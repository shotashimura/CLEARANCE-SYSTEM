// CLEARANCE SYSTEM の判定パイプライン。
// 1便あたり SECURITY / FLOW / CARE を並列実行 → ORCHESTRATOR で集約。
// 5便を並列に走らせる runCycle() も同居。
// P3: 過去履歴は一切渡さない。messages 配列はサイクルごとに新規生成。

import {
  SECURITY_PROMPT,
  FLOW_PROMPT,
  CARE_PROMPT,
  ORCHESTRATOR_PROMPT,
} from "../prompts/index.js";

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

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
        onChunk?.(fullText);
      } catch {}
    }
  }
  return fullText;
}

export async function callAgent(systemPrompt, flightData, onChunk) {
  const res = await fetch(OPENAI_URL, {
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

export async function callOrchestrator(securityText, flowText, careText, flightData) {
  const res = await fetch(OPENAI_URL, {
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

/**
 * 1便分の合議。3エージェント並列 → オーケストレーター集約。
 * onAgent: (agentName, fullText) => void
 */
export async function deliberateOne(flight, { onAgent } = {}) {
  const [s, f, c] = await Promise.all([
    callAgent(SECURITY_PROMPT, flight, (t) => onAgent?.("SECURITY", t)),
    callAgent(FLOW_PROMPT, flight, (t) => onAgent?.("FLOW", t)),
    callAgent(CARE_PROMPT, flight, (t) => onAgent?.("CARE", t)),
  ]);
  const verdict = await callOrchestrator(s, f, c, flight);
  return {
    securityText: s,
    flowText: f,
    careText: c,
    verdict,
  };
}

/**
 * 5便を並列に判定する。flights.length 回 deliberateOne を Promise.all で実行。
 * onPairResult: (index, result) => void  — 完了した便から順次UI更新できる。
 */
export async function runCycle(flights, { onPairResult } = {}) {
  return Promise.all(
    flights.map((flight, idx) =>
      deliberateOne(flight).then((result) => {
        onPairResult?.(idx, result);
        return result;
      })
    )
  );
}
