// サーバー側の CLEARANCE 判定パイプライン。
// フロントの src/lib/orchestrator.js と同等だが、API キーは process.env から取り、
// ストリーミングはしない（サーバーは最終テキストだけ必要）。
// プロンプト・言語・翻訳ロジックはフロントと共有モジュールを再利用する。
import {
  SECURITY_PROMPT,
  FLOW_PROMPT,
  CARE_PROMPT,
  ORCHESTRATOR_PROMPT,
} from "../src/prompts/index.js";
import { detectLanguage, languageInstruction } from "../src/lib/lang.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function apiKey() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY is not set (server/.env)");
  return k;
}

function withLanguage(basePrompt, lang) {
  if (!lang) return basePrompt;
  return `${basePrompt}\n\n--- LANGUAGE DIRECTIVE ---\n${languageInstruction(lang)}`;
}

async function callAgent(systemPrompt, flightData) {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(flightData) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI agent ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callOrchestrator(securityText, flowText, careText, flightData) {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ORCHESTRATOR_PROMPT },
        {
          role: "user",
          content: JSON.stringify({ securityText, flowText, careText, flightData }),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI orchestrator ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

/**
 * 1便分の合議。P3: 過去履歴は渡さず毎回フラット判定。
 * language 未指定時は flight.origin から自動推定。
 */
export async function deliberateOne(flight, { language } = {}) {
  const lang = language ?? detectLanguage(flight?.origin);
  const [s, f, c] = await Promise.all([
    callAgent(withLanguage(SECURITY_PROMPT, lang), flight),
    callAgent(withLanguage(FLOW_PROMPT, lang), flight),
    callAgent(withLanguage(CARE_PROMPT, lang), flight),
  ]);
  const verdict = await callOrchestrator(s, f, c, flight);
  return { securityText: s, flowText: f, careText: c, verdict, language: lang };
}
