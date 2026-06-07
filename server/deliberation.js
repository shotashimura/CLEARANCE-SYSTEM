// サーバー側の CLEARANCE 判定パイプライン。
// ③ オーケストレーターの LLM コールは廃止し、3エージェントの発言から
//    server/aggregate.js でコード集約する（1台あたり 4→3 コール）。
// ④ エージェントのモデルは既定で gpt-4o-mini（コスト削減）。
// プロンプト・言語ロジックはフロントと共有モジュールを再利用する。
import {
  SECURITY_PROMPT,
  FLOW_PROMPT,
  CARE_PROMPT,
} from "../src/prompts/index.js";
import { detectLanguage, languageInstruction } from "../src/lib/lang.js";
import { aggregateVerdict } from "./aggregate.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
// ④ 既定を gpt-4o-mini に。必要なら CLEARANCE_AGENT_MODEL で上書き。
const AGENT_MODEL = process.env.CLEARANCE_AGENT_MODEL ?? "gpt-4o-mini";

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
      model: AGENT_MODEL,
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

/**
 * 1便分の合議。3エージェントを並列に呼び、verdict はコード集約。
 * P3: 過去履歴は渡さず毎回フラット判定。
 * language 未指定時は flight.origin から自動推定。
 */
export async function deliberateOne(flight, { language } = {}) {
  const lang = language ?? detectLanguage(flight?.origin);
  const [s, f, c] = await Promise.all([
    callAgent(withLanguage(SECURITY_PROMPT, lang), flight),
    callAgent(withLanguage(FLOW_PROMPT, lang), flight),
    callAgent(withLanguage(CARE_PROMPT, lang), flight),
  ]);
  const verdict = aggregateVerdict(s, f, c);
  return { securityText: s, flowText: f, careText: c, verdict, language: lang };
}
