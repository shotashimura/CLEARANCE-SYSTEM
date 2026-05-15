import { useState, useEffect, useCallback, useMemo } from "react";
import { INDIVIDUALS, translateJudgment } from "../lib/translateJudgment.js";
import { fetchFiveFlights, MOCK_FLIGHTS } from "../lib/flights.js";
import { runCycle, deliberateOne } from "../lib/orchestrator.js";

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

const AGENT_COLOR = {
  SECURITY: "#4488ff",
  FLOW: "#ff8844",
  CARE: "#88ff88",
};

function extractStance(text) {
  const match = text.match(/\b(PASS|HOLD|DENY)\b/);
  return match ? match[1] : null;
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

function DiscussionPanel({ result }) {
  if (!result) {
    return (
      <div style={{ color: "#444", fontSize: 11, padding: "12px 16px" }}>
        — 判定が完了すると議論ログが展開されます —
      </div>
    );
  }
  const items = [
    { name: "SECURITY", label: "PAST × SAFETY", text: result.securityText },
    { name: "FLOW", label: "PRESENT × EFFICIENCY", text: result.flowText },
    { name: "CARE", label: "FUTURE × HUMANITY", text: result.careText },
  ];
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px" }}>
      {items.map((it) => {
        const stance = it.text ? extractStance(it.text) : null;
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
            <div
              style={{ color, fontSize: 10, letterSpacing: 3, marginBottom: 4 }}
            >
              [{it.name}]
            </div>
            <div style={{ color: "#666", fontSize: 9, marginBottom: 6 }}>
              {it.label}
            </div>
            <pre
              style={{
                color: "#bbb",
                fontSize: 11,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
                lineHeight: 1.6,
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
                    stance === "PASS"
                      ? "#003322"
                      : stance === "DENY"
                      ? "#330011"
                      : "#332200",
                  color:
                    stance === "PASS"
                      ? "#00ff88"
                      : stance === "DENY"
                      ? "#ff3366"
                      : "#ffaa00",
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

function OscBlock({ result, individual }) {
  if (!result?.verdict) return null;
  const t = translateJudgment(result.verdict, individual);
  return (
    <div
      style={{
        padding: "10px 16px",
        background: "#050505",
        borderTop: "1px solid #1a1a1a",
      }}
    >
      <div
        style={{
          color: "#666",
          fontSize: 10,
          letterSpacing: 2,
          marginBottom: 6,
        }}
      >
        OUTBOUND TELEMETRY · M5Stack receiver offline
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
        {t.oscLines.join("\n")}
      </pre>
    </div>
  );
}

function SuitcaseRow({ individual, flight, result, expanded, onToggle }) {
  const fj = result?.verdict?.final_judgment;
  const permission = fj?.permission;
  const speed = fj?.speed_factor;
  const behavior = fj?.behavior_modifier;
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
          gridTemplateColumns: "60px 1fr 120px 180px 100px 110px 60px",
          alignItems: "center",
          padding: "10px 16px",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        <div style={{ color: "#fff", letterSpacing: 2 }}>#{individual.id}</div>
        <div>
          <div style={{ color: "#ccc" }}>{individual.label}</div>
          <div style={{ color: "#555", fontSize: 10 }}>{individual.contents}</div>
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
          {typeof speed === "number" ? `${speed.toFixed(2)}×` : "—"}
        </div>
        <div style={{ color: "#888", letterSpacing: 2, fontSize: 11 }}>
          {BEHAVIOR_LABEL[behavior] || "—"}
        </div>
        <div style={{ color: "#444", fontSize: 12, textAlign: "right" }}>
          {expanded ? "▾" : "▸"}
        </div>
      </div>
      {expanded && (
        <>
          <DiscussionPanel result={result} />
          <OscBlock result={result} individual={individual} />
        </>
      )}
    </div>
  );
}

export default function CycleView() {
  const [flights, setFlights] = useState(MOCK_FLIGHTS);
  const [flightSource, setFlightSource] = useState("mock");
  const [results, setResults] = useState([null, null, null, null, null]);
  const [phase, setPhase] = useState("idle"); // idle | fetching | deliberating | testing
  const [expandedId, setExpandedId] = useState(null);
  const [sameInputResults, setSameInputResults] = useState([]);
  const [lastFetched, setLastFetched] = useState(null);

  const refreshFlights = useCallback(async () => {
    setPhase("fetching");
    const fetched = await fetchFiveFlights();
    setFlights(fetched);
    setFlightSource(fetched.some((f) => f.source === "opensky") ? "opensky" : "mock");
    setLastFetched(new Date());
    setPhase("idle");
  }, []);

  useEffect(() => {
    refreshFlights();
    const id = setInterval(refreshFlights, 60_000);
    return () => clearInterval(id);
  }, [refreshFlights]);

  const runDeliberation = useCallback(async () => {
    setPhase("deliberating");
    setResults([null, null, null, null, null]);
    setExpandedId(null);
    await runCycle(flights, {
      onPairResult: (idx, r) => {
        setResults((prev) => {
          const next = [...prev];
          next[idx] = r;
          return next;
        });
      },
    });
    setPhase("idle");
  }, [flights]);

  const runSameInputTest = useCallback(async () => {
    setPhase("testing");
    setSameInputResults([]);
    const target = flights[0];
    for (let i = 0; i < 10; i++) {
      const r = await deliberateOne(target);
      const fj = r.verdict?.final_judgment ?? {};
      setSameInputResults((prev) => [
        ...prev,
        {
          run: i + 1,
          permission: fj.permission,
          risk_score: fj.risk_score,
          decisiveness: fj.decisiveness,
          behavior: fj.behavior_modifier,
        },
      ]);
    }
    setPhase("idle");
  }, [flights]);

  const isBusy = phase !== "idle";

  const trackingSummary = useMemo(() => {
    const callsigns = flights
      .map((f) => f?.callsign || f?.flight)
      .filter(Boolean)
      .join(" · ");
    return callsigns || "—";
  }, [flights]);

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
          <div
            style={{ color: "#555", fontSize: 10, letterSpacing: 4, marginBottom: 4 }}
          >
            FLEET DELIBERATION INTERFACE
          </div>
          <div style={{ color: "#fff", fontSize: 18, letterSpacing: 2 }}>
            ▸ 5 SUITCASES · PARALLEL CLEARANCE
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#555", fontSize: 10, letterSpacing: 2 }}>
            TRACKING {flights.length} FLIGHTS · SOURCE:{" "}
            <span
              style={{
                color: flightSource === "opensky" ? "#00ff88" : "#ffaa00",
                letterSpacing: 2,
              }}
            >
              {flightSource.toUpperCase()}
            </span>
          </div>
          <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>
            {trackingSummary}
          </div>
          <div style={{ color: "#444", fontSize: 9, marginTop: 4 }}>
            last sync: {lastFetched ? lastFetched.toLocaleTimeString() : "—"}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button
          onClick={runDeliberation}
          disabled={isBusy}
          style={{
            background: isBusy ? "#111" : "#1a1a1a",
            border: "1px solid #444",
            color: isBusy ? "#555" : "#fff",
            padding: "10px 20px",
            cursor: isBusy ? "not-allowed" : "pointer",
            fontFamily: "monospace",
            letterSpacing: 2,
            fontSize: 12,
          }}
        >
          {phase === "deliberating"
            ? "▸ DELIBERATING 5 SUITCASES..."
            : "▸ INITIATE CLEARANCE CYCLE"}
        </button>
        <button
          onClick={refreshFlights}
          disabled={isBusy}
          style={{
            background: "#0d0d0d",
            border: "1px solid #333",
            color: isBusy ? "#444" : "#888",
            padding: "10px 20px",
            cursor: isBusy ? "not-allowed" : "pointer",
            fontFamily: "monospace",
            letterSpacing: 2,
            fontSize: 12,
          }}
        >
          ↻ REFRESH FLIGHTS
        </button>
        <button
          onClick={runSameInputTest}
          disabled={isBusy}
          title="先頭便で連続10回判定 → ブレることを検証"
          style={{
            background: "#0d0d0d",
            border: "1px solid #333",
            color: isBusy ? "#444" : "#888",
            padding: "10px 20px",
            cursor: isBusy ? "not-allowed" : "pointer",
            fontFamily: "monospace",
            letterSpacing: 2,
            fontSize: 11,
          }}
        >
          🔀 SAME INPUT TEST ×10
        </button>
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
            gridTemplateColumns: "60px 1fr 120px 180px 100px 110px 60px",
            padding: "8px 16px",
            color: "#555",
            fontSize: 10,
            letterSpacing: 2,
            background: "#0d0d0d",
          }}
        >
          <div>SUITCASE</div>
          <div>CONTENTS</div>
          <div>FLIGHT</div>
          <div>PERMISSION</div>
          <div>SPEED</div>
          <div>BEHAVIOR</div>
          <div></div>
        </div>
        {INDIVIDUALS.map((ind, idx) => (
          <SuitcaseRow
            key={ind.id}
            individual={ind}
            flight={flights[idx]}
            result={results[idx]}
            expanded={expandedId === ind.id}
            onToggle={() => setExpandedId((e) => (e === ind.id ? null : ind.id))}
          />
        ))}
      </div>

      {/* SAME INPUT TEST results */}
      {sameInputResults.length > 0 && (
        <div
          style={{
            marginTop: 12,
            border: "1px solid #333",
            borderRadius: 4,
            padding: "12px 16px",
            background: "#0a0a0a",
          }}
        >
          <div
            style={{
              color: "#888",
              fontSize: 10,
              letterSpacing: 3,
              marginBottom: 8,
            }}
          >
            SAME INPUT TEST — FLAT JUDGMENT VERIFICATION (
            {flights[0]?.callsign || flights[0]?.flight})
          </div>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#555", textAlign: "left" }}>
                <th style={{ padding: "4px 8px" }}>#</th>
                <th style={{ padding: "4px 8px" }}>PERMISSION</th>
                <th style={{ padding: "4px 8px" }}>RISK</th>
                <th style={{ padding: "4px 8px" }}>DECISIVENESS</th>
                <th style={{ padding: "4px 8px" }}>BEHAVIOR</th>
              </tr>
            </thead>
            <tbody>
              {sameInputResults.map((r) => (
                <tr key={r.run} style={{ borderTop: "1px solid #1a1a1a" }}>
                  <td style={{ padding: "4px 8px", color: "#666" }}>{r.run}</td>
                  <td
                    style={{
                      padding: "4px 8px",
                      color: PERMISSION_COLOR[r.permission] || "#ccc",
                      letterSpacing: 1,
                    }}
                  >
                    {r.permission}
                  </td>
                  <td style={{ padding: "4px 8px", color: "#888" }}>{r.risk_score}</td>
                  <td style={{ padding: "4px 8px", color: "#888" }}>
                    {r.decisiveness?.toFixed?.(2)}
                  </td>
                  <td style={{ padding: "4px 8px", color: "#888" }}>
                    {BEHAVIOR_LABEL[r.behavior] || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ color: "#444", fontSize: 10, marginTop: 8 }}>
            ※ 同一入力でも判定がブレることが仕様（毎回フラット判定 / 履歴非参照）
          </div>
        </div>
      )}

      {/* Operator-only raw */}
      {results.some(Boolean) && (
        <details style={{ marginTop: 16 }}>
          <summary
            style={{ color: "#444", fontSize: 10, cursor: "pointer", letterSpacing: 2 }}
          >
            RAW OUTPUT (OPERATOR ONLY)
          </summary>
          <pre
            style={{ color: "#333", fontSize: 10, marginTop: 8, whiteSpace: "pre-wrap" }}
          >
            {JSON.stringify(
              results.map((r, i) => ({
                suitcase: INDIVIDUALS[i],
                flight: flights[i],
                verdict: r?.verdict,
              })),
              null,
              2
            )}
          </pre>
        </details>
      )}
    </>
  );
}
