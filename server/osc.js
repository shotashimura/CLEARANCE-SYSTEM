// OSC 実 UDP 送信。fleet 対応表の m5stack.host:port へ各スーツケースの
// 運動パラメータを送る。M5Stack 未接続でも UDP は「投げっぱなし」なので
// 受け手不在でもエラーにならない（送信ログだけ残す）。
//
// 1スーツケース = 1 UDPPort（送信専用）。送信先は fleet[id].m5stack。
// OSC アドレスは fleet[id].oscAddressBase = "/suitcase/{id}" を基底にする。
import osc from "osc";
import { FLEET, getSuitcase } from "../src/config/fleet.js";

// suitcaseId -> { port: osc.UDPPort, ready: bool, target: {host,port} }
const ports = new Map();

// ローカルの送信元ポート（M5Stack 側へは関係しないが UDPPort 起動に必要）。
let localPortCounter = 9100;

export function initOscPorts() {
  for (const s of FLEET) {
    const localPort = localPortCounter++;
    const udp = new osc.UDPPort({
      localAddress: "0.0.0.0",
      localPort,
      remoteAddress: s.m5stack.host,
      remotePort: s.m5stack.port,
      metadata: true,
    });
    const entry = { port: udp, ready: false, target: s.m5stack };
    udp.on("ready", () => {
      entry.ready = true;
    });
    udp.on("error", (err) => {
      // 送信先不達などは致命ではない。ログのみ。
      console.warn(`[osc] suitcase ${s.suitcaseId} port error: ${err.message}`);
    });
    udp.open();
    ports.set(s.suitcaseId, entry);
  }
  console.log(
    `[osc] initialized ${ports.size} UDP ports -> ` +
      FLEET.map((s) => `#${s.suitcaseId}:${s.m5stack.host}:${s.m5stack.port}`).join(" ")
  );
}

export function closeOscPorts() {
  for (const { port } of ports.values()) {
    try {
      port.close();
    } catch {
      // noop
    }
  }
  ports.clear();
}

// 運動パラメータ（base または衝突補正後）を OSC メッセージ群に変換する。
// 返り値は { address, args } の配列（ログ表示にも使える）。
export function oscMessagesFor(suitcaseId, params) {
  const s = getSuitcase(suitcaseId);
  if (!s || !params) return [];
  const base = s.oscAddressBase; // "/suitcase/{id}"
  const f = (v) => ({ type: "f", value: Number(v) || 0 });
  const str = (v) => ({ type: "s", value: String(v ?? "") });
  return [
    { address: `${base}/speed`, args: [f(params.speed)] },
    { address: `${base}/direction`, args: [f(params.direction)] },
    { address: `${base}/duration`, args: [f(params.duration)] },
    { address: `${base}/behavior`, args: [str(params.behavior)] },
    { address: `${base}/jitter`, args: [f(params.jitter)] },
    { address: `${base}/hesitation`, args: [f(params.hesitation)] },
    { address: `${base}/steering`, args: [f(params.steering_bias)] },
  ];
}

// 1スーツケース分のパラメータを対応 M5Stack へ送信する。
// 戻り値は送信したメッセージのプレーン表現（UI ログ/配信に使える）。
export function sendSuitcaseOsc(suitcaseId, params) {
  const messages = oscMessagesFor(suitcaseId, params);
  const entry = ports.get(suitcaseId);
  const target = entry?.target ?? getSuitcase(suitcaseId)?.m5stack ?? null;

  for (const msg of messages) {
    try {
      entry?.port?.send(msg);
    } catch (e) {
      console.warn(`[osc] send fail #${suitcaseId} ${msg.address}: ${e.message}`);
    }
  }

  return {
    suitcaseId,
    target,
    sentAt: Date.now(),
    lines: messages.map((m) => formatOscLine(m, target)),
  };
}

function formatOscLine(msg, target) {
  const argStr = msg.args
    .map((a) => (a.type === "s" ? `"${a.value}"` : Number(a.value).toFixed(3)))
    .join(" ");
  const dst = target ? `${target.host}:${target.port}` : "—";
  return `${msg.address.padEnd(26)} ${argStr.padEnd(10)} → ${dst}`;
}
