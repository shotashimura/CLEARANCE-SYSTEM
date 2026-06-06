// ブラウザ用フライト取得。純粋ロジックは flightsCore.js に集約し、
// ここでは fetch 先 URL（CORS 回避のための Vite プロキシ）だけを与える。
//
// OpenSky は自ドメイン以外への CORS を許可しないため、dev では Vite の
// プロキシ（/opensky → https://opensky-network.org、vite.config.js 参照）を
// 経由して同一オリジン化する。本番ビルドでは直 URL（CORS で失敗時はモック）。
import {
  fetchFiveFlights as fetchFiveFlightsCore,
  MOCK_FLIGHTS,
  BOUNDING_BOXES,
} from "./flightsCore.js";

const OPENSKY_BASE = import.meta.env.DEV
  ? "/opensky"
  : "https://opensky-network.org";

export { MOCK_FLIGHTS, BOUNDING_BOXES };

export function fetchFiveFlights(opts = {}) {
  return fetchFiveFlightsCore(OPENSKY_BASE, opts);
}
