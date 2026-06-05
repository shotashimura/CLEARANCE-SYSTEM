import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchFiveFlights, MOCK_FLIGHTS } from "../lib/flights.js";
import { INDIVIDUALS, translateJudgment } from "../lib/translateJudgment.js";
import { deliberateOne } from "../lib/orchestrator.js";
import {
  detectLanguage,
  LANG_META,
  languageMeta,
  isRTL,
} from "../lib/lang.js";

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

async function speak(text, voice) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "tts-1",
      voice,
      input: text,
      response_format: "mp3",
    }),
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play();
  return new Promise((resolve) => {
    audio.onended = resolve;
  });
}

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

function extractStance(text) {
  const match = text.match(/\b(PASS|HOLD|DENY)\b/);
  return match ? match[1] : null;
}

function AgentCard({ name, label, color, text, stance, lang }) {
  const rtl = isRTL(lang);
  return (
    <div
      style={{
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: "16px",
        background: "#0a0a0a",
        flex: 1,
        minWidth: 0,
        fontFamily: "monospace",
      }}
    >
      <div style={{ color, fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>
        [{name}]
      </div>
      <div style={{ color: "#888", fontSize: 10, marginBottom: 12 }}>{label}</div>
      <pre
        dir={rtl ? "rtl" : "ltr"}
        style={{
          color: "#ccc",
          fontSize: 12,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
          minHeight: 120,
          lineHeight: 1.6,
          textAlign: rtl ? "right" : "left",
        }}
      >
        {text || "— 待機中 —"}
      </pre>
      {stance && (
        <div
          style={{
            marginTop: 12,
            padding: "4px 8px",
            background:
              stance === "PASS" ? "#003322" : stance === "DENY" ? "#330011" : "#332200",
            color:
              stance === "PASS" ? "#00ff88" : stance === "DENY" ? "#ff3366" : "#ffaa00",
            fontSize: 11,
            letterSpacing: 2,
            display: "inline-block",
          }}
        >
          STANCE: {stance}
        </div>
      )}
    </div>
  );
}

function DecisivenessBar({ value }) {
  const v = typeof value === "number" ? Math.max(0, Math.min(1, value)) : 0;
  const color = v >= 0.7 ? "#00ff88" : v >= 0.4 ? "#ffaa00" : "#ff3366";
  return (
    <div>
      <div style={{ color: "#555", fontSize: 10 }}>DECISIVENESS</div>
      <div
        style={{
          width: 120,
          height: 8,
          background: "#1a1a1a",
          marginTop: 6,
          position: "relative",
        }}
      >
        <div
          style={{
            width: `${v * 100}%`,
            height: "100%",
            background: color,
            transition: "width 0.4s",
          }}
        />
      </div>
      <div style={{ color, fontSize: 11, marginTop: 4, letterSpacing: 1 }}>
        {v.toFixed(2)}
      </div>
    </div>
  );
}

export default function SingleView() {
  const [flights, setFlights] = useState(MOCK_FLIGHTS);
  const [flightSource, setFlightSource] = useState("mock");
  const [flightIndex, setFlightIndex] = useState(0);
  const [securityText, setSecurityText] = useState("");
  const [flowText, setFlowText] = useState("");
  const [careText, setCareText] = useState("");
  const [verdict, setVerdict] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | fetching | deliberating | speaking | testing
  const [sameInputResults, setSameInputResults] = useState([]);
  const [langOverride, setLangOverride] = useState(""); // "" = auto

  const flight = flights[flightIndex] ?? MOCK_FLIGHTS[0];
  const autoLang = useMemo(() => detectLanguage(flight?.origin), [flight]);
  const activeLang = langOverride || autoLang;
  const activeLangMeta = languageMeta(activeLang);

  // 起動時に OpenSky から 5 便取得（CycleView と同じソース）。失敗時はモック。
  const refreshFlights = useCallback(async () => {
    setPhase("fetching");
    const fetched = await fetchFiveFlights();
    setFlights(fetched);
    setFlightSource(
      fetched.some((f) => f.source === "opensky") ? "opensky" : "mock"
    );
    setFlightIndex(0);
    setSecurityText("");
    setFlowText("");
    setCareText("");
    setVerdict(null);
    setSameInputResults([]);
    setLangOverride("");
    setPhase("idle");
  }, []);

  useEffect(() => {
    refreshFlights();
  }, [refreshFlights]);

  const onAgentChunk = useCallback((agent, text) => {
    if (agent === "SECURITY") setSecurityText(text);
    else if (agent === "FLOW") setFlowText(text);
    else if (agent === "CARE") setCareText(text);
  }, []);

  const deliberate = useCallback(async () => {
    setPhase("deliberating");
    setSecurityText("");
    setFlowText("");
    setCareText("");
    setVerdict(null);

    const result = await deliberateOne(flight, {
      onAgent: onAgentChunk,
      language: activeLang,
    });
    setVerdict(result.verdict);

    setPhase("speaking");
    await speak(result.securityText, "onyx");
    await speak(result.flowText, "nova");
    await speak(result.careText, "shimmer");

    setPhase("done");
  }, [flight, onAgentChunk, activeLang]);

  const runSameInputTest = useCallback(async () => {
    setPhase("testing");
    setSameInputResults([]);
    for (let i = 0; i < 10; i++) {
      const r = await deliberateOne(flight, { language: activeLang });
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
    setPhase("done");
  }, [flight, activeLang]);

  const nextFlight = () => {
    setFlightIndex((i) => (i + 1) % flights.length);
    setSecurityText("");
    setFlowText("");
    setCareText("");
    setVerdict(null);
    setSameInputResults([]);
    setLangOverride("");
    setPhase("idle");
  };

  const permission = verdict?.final_judgment?.permission;
  const fj = verdict?.final_judgment;
  const isBusy =
    phase === "fetching" ||
    phase === "deliberating" ||
    phase === "speaking" ||
    phase === "testing";

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
        }}
      >
        <div>
          <div
            style={{ color: "#555", fontSize: 10, letterSpacing: 4, marginBottom: 4 }}
          >
            SINGLE DELIBERATION INTERFACE
          </div>
          <div style={{ color: "#fff", fontSize: 18, letterSpacing: 2 }}>
            ▸ SECURITY · FLOW · CARE
          </div>
          <div style={{ color: "#555", fontSize: 10, letterSpacing: 2, marginTop: 6 }}>
            {phase === "fetching" ? (
              "FETCHING LIVE FLIGHTS..."
            ) : (
              <>
                {flights.length} FLIGHTS LOADED · SOURCE:{" "}
                <span
                  style={{
                    color: flightSource === "opensky" ? "#00ff88" : "#ffaa00",
                    letterSpacing: 2,
                  }}
                >
                  {flightSource.toUpperCase()}
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={refreshFlights}
            disabled={isBusy}
            title="OpenSky から稼働中フライトを再取得"
            style={{
              background: isBusy ? "#111" : "#0d0d0d",
              border: "1px solid #333",
              color: isBusy ? "#444" : "#888",
              padding: "8px 14px",
              cursor: isBusy ? "not-allowed" : "pointer",
              fontFamily: "monospace",
              letterSpacing: 2,
              fontSize: 11,
            }}
          >
            ↻ REFRESH FLIGHTS
          </button>
          <button
            onClick={runSameInputTest}
            disabled={isBusy}
            title="同じ入力で連続10回判定 → 判定がブレることを検証"
            style={{
              background: isBusy ? "#111" : "#0d0d0d",
              border: "1px solid #444",
              color: isBusy ? "#555" : "#bbb",
              padding: "8px 14px",
              cursor: isBusy ? "not-allowed" : "pointer",
              fontFamily: "monospace",
              letterSpacing: 2,
              fontSize: 11,
            }}
          >
            🔀 SAME INPUT TEST ×10
          </button>
        </div>
      </div>

      {/* Flight Info */}
      <div
        style={{
          background: "#0d0d0d",
          border: "1px solid #1a1a1a",
          borderRadius: 4,
          padding: "12px 16px",
          marginBottom: 20,
          display: "flex",
          gap: 32,
          flexWrap: "wrap",
          fontSize: 12,
        }}
      >
        <div>
          <div style={{ color: "#555", fontSize: 10 }}>FLIGHT</div>
          <div style={{ color: "#fff", fontSize: 16 }}>
            {flight.callsign || flight.flight}
          </div>
        </div>
        <div>
          <div style={{ color: "#555", fontSize: 10 }}>ROUTE</div>
          <div style={{ color: "#ccc" }}>
            {flight.origin} → {flight.destination}
          </div>
        </div>
        <div>
          <div style={{ color: "#555", fontSize: 10 }}>STATUS</div>
          <div
            style={{
              color:
                flight.status === "ON_TIME"
                  ? "#00ff88"
                  : flight.status === "DELAYED"
                  ? "#ffaa00"
                  : "#88aaff",
            }}
          >
            {flight.status}
          </div>
        </div>
        {typeof flight.passengerCount === "number" && (
          <div>
            <div style={{ color: "#555", fontSize: 10 }}>PAX</div>
            <div style={{ color: "#ccc" }}>{flight.passengerCount}</div>
          </div>
        )}
        <div>
          <div style={{ color: "#555", fontSize: 10 }}>METAL ALERT</div>
          <div style={{ color: flight.metalAlert ? "#ff3366" : "#555" }}>
            {flight.metalAlert ? "⚠ YES" : "CLEAR"}
          </div>
        </div>
        <div>
          <div style={{ color: "#555", fontSize: 10 }}>CONGESTION</div>
          <div
            style={{
              color:
                flight.congestionLevel === "HIGH"
                  ? "#ff3366"
                  : flight.congestionLevel === "MEDIUM"
                  ? "#ffaa00"
                  : "#00ff88",
            }}
          >
            {flight.congestionLevel}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <div style={{ color: "#555", fontSize: 10 }}>LANGUAGE</div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginTop: 2,
            }}
          >
            <div style={{ color: "#ccc", fontSize: 14 }}>
              {activeLangMeta.native}{" "}
              <span style={{ color: "#555", fontSize: 11, letterSpacing: 2 }}>
                ({activeLangMeta.displayCode})
              </span>
            </div>
            <select
              value={langOverride}
              onChange={(e) => setLangOverride(e.target.value)}
              disabled={isBusy}
              style={{
                background: "#0a0a0a",
                color: "#888",
                border: "1px solid #333",
                padding: "2px 6px",
                fontFamily: "monospace",
                fontSize: 11,
              }}
            >
              <option value="">AUTO ({autoLang.toUpperCase()})</option>
              {Object.entries(LANG_META).map(([code, m]) => (
                <option key={code} value={code}>
                  {m.displayCode} · {m.native}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <button
          onClick={deliberate}
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
          {phase === "fetching"
            ? "▸ FETCHING FLIGHTS..."
            : phase === "deliberating"
            ? "▸ DELIBERATING..."
            : phase === "speaking"
            ? "▸ ANNOUNCING..."
            : phase === "testing"
            ? "▸ RUNNING TEST..."
            : "▸ INITIATE DELIBERATION"}
        </button>
        <button
          onClick={nextFlight}
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
          NEXT FLIGHT →
        </button>
      </div>

      {/* Agent Cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <AgentCard
          name="SECURITY"
          label="PAST × SAFETY"
          color="#4488ff"
          text={securityText}
          stance={securityText ? extractStance(securityText) : null}
          lang={activeLang}
        />
        <AgentCard
          name="FLOW"
          label="PRESENT × EFFICIENCY"
          color="#ff8844"
          text={flowText}
          stance={flowText ? extractStance(flowText) : null}
          lang={activeLang}
        />
        <AgentCard
          name="CARE"
          label="FUTURE × HUMANITY"
          color="#88ff88"
          text={careText}
          stance={careText ? extractStance(careText) : null}
          lang={activeLang}
        />
      </div>

      {/* Final Verdict */}
      {verdict && (
        <div
          style={{
            border: `1px solid ${PERMISSION_COLOR[permission] || "#555"}`,
            borderRadius: 4,
            padding: "16px",
            background: "#0a0a0a",
          }}
        >
          <div
            style={{
              color: "#555",
              fontSize: 10,
              letterSpacing: 3,
              marginBottom: 12,
            }}
          >
            [CLEARANCE ORCHESTRATOR] — FINAL VERDICT
          </div>
          <div
            style={{
              display: "flex",
              gap: 32,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ color: "#555", fontSize: 10 }}>PERMISSION</div>
              <div
                style={{
                  color: PERMISSION_COLOR[permission] || "#ccc",
                  fontSize: 22,
                  letterSpacing: 3,
                  marginTop: 2,
                }}
              >
                {permission}
              </div>
            </div>
            <div>
              <div style={{ color: "#555", fontSize: 10 }}>SPEED FACTOR</div>
              <div style={{ color: "#ccc", fontSize: 18, marginTop: 6 }}>
                {fj?.speed_factor?.toFixed(2)}×
              </div>
            </div>
            <div>
              <div style={{ color: "#555", fontSize: 10 }}>DIRECTION</div>
              <div
                style={{ color: "#ccc", fontSize: 14, letterSpacing: 2, marginTop: 8 }}
              >
                {fj?.direction?.toUpperCase()}
              </div>
            </div>
            <div>
              <div style={{ color: "#555", fontSize: 10 }}>DURATION</div>
              <div style={{ color: "#ccc", fontSize: 14, marginTop: 8 }}>
                {fj?.duration_seconds}s
              </div>
            </div>
            <div>
              <div style={{ color: "#555", fontSize: 10 }}>BEHAVIOR</div>
              <div
                style={{
                  color: "#ccc",
                  fontSize: 12,
                  letterSpacing: 2,
                  marginTop: 8,
                }}
              >
                {BEHAVIOR_LABEL[fj?.behavior_modifier] || "—"}
              </div>
            </div>
            <DecisivenessBar value={fj?.decisiveness} />
            <div style={{ marginLeft: "auto" }}>
              <div style={{ color: "#333", fontSize: 10, letterSpacing: 2 }}>
                REASONING: CLASSIFIED
              </div>
              <div
                style={{
                  color: "#333",
                  fontSize: 10,
                  letterSpacing: 2,
                  marginTop: 4,
                }}
              >
                RISK_SCORE: WITHHELD
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Translation Engine — verdict → 5個体の動きパラメータ */}
      {verdict && (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              color: "#888",
              fontSize: 10,
              letterSpacing: 3,
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span>OUTBOUND TELEMETRY — OSC PARAMETERS</span>
            <span style={{ color: "#444", fontSize: 9 }}>
              [M5Stack receiver offline · log preview only]
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 8,
            }}
          >
            {INDIVIDUALS.map((ind) => {
              const t = translateJudgment(verdict, ind);
              return (
                <div
                  key={ind.id}
                  style={{
                    border: "1px solid #222",
                    background: "#0a0a0a",
                    padding: "10px 12px",
                    fontFamily: "monospace",
                  }}
                >
                  <div
                    style={{
                      color: "#fff",
                      fontSize: 12,
                      letterSpacing: 2,
                      marginBottom: 2,
                    }}
                  >
                    #{ind.id} {ind.label}
                  </div>
                  <div
                    style={{
                      color: "#555",
                      fontSize: 9,
                      marginBottom: 8,
                      lineHeight: 1.5,
                    }}
                  >
                    {ind.contents}
                    <br />
                    base {ind.base_speed.toFixed(1)}× · {ind.behavior_lean}
                  </div>
                  <pre
                    style={{
                      color: "#7fa",
                      fontSize: 10,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      lineHeight: 1.6,
                    }}
                  >
                    {t.oscLines.join("\n")}
                  </pre>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SAME INPUT TEST results */}
      {sameInputResults.length > 0 && (
        <div
          style={{
            marginTop: 20,
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
            {flight.callsign || flight.flight})
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
      {verdict && (
        <details style={{ marginTop: 16 }}>
          <summary
            style={{ color: "#444", fontSize: 10, cursor: "pointer", letterSpacing: 2 }}
          >
            RAW OUTPUT (OPERATOR ONLY)
          </summary>
          <pre
            style={{ color: "#333", fontSize: 10, marginTop: 8, whiteSpace: "pre-wrap" }}
          >
            {JSON.stringify(verdict, null, 2)}
          </pre>
        </details>
      )}
    </>
  );
}
