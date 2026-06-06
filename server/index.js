// CLEARANCE SYSTEM 中央サーバー
// - OpenSky から 5 便取得 → 1 便 1 スーツケース固定割当
// - 5 台分を並列に 3 エージェント判定 → verdict → base OSC
// - 議論ログから対立アナウンス抽出、HISTORY 蓄積
// - 位置 provider + 衝突回避で base OSC を補正 → 実効 OSC を UDP 送信
// - 状態を WebSocket で各フロント（/suitcase/:id, /board, /cycle）へ配信
//
// 2つのループで動く:
//   judgeLoop  (低頻度, ~10s): 判定→base OSC→アナウンス→HISTORY
//   motionLoop (高頻度, ~0.5s): 位置取得→衝突回避→OSC補正→UDP送信→配信
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
const CYCLE_GAP_MS = Number(process.env.CLEARANCE_CYCLE_GAP_MS ?? 10_000);
const FLIGHT_TTL_MS = Number(process.env.CLEARANCE_FLIGHT_TTL_MS ?? 120_000);
const MOTION_GAP_MS = Number(process.env.CLEARANCE_MOTION_GAP_MS ?? 500);

const state = new ClearanceState();
const positionProvider = createPositionProvider(process.env.CLEARANCE_POSITION ?? "mock");
let lastFlightFetch = 0;

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

async function runCycle() {
  await refreshFlightsIfNeeded();

  // 5台分を並列に判定（1便1スーツケース）
  const results = await Promise.all(
    FLEET.map((s) => {
      const rec = state.suitcases.get(s.suitcaseId);
      if (!rec.flight) return Promise.resolve(null);
      return deliberateOne(rec.flight)
        .then((r) => ({ suitcaseId: s.suitcaseId, result: r }))
        .catch((e) => {
          console.error(`[deliberate] suitcase ${s.suitcaseId}:`, e.message);
          return null;
        });
    })
  );

  const cycleResults = [];
  const stamp = Date.now();
  const historyAdds = [];
  for (const item of results) {
    if (!item) continue;
    state.setVerdict(item.suitcaseId, item.result);
    cycleResults.push(item.result);
    const fj = item.result.verdict?.final_judgment;
    const rec = state.suitcases.get(item.suitcaseId);
    if (fj) {
      historyAdds.push({
        time: stamp,
        suitcaseId: item.suitcaseId,
        callsign: rec.flight?.callsign ?? rec.flight?.flight ?? "----",
        origin: rec.flight?.origin ?? "---",
        destination: rec.flight?.destination ?? "---",
        permission: fj.permission,
        alert: announcementFor(item.result),
      });
    }
  }
  state.pushHistory(historyAdds);
  state.setAnnouncement(pickCycleAnnouncement(cycleResults));
  state.incrementCycle();

  // 判定が更新されたらすぐ一度配信（OSC 送信は motionLoop が高頻度で担当）
  broadcast();
  console.log(`[cycle ${state.cycle}] judged ${cycleResults.length}/5`);
}

// 判定ループ（低頻度）: OpenSky取得→判定→base OSC→アナウンス
async function judgeLoop() {
  try {
    await runCycle();
  } catch (e) {
    console.error("[judge] error:", e.message);
  }
  setTimeout(judgeLoop, CYCLE_GAP_MS);
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
