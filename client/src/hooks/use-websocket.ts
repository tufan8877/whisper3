import { useEffect, useRef, useState } from "react";

type Handler = (data?: any) => void;

export function useWebSocket(userId?: number) {
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventHandlersRef = useRef<Map<string, Handler[]>>(new Map());
  const manualCloseRef = useRef(false);

  const getToken = () => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      const u = JSON.parse(raw);
      return u?.token || u?.accessToken || localStorage.getItem("token") || null;
    } catch {
      return localStorage.getItem("token");
    }
  };

  const emit = (event: string, data?: any) => {
    const handlers = eventHandlersRef.current.get(event);
    if (!handlers) return;
    handlers.forEach((fn) => {
      try {
        fn(data);
      } catch (e) {
        console.error("WS handler error:", e);
      }
    });
  };

  useEffect(() => {
    if (!userId) {
      console.log("🚫 useWebSocket: No userId provided");
      return;
    }

    manualCloseRef.current = false;

    const connect = () => {
      if (manualCloseRef.current) return;

      // ws/wss automatisch passend zum Browser-Protokoll
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = `${proto}://${window.location.host}/ws`;

      console.log("🔌 Connecting to WebSocket:", wsUrl);

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("✅ WebSocket connected");
          setIsConnected(true);
          emit("connected");

          // JOIN mit TOKEN (Server verlangt token!)
          const token = getToken();
          const joinMessage = { type: "join", token };
          ws.send(JSON.stringify(joinMessage));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // 1) spezifisches Event (new_message, user_status, typing, ...)
            if (data?.type) emit(data.type, data);
            // 2) allgemeines Event
            emit("message", data);
          } catch (error) {
            console.error("❌ Failed to parse WS message:", error);
          }
        };

        ws.onclose = () => {
          console.log("❌ WebSocket disconnected");
          setIsConnected(false);
          emit("disconnected");

          if (manualCloseRef.current) return;

          // Reconnect nach 2s
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("🔄 Reconnecting...");
            connect();
          }, 2000);
        };

        ws.onerror = (err) => {
          console.error("❌ WebSocket error:", err);
          setIsConnected(false);
          emit("error", err);
        };
      } catch (error) {
        console.error("❌ Failed to create WebSocket:", error);
        setIsConnected(false);
      }
    };

    connect();

    return () => {
      console.log("🧹 Cleaning up WebSocket");
      manualCloseRef.current = true;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }

      eventHandlersRef.current.clear();
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const send = (message: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  };

  const on = (event: string, handler: Handler) => {
    if (!eventHandlersRef.current.has(event)) eventHandlersRef.current.set(event, []);
    eventHandlersRef.current.get(event)!.push(handler);
  };

  const off = (event: string, handler?: Handler) => {
    if (!handler) {
      eventHandlersRef.current.delete(event);
      return;
    }
    const handlers = eventHandlersRef.current.get(event);
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  };

  const socket = {
    send,
    on,
    off,
    isConnected: () => wsRef.current?.readyState === WebSocket.OPEN,
  };

  return { socket, isConnected };
}