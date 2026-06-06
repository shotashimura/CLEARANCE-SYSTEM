// mock 位置 provider。
// 実カメラ/ArUco 検出の代わりに、5台のスーツケースを展示空間内で
// 擬似的に動かす。衝突回避ロジックを「入力あり」で検証できるよう、
// ときどき接近・壁寄りが発生するように動かす。
//
// 後日この provider を ArUco 版（天井カメラ + OpenCV の検出結果）に
// 差し替えれば、collision はそのまま実データで動く。
import { FLEET } from "../../src/config/fleet.js";
import { ROOM } from "./index.js";

export function createMockPositionProvider() {
  // 各スーツケースに初期位置・速度・向きを与える
  const agents = new Map();
  const n = FLEET.length;
  FLEET.forEach((s, i) => {
    // 横一列に等間隔配置から開始
    const x = ROOM.margin + ((ROOM.width - 2 * ROOM.margin) * (i + 0.5)) / n;
    const y = ROOM.height / 2;
    const heading = i % 2 === 0 ? 0.4 : Math.PI - 0.4;
    agents.set(s.suitcaseId, {
      x,
      y,
      heading,
      speed: 0.25 + 0.05 * i, // [m/step] 程度
    });
  });

  let step = 0;

  function tick() {
    step += 1;
    const positions = new Map();
    const ts = Date.now();
    for (const [id, a] of agents) {
      // 進行方向に少し進む
      a.x += Math.cos(a.heading) * a.speed;
      a.y += Math.sin(a.heading) * a.speed;

      // 壁で反射（margin 内側で跳ね返す）
      if (a.x < ROOM.margin) {
        a.x = ROOM.margin;
        a.heading = Math.PI - a.heading;
      } else if (a.x > ROOM.width - ROOM.margin) {
        a.x = ROOM.width - ROOM.margin;
        a.heading = Math.PI - a.heading;
      }
      if (a.y < ROOM.margin) {
        a.y = ROOM.margin;
        a.heading = -a.heading;
      } else if (a.y > ROOM.height - ROOM.margin) {
        a.y = ROOM.height - ROOM.margin;
        a.heading = -a.heading;
      }

      // 緩やかに向きを揺らして、たまに接近が起きるようにする
      a.heading += Math.sin((step + id * 7) * 0.15) * 0.08;

      positions.set(id, {
        x: round(a.x),
        y: round(a.y),
        heading: round(a.heading, 3),
        ts,
      });
    }
    return positions;
  }

  return {
    kind: "mock",
    getPositions: tick,
  };
}

function round(n, d = 2) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
