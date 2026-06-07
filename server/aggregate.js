// ③ オーケストレーターの LLM コールを置き換える機械的集約。
// 3エージェントの発言から stance(PASS/HOLD/DENY) を取り出し、final_judgment を
// サーバー側でコード算出する。これで 1 スーツケースあたりの OpenAI コールが
// 4 → 3 に減る（25%削減）。
//
// 作品コンセプト的にも、集約ロジックが「機械的で不透明・誰も責任を負わない」
// という批評性に忠実。さらに「同じ入力でも判定が時間でブレる」フラット判定の
// 恣意性は、ここに入れる制御された乱数 noise() で担保する。

const STANCE_RE = /\b(PASS|HOLD|DENY)\b/;
const LENIENCY = { PASS: 1.0, HOLD: 0.5, DENY: 0.0 };

function stanceOf(text) {
  const m = text?.match(STANCE_RE);
  return m ? m[1] : "HOLD"; // 読み取れなければ中庸
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function round(n, d = 2) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
// ±amp の一様乱数（フラット判定の揺らぎ源）
function noise(amp) {
  return (Math.random() - 0.5) * 2 * amp;
}

export function aggregateVerdict(securityText, flowText, careText) {
  const sec = stanceOf(securityText);
  const flo = stanceOf(flowText);
  const car = stanceOf(careText);
  const stances = [sec, flo, car];

  // 寛容度の平均（0=拒否寄り .. 1=通過寄り）
  const base = (LENIENCY[sec] + LENIENCY[flo] + LENIENCY[car]) / 3;

  // 合意度: 異なる stance の種類数（1種=高い一致 .. 3種=三者三様）+ ノイズ
  const distinct = new Set(stances).size;
  const decBase = distinct === 1 ? 0.9 : distinct === 2 ? 0.55 : 0.25;
  const decisiveness = round(clamp(decBase + noise(0.1), 0, 1), 2);

  // permission: base + ノイズ を5段階に割る（同じ入力でも結果がブレる）
  const score = clamp(base + noise(0.18), 0, 1);
  let permission;
  if (score >= 0.8) permission = "GRANTED";
  else if (score >= 0.6) permission = "GRANTED_CONDITIONAL";
  else if (score >= 0.4) permission = "FLAGGED";
  else if (score >= 0.2) permission = "PROCESSING";
  else permission = "DENIED";

  // risk_score: SECURITY 視点主導（観客非表示の内部値）
  const secRisk = sec === "DENY" ? 82 : sec === "HOLD" ? 52 : 22;
  const risk_score = Math.round(clamp(secRisk + noise(15), 0, 100));

  // speed_factor: 寛容度寄り
  const speed_factor = round(clamp(base + noise(0.12), 0, 1), 2);

  // direction
  const direction =
    permission === "DENIED"
      ? "reverse"
      : permission === "PROCESSING"
      ? "halt"
      : "forward";

  // duration: 合意が低いほど長い（迷っているように見える）
  const duration_seconds = Math.round(
    clamp(5 + (1 - decisiveness) * 15 + noise(2), 5, 20)
  );

  // behavior_modifier
  let behavior_modifier;
  if (permission === "PROCESSING") behavior_modifier = "frozen";
  else if (decisiveness < 0.5) behavior_modifier = "hesitant";
  else if (car === "PASS" && sec !== "DENY" && risk_score < 40)
    behavior_modifier = "random_walk";
  else if (permission === "GRANTED" && decisiveness >= 0.8)
    behavior_modifier = "assertive";
  else behavior_modifier = "hesitant";

  return {
    discussion_log: [
      { agent: "SECURITY", statement: securityText },
      { agent: "FLOW", statement: flowText },
      { agent: "CARE", statement: careText },
    ],
    final_judgment: {
      permission,
      risk_score,
      decisiveness,
      speed_factor,
      direction,
      duration_seconds,
      behavior_modifier,
      reasoning_visible: false,
    },
  };
}
