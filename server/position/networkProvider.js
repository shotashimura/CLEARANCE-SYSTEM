// ネットワーク位置 provider（Step3）。
// 外部の検出プロセス（vision/detect.py）から UDP/JSON で送られてくる
// マーカー位置を受信し、衝突回避が使う {x, y, heading} に変換して保持する。
//
// 受信する JSON（1データグラム）:
//   { "markers": [ {"id":1, "nx":0.5, "ny":0.4, "yaw":12.3}, ... ], "ts": 169... }
//     nx, ny: 画像内の正規化座標 0..1 / yaw: 度
//
// 簡易マッピング（Step3）: nx,ny を部屋サイズ ROOM(8x5m) に線形展開する。
// 本番は天井カメラ＋ホモグラフィに差し替える（Step2）。その際もこの provider の
// インターフェース（getPositions）は不変。
import dgram from "node:dgram";
import { ROOM } from "./index.js";

const PORT = Number(process.env.CLEARANCE_POSITION_PORT ?? 8788);
const STALE_MS = Number(process.env.CLEARANCE_POSITION_STALE_MS ?? 2000);

function round(n, d = 2) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

export function createNetworkPositionProvider() {
  const latest = new Map(); // suitcaseId -> { x, y, heading, ts }
  const sock = dgram.createSocket("udp4");

  sock.on("message", (buf) => {
    try {
      const msg = JSON.parse(buf.toString());
      const now = Date.now();
      for (const m of msg.markers ?? []) {
        const id = Number(m.id);
        if (!id) continue;
        latest.set(id, {
          x: round((Number(m.nx) || 0) * ROOM.width),
          y: round((Number(m.ny) || 0) * ROOM.height),
          heading: round(((Number(m.yaw) || 0) * Math.PI) / 180, 3),
          ts: now,
        });
      }
    } catch {
      // 壊れたパケットは無視
    }
  });

  sock.on("error", (err) => {
    console.error("[position] UDP error:", err.message);
  });

  sock.bind(PORT, () => {
    console.log(`[position] aruco provider: UDP listening on ${PORT}`);
    console.log(`  検出プロセス側 (vision/detect.py) から JSON を送る`);
  });

  return {
    kind: "aruco",
    // 直近 STALE_MS 以内に受信した位置だけを返す（見失ったものは落とす）
    getPositions() {
      const now = Date.now();
      const out = new Map();
      for (const [id, p] of latest) {
        if (now - p.ts <= STALE_MS) out.set(id, p);
      }
      return out;
    },
    close() {
      try {
        sock.close();
      } catch {
        // noop
      }
    },
  };
}
