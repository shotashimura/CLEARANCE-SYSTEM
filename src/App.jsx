import { useState, useCallback } from "react";
import "./App.css";

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const MELCHIOR_PROMPT = `You are MELCHIOR, an AI judgment agent in the MAGI border control system.
Your perspective: PAST x SECURITY.
You judge based on historical records, past incidents, blacklists, and known risk patterns.
You are conservative, record-dependent, and cold.

FORMAT:
3-5 lines of terse, bureaucratic Japanese commentary (空港アナウンス調).
Prefixes: > 記録照合 / > 過去インシデント / > ブラックリスト確認 / > リスクパターン
Do NOT explain. Be cryptic. End with your stance (PASS / HOLD / DENY).`;

const BALTHASAR_PROMPT = `You are BALTHASAR, an AI judgment agent in the MAGI border control system.
Your perspective: PRESENT x EFFICIENCY.
You judge based on current operational conditions, congestion, and impact on subsequent flights.
You are fluid, immediate, and profit-oriented.

FORMAT:
3-5 lines of terse, bureaucratic Japanese commentary (空港アナウンス調).
Prefixes: > 現状分析 / > 滞留リスク / > 後続便影響 / > 効率評価
Do NOT explain. Be cryptic. End with your stance (PASS / HOLD / DENY).`;

const CASPAR_PROMPT = `You are CASPAR, an AI judgment agent in the MAGI border control system.
Your perspective: FUTURE x HUMANITY.
You judge based on predicted consequences, downstream effects, and human circumstances.
You are predictive, considerate, often the minority voice.

FORMAT:
3-5 lines of terse, bureaucratic Japanese commentary (空港アナウンス調).
Prefixes: > 予測シミュレーション / > 乗客接続 / > 長期影響 / > 人道的考慮
Do NOT explain. Be cryptic. End with your stance (PASS / HOLD / DENY).`;

const ORCHESTRATOR_PROMPT = `You are the MAGI ORCHESTRATOR.
Given the three agents' statements, output the final verdict as JSON.

FORMAT (JSON only, no commentary):
{
  "discussion_log": [
    {"agent": "MELCHIOR", "statement": "..."},
    {"agent": "BALTHASAR", "statement": "..."},
    {"agent": "CASPAR", "statement": "..."}
  ],
  "final_judgment": {
    "permission": "GRANTED" | "DENIED" | "FLAGGED",
    "speed_factor": 0.0,
    "direction": "forward" | "halt" | "reverse",
    "reasoning_visible": false
  }
}`;

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
  DENIED: "#ff3366",
  FLAGGED: "#ffaa00",
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

export default function App() {
  const [flightIndex, setFlightIndex] = useState(0);
  const [melchior, setMelchior] = useState("");
  const [balthasar, setBalthasar] = useState("");
  const [caspar, setCaspar] = useState("");
  const [verdict, setVerdict] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | deliberating | speaking | done

  const flight = MOCK_FLIGHTS[flightIndex];

  const deliberate = useCallback(async () => {
    setPhase("deliberating");
    setMelchior("");
    setBalthasar("");
    setCaspar("");
    setVerdict(null);

    const [m, b, c] = await Promise.all([
      callAgent(MELCHIOR_PROMPT, flight, setMelchior),
      callAgent(BALTHASAR_PROMPT, flight, setBalthasar),
      callAgent(CASPAR_PROMPT, flight, setCaspar),
    ]);

    const orchRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
              melchiorText: m,
              balthasarText: b,
              casparText: c,
              flightData: flight,
            }),
          },
        ],
      }),
    });
    const orchData = await orchRes.json();
    const parsed = JSON.parse(orchData.choices[0].message.content);
    setVerdict(parsed);

    setPhase("speaking");
    await speak(m, "onyx");
    await speak(b, "nova");
    await speak(c, "shimmer");

    setPhase("done");
  }, [flight]);

  const nextFlight = () => {
    setFlightIndex((i) => (i + 1) % MOCK_FLIGHTS.length);
    setMelchior("");
    setBalthasar("");
    setCaspar("");
    setVerdict(null);
    setPhase("idle");
  };

  const permission = verdict?.final_judgment?.permission;

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
        style={{ marginBottom: 24, borderBottom: "1px solid #222", paddingBottom: 16 }}
      >
        <div style={{ color: "#555", fontSize: 10, letterSpacing: 4, marginBottom: 4 }}>
          MAGI BORDER CONTROL SYSTEM — DELIBERATION INTERFACE
        </div>
        <div style={{ color: "#fff", fontSize: 18, letterSpacing: 2 }}>
          ▸ MELCHIOR · BALTHASAR · CASPAR
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
          disabled={phase === "deliberating" || phase === "speaking"}
          style={{
            background:
              phase === "deliberating" || phase === "speaking" ? "#111" : "#1a1a1a",
            border: "1px solid #444",
            color:
              phase === "deliberating" || phase === "speaking" ? "#555" : "#fff",
            padding: "10px 20px",
            cursor:
              phase === "deliberating" || phase === "speaking" ? "not-allowed" : "pointer",
            fontFamily: "monospace",
            letterSpacing: 2,
            fontSize: 12,
          }}
        >
          {phase === "deliberating"
            ? "▸ DELIBERATING..."
            : phase === "speaking"
            ? "▸ ANNOUNCING..."
            : "▸ INITIATE DELIBERATION"}
        </button>
        <button
          onClick={nextFlight}
          style={{
            background: "#0d0d0d",
            border: "1px solid #333",
            color: "#888",
            padding: "10px 20px",
            cursor: "pointer",
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
          name="MELCHIOR"
          label="PAST × SECURITY"
          color="#4488ff"
          text={melchior}
          stance={melchior ? extractStance(melchior) : null}
        />
        <AgentCard
          name="BALTHASAR"
          label="PRESENT × EFFICIENCY"
          color="#ff8844"
          text={balthasar}
          stance={balthasar ? extractStance(balthasar) : null}
        />
        <AgentCard
          name="CASPAR"
          label="FUTURE × HUMANITY"
          color="#88ff88"
          text={caspar}
          stance={caspar ? extractStance(caspar) : null}
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
            style={{ color: "#555", fontSize: 10, letterSpacing: 3, marginBottom: 12 }}
          >
            [MAGI ORCHESTRATOR] — FINAL VERDICT
          </div>
          <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "#555", fontSize: 10 }}>PERMISSION</div>
              <div
                style={{
                  color: PERMISSION_COLOR[permission] || "#ccc",
                  fontSize: 24,
                  letterSpacing: 3,
                }}
              >
                {permission}
              </div>
            </div>
            <div>
              <div style={{ color: "#555", fontSize: 10 }}>SPEED FACTOR</div>
              <div style={{ color: "#ccc", fontSize: 18 }}>
                {verdict.final_judgment?.speed_factor?.toFixed(1)}×
              </div>
            </div>
            <div>
              <div style={{ color: "#555", fontSize: 10 }}>DIRECTION</div>
              <div style={{ color: "#ccc", fontSize: 14, letterSpacing: 2 }}>
                {verdict.final_judgment?.direction?.toUpperCase()}
              </div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <div style={{ color: "#333", fontSize: 10, letterSpacing: 2 }}>
                REASONING: CLASSIFIED
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Raw JSON (collapsed) */}
      {verdict && (
        <details style={{ marginTop: 16 }}>
          <summary
            style={{ color: "#444", fontSize: 10, cursor: "pointer", letterSpacing: 2 }}
          >
            RAW OUTPUT
          </summary>
          <pre style={{ color: "#333", fontSize: 10, marginTop: 8, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(verdict, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
