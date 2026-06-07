// CLEARANCE SYSTEM 中央サーバー
// - OpenSky から 5 便取得 → 1 便 1 スーツケース固定割当
// - ① 判定はゆっくり、② 5台をラウンドロビンで1台ずつ判定（OpenAI 回数削減）
// - ③ verdict はオーケストレーター LLM を使わずサーバー側でコード集約
// - 位置 provider + 衝突回避で base OSC を補正 → 実効 OSC を UDP 送信
// - 状態を WebSocket で各フロント（/suitcase/:id, /board, /cycle）へ配信
//
// 2つのループで動く:
//   judgeLoop  (低頻度): 12秒ごとに「1台だけ」判定 → 各台は約60秒ごとに再判定
//   motionLoop (高頻度, ~0.5s): 位置取得→衝突回避→OSC補正→UDP送信→配信
//
// OpenAI 消費: 12秒ごとに1台 × 3コール = 約15コール/分
//   （従来 120コール/分 から約 1/8）
import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";

import { FLEET } from "../src/config/fleet.js";
import { fetchFiveFlights } from "./flights.js";
import { deliberateOne } from "./deliberation.js";
import { ClearanceState } from "./state.js";
import {
  announcementFor,
  pickCycleAnnouncement,
} from "../src/lib/announcement.js";
import { initOscPorts, sendSuitcaseOsc, closeOscPorts } from "./osc.js";
import { createPositionProvider } from "./position/index.js";
import { avoidCollisions } from "./collision.js";

const PORT = Number(process.env.CLEARANCE_PORT ?? 8787);
// ①② 1台あたり何秒間隔で判定するか / それを5台に割った1tickの間隔
const JUDGE_PER_SUITCASE_MS = Number(process.env.CLEARANCE_JUDGE_INTERVAL_MS ?? 60_000);
const JUDGE_TICK_MS = Math.max(2_000, Math.round(JUDGE_PER_SUITCASE_MS / FLEET.length));
const FLIGHT_TTL_MS = Number(process.env.CLEARANCE_FLIGHT_TTL_MS ?? 120_000);
const MOTION_GAP_MS = Number(process.env.CLEARANCE_MOTION_GAP_MS ?? 500);

const state = new ClearanceState();
const positionProvider = createPositionProvider(process.env.CLEARANCE_POSITION ?? "mock");
let lastFlightFetch = 0;
let rrIndex = 0; // ラウンドロビンの現在位置

// ---- HTTP (デバッグ用) + WebSocket ----
const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});
app.get("/health", (_req, res) => res.json({ ok: true, cycle: state.cycle }));
app.get("/state", (_req, res) => res.json(state.snapshot()));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  // 接続直後に現在の全状態を送る
  ws.send(JSON.stringify({ type: "state", payload: state.snapshot() }));
});

function broadcast() {
  const msg = JSON.stringify({ type: "state", payload: state.snapshot() });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

// ---- メインサイクル ----
async function refreshFlightsIfNeeded() {
  const now = Date.now();
  const needFetch =
    now - lastFlightFetch > FLIGHT_TTL_MS ||
    FLEET.some((s) => !state.suitcases.get(s.suitcaseId).flight);
  if (!needFetch) return;
  const flights = await fetchFiveFlights();
  const source = flights.some((f) => f?.source === "opensky") ? "opensky" : "mock";
  state.assignFlights(flights, source);
  lastFlightFetch = now;
  console.log(
    `[flights] source=${source} ` +
      flights.map((f) => `${f?.callsign ?? "----"}(${f?.region})`).join(" ")
  );
}

// state に保存済みの議論から、アナウンス再計算用の result 風オブジェクトを作る
function resultsFromState() {
  return FLEET.map((s) => {
    const rec = state.suitcases.get(s.suitcaseId);
    if (!rec.discussion || !rec.verdict) return null;
    return {
      securityText: rec.discussion.securityText,
      flowText: rec.discussion.flowText,
      careText: rec.discussion.careText,
      verdict: rec.verdict,
    };
  }).filter(Boolean);
}

// ②ラウンドロビン: 1 tick で「1台だけ」判定する。
async function judgeOne() {
  await refreshFlightsIfNeeded();

  const s = FLEET[rrIndex];
  const rec = state.suitcases.get(s.suitcaseId);

  if (rec.flight) {
    try {
      const result = await deliberateOne(rec.flight);
      state.setVerdict(s.suitcaseId, result);
      const fj = result.verdict?.final_judgment;
      if (fj) {
        state.pushHistory([
          {
            time: Date.now(),
            suitcaseId: s.suitcaseId,
            callsign: rec.flight?.callsign ?? rec.flight?.flight ?? "----",
            origin: rec.flight?.origin ?? "---",
            destination: rec.flight?.destination ?? "---",
            permission: fj.permission,
            alert: announcementFor(result),
          },
        ]);
      }
      console.log(
        `[judge] #${s.suitcaseId} ${s.label} → ${fj?.permission} ` +
          `(${result.language})`
      );
    } catch (e) {
      console.error(`[judge] suitcase ${s.suitcaseId}:`, e.message);
    }
  }

  // アナウンスは全台の最新判定から再計算（対立検出）
  state.setAnnouncement(pickCycleAnnouncement(resultsFromState()));

  // ポインタを進め、一周したらサイクル数を増やす
  rrIndex = (rrIndex + 1) % FLEET.length;
  if (rrIndex === 0) state.incrementCycle();

  broadcast();
}

// 判定ループ（低頻度）: 1 tick = 1台判定
async function judgeLoop() {
  try {
    await judgeOne();
  } catch (e) {
    console.error("[judge] error:", e.message);
  }
  setTimeout(judgeLoop, JUDGE_TICK_MS);
}

// 運動ループ（高頻度）: 位置取得→衝突回避→OSC補正→UDP送信→配信
let motionTick = 0;
function motionLoop() {
  try {
    const positions = positionProvider.getPositions();

    // base OSC（判定由来）を集める
    const baseParams = new Map();
    for (const s of FLEET) {
      baseParams.set(s.suitcaseId, state.suitcases.get(s.suitcaseId).osc);
    }

    // 衝突回避で補正
    const corrected = avoidCollisions(baseParams, positions);

    let oscCount = 0;
    let interventions = 0;
    for (const s of FLEET) {
      const id = s.suitcaseId;
      const c = corrected.get(id);
      const pos = positions.get(id) ?? null;
      if (!c || !c.params) {
        state.setCorrected(id, { position: pos, collision: null });
        continue;
      }
      state.setCorrected(id, {
        oscCorrected: c.params,
        position: pos,
        collision: c.collision,
      });
      if (c.collision && c.collision.state !== "CLEAR") interventions += 1;

      // 実効 OSC（補正後）を UDP 送信
      const sent = sendSuitcaseOsc(id, c.params);
      state.setOscSent(id, sent);
      oscCount += 1;
    }

    motionTick += 1;
    broadcast();
    if (motionTick % 20 === 0) {
      console.log(`[motion ${motionTick}] osc ${oscCount}/5, interventions ${interventions}`);
    }
  } catch (e) {
    console.error("[motion] error:", e.message);
  }
  setTimeout(motionLoop, MOTION_GAP_MS);
}

server.listen(PORT, () => {
  console.log(`CLEARANCE central server on http://localhost:${PORT}`);
  console.log(`  WebSocket:  ws://localhost:${PORT}`);
  console.log(`  state:      http://localhost:${PORT}/state`);
  const callsPerMin = Math.round((60_000 / JUDGE_TICK_MS) * 3);
  console.log(
    `  judge: 1台/${(JUDGE_TICK_MS / 1000).toFixed(0)}s ` +
      `(各台 約${(JUDGE_PER_SUITCASE_MS / 1000).toFixed(0)}s毎) ` +
      `→ OpenAI 約${callsPerMin}コール/分`
  );
  initOscPorts();
  // 判定ループと運動ループを起動
  judgeLoop();
  motionLoop();
});

function shutdown() {
  console.log("\n[server] shutting down...");
  closeOscPorts();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
