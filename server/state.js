// 中央サーバーの唯一の状態源 (single source of truth)。
// suitcaseId ごとに { 割当便, 判定, 議論, OSC, 位置, 衝突状態 } を保持する。
// フライトの割当は 1 便 1 スーツケース固定。便が無効化したら同地域の次候補へ再割当。
import { FLEET, INDIVIDUALS, getSuitcase } from "../src/config/fleet.js";
import { translateJudgment } from "../src/lib/translateJudgment.js";

const HISTORY_LIMIT = 40;

function individualOf(suitcaseId) {
  return INDIVIDUALS.find((i) => i.id === suitcaseId) ?? null;
}

export class ClearanceState {
  constructor() {
    this.startedAt = Date.now();
    this.cycle = 0;
    this.source = "mock";
    this.announcement = null;
    this.history = [];
    // suitcaseId -> per-suitcase record
    this.suitcases = new Map();
    for (const s of FLEET) {
      this.suitcases.set(s.suitcaseId, {
        suitcaseId: s.suitcaseId,
        label: s.label,
        contents: s.contents,
        flightRegion: s.flightRegion,
        page: s.page,
        m5stack: s.m5stack,
        oscAddressBase: s.oscAddressBase,
        flight: null,
        language: null,
        verdict: null,
        discussion: null, // { securityText, flowText, careText }
        osc: null, // base OSC params（衝突補正前）
        oscCorrected: null, // 衝突補正後（Step4 で設定）
        position: null, // { x, y, heading, ts }（Step4 で設定）
        collision: null, // { state, reason }（Step4 で設定）
        updatedAt: null,
      });
    }
  }

  // 地域順に並んだ5便を、対応する suitcase に固定割当する。
  assignFlights(flights, source) {
    this.source = source;
    for (const s of FLEET) {
      const flight = flights.find((f) => f?.region === s.flightRegion) ?? null;
      const rec = this.suitcases.get(s.suitcaseId);
      rec.flight = flight;
    }
  }

  // 1便分の判定結果を反映し、base OSC を算出する。
  setVerdict(suitcaseId, result) {
    const rec = this.suitcases.get(suitcaseId);
    if (!rec) return;
    rec.verdict = result.verdict ?? null;
    rec.language = result.language ?? null;
    rec.discussion = {
      securityText: result.securityText ?? "",
      flowText: result.flowText ?? "",
      careText: result.careText ?? "",
    };
    const individual = individualOf(suitcaseId);
    if (rec.verdict && individual) {
      const t = translateJudgment(rec.verdict, individual);
      rec.osc = t.params; // 衝突補正前のベース
    }
    rec.updatedAt = Date.now();
  }

  // Step4 用: 衝突補正後の OSC と位置・衝突状態をまとめて設定する。
  setCorrected(suitcaseId, { oscCorrected, position, collision }) {
    const rec = this.suitcases.get(suitcaseId);
    if (!rec) return;
    if (oscCorrected !== undefined) rec.oscCorrected = oscCorrected;
    if (position !== undefined) rec.position = position;
    if (collision !== undefined) rec.collision = collision;
  }

  pushHistory(entries) {
    this.history.push(...entries);
    if (this.history.length > HISTORY_LIMIT) {
      this.history = this.history.slice(this.history.length - HISTORY_LIMIT);
    }
  }

  setAnnouncement(msg) {
    this.announcement = msg ?? null;
  }

  incrementCycle() {
    this.cycle += 1;
  }

  // 1台分の購読用スナップショット（/suitcase/:id 用）。判定理由・risk_score は
  // 含めるが、フロント側で観客に出さない運用（禁則は表示層で担保）。
  suitcaseSnapshot(suitcaseId) {
    const rec = this.suitcases.get(Number(suitcaseId));
    if (!rec) return null;
    return JSON.parse(JSON.stringify(rec));
  }

  // 全体スナップショット（/board・/cycle・配信用）。
  snapshot() {
    return {
      startedAt: this.startedAt,
      cycle: this.cycle,
      source: this.source,
      announcement: this.announcement,
      history: this.history,
      suitcases: FLEET.map((s) => this.suitcaseSnapshot(s.suitcaseId)),
      fleet: FLEET.map((s) => ({
        suitcaseId: s.suitcaseId,
        label: s.label,
        page: s.page,
        oscAddressBase: s.oscAddressBase,
        m5stack: s.m5stack,
      })),
    };
  }
}

export { getSuitcase };
