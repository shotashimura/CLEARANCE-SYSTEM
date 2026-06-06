import { useState } from "react";
import { useClearanceState } from "../lib/clearanceClient.js";
import { languageMeta, isRTL } from "../lib/lang.js";

// 運用監視ビュー。中央サーバーの状態を購読し、5台の判定・議論・OSC・
// 衝突状態を一覧表示する。判定・OSC送信は中央サーバーが担い、ここは読み取り専用。

const PERMISSION_COLOR = {
  GRANTED: "#00ff88",
  GRANTED_CONDITIONAL: "#88ff44",
  FLAGGED: "#ffaa00",
  PROCESSING: "#88aaff",
  DENIED: "#ff3366",
};

const BEHAVIOR_LABEL = {
  hesitant: "HESITANT",
  assertive: "ASSERTIVE",
  frozen: "FROZEN",
  random_walk: "RANDOM_WALK",
};

const COLLISION_COLOR = {
  CLEAR: "#444",
  SLOW: "#ffcc44",
  DIVERT: "#ffaa00",
  STOP: "#ff3366",
  REVERSE: "#ff3366",
};

const AGENT_COLOR = { SECURITY: "#4488ff", FLOW: "#ff8844", CARE: "#88ff88" };

function extractStance(text) {
  const m = text?.match(/\b(PASS|HOLD|DENY)\b/);
  return m ? m[1] : null;
}

function StatusDot({ permission }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: PERMISSION_COLOR[permission] || "#444",
        marginRight: 8,
      }}
    />
  );
}

function DiscussionPanel({ suitcase }) {
  const d = suitcase?.discussion;
  if (!d) {
    return (
      <div style={{ color: "#444", fontSize: 11, padding: "12px 16px" }}>
        — 中央サーバーの判定待ち —
      </div>
    );
  }
  const rtl = isRTL(suitcase?.language);
  const items = [
    { name: "SECURITY", label: "PAST × SAFETY", text: d.securityText },
    { name: "FLOW", label: "PRESENT × EFFICIENCY", text: d.flowText },
    { name: "CARE", label: "FUTURE × HUMANITY", text: d.careText },
  ];
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px" }}>
      {items.map((it) => {
        const stance = extractStance(it.text);
        const color = AGENT_COLOR[it.name];
        return (
          <div
            key={it.name}
            style={{
              flex: 1,
              minWidth: 0,
              border: `1px solid ${color}`,
              background: "#050505",
              padding: "10px 12px",
            }}
          >
            <div style={{ color, fontSize: 10, letterSpacing: 3, marginBottom: 4 }}>
              [{it.name}]
            </div>
            <div style={{ color: "#666", fontSize: 9, marginBottom: 6 }}>{it.label}</div>
            <pre
              dir={rtl ? "rtl" : "ltr"}
              style={{
                color: "#bbb",
                fontSize: 11,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
                lineHeight: 1.6,
                textAlign: rtl ? "right" : "left",
              }}
            >
              {it.text || "— 待機中 —"}
            </pre>
            {stance && (
              <div
                style={{
                  marginTop: 8,
                  padding: "2px 6px",
                  display: "inline-block",
                  fontSize: 10,
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
      })}
    </div>
  );
}

function OscBlock({ suitcase }) {
  const sent = suitcase?.oscSent;
  if (!sent) return null;
  return (
    <div style={{ padding: "10px 16px", background: "#050505", borderTop: "1px solid #1a1a1a" }}>
      <div style={{ color: "#666", fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
        OUTBOUND OSC → {sent.target?.host}:{sent.target?.port} ({suitcase.m5stack?.id})
      </div>
      <pre
        style={{
          color: "#7fa",
          fontSize: 10,
          margin: 0,
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
        }}
      >
        {(sent.lines ?? []).join("\n")}
      </pre>
    </div>
  );
}

function SuitcaseRow({ suitcase, expanded, onToggle }) {
  const flight = suitcase?.flight;
  const fj = suitcase?.verdict?.final_judgment;
  const permission = fj?.permission;
  const osc = suitcase?.oscCorrected ?? suitcase?.osc;
  const behavior = osc?.behavior ?? fj?.behavior_modifier;
  const lang = suitcase?.language;
  const langInfo = lang ? languageMeta(lang) : null;
  const collision = suitcase?.collision;
  return (
    <div
      style={{
        borderTop: "1px solid #1a1a1a",
        background: expanded ? "#080808" : "transparent",
      }}
    >
      <div
        onClick={onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: "60px 1fr 110px 60px 150px 80px 100px 110px 40px",
          alignItems: "center",
          padding: "10px 16px",
          cursor: "pointer",
          fontSize: 12,
          gap: 6,
        }}
      >
        <div style={{ color: "#fff", letterSpacing: 2 }}>#{suitcase.suitcaseId}</div>
        <div>
          <div style={{ color: "#ccc" }}>{suitcase.label}</div>
          <div style={{ color: "#555", fontSize: 10 }}>{suitcase.contents}</div>
        </div>
        <div style={{ color: "#888" }}>
          {flight ? (
            <>
              <div style={{ color: "#ddd" }}>{flight.callsign || flight.flight}</div>
              <div style={{ color: "#555", fontSize: 10 }}>
                {flight.origin} → {flight.destination}
              </div>
            </>
          ) : (
            <span style={{ color: "#333" }}>—</span>
          )}
        </div>
        <div style={{ color: "#aaa", fontSize: 11, letterSpacing: 1 }}>
          {langInfo?.displayCode ?? "--"}
        </div>
        <div>
          {permission ? (
            <>
              <StatusDot permission={permission} />
              <span
                style={{
                  color: PERMISSION_COLOR[permission] || "#ccc",
                  letterSpacing: 2,
                  fontSize: 12,
                }}
              >
                {permission}
              </span>
            </>
          ) : (
            <span style={{ color: "#333" }}>—</span>
          )}
        </div>
        <div style={{ color: "#ccc" }}>
          {typeof osc?.speed === "number" ? `${osc.speed.toFixed(2)}` : "—"}
        </div>
        <div style={{ color: "#888", letterSpacing: 1, fontSize: 11 }}>
          {BEHAVIOR_LABEL[behavior] || "—"}
        </div>
        <div
          style={{
            color: COLLISION_COLOR[collision?.state] || "#444",
            letterSpacing: 1,
            fontSize: 11,
          }}
        >
          {collision?.state ?? "—"}
        </div>
        <div style={{ color: "#444", fontSize: 12, textAlign: "right" }}>
          {expanded ? "▾" : "▸"}
        </div>
      </div>
      {expanded && (
        <>
          <DiscussionPanel suitcase={suitcase} />
          <OscBlock suitcase={suitcase} />
        </>
      )}
    </div>
  );
}

export default function CycleView() {
  const { state, connected } = useClearanceState();
  const [expandedId, setExpandedId] = useState(null);

  const suitcases = state?.suitcases ?? [];
  const cycle = state?.cycle ?? 0;
  const source = (state?.source ?? "—").toUpperCase();
  const trackingSummary =
    suitcases
      .map((s) => s?.flight?.callsign || s?.flight?.flight)
      .filter(Boolean)
      .join(" · ") || "—";

  return (
    <>
      {/* Header */}
      <div
        style={{
          marginBottom: 24,
          borderBottom: "1px solid #222",
          paddingBottom: 16,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ color: "#555", fontSize: 10, letterSpacing: 4, marginBottom: 4 }}>
            FLEET MONITOR — CENTRAL SERVER
          </div>
          <div style={{ color: "#fff", fontSize: 18, letterSpacing: 2 }}>
            ▸ 5 SUITCASES · LIVE SUBSCRIPTION
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#555", fontSize: 10, letterSpacing: 2 }}>
            CYCLE {String(cycle).padStart(4, "0")} · SOURCE:{" "}
            <span
              style={{ color: source === "OPENSKY" ? "#00ff88" : "#ffaa00", letterSpacing: 2 }}
            >
              {source}
            </span>{" "}
            ·{" "}
            <span style={{ color: connected ? "#00ff88" : "#ff3366" }}>
              {connected ? "LINKED" : "DISCONNECTED"}
            </span>
          </div>
          <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>{trackingSummary}</div>
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          border: "1px solid #1a1a1a",
          borderRadius: 4,
          background: "#0a0a0a",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 110px 60px 150px 80px 100px 110px 40px",
            padding: "8px 16px",
            color: "#555",
            fontSize: 10,
            letterSpacing: 2,
            background: "#0d0d0d",
            gap: 6,
          }}
        >
          <div>SUITCASE</div>
          <div>CONTENTS</div>
          <div>FLIGHT</div>
          <div>LANG</div>
          <div>PERMISSION</div>
          <div>SPEED</div>
          <div>BEHAVIOR</div>
          <div>SAFETY</div>
          <div></div>
        </div>
        {suitcases.length === 0 ? (
          <div style={{ color: "#444", padding: "20px 16px", letterSpacing: 1 }}>
            {connected ? "— 中央サーバーの最初のサイクル待ち —" : "— 中央サーバーに接続中 —"}
          </div>
        ) : (
          suitcases.map((s) => (
            <SuitcaseRow
              key={s.suitcaseId}
              suitcase={s}
              expanded={expandedId === s.suitcaseId}
              onToggle={() =>
                setExpandedId((e) => (e === s.suitcaseId ? null : s.suitcaseId))
              }
            />
          ))
        )}
      </div>

      {/* Operator-only raw */}
      {suitcases.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary
            style={{ color: "#444", fontSize: 10, cursor: "pointer", letterSpacing: 2 }}
          >
            RAW STATE (OPERATOR ONLY)
          </summary>
          <pre style={{ color: "#333", fontSize: 10, marginTop: 8, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(suitcases, null, 2)}
          </pre>
        </details>
      )}
    </>
  );
}
