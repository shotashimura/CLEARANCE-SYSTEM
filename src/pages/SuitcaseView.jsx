import { useParams } from "react-router-dom";
import { useSuitcaseState } from "../lib/clearanceClient.js";
import { getSuitcase } from "../config/fleet.js";
import { isRTL, languageMeta } from "../lib/lang.js";

// 各スーツケース内ディスプレイ（iPad 想定）用の個別ページ。
// 中央サーバーから配信される状態のうち、自分 1 台分だけを表示する。
// 観客に判定理由・risk_score は出さない（禁則）。議論ログと判定・動きのみ。

const PERMISSION_COLOR = {
  GRANTED: "#00ff88",
  GRANTED_CONDITIONAL: "#88ff44",
  FLAGGED: "#ffaa00",
  PROCESSING: "#88aaff",
  DENIED: "#ff3366",
};

const PERMISSION_LABEL = {
  GRANTED: "GRANTED",
  GRANTED_CONDITIONAL: "GRANTED · CONDITIONAL",
  FLAGGED: "FLAGGED",
  PROCESSING: "PROCESSING",
  DENIED: "DENIED",
};

const COLLISION_COLOR = {
  CLEAR: "#2a2a2a",
  SLOW: "#3a3000",
  DIVERT: "#3a2400",
  STOP: "#3a0010",
  REVERSE: "#3a0010",
};

const AGENT_COLOR = { SECURITY: "#4488ff", FLOW: "#ff8844", CARE: "#88ff88" };

function extractStance(text) {
  const m = text?.match(/\b(PASS|HOLD|DENY)\b/);
  return m ? m[1] : null;
}

function AgentBlock({ name, label, text, lang }) {
  const color = AGENT_COLOR[name];
  const rtl = isRTL(lang);
  const stance = extractStance(text);
  return (
    <div
      style={{
        border: `1px solid ${color}`,
        background: "#070707",
        padding: "14px 16px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ color, fontSize: 11, letterSpacing: 3, marginBottom: 4 }}>
        [{name}]
      </div>
      <div style={{ color: "#666", fontSize: 9, marginBottom: 8 }}>{label}</div>
      <pre
        dir={rtl ? "rtl" : "ltr"}
        style={{
          color: "#cfcfcf",
          fontSize: 13,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
          minHeight: 96,
          lineHeight: 1.7,
          textAlign: rtl ? "right" : "left",
        }}
      >
        {text || "— 待機中 —"}
      </pre>
      {stance && (
        <div
          style={{
            marginTop: 10,
            padding: "2px 8px",
            display: "inline-block",
            fontSize: 11,
            letterSpacing: 2,
            background:
              stance === "PASS" ? "#003322" : stance === "DENY" ? "#330011" : "#332200",
            color:
              stance === "PASS" ? "#00ff88" : stance === "DENY" ? "#ff3366" : "#ffaa00",
          }}
        >
          {stance}
        </div>
      )}
    </div>
  );
}

function MetricsBar({ verdict, osc }) {
  const fj = verdict?.final_judgment ?? {};
  const items = [
    { k: "SPEED", v: typeof osc?.speed === "number" ? `${osc.speed.toFixed(2)}` : "—" },
    {
      k: "DIRECTION",
      v:
        osc?.direction > 0 ? "FORWARD" : osc?.direction < 0 ? "REVERSE" : "HALT",
    },
    { k: "BEHAVIOR", v: (osc?.behavior ?? fj.behavior_modifier ?? "—").toUpperCase() },
    {
      k: "DURATION",
      v: typeof fj.duration_seconds === "number" ? `${fj.duration_seconds}s` : "—",
    },
  ];
  return (
    <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
      {items.map((it) => (
        <div key={it.k}>
          <div style={{ color: "#555", fontSize: 10, letterSpacing: 2 }}>{it.k}</div>
          <div style={{ color: "#ddd", fontSize: 18, letterSpacing: 1, marginTop: 4 }}>
            {it.v}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SuitcaseView() {
  const { id } = useParams();
  const fleet = getSuitcase(id);
  const { suitcase, connected, source, cycle } = useSuitcaseState(id);

  if (!fleet) {
    return (
      <div style={{ color: "#ff3366", fontFamily: "monospace", padding: 24 }}>
        UNKNOWN SUITCASE: {id}（1〜5 を指定してください）
      </div>
    );
  }

  const flight = suitcase?.flight ?? null;
  const verdict = suitcase?.verdict ?? null;
  const osc = suitcase?.oscCorrected ?? suitcase?.osc ?? null;
  const discussion = suitcase?.discussion ?? null;
  const collision = suitcase?.collision ?? null;
  const lang = suitcase?.language ?? null;
  const permission = verdict?.final_judgment?.permission;
  const langInfo = lang ? languageMeta(lang) : null;

  return (
    <div
      style={{
        background: "#000",
        minHeight: "100vh",
        color: "#ddd",
        fontFamily: "monospace",
        padding: "28px 32px",
        boxSizing: "border-box",
      }}
    >
      {/* HEADER: このスーツケース1台のアイデンティティ */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          borderBottom: "1px solid #222",
          paddingBottom: 18,
          marginBottom: 22,
          gap: 16,
        }}
      >
        <div>
          <div style={{ color: "#555", fontSize: 11, letterSpacing: 6 }}>
            CLEARANCE SYSTEM
          </div>
          <div style={{ color: "#fff", fontSize: 40, letterSpacing: 6, marginTop: 6 }}>
            #{String(fleet.suitcaseId).padStart(3, "0")} {fleet.label}
          </div>
          <div style={{ color: "#777", fontSize: 13, marginTop: 4 }}>
            中身: {fleet.contents}　/　戦術: {fleet.tactic}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              color: connected ? "#00ff88" : "#ff3366",
              fontSize: 11,
              letterSpacing: 2,
            }}
          >
            {connected ? "● CENTRAL LINKED" : "○ DISCONNECTED"}
          </div>
          <div style={{ color: "#555", fontSize: 10, marginTop: 4 }}>
            cycle {String(cycle).padStart(4, "0")} · {(source ?? "—").toUpperCase()}
          </div>
          <div style={{ color: "#444", fontSize: 10, marginTop: 4 }}>
            {fleet.m5stack.id} · {fleet.oscAddressBase}/*
          </div>
        </div>
      </div>

      {/* FLIGHT + PERMISSION */}
      <div
        style={{
          display: "flex",
          gap: 40,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ color: "#555", fontSize: 10, letterSpacing: 2 }}>ASSIGNED FLIGHT</div>
          <div style={{ color: "#fff", fontSize: 24, marginTop: 4 }}>
            {flight ? flight.callsign || flight.flight : "—"}
          </div>
          <div style={{ color: "#888", fontSize: 14, marginTop: 2 }}>
            {flight ? `${flight.origin} → ${flight.destination}` : "awaiting assignment"}
            {langInfo && (
              <span style={{ color: "#555", marginLeft: 12 }}>
                {langInfo.displayCode} · {langInfo.native}
              </span>
            )}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <div style={{ color: "#555", fontSize: 10, letterSpacing: 2 }}>PERMISSION</div>
          <div
            style={{
              color: PERMISSION_COLOR[permission] || "#444",
              fontSize: 34,
              letterSpacing: 4,
              marginTop: 4,
            }}
          >
            {permission ? PERMISSION_LABEL[permission] || permission : "— PROCESSING —"}
          </div>
        </div>
      </div>

      {/* DISCUSSION (このスーツケースの3エージェント) */}
      <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
        <AgentBlock
          name="SECURITY"
          label="PAST × SAFETY"
          text={discussion?.securityText}
          lang={lang}
        />
        <AgentBlock
          name="FLOW"
          label="PRESENT × EFFICIENCY"
          text={discussion?.flowText}
          lang={lang}
        />
        <AgentBlock
          name="CARE"
          label="FUTURE × HUMANITY"
          text={discussion?.careText}
          lang={lang}
        />
      </div>

      {/* MOTION (このスーツケースの動き) + COLLISION */}
      <div
        style={{
          display: "flex",
          gap: 24,
          alignItems: "stretch",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            flex: 2,
            minWidth: 280,
            border: "1px solid #222",
            background: "#070707",
            padding: "16px 18px",
          }}
        >
          <div style={{ color: "#555", fontSize: 10, letterSpacing: 3, marginBottom: 12 }}>
            MOTION OUTPUT → {fleet.m5stack.id} ({fleet.m5stack.host}:{fleet.m5stack.port})
          </div>
          <MetricsBar verdict={verdict} osc={osc} />
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 220,
            border: "1px solid #222",
            background: COLLISION_COLOR[collision?.state] || "#070707",
            padding: "16px 18px",
            transition: "background 0.4s",
          }}
        >
          <div style={{ color: "#555", fontSize: 10, letterSpacing: 3, marginBottom: 12 }}>
            COLLISION AVOIDANCE
          </div>
          <div
            style={{
              color:
                collision?.state && collision.state !== "CLEAR" ? "#ffd066" : "#00ff88",
              fontSize: 22,
              letterSpacing: 3,
            }}
          >
            {collision?.state ?? "—"}
          </div>
          <div style={{ color: "#999", fontSize: 12, marginTop: 8, minHeight: 18 }}>
            {collision?.reason ?? "クリア"}
          </div>
          {suitcase?.position && (
            <div style={{ color: "#555", fontSize: 11, marginTop: 10 }}>
              pos ({suitcase.position.x}, {suitcase.position.y}) m
            </div>
          )}
        </div>
      </div>

      {/* 禁則の明示（観客には理由を出さない） */}
      <div style={{ color: "#2a2a2a", fontSize: 10, letterSpacing: 2, marginTop: 20 }}>
        REASONING: CLASSIFIED · RISK_SCORE: WITHHELD
      </div>
    </div>
  );
}
