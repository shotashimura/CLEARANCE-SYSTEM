import { useEffect, useMemo, useRef, useState } from "react";
import { fetchFiveFlights, MOCK_FLIGHTS } from "../lib/flights.js";
import { runCycle } from "../lib/orchestrator.js";
import { INDIVIDUALS } from "../lib/translateJudgment.js";
import { detectLanguage, languageMeta } from "../lib/lang.js";
import { announcementFor, pickCycleAnnouncement } from "../lib/announcement.js";
import FlipText from "../components/FlipText.jsx";

const PERMISSION_COLOR = {
  GRANTED: "#00ff88",
  GRANTED_CONDITIONAL: "#88ff44",
  FLAGGED: "#ffaa00",
  PROCESSING: "#88aaff",
  DENIED: "#ff3366",
};

const PERMISSION_SHORT = {
  GRANTED: "GRANTED",
  GRANTED_CONDITIONAL: "CONDITIONAL",
  FLAGGED: "FLAGGED",
  PROCESSING: "HOLDING",
  DENIED: "DENIED",
};

const CYCLE_INTERVAL_MS = 8_000;       // サイクル間の待ち時間
const FLIGHT_REFRESH_MS = 120_000;     // 2分ごとにOpenSky再取得
const HISTORY_LIMIT = 24;

function formatTime(d) {
  if (!d) return "—";
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

function Row({ individual, flight, result }) {
  const fj = result?.verdict?.final_judgment;
  const permission = fj?.permission;
  const speedFactor = fj?.speed_factor;
  const color = PERMISSION_COLOR[permission] || "#444";
  const lang = result?.language ?? (flight ? detectLanguage(flight.origin) : null);
  const langDisplay = lang ? languageMeta(lang).displayCode : "--";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 90px 90px 130px 70px 1fr 100px",
        alignItems: "center",
        padding: "12px 24px",
        borderBottom: "1px solid #1a1a1a",
        gap: 16,
      }}
    >
      <FlipText
        value={`#${String(individual.id).padStart(3, "0")}`}
        color="#fff"
        fontSize={20}
        letterSpacing={3}
      />
      <FlipText
        value={flight?.origin ?? "---"}
        color="#ccc"
        fontSize={22}
        letterSpacing={2}
      />
      <FlipText
        value={flight?.destination ?? "---"}
        color="#ccc"
        fontSize={22}
        letterSpacing={2}
      />
      <FlipText
        value={flight?.callsign ?? flight?.flight ?? "---"}
        color="#888"
        fontSize={16}
        letterSpacing={2}
      />
      <FlipText
        value={langDisplay}
        color="#888"
        fontSize={16}
        letterSpacing={2}
      />
      <FlipText
        value={permission ? PERMISSION_SHORT[permission] || permission : "PROCESSING"}
        color={color}
        fontSize={22}
        letterSpacing={3}
      />
      <FlipText
        value={typeof speedFactor === "number" ? `${speedFactor.toFixed(2)}×` : "—"}
        color="#aaa"
        fontSize={18}
        align="right"
      />
    </div>
  );
}

export default function BoardView() {
  const [flights, setFlights] = useState(MOCK_FLIGHTS);
  const [results, setResults] = useState([null, null, null, null, null]);
  const [history, setHistory] = useState([]); // 古いものほど上、新しいものを下に追加
  const [announcement, setAnnouncement] = useState(null);
  const [now, setNow] = useState(new Date());
  const [cycleCount, setCycleCount] = useState(0);
  const [phase, setPhase] = useState("boot"); // boot | running

  const cycleLockRef = useRef(false);
  const stopRef = useRef(false);

  // 時計
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 初回フライト取得 + 定期再取得
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const fetched = await fetchFiveFlights();
      if (!cancelled) setFlights(fetched);
    }
    load();
    const id = setInterval(load, FLIGHT_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // メインの自動サイクル
  useEffect(() => {
    stopRef.current = false;
    let timer = null;

    async function loop() {
      if (cycleLockRef.current || stopRef.current) return;
      cycleLockRef.current = true;
      setPhase("running");
      // CURRENT 行をリセット（パタパタ感を出す）
      setResults([null, null, null, null, null]);

      try {
        await runCycle(flights, {
          onPairResult: (idx, r) => {
            setResults((prev) => {
              const next = [...prev];
              next[idx] = r;
              return next;
            });
          },
        });
      } catch {
        // 失敗時もループは継続
      }

      setResults((finalResults) => {
        // HISTORY に積む
        const stamp = new Date();
        const additions = finalResults
          .map((r, i) => {
            const fj = r?.verdict?.final_judgment;
            if (!fj) return null;
            const flight = flights[i];
            return {
              time: stamp,
              suitcaseId: INDIVIDUALS[i].id,
              callsign: flight?.callsign || flight?.flight || "----",
              origin: flight?.origin || "---",
              destination: flight?.destination || "---",
              permission: fj.permission,
              alert: announcementFor(r),
            };
          })
          .filter(Boolean);
        setHistory((prev) => {
          const next = [...prev, ...additions];
          if (next.length > HISTORY_LIMIT) {
            return next.slice(next.length - HISTORY_LIMIT);
          }
          return next;
        });

        // ANNOUNCEMENT 抽出（対立検出時のみ）
        const msg = pickCycleAnnouncement(finalResults);
        setAnnouncement(msg);

        return finalResults;
      });

      setCycleCount((c) => c + 1);
      cycleLockRef.current = false;

      if (!stopRef.current) {
        timer = setTimeout(loop, CYCLE_INTERVAL_MS);
      }
    }

    // 初回起動は flights が確定したあと少し遅らせる
    timer = setTimeout(loop, 1500);
    return () => {
      stopRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [flights]);

  const trackingSource = useMemo(
    () => (flights.some((f) => f?.source === "opensky") ? "OPENSKY" : "MOCK"),
    [flights]
  );

  return (
    <div
      style={{
        background: "#000",
        color: "#ddd",
        minHeight: "100vh",
        fontFamily: "monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          padding: "20px 32px",
          borderBottom: "2px solid #222",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#050505",
        }}
      >
        <div>
          <div style={{ color: "#666", fontSize: 11, letterSpacing: 6, marginBottom: 4 }}>
            CLEARANCE SYSTEM
          </div>
          <div style={{ color: "#fff", fontSize: 30, letterSpacing: 6 }}>
            INTERNATIONAL DEPARTURES
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#fff", fontSize: 32, letterSpacing: 4 }}>
            {formatTime(now)}
          </div>
          <div style={{ color: "#555", fontSize: 11, letterSpacing: 3, marginTop: 4 }}>
            CYCLE {String(cycleCount).padStart(4, "0")} · SRC {trackingSource} · {phase.toUpperCase()}
          </div>
        </div>
      </div>

      {/* CURRENT 5 rows */}
      <div style={{ borderBottom: "2px solid #222" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "80px 90px 90px 130px 70px 1fr 100px",
            padding: "10px 24px",
            color: "#555",
            fontSize: 10,
            letterSpacing: 3,
            background: "#0a0a0a",
            gap: 16,
          }}
        >
          <div>SUITCASE</div>
          <div>ORIGIN</div>
          <div>DEST</div>
          <div>FLIGHT</div>
          <div>LANG</div>
          <div>STATUS</div>
          <div style={{ textAlign: "right" }}>SPEED</div>
        </div>
        {INDIVIDUALS.map((ind, idx) => (
          <Row
            key={ind.id}
            individual={ind}
            flight={flights[idx]}
            result={results[idx]}
          />
        ))}
      </div>

      {/* HISTORY */}
      <div
        style={{
          flex: 1,
          padding: "16px 32px",
          overflow: "hidden",
          background: "#020202",
          minHeight: 240,
        }}
      >
        <div
          style={{
            color: "#555",
            fontSize: 10,
            letterSpacing: 4,
            marginBottom: 12,
          }}
        >
          HISTORY · LAST {HISTORY_LIMIT}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column-reverse",
            gap: 4,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {history.length === 0 && (
            <div style={{ color: "#333" }}>— awaiting first cycle —</div>
          )}
          {history.map((h, i) => {
            const color = PERMISSION_COLOR[h.permission] || "#888";
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 60px 130px 1fr",
                  gap: 16,
                  color: "#777",
                  opacity: Math.max(0.35, 1 - (history.length - 1 - i) * 0.04),
                }}
              >
                <div style={{ color: "#555" }}>{formatTime(h.time)}</div>
                <div style={{ color: "#999" }}>
                  #{String(h.suitcaseId).padStart(3, "0")}
                </div>
                <div>
                  <span style={{ color: "#aaa" }}>{h.callsign}</span>{" "}
                  <span style={{ color: "#555" }}>
                    {h.origin}→{h.destination}
                  </span>
                </div>
                <div style={{ color, letterSpacing: 3 }}>
                  {PERMISSION_SHORT[h.permission] || h.permission}
                  {h.alert && (
                    <span style={{ color: "#666", marginLeft: 12, letterSpacing: 2 }}>
                      · {h.alert}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ANNOUNCEMENT */}
      <div
        style={{
          borderTop: "2px solid #222",
          background: announcement ? "#170d00" : "#050505",
          padding: "18px 32px",
          transition: "background 0.6s",
          minHeight: 60,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        {announcement ? (
          <>
            <div
              style={{
                color: "#ffaa00",
                fontSize: 12,
                letterSpacing: 4,
              }}
            >
              ATTENTION
            </div>
            <div
              style={{
                color: "#ffd066",
                fontSize: 18,
                letterSpacing: 4,
              }}
            >
              {announcement}
            </div>
          </>
        ) : (
          <div style={{ color: "#222", fontSize: 11, letterSpacing: 4 }}>
            — NO STANDING ALERT —
          </div>
        )}
      </div>
    </div>
  );
}
