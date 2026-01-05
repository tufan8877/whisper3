// client/src/hooks/use-websocket-reliable.ts
import { useEffect, useMemo, useRef, useState } from "react";

type Handler = (data?: any) => void;

export function useWebSocketReliable(userId?: number, token?: string) {
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const handlersRef = useRef<Map<string, Set<Handler>>>(new Map());
  const joinedRef = useRef(false);

  const wsUrl = useMemo(() => {
    // ✅ Render/HTTPS => wss, local => ws
    const isHttps = window.location.protocol === "https:";
    const proto = isHttps ? "wss" : "ws";

    // ✅ KEIN :5000 (Render routed den Websocket über die gleiche Domain)
    return `${proto}://${window.location.host}/ws`;
  }, []);

  const emit = (event: string, data?: any) => {
    const set = handlersRef.current.get(event);
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn(data);
      } catch (e) {
        console.error("WS handler error:", e);
      }
    });
  };

  const connect = () => {
    if (!userId || !token) return;

    // schon offen?
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    // cleanup old
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    joinedRef.current = false;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      emit("connected");

      // ✅ Join mit token (Server verlangt token)
      try {
        ws.send(JSON.stringify({ type: "join", token }));
      } catch (e) {
        console.error("Failed to send join:", e);
      }
    };

    ws.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data?.type === "join_confirmed") {
        joinedRef.current = true;
      }

      // ✅ nur 1x dispatch – NICHT doppelt "message" UND "data.type"
      if (data?.type) emit(data.type, data);
    };

    ws.onerror = (err) => {
      emit("error", err);
    };

    ws.onclose = () => {
      setIsConnected(false);
      emit("disconnected");

      // auto reconnect
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, 1500);
    };
  };

  useEffect(() => {
    if (!userId || !token) return;

    connect();

    return () => {
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
      wsRef.current = null;
      handlersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token, wsUrl]);

  const send = (payload: any) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    if (!joinedRef.current) return false;

    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error("WS send failed:", e);
      return false;
    }
  };

  const on = (event: string, handler: Handler) => {
    if (!handlersRef.current.has(event)) handlersRef.current.set(event, new Set());
    handlersRef.current.get(event)!.add(handler);
    return () => off(event, handler);
  };

  const off = (event: string, handler: Handler) => {
    const set = handlersRef.current.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) handlersRef.current.delete(event);
  };

  return {
    isConnected,
    send,
    on,
    off,
  };
}

export default useWebSocketReliable;