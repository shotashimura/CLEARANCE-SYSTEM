// 中央サーバーの状態を WebSocket で購読する React フック。
// 各フロント（/suitcase/:id, /board, /cycle）は判定もOSC送信も行わず、
// このフックで配信される状態を「読み取って表示する」だけ。
import { useEffect, useRef, useState } from "react";

// dev では Vite(5173) と中央サーバー(8787) はポートが別。
// 既定の WS URL は同一ホストの 8787。VITE_CLEARANCE_WS で上書き可能。
function defaultWsUrl() {
  if (import.meta.env.VITE_CLEARANCE_WS) return import.meta.env.VITE_CLEARANCE_WS;
  const host = window.location.hostname || "localhost";
  const port = import.meta.env.VITE_CLEARANCE_PORT ?? "8787";
  return `ws://${host}:${port}`;
}

/**
 * 中央サーバーの全状態を購読する。
 * 戻り値: { state, connected }
 *   state: 最新スナップショット（未接続時は null）
 *   connected: WebSocket 接続状態
 * 切断時は自動再接続する。
 */
export function useClearanceState() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  useEffect(() => {
    let closed = false;

    function connect() {
      const ws = new WebSocket(defaultWsUrl());
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          retryRef.current = setTimeout(connect, 1500); // 自動再接続
        }
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // noop
        }
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "state") setState(msg.payload);
        } catch {
          // 壊れたフレームは無視
        }
      };
    }

    connect();
    return () => {
      closed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      try {
        wsRef.current?.close();
      } catch {
        // noop
      }
    };
  }, []);

  return { state, connected };
}

/**
 * 1台分だけを購読する派生フック（/suitcase/:id 用）。
 * 全状態から自分の suitcaseId のレコードだけを取り出して返す。
 */
export function useSuitcaseState(suitcaseId) {
  const { state, connected } = useClearanceState();
  const id = Number(suitcaseId);
  const suitcase =
    state?.suitcases?.find((s) => s?.suitcaseId === id) ?? null;
  return {
    suitcase,
    announcement: state?.announcement ?? null,
    cycle: state?.cycle ?? 0,
    source: state?.source ?? null,
    connected,
  };
}
