// 判定 → 動き翻訳エンジン
// CLEARANCE SYSTEM の verdict と、5台それぞれの個体パラメータを合成して
// 各スーツケースに送る動きパラメータ（OSC相当）に変換する。
// 本物の OSC 送信は展示時に M5Stack へ。本ファイルでは文字列ログまでを生成する。

export const PERMISSION_SPEED_MAP = {
  GRANTED: 1.0,
  GRANTED_CONDITIONAL: 0.5,
  FLAGGED: 0.2,
  PROCESSING: 0.0,
  DENIED: -0.5,
};

export const DIRECTION_VALUE = {
  forward: 1.0,
  halt: 0.0,
  reverse: -1.0,
};

// 企画書 7 ページ目の 5 類型。中身は観客には可視だが、システムの判定とは
// 独立に「動きのキャラクター」として作用する（戦術の側）。
export const INDIVIDUALS = [
  {
    id: 1,
    label: "TOURIST",
    contents: "普通の旅行物",
    tactic: "平凡さに隠れる",
    base_speed: 1.0,
    steering_bias: 0.0,
    behavior_lean: "assertive",
  },
  {
    id: 2,
    label: "DATA CARRIER",
    contents: "データ媒体",
    tactic: "読めないものを通す",
    base_speed: 1.4,
    steering_bias: 0.3,
    behavior_lean: "assertive",
  },
  {
    id: 3,
    label: "SUSPECT",
    contents: "レプリカ禁制品",
    tactic: "疑わしさで本当の中身を隠す",
    base_speed: 0.8,
    steering_bias: 0.5,
    behavior_lean: "hesitant",
  },
  {
    id: 4,
    label: "GHOST",
    contents: "物語の断片",
    tactic: "物語を放棄して読まれない",
    base_speed: 0.6,
    steering_bias: 0.0,
    behavior_lean: "random_walk",
  },
  {
    id: 5,
    label: "EMPTY",
    contents: "移動の痕跡のみ",
    tactic: "何も持たないことで情報を最小化",
    base_speed: 0.5,
    steering_bias: 0.0,
    behavior_lean: "hesitant",
  },
];

function round(n, digits = 2) {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/**
 * verdict（CLEARANCE SYSTEM の最終判定）と個体パラメータから、
 * 動きパラメータ（OSC送信相当）を生成する。
 *
 * 変換式（企画書 5 ページ目に準拠）:
 *   final_speed = PERMISSION_SPEED_MAP[permission] * speed_factor * base_speed
 *   jitter      = (risk_score / 100) * 0.15
 *   hesitation  = (1 - decisiveness) * 3.0   [秒]
 */
export function translateJudgment(verdict, individual) {
  const fj = verdict?.final_judgment ?? {};
  const permission = fj.permission ?? "PROCESSING";
  const speedMultiplier = PERMISSION_SPEED_MAP[permission] ?? 0;
  const speedFactor = typeof fj.speed_factor === "number" ? fj.speed_factor : 0;
  const riskScore = typeof fj.risk_score === "number" ? fj.risk_score : 0;
  const decisiveness =
    typeof fj.decisiveness === "number" ? fj.decisiveness : 0;
  const direction = fj.direction ?? "halt";
  const duration = typeof fj.duration_seconds === "number" ? fj.duration_seconds : 0;
  const behavior = fj.behavior_modifier ?? individual.behavior_lean;

  const finalSpeed = speedMultiplier * speedFactor * individual.base_speed;
  const jitter = (riskScore / 100) * 0.15;
  const hesitation = (1 - decisiveness) * 3.0;
  const directionValue = DIRECTION_VALUE[direction] ?? 0;

  const params = {
    suitcase_id: individual.id,
    speed: round(finalSpeed, 3),
    direction: directionValue,
    duration: round(duration, 1),
    behavior,
    jitter: round(jitter, 3),
    hesitation: round(hesitation, 2),
    steering_bias: individual.steering_bias,
  };

  return {
    params,
    oscLines: formatOsc(params),
  };
}

/**
 * 動きパラメータを OSC アドレス形式の文字列配列に整形する。
 * 展示時はこの内容を実 OSC で M5Stack に UDP 送信する想定。
 */
export function formatOsc(params) {
  const n = params.suitcase_id;
  return [
    `/suitcase/${n}/speed       ${params.speed.toFixed(3)}`,
    `/suitcase/${n}/direction   ${params.direction.toFixed(1)}`,
    `/suitcase/${n}/duration    ${params.duration.toFixed(1)}`,
    `/suitcase/${n}/behavior    "${params.behavior}"`,
    `/suitcase/${n}/jitter      ${params.jitter.toFixed(3)}`,
    `/suitcase/${n}/hesitation  ${params.hesitation.toFixed(2)}`,
    `/suitcase/${n}/steering    ${params.steering_bias.toFixed(2)}`,
  ];
}
