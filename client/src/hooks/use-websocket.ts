import { useState, useEffect, useRef } from "react";

export function useWebSocket(userId?: number) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventHandlersRef = useRef<Map<string, Function[]>>(new Map());

  const emit = (event: string, data?: any) => {
    const handlers = eventHandlersRef.current.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  };

  useEffect(() => {
    if (!userId) {
      console.log("🚫 useWebSocket: No userId provided");
      return;
    }

    console.log("🔄 useWebSocket: Creating WebSocket for user:", userId);

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = `${protocol}://${window.location.host}/ws`;

      console.log("🔌 Connecting to WebSocket:", wsUrl);

      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.log("✅ WebSocket connected for user:", userId);
          setIsConnected(true);

          // Token für JOIN holen
          let token: string | null = null;
          try {
            const raw = localStorage.getItem("user");
            if (raw) {
              const u = JSON.parse(raw);
              token = u.token || u.accessToken || null;
            }
          } catch {}

          wsRef.current?.send(
            JSON.stringify({
              type: "join",
              token,
            })
          );

          emit("connected");
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // Spezifisches Event
            if (data.type) {
              emit(data.type, data);
            }
            // Generisch – nur falls jemand "message" abonniert
            emit("message", data);
          } catch (error) {
            console.error("❌ Failed to parse message:", error);
          }
        };

        wsRef.current.onclose = () => {
          console.log("❌ WebSocket disconnected");
          setIsConnected(false);
          emit("disconnected");

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("🔄 Reconnecting...");
            connect();
          }, 3000);
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
      if (wsRef.current) wsRef.current.close();
      eventHandlersRef.current.clear();
    };
  }, [userId]);

  const send = (message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log("📤 Sending WS message:", message);
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.error("❌ Cannot send - WebSocket not connected");
      return false;
    }
  };

  const on = (event: string, handler: Function) => {
    if (!eventHandlersRef.current.has(event)) {
      eventHandlersRef.current.set(event, []);
    }
    eventHandlersRef.current.get(event)!.push(handler);
  };

  const off = (event: string, handler?: Function) => {
    if (!handler) {
      eventHandlersRef.current.delete(event);
      return;
    }
    const handlers = eventHandlersRef.current.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }
  };

  const socket = {
    send,
    on,
    off,
    isConnected: () => wsRef.current?.readyState === WebSocket.OPEN,
  };

  return { socket, isConnected };
}