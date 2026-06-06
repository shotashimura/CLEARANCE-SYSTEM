// ============================================================================
// FLEET — 単一の真実 (Single Source of Truth)
// ----------------------------------------------------------------------------
// スーツケースID ↔ 中身/個体パラメータ ↔ フライト地域スロット ↔ 個別ページ
//   ↔ OSCアドレス ↔ M5Stack の対応を、この1ファイルで一意に固定する。
//
// フロントエンド（Vite/React）と中央サーバー（Node）の双方がこのファイルを
// import することで、対応関係が二重定義されず破綻しない。
//
// 重要な不変条件:
//   - 1スーツケース = 1便（固定対応。便の到着/欠航時に中央サーバーが再割当）
//   - suitcaseId は 1..5 の整数で、配列順とも一致させる
//   - OSCアドレスは /suitcase/{id}/* 名前空間
//   - M5Stack は 1台につき1つ。host:port は LAN 上の静的割当
// ============================================================================

export const FLEET = [
  {
    suitcaseId: 1,
    label: "TOURIST",
    contents: "普通の旅行物",
    tactic: "平凡さに隠れる",
    base_speed: 1.0,
    steering_bias: 0.0,
    behavior_lean: "assertive",
    flightRegion: "east_asia", // この地域の便を割り当てる
    page: "/suitcase/1",
    oscAddressBase: "/suitcase/1",
    m5stack: { id: "M5-01", host: "192.168.10.11", port: 8000 },
  },
  {
    suitcaseId: 2,
    label: "DATA CARRIER",
    contents: "データ媒体",
    tactic: "読めないものを通す",
    base_speed: 1.4,
    steering_bias: 0.3,
    behavior_lean: "assertive",
    flightRegion: "europe",
    page: "/suitcase/2",
    oscAddressBase: "/suitcase/2",
    m5stack: { id: "M5-02", host: "192.168.10.12", port: 8000 },
  },
  {
    suitcaseId: 3,
    label: "SUSPECT",
    contents: "レプリカ禁制品",
    tactic: "疑わしさで本当の中身を隠す",
    base_speed: 0.8,
    steering_bias: 0.5,
    behavior_lean: "hesitant",
    flightRegion: "middle_east",
    page: "/suitcase/3",
    oscAddressBase: "/suitcase/3",
    m5stack: { id: "M5-03", host: "192.168.10.13", port: 8000 },
  },
  {
    suitcaseId: 4,
    label: "GHOST",
    contents: "物語の断片",
    tactic: "物語を放棄して読まれない",
    base_speed: 0.6,
    steering_bias: 0.0,
    behavior_lean: "random_walk",
    flightRegion: "north_america",
    page: "/suitcase/4",
    oscAddressBase: "/suitcase/4",
    m5stack: { id: "M5-04", host: "192.168.10.14", port: 8000 },
  },
  {
    suitcaseId: 5,
    label: "EMPTY",
    contents: "移動の痕跡のみ",
    tactic: "何も持たないことで情報を最小化",
    base_speed: 0.5,
    steering_bias: 0.0,
    behavior_lean: "hesitant",
    flightRegion: "oceania",
    page: "/suitcase/5",
    oscAddressBase: "/suitcase/5",
    m5stack: { id: "M5-05", host: "192.168.10.15", port: 8000 },
  },
];

// suitcaseId の一覧（1..5）
export const SUITCASE_IDS = FLEET.map((s) => s.suitcaseId);

// id から fleet エントリを引く（id は number でも string でも可）
export function getSuitcase(id) {
  const n = Number(id);
  return FLEET.find((s) => s.suitcaseId === n) ?? null;
}

// 地域 → suitcase の逆引き
export function suitcaseForRegion(region) {
  return FLEET.find((s) => s.flightRegion === region) ?? null;
}

// この suitcase が割り当てられる地域 bounding box の順序（OpenSky取得順と一致）
export const REGION_ORDER = FLEET.map((s) => s.flightRegion);

// ----------------------------------------------------------------------------
// 後方互換: 既存コードが参照する INDIVIDUALS を FLEET から派生させる。
// （translateJudgment.js などが { id, label, contents, base_speed,
//   steering_bias, behavior_lean } を期待しているため形を保つ）
// ----------------------------------------------------------------------------
export const INDIVIDUALS = FLEET.map((s) => ({
  id: s.suitcaseId,
  label: s.label,
  contents: s.contents,
  tactic: s.tactic,
  base_speed: s.base_speed,
  steering_bias: s.steering_bias,
  behavior_lean: s.behavior_lean,
}));
