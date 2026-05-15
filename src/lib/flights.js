// OpenSky Network から稼働中フライトを取得し、5地域から1便ずつ選定する。
// state vector に出発地・目的地は含まれないため、callsign / origin_country と
// 地域 bounding box から擬似的にIATA空港コードを推定する（v2段階の妥協）。

// 5つの地域 bounding box。各地域から1便ずつ取って「世界中で同時に動いている感」を出す。
export const BOUNDING_BOXES = [
  { region: "east_asia",     lamin: 20, lomin: 100, lamax: 50, lomax: 150 },
  { region: "europe",        lamin: 35, lomin: -10, lamax: 70, lomax: 40  },
  { region: "middle_east",   lamin: 20, lomin: 30,  lamax: 42, lomax: 65  },
  { region: "north_america", lamin: 24, lomin: -125, lamax: 49, lomax: -66 },
  { region: "oceania",       lamin: -50, lomin: 110, lamax: -10, lomax: 180 },
];

// origin_country または callsign プレフィックスから出発空港コードを擬似推定。
const ORIGIN_BY_COUNTRY = {
  Japan: "HND",
  Germany: "FRA",
  France: "CDG",
  "United Kingdom": "LHR",
  "United States": "JFK",
  "United Arab Emirates": "DXB",
  Qatar: "DOH",
  China: "PEK",
  "Republic of Korea": "ICN",
  "Korea, Republic Of": "ICN",
  Australia: "SYD",
  Turkey: "IST",
  Singapore: "SIN",
  Netherlands: "AMS",
  Spain: "MAD",
};

const ORIGIN_BY_CALLSIGN = {
  ANA: "HND", JAL: "NRT", NCA: "NRT",
  DLH: "FRA", BER: "BER",
  AFR: "CDG",
  BAW: "LHR", VIR: "LHR",
  UAE: "DXB", ETD: "AUH", QTR: "DOH",
  CCA: "PEK", CES: "PVG", CSN: "CAN",
  KAL: "ICN", AAR: "ICN",
  UAL: "JFK", AAL: "DFW", DAL: "ATL", FDX: "MEM",
  QFA: "SYD",
  THY: "IST",
  SIA: "SIN",
  KLM: "AMS",
  IBE: "MAD",
};

// 出発地に対する代表的な行き先候補。便のキャラクターを多様化させる。
const DEST_POOL = [
  ["JFK", "LHR", "CDG", "FRA", "AMS"],
  ["HND", "NRT", "ICN", "PEK", "PVG"],
  ["DXB", "AUH", "DOH", "IST"],
  ["SYD", "MEL", "AKL"],
  ["LAX", "SFO", "ORD", "ATL"],
];

function callsignPrefix(callsign) {
  if (!callsign) return null;
  const cs = callsign.trim().toUpperCase();
  return cs.slice(0, 3);
}

function pickOrigin(callsign, originCountry) {
  const fromCs = ORIGIN_BY_CALLSIGN[callsignPrefix(callsign)];
  if (fromCs) return fromCs;
  if (originCountry && ORIGIN_BY_COUNTRY[originCountry]) {
    return ORIGIN_BY_COUNTRY[originCountry];
  }
  return null;
}

function pickDestination(origin, seed) {
  // origin と異なる行き先を擬似乱数的に選ぶ
  const pool = DEST_POOL.flat();
  const candidates = pool.filter((d) => d !== origin);
  const idx = Math.abs(seed) % candidates.length;
  return candidates[idx];
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

// state vector: [icao24, callsign, origin_country, time_position, last_contact,
//                 longitude, latitude, baro_altitude, on_ground, velocity, ...]
function parseState(state, region) {
  const [icao24, callsign, originCountry, , , longitude, latitude, baroAltitude, onGround, velocity] = state;
  return {
    icao24,
    callsign: (callsign || "").trim(),
    origin_country: originCountry,
    longitude,
    latitude,
    altitude_m: baroAltitude,
    on_ground: onGround,
    velocity_ms: velocity,
    region,
  };
}

// 高度8000m以上 & 速度200m/s以上 = 巡航中の長距離便を優先
function isCruising(state) {
  return (
    !state.on_ground &&
    typeof state.altitude_m === "number" &&
    state.altitude_m >= 8000 &&
    typeof state.velocity_ms === "number" &&
    state.velocity_ms >= 200 &&
    state.callsign
  );
}

async function fetchRegion(box, signal) {
  const url =
    `https://opensky-network.org/api/states/all?` +
    `lamin=${box.lamin}&lomin=${box.lomin}&lamax=${box.lamax}&lomax=${box.lomax}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OpenSky ${box.region} ${res.status}`);
  const data = await res.json();
  const states = Array.isArray(data?.states) ? data.states : [];
  const parsed = states.map((s) => parseState(s, box.region)).filter(isCruising);
  if (parsed.length === 0) return null;
  // 速度が速い順の中から、ハッシュで擬似ランダムに1便選ぶ
  parsed.sort((a, b) => (b.velocity_ms ?? 0) - (a.velocity_ms ?? 0));
  return parsed[0];
}

function enrich(raw) {
  if (!raw) return null;
  const origin = pickOrigin(raw.callsign, raw.origin_country) ?? "---";
  const destination = pickDestination(origin, hashString(raw.icao24 + raw.callsign));
  // 簡易ステータス推定: 速度が低めなら DELAYED
  const status =
    raw.velocity_ms && raw.velocity_ms > 220 ? "ON_TIME" : "DELAYED";
  return {
    flight: raw.callsign,
    callsign: raw.callsign,
    icao24: raw.icao24,
    origin,
    destination,
    origin_country: raw.origin_country,
    region: raw.region,
    status,
    altitude_m: raw.altitude_m,
    velocity_ms: raw.velocity_ms,
    current_position: { lat: raw.latitude, lon: raw.longitude },
    delay_minutes: status === "DELAYED" ? 15 : 0,
    on_ground: raw.on_ground,
    // CARE / SECURITY 側で参照するフィールドはモック扱い
    routeHistory: "—",
    congestionLevel: "MEDIUM",
    metalAlert: false,
    passengerCount: 200,
    source: "opensky",
  };
}

/**
 * 5地域から1便ずつ並列取得。失敗した地域はモックで埋める。
 * すべて失敗した場合は全件モックフォールバック。
 */
export async function fetchFiveFlights({ timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const results = await Promise.all(
      BOUNDING_BOXES.map((box) =>
        fetchRegion(box, controller.signal)
          .then(enrich)
          .catch(() => null)
      )
    );
    const filled = results.map((r, i) => r ?? MOCK_FLIGHTS[i]);
    return filled;
  } catch {
    return MOCK_FLIGHTS;
  } finally {
    clearTimeout(timer);
  }
}

// フォールバック用モック。OpenSky の地域順（east_asia, europe, middle_east, north_america, oceania）
export const MOCK_FLIGHTS = [
  {
    flight: "NH205",
    callsign: "ANA205",
    origin: "HND",
    destination: "FRA",
    origin_country: "Japan",
    region: "east_asia",
    status: "ON_TIME",
    altitude_m: 11200,
    velocity_ms: 245,
    delay_minutes: 0,
    congestionLevel: "HIGH",
    routeHistory: "過去6ヶ月で同ルート類似プロファイル インシデント記録なし",
    metalAlert: true,
    passengerCount: 189,
    source: "mock",
  },
  {
    flight: "LH717",
    callsign: "DLH717",
    origin: "FRA",
    destination: "HND",
    origin_country: "Germany",
    region: "europe",
    status: "DELAYED",
    altitude_m: 10800,
    velocity_ms: 232,
    delay_minutes: 12,
    congestionLevel: "MEDIUM",
    routeHistory: "同ルート過去3ヶ月：遅延2件、インシデント1件記録",
    metalAlert: false,
    passengerCount: 245,
    source: "mock",
  },
  {
    flight: "EK316",
    callsign: "UAE316",
    origin: "DXB",
    destination: "CDG",
    origin_country: "United Arab Emirates",
    region: "middle_east",
    status: "ON_TIME",
    altitude_m: 11800,
    velocity_ms: 258,
    delay_minutes: 0,
    congestionLevel: "LOW",
    routeHistory: "インシデント記録なし",
    metalAlert: false,
    passengerCount: 312,
    source: "mock",
  },
  {
    flight: "AA101",
    callsign: "AAL101",
    origin: "JFK",
    destination: "LHR",
    origin_country: "United States",
    region: "north_america",
    status: "ON_TIME",
    altitude_m: 11000,
    velocity_ms: 248,
    delay_minutes: 0,
    congestionLevel: "MEDIUM",
    routeHistory: "—",
    metalAlert: false,
    passengerCount: 220,
    source: "mock",
  },
  {
    flight: "QF7",
    callsign: "QFA7",
    origin: "SYD",
    destination: "LAX",
    origin_country: "Australia",
    region: "oceania",
    status: "DELAYED",
    altitude_m: 10500,
    velocity_ms: 228,
    delay_minutes: 22,
    congestionLevel: "LOW",
    routeHistory: "—",
    metalAlert: false,
    passengerCount: 270,
    source: "mock",
  },
];
