// CLEARANCE SYSTEM 中央サーバー
// - OpenSky から 5 便取得 → 1 便 1 スーツケース固定割当
// - 5 台分を並列に 3 エージェント判定 → verdict → base OSC
// - 議論ログから対立アナウンス抽出、HISTORY 蓄積
// - 状態を WebSocket で各フロント（/suitcase/:id, /board, /cycle）へ配信
//
// ※ OSC 実 UDP 送信は Step3、衝突回避は Step4 でこのループに差し込む。
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

const PORT = Number(process.env.CLEARANCE_PORT ?? 8787);
const CYCLE_GAP_MS = Number(process.env.CLEARANCE_CYCLE_GAP_MS ?? 10_000);
const FLIGHT_TTL_MS = Number(process.env.CLEARANCE_FLIGHT_TTL_MS ?? 120_000);

const state = new ClearanceState();
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

  // TODO(Step4): 位置 provider + 衝突回避で oscCorrected を算出し setCorrected

  // OSC 送信: 実効パラメータ（補正後があればそれ、無ければ base）を
  // 各スーツケースの対応 M5Stack へ UDP 送信する。
  let oscCount = 0;
  for (const s of FLEET) {
    const params = state.effectiveOsc(s.suitcaseId);
    if (!params) continue;
    const sent = sendSuitcaseOsc(s.suitcaseId, params);
    state.setOscSent(s.suitcaseId, sent);
    oscCount += 1;
  }

  broadcast();
  console.log(`[cycle ${state.cycle}] judged ${cycleResults.length}/5, osc sent ${oscCount}/5`);
}

async function loop() {
  try {
    await runCycle();
  } catch (e) {
    console.error("[cycle] error:", e.message);
  }
  setTimeout(loop, CYCLE_GAP_MS);
}

server.listen(PORT, () => {
  console.log(`CLEARANCE central server on http://localhost:${PORT}`);
  console.log(`  WebSocket:  ws://localhost:${PORT}`);
  console.log(`  state:      http://localhost:${PORT}/state`);
  initOscPorts();
  // 起動直後に最初のサイクル
  loop();
});

function shutdown() {
  console.log("\n[server] shutting down...");
  closeOscPorts();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
