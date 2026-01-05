// client/src/hooks/useWebSocket.ts
import { useEffect, useRef, useState } from "react";

type Handler = (data?: any) => void;

export function useWebSocket(userId?: number, token?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventHandlersRef = useRef<Map<string, Handler[]>>(new Map());
  const joinedRef = useRef(false);
  const reconnectingRef = useRef(false);

  const emit = (event: string, data?: any) => {
    const handlers = eventHandlersRef.current.get(event);
    if (handlers) handlers.forEach((h) => h(data));
  };

  useEffect(() => {
    if (!userId) {
      console.log("🚫 useWebSocket: No userId provided");
      return;
    }

    // Token ist für JOIN nötig (dein Server verlangt token!)
    if (!token) {
      console.log("🚫 useWebSocket: No token provided (join requires token)");
      return;
    }

    const connect = () => {
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      // ✅ Render/Prod: wss://host/ws
      // ✅ Dev: ws://localhost:5173 -> ws://localhost:5173/ws (läuft über Vite Proxy oder same origin)
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = `${protocol}://${window.location.host}/ws`;

      console.log("🔌 Connecting WebSocket:", wsUrl);

      try {
        joinedRef.current = false;
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.log("✅ WebSocket connected");
          setIsConnected(true);
          reconnectingRef.current = false;

          // ✅ JOIN mit token (Server verlangt token)
          const joinMessage = { type: "join", token };
          wsRef.current?.send(JSON.stringify(joinMessage));
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // join_confirmed nur einmal akzeptieren
            if (data?.type === "join_confirmed") {
              if (joinedRef.current) return;
              joinedRef.current = true;
              emit("connected", data);
              emit("join_confirmed", data);
              return;
            }

            if (data?.type) emit(data.type, data);
            emit("message", data);
          } catch (err) {
            console.error("❌ Failed to parse WS message:", err);
          }
        };

        wsRef.current.onclose = () => {
          console.log("❌ WebSocket disconnected");
          setIsConnected(false);
          joinedRef.current = false;
          emit("disconnected");

          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

          // ✅ Reconnect – aber nur einmal geplant
          if (!reconnectingRef.current) {
            reconnectingRef.current = true;
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectingRef.current = false;
              connect();
            }, 1500);
          }
        };

        wsRef.current.onerror = (error) => {
          console.error("❌ WebSocket error:", error);
          setIsConnected(false);
          emit("error", error);
        };
      } catch (error) {
        console.error("❌ Failed to create WebSocket:", error);
        setIsConnected(false);
      }
    };

    connect();

    return () => {
      console.log("🧹 Cleaning up WebSocket");
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectingRef.current = false;
      joinedRef.current = false;

      if (wsRef.current) {
        try {
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          wsRef.current.close();
        } catch {}
      }

      wsRef.current = null;
      eventHandlersRef.current.clear();
    };
  }, [userId, token]);

  const send = (message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
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

  return { socket: { send, on, off }, isConnected };
}