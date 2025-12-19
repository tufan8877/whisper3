import { useState, useEffect, useRef, useCallback } from "react";

function getToken(): string | null {
  try {
    const rawUser = localStorage.getItem("user");
    if (!rawUser) return null;
    const u = JSON.parse(rawUser);
    return u?.token || u?.accessToken || null;
  } catch {
    return null;
  }
}

export function useWebSocketReliable(userId?: number) {
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventHandlersRef = useRef<Map<string, Function[]>>(new Map());
  const messageQueueRef = useRef<any[]>([]);
  const joinedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    joinedRef.current = false;
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!userId) {
      console.log("❌ WebSocket: no userId -> not connecting");
      return;
    }

    const token = getToken();
    if (!token) {
      console.log("❌ WebSocket: Missing token in localStorage.user.token");
      setIsConnected(false);
      return;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log("🔌 WS connecting:", wsUrl, "userId:", userId);

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("🟢 WS open");
        setIsConnected(true);

        // ✅ JOIN mit TOKEN (Server erwartet token!)
        const joinMsg = { type: "join", token };
        console.log("📤 WS join:", joinMsg);
        wsRef.current?.send(JSON.stringify(joinMsg));

        // queued messages senden
        while (messageQueueRef.current.length > 0) {
          const m = messageQueueRef.current.shift();
          wsRef.current?.send(JSON.stringify(m));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // join bestätigt?
          if (data?.type === "join_confirmed") {
            joinedRef.current = true;
            console.log("✅ WS join_confirmed:", data);
          }

          // 1) spezifisches event
          if (data?.type) {
            const handlers = eventHandlersRef.current.get(data.type) || [];
            handlers.forEach((h) => {
              try { h(data); } catch (e) { console.error(e); }
            });
          }

          // 2) general message event
          const msgHandlers = eventHandlersRef.current.get("message") || [];
          msgHandlers.forEach((h) => {
            try { h(data); } catch (e) { console.error(e); }
          });
        } catch (err) {
          console.error("❌ WS parse error:", err);
        }
      };

      wsRef.current.onerror = (err) => {
        console.error("❌ WS error:", err);
        setIsConnected(false);
      };

      wsRef.current.onclose = (ev) => {
        console.log("🔴 WS close:", ev.code, ev.reason);
        setIsConnected(false);
        joinedRef.current = false;

        // reconnect
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("🔄 WS reconnecting...");
          connect();
        }, 3000);
      };
    } catch (err) {
      console.error("❌ WS connect failed:", err);
      setIsConnected(false);
    }
  }, [userId]);

  useEffect(() => {
    cleanup();
    connect();
    return cleanup;
  }, [connect, cleanup]);

  const send = useCallback((message: any) => {
    // optional: wenn noch nicht joined, queue
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      messageQueueRef.current.push(message);
      return false;
    }
    wsRef.current.send(JSON.stringify(message));
    return true;
  }, []);

  const on = useCallback((event: string, handler: Function) => {
    const list = eventHandlersRef.current.get(event) || [];
    list.push(handler);
    eventHandlersRef.current.set(event, list);
  }, []);

  const off = useCallback((event: string, handler?: Function) => {
    if (!handler) {
      eventHandlersRef.current.delete(event);
      return;
    }
    const list = eventHandlersRef.current.get(event) || [];
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
    eventHandlersRef.current.set(event, list);
  }, []);

  return { isConnected, send, on, off };
}
