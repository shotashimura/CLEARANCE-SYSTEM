import { useState, useCallback } from "react";
import "./App.css";
import {
  SECURITY_PROMPT,
  FLOW_PROMPT,
  CARE_PROMPT,
  ORCHESTRATOR_PROMPT,
} from "./prompts/index.js";

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const MOCK_FLIGHTS = [
  {
    flight: "NH205",
    origin: "HND",
    destination: "FRA",
    departure: "2025-05-15T23:45:00+09:00",
    status: "ON_TIME",
    aircraft: "B787",
    passengerCount: 189,
    connectingFlights: 3,
    cargoWeight: 12400,
    metalAlert: true,
    routeHistory: "過去6ヶ月で同ルート類似プロファイル インシデント記録なし",
    congestionLevel: "HIGH",
    subsequentFlights: 3,
  },
  {
    flight: "JL407",
    origin: "NRT",
    destination: "CDG",
    departure: "2025-05-15T14:30:00+09:00",
    status: "DELAYED",
    aircraft: "B777",
    passengerCount: 245,
    connectingFlights: 7,
    cargoWeight: 18200,
    metalAlert: false,
    routeHistory: "同ルート過去3ヶ月：遅延2件、インシデント1件記録",
    congestionLevel: "MEDIUM",
    subsequentFlights: 7,
  },
  {
    flight: "BA018",
    origin: "HND",
    destination: "LHR",
    departure: "2025-05-15T11:00:00+09:00",
    status: "BOARDING",
    aircraft: "A380",
    passengerCount: 312,
    connectingFlights: 12,
    cargoWeight: 22100,
    metalAlert: false,
    routeHistory: "インシデント記録なし。スコアクリア",
    congestionLevel: "LOW",
    subsequentFlights: 12,
  },
];

async function parseStream(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6);
      if (raw === "[DONE]") break;
      try {
        const data = JSON.parse(raw);
        const text = data.choices?.[0]?.delta?.content || "";
        fullText += text;
        onChunk(fullText);
      } catch {}
    }
  }
  return fullText;
}

async function callAgent(systemPrompt, flightData, onChunk) {
  // P3: 過去履歴を一切渡さない。messages配列はサイクルごとに新規生成。
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 500,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(flightData) },
      ],
    }),
  });
  return parseStream(res, onChunk);
}

async function callOrchestrator(securityText, flowText, careText, flightData) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ORCHESTRATOR_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            securityText,
            flowText,
            careText,
            flightData,
          }),
        },
      ],
    }),
  });
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

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

function AgentCard({ name, label, color, text, stance }) {
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
        style={{
          color: "#ccc",
          fontSize: 12,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
          minHeight: 120,
          lineHeight: 1.6,
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

export default function App() {
  const [flightIndex, setFlightIndex] = useState(0);
  const [securityText, setSecurityText] = useState("");
  const [flowText, setFlowText] = useState("");
  const [careText, setCareText] = useState("");
  const [verdict, setVerdict] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | deliberating | speaking | done | testing
  const [sameInputResults, setSameInputResults] = useState([]); // P3 verification

  const flight = MOCK_FLIGHTS[flightIndex];

  const deliberate = useCallback(async () => {
    setPhase("deliberating");
    setSecurityText("");
    setFlowText("");
    setCareText("");
    setVerdict(null);

    const [s, f, c] = await Promise.all([
      callAgent(SECURITY_PROMPT, flight, setSecurityText),
      callAgent(FLOW_PROMPT, flight, setFlowText),
      callAgent(CARE_PROMPT, flight, setCareText),
    ]);

    const parsed = await callOrchestrator(s, f, c, flight);
    setVerdict(parsed);

    setPhase("speaking");
    await speak(s, "onyx");
    await speak(f, "nova");
    await speak(c, "shimmer");

    setPhase("done");
  }, [flight]);

  // P3: 同じ入力で連続10回判定 → 結果がブレることを確認
  const runSameInputTest = useCallback(async () => {
    setPhase("testing");
    setSameInputResults([]);
    for (let i = 0; i < 10; i++) {
      const [s, f, c] = await Promise.all([
        callAgent(SECURITY_PROMPT, flight, () => {}),
        callAgent(FLOW_PROMPT, flight, () => {}),
        callAgent(CARE_PROMPT, flight, () => {}),
      ]);
      const parsed = await callOrchestrator(s, f, c, flight);
      const fj = parsed?.final_judgment ?? {};
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
  }, [flight]);

  const nextFlight = () => {
    setFlightIndex((i) => (i + 1) % MOCK_FLIGHTS.length);
    setSecurityText("");
    setFlowText("");
    setCareText("");
    setVerdict(null);
    setSameInputResults([]);
    setPhase("idle");
  };

  const permission = verdict?.final_judgment?.permission;
  const fj = verdict?.final_judgment;

  const isBusy = phase === "deliberating" || phase === "speaking" || phase === "testing";

  return (
    <div
      style={{
        background: "#050505",
        minHeight: "100vh",
        color: "#ccc",
        padding: "24px",
        fontFamily: "monospace",
        boxSizing: "border-box",
      }}
    >
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
            CLEARANCE SYSTEM — DELIBERATION INTERFACE
          </div>
          <div style={{ color: "#fff", fontSize: 18, letterSpacing: 2 }}>
            ▸ SECURITY · FLOW · CARE
          </div>
        </div>
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
          <div style={{ color: "#fff", fontSize: 16 }}>{flight.flight}</div>
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
        <div>
          <div style={{ color: "#555", fontSize: 10 }}>PAX</div>
          <div style={{ color: "#ccc" }}>{flight.passengerCount}</div>
        </div>
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
          {phase === "deliberating"
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
        />
        <AgentCard
          name="FLOW"
          label="PRESENT × EFFICIENCY"
          color="#ff8844"
          text={flowText}
          stance={flowText ? extractStance(flowText) : null}
        />
        <AgentCard
          name="CARE"
          label="FUTURE × HUMANITY"
          color="#88ff88"
          text={careText}
          stance={careText ? extractStance(careText) : null}
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

      {/* SAME INPUT TEST results — P3 verification */}
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
            SAME INPUT TEST — FLAT JUDGMENT VERIFICATION ({flight.flight})
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

      {/* Raw JSON (collapsed) — operator-only, includes risk_score */}
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
    </div>
  );
}
