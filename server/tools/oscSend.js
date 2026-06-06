// M5Stack への OSC 送信テスト（中央サーバー全体を起動せず単体で実行）。
// 指定したホスト:ポートへ /suitcase/<ID>/* をアニメーション送信し、
// M5 の画面で値が動くことを確認するための道具。
//
// 使い方:
//   node server/tools/oscSend.js <host> [port] [suitcaseId]
//   例: node server/tools/oscSend.js 192.168.10.42 8000 1
//
// host は M5Stack の画面に表示される IP を入れる。
import osc from "osc";

const host = process.argv[2] || process.env.M5_HOST;
const port = Number(process.argv[3] || 8000);
const id = Number(process.argv[4] || 1);

if (!host) {
  console.error(
    "usage: node server/tools/oscSend.js <host> [port] [suitcaseId]\n" +
      "  例: node server/tools/oscSend.js 192.168.10.42 8000 1"
  );
  process.exit(1);
}

const udp = new osc.UDPPort({
  localAddress: "0.0.0.0",
  localPort: 0, // OS に任せる
  remoteAddress: host,
  remotePort: port,
  metadata: true,
});

function sendFloat(address, value) {
  udp.send({ address, args: [{ type: "f", value: Number(value) }] });
}
function sendString(address, value) {
  udp.send({ address, args: [{ type: "s", value: String(value) }] });
}

const BEHAVIORS = ["assertive", "hesitant", "frozen", "random_walk"];

udp.on("ready", () => {
  console.log(`OSC test → ${host}:${port}  (/suitcase/${id}/*)  Ctrl+C で停止`);
  let t = 0;
  setInterval(() => {
    const base = `/suitcase/${id}`;
    const speed = Number((0.5 + 0.5 * Math.sin(t / 5)).toFixed(2)); // 0..1 を往復
    const direction = Math.sin(t / 8) >= 0 ? 1 : -1;
    const steering = Number(Math.sin(t / 4).toFixed(2)); // -1..1
    const behavior = BEHAVIORS[Math.floor(t / 3) % BEHAVIORS.length];

    sendFloat(`${base}/speed`, speed);
    sendFloat(`${base}/direction`, direction);
    sendFloat(`${base}/steering`, steering);
    sendFloat(`${base}/duration`, 10);
    sendFloat(`${base}/jitter`, 0.05);
    sendFloat(`${base}/hesitation`, 1.2);
    sendString(`${base}/behavior`, behavior);

    console.log(
      `t=${String(t).padStart(3)}  speed=${speed.toFixed(2)} dir=${direction} ` +
        `steer=${steering.toFixed(2)} behavior=${behavior}`
    );
    t++;
  }, 500);
});

udp.on("error", (e) => console.error("[osc] error:", e.message));
udp.open();

process.on("SIGINT", () => {
  console.log("\nstopped.");
  try {
    udp.close();
  } catch {
    // noop
  }
  process.exit(0);
});
