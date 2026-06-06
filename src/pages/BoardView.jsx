import { useEffect, useState } from "react";
import { useClearanceState } from "../lib/clearanceClient.js";
import { languageMeta } from "../lib/lang.js";
import FlipText from "../components/FlipText.jsx";

// DepartureBoard。中央サーバーの状態を WebSocket 購読して表示するだけ。
// 自前の判定・OSC送信は行わない（単一の状態源）。

const PERMISSION_COLOR = {
  GRANTED: "#00ff88",
  GRANTED_CONDITIONAL: "#88ff44",
  FLAGGED: "#ffaa00",
  PROCESSING: "#88aaff",
  DENIED: "#ff3366",
};

const PERMISSION_SHORT = {
  GRANTED: "GRANTED",
  GRANTED_CONDITIONAL: "CONDITIONAL",
  FLAGGED: "FLAGGED",
  PROCESSING: "HOLDING",
  DENIED: "DENIED",
};

const COLLISION_TAG = {
  SLOW: "SLOW",
  DIVERT: "DIVERT",
  STOP: "STOP",
  REVERSE: "REVERSE",
};

const HISTORY_LIMIT = 24;

function formatTime(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString("en-GB", { hour12: false });
}

function Row({ suitcase }) {
  const flight = suitcase?.flight;
  const fj = suitcase?.verdict?.final_judgment;
  const permission = fj?.permission;
  const osc = suitcase?.oscCorrected ?? suitcase?.osc;
  const color = PERMISSION_COLOR[permission] || "#444";
  const lang = suitcase?.language;
  const langDisplay = lang ? languageMeta(lang).displayCode : "--";
  const collision = suitcase?.collision;
  const intervened = collision && collision.state !== "CLEAR";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 90px 90px 130px 60px 1fr 110px 90px",
        alignItems: "center",
        padding: "12px 24px",
        borderBottom: "1px solid #1a1a1a",
        gap: 14,
      }}
    >
      <FlipText
        value={`#${String(suitcase.suitcaseId).padStart(3, "0")}`}
        color="#fff"
        fontSize={20}
        letterSpacing={3}
      />
      <FlipText value={flight?.origin ?? "---"} color="#ccc" fontSize={22} letterSpacing={2} />
      <FlipText value={flight?.destination ?? "---"} color="#ccc" fontSize={22} letterSpacing={2} />
      <FlipText
        value={flight?.callsign ?? flight?.flight ?? "---"}
        color="#888"
        fontSize={16}
        letterSpacing={2}
      />
      <FlipText value={langDisplay} color="#888" fontSize={16} letterSpacing={2} />
      <FlipText
        value={permission ? PERMISSION_SHORT[permission] || permission : "PROCESSING"}
        color={color}
        fontSize={22}
        letterSpacing={3}
      />
      <FlipText
        value={typeof osc?.speed === "number" ? `${osc.speed.toFixed(2)}` : "—"}
        color="#aaa"
        fontSize={18}
        align="right"
      />
      <div style={{ textAlign: "right" }}>
        {intervened ? (
          <span
            style={{
              color: "#ffd066",
              fontSize: 12,
              letterSpacing: 2,
              border: "1px solid #5a4400",
              padding: "2px 6px",
            }}
          >
            {COLLISION_TAG[collision.state] || collision.state}
          </span>
        ) : (
          <span style={{ color: "#2a2a2a", fontSize: 12 }}>—</span>
        )}
      </div>
    </div>
  );
}

export default function BoardView() {
  const { state, connected } = useClearanceState();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const suitcases = state?.suitcases ?? [];
  const history = (state?.history ?? []).slice(-HISTORY_LIMIT);
  const announcement = state?.announcement ?? null;
  const cycle = state?.cycle ?? 0;
  const source = (state?.source ?? "—").toUpperCase();

  return (
    <div
      style={{
        background: "#000",
        color: "#ddd",
        minHeight: "100vh",
        fontFamily: "monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          padding: "20px 32px",
          borderBottom: "2px solid #222",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#050505",
        }}
      >
        <div>
          <div style={{ color: "#666", fontSize: 11, letterSpacing: 6, marginBottom: 4 }}>
            CLEARANCE SYSTEM
          </div>
          <div style={{ color: "#fff", fontSize: 30, letterSpacing: 6 }}>
            INTERNATIONAL DEPARTURES
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#fff", fontSize: 32, letterSpacing: 4 }}>
            {formatTime(now)}
          </div>
          <div style={{ color: "#555", fontSize: 11, letterSpacing: 3, marginTop: 4 }}>
            CYCLE {String(cycle).padStart(4, "0")} · SRC {source} ·{" "}
            <span style={{ color: connected ? "#00ff88" : "#ff3366" }}>
              {connected ? "LINKED" : "DISCONNECTED"}
            </span>
          </div>
        </div>
      </div>

      {/* CURRENT 5 rows */}
      <div style={{ borderBottom: "2px solid #222" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "80px 90px 90px 130px 60px 1fr 110px 90px",
            padding: "10px 24px",
            color: "#555",
            fontSize: 10,
            letterSpacing: 3,
            background: "#0a0a0a",
            gap: 14,
          }}
        >
          <div>SUITCASE</div>
          <div>ORIGIN</div>
          <div>DEST</div>
          <div>FLIGHT</div>
          <div>LANG</div>
          <div>STATUS</div>
          <div style={{ textAlign: "right" }}>SPEED</div>
          <div style={{ textAlign: "right" }}>SAFETY</div>
        </div>
        {suitcases.length === 0 ? (
          <div style={{ color: "#444", padding: "24px", letterSpacing: 2 }}>
            {connected ? "— awaiting first cycle —" : "— connecting to central server —"}
          </div>
        ) : (
          suitcases.map((s) => <Row key={s.suitcaseId} suitcase={s} />)
        )}
      </div>

      {/* HISTORY */}
      <div
        style={{
          flex: 1,
          padding: "16px 32px",
          overflow: "hidden",
          background: "#020202",
          minHeight: 240,
        }}
      >
        <div style={{ color: "#555", fontSize: 10, letterSpacing: 4, marginBottom: 12 }}>
          HISTORY · LAST {HISTORY_LIMIT}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column-reverse",
            gap: 4,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {history.length === 0 && (
            <div style={{ color: "#333" }}>— awaiting first cycle —</div>
          )}
          {history.map((h, i) => {
            const color = PERMISSION_COLOR[h.permission] || "#888";
            return (
              <div
                key={`${h.time}-${h.suitcaseId}-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 60px 130px 1fr",
                  gap: 16,
                  color: "#777",
                  opacity: Math.max(0.35, 1 - (history.length - 1 - i) * 0.04),
                }}
              >
                <div style={{ color: "#555" }}>{formatTime(h.time)}</div>
                <div style={{ color: "#999" }}>
                  #{String(h.suitcaseId).padStart(3, "0")}
                </div>
                <div>
                  <span style={{ color: "#aaa" }}>{h.callsign}</span>{" "}
                  <span style={{ color: "#555" }}>
                    {h.origin}→{h.destination}
                  </span>
                </div>
                <div style={{ color, letterSpacing: 3 }}>
                  {PERMISSION_SHORT[h.permission] || h.permission}
                  {h.alert && (
                    <span style={{ color: "#666", marginLeft: 12, letterSpacing: 2 }}>
                      · {h.alert}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ANNOUNCEMENT */}
      <div
        style={{
          borderTop: "2px solid #222",
          background: announcement ? "#170d00" : "#050505",
          padding: "18px 32px",
          transition: "background 0.6s",
          minHeight: 60,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        {announcement ? (
          <>
            <div style={{ color: "#ffaa00", fontSize: 12, letterSpacing: 4 }}>
              ATTENTION
            </div>
            <div style={{ color: "#ffd066", fontSize: 18, letterSpacing: 4 }}>
              {announcement}
            </div>
          </>
        ) : (
          <div style={{ color: "#222", fontSize: 11, letterSpacing: 4 }}>
            — NO STANDING ALERT —
          </div>
        )}
      </div>
    </div>
  );
}
