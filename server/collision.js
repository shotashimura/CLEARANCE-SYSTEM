// 衝突回避。各スーツケースの位置・向き（position provider）と、
// 判定から生成された base OSC を入力に取り、接近を予測して OSC を補正する。
//
// 企画書 9 ページ準拠: 補正は中央サーバー側で完結し、M5Stack はカメラ・
// 画像認識を持たず、補正後の OSC を受信して動くだけ。
//
// 補正の段階（近いほど強い介入）:
//   SLOW   : 接近を検知 → 減速（speed を縮小）
//   DIVERT : さらに接近 → 迂回（steering を曲げて回避方向へ）
//   STOP   : 近接 → 停止（speed=0, direction=0, behavior=frozen）
//   REVERSE: 正面衝突が差し迫る → 後退（direction=-1）
import { FLEET } from "../src/config/fleet.js";
import { ROOM } from "./position/index.js";

// 距離しきい値 [m]
const D_SLOW = 1.6;
const D_DIVERT = 1.1;
const D_STOP = 0.7;
const D_REVERSE = 0.45;

// 壁接近しきい値 [m]（margin からの余裕）
const WALL_SLOW = 0.5;
const WALL_STOP = 0.2;

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// a から見て b が進行方向前方にいるか（正面衝突の判定に使う）
function isAhead(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const bearing = Math.atan2(dy, dx);
  let diff = Math.abs(normalize(bearing - a.heading));
  return diff < Math.PI / 3; // 前方 ±60°
}

function normalize(rad) {
  while (rad > Math.PI) rad -= 2 * Math.PI;
  while (rad < -Math.PI) rad += 2 * Math.PI;
  return rad;
}

function wallClearance(p) {
  const left = p.x - ROOM.margin;
  const right = ROOM.width - ROOM.margin - p.x;
  const bottom = p.y - ROOM.margin;
  const top = ROOM.height - ROOM.margin - p.y;
  return Math.min(left, right, bottom, top);
}

/**
 * 衝突回避の本体。
 * @param baseParams  Map<suitcaseId, oscParams>  判定由来の base OSC
 * @param positions   Map<suitcaseId, {x,y,heading,ts}>
 * @returns Map<suitcaseId, { params, collision }>
 *   params: 補正後 OSC（base のコピーを補正）
 *   collision: { state, reason, nearest } 観測ログ
 */
export function avoidCollisions(baseParams, positions) {
  const out = new Map();

  for (const s of FLEET) {
    const id = s.suitcaseId;
    const base = baseParams.get(id);
    const p = positions.get(id);
    // base が無い（未判定）場合はスキップ
    if (!base) {
      out.set(id, { params: null, collision: null });
      continue;
    }
    const params = { ...base };
    let collisionState = "CLEAR";
    let reason = null;
    let nearestId = null;
    let nearestDist = Infinity;

    if (p) {
      // --- 1) 他スーツケースとの最接近を調べる ---
      for (const other of FLEET) {
        if (other.suitcaseId === id) continue;
        const q = positions.get(other.suitcaseId);
        if (!q) continue;
        const d = dist(p, q);
        if (d < nearestDist) {
          nearestDist = d;
          nearestId = other.suitcaseId;
        }
      }

      const ahead = nearestId != null && isAhead(p, positions.get(nearestId));

      // --- 2) 段階的に介入（近いほど強い）---
      if (nearestDist < D_REVERSE && ahead) {
        params.speed = -Math.abs(params.speed) || -0.2;
        params.direction = -1.0;
        params.behavior = "hesitant";
        collisionState = "REVERSE";
        reason = `imminent head-on with #${nearestId}`;
      } else if (nearestDist < D_STOP) {
        params.speed = 0;
        params.direction = 0;
        params.behavior = "frozen";
        collisionState = "STOP";
        reason = `proximity to #${nearestId}`;
      } else if (nearestDist < D_DIVERT) {
        // 迂回: 相手と反対方向へステアリングを曲げる
        const q = positions.get(nearestId);
        const bearing = Math.atan2(q.y - p.y, q.x - p.x);
        const side = normalize(bearing - p.heading) > 0 ? -1 : 1;
        params.steering_bias = clamp((params.steering_bias ?? 0) + 0.6 * side, -1, 1);
        params.speed = round(params.speed * 0.5);
        params.behavior = "hesitant";
        collisionState = "DIVERT";
        reason = `diverting around #${nearestId}`;
      } else if (nearestDist < D_SLOW) {
        params.speed = round(params.speed * 0.7);
        collisionState = "SLOW";
        reason = `closing on #${nearestId}`;
      }

      // --- 3) 壁接近（他スーツケース判定より優先度は低いが上書きしうる）---
      const wc = wallClearance(p);
      if (collisionState === "CLEAR" || collisionState === "SLOW") {
        if (wc < WALL_STOP) {
          params.speed = 0;
          params.direction = 0;
          params.behavior = "frozen";
          collisionState = "STOP";
          reason = "wall proximity";
        } else if (wc < WALL_SLOW) {
          params.speed = round(params.speed * 0.6);
          if (collisionState === "CLEAR") collisionState = "SLOW";
          reason = reason ?? "approaching wall";
        }
      }
    }

    out.set(id, {
      params,
      collision: {
        state: collisionState,
        reason,
        nearest:
          nearestId != null
            ? { suitcaseId: nearestId, dist: round(nearestDist) }
            : null,
      },
    });
  }

  return out;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function round(n, d = 3) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
