// サーバー側フライト取得。Node からは CORS 制約がないため OpenSky を直叩きできる。
// 純粋ロジックはフロントと共有（src/lib/flightsCore.js）。
import {
  fetchFiveFlights as fetchFiveFlightsCore,
  MOCK_FLIGHTS,
} from "../src/lib/flightsCore.js";

const OPENSKY_BASE = "https://opensky-network.org";

export { MOCK_FLIGHTS };

export function fetchFiveFlights(opts = {}) {
  return fetchFiveFlightsCore(OPENSKY_BASE, opts);
}
