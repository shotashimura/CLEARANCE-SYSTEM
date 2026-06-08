// 位置 provider の共通インターフェース。
// 衝突回避は「展示空間内の各スーツケースの位置・向き」を入力に取る。
// 現段階は mock provider が擬似値を供給し、後日 ArUco provider
// （天井カメラ + OpenCV）に差し替えるだけで衝突回避が実データで動く。
//
// provider 契約:
//   getPositions(): Map<suitcaseId, { x, y, heading, ts }>
//     - x, y: 展示空間座標 [m]（原点は床の一隅、ROOM の範囲内）
//     - heading: 進行方位 [rad]（+x 方向が 0、反時計回り）
//     - ts: 取得時刻 [ms]
//
// 座標系・空間サイズは衝突回避と共有するため config として公開する。

export const ROOM = {
  width: 8.0, // x方向 [m]
  height: 5.0, // y方向 [m]
  margin: 0.6, // 壁とみなす内側マージン [m]（この内側に入ると壁接近）
};

import { createMockPositionProvider } from "./mockProvider.js";
import { createNetworkPositionProvider } from "./networkProvider.js";

// provider の選択。環境変数 CLEARANCE_POSITION で切替（既定 mock）。
//   mock           : 擬似走行（カメラ不要・開発/デモ用）
//   aruco/network  : vision/detect.py から UDP で受け取る実カメラ位置（Step3）
export function createPositionProvider(kind = "mock") {
  switch (kind) {
    case "aruco":
    case "network":
      return createNetworkPositionProvider();
    case "mock":
    default:
      return createMockPositionProvider();
  }
}
