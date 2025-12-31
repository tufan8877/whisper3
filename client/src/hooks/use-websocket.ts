import { useState, useEffect, useRef } from "react";

export function useWebSocket(userId?: number) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventHandlersRef = useRef<Map<string, Function[]>>(new Map());

  // Token aus localStorage holen (gleich wie in useChat)
  const getToken = () => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      const u = JSON.parse(raw);
      return u?.token || u?.accessToken || null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!userId) {
      console.log("🚫 useWebSocket: No userId provided");
      return;
    }

    console.log("🔄 useWebSocket: Creating WebSocket for user:", userId);

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log("🔌 Connecting to WebSocket:", wsUrl);

      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.log("✅ WebSocket connected for user:", userId);
          setIsConnected(true);

          const token = getToken();
          if (!token) {
            console.warn("⚠️ No token for WebSocket join");
          } else {
            // 🔑 Server erwartet token, NICHT userId
            const joinMessage = { type: "join", token };
            wsRef.current?.send(JSON.stringify(joinMessage));
          }

          emit("connected");
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("📥 WS Received:", data.type || "unknown");

            if (data.type) {
              emit(data.type, data);
            }

            emit("message", data);
          } catch (error) {
            console.error("❌ Failed to parse WS message:", error);
          }
        };

        wsRef.current.onclose = () => {
          console.log("❌ WebSocket disconnected");
          setIsConnected(false);
          emit("disconnected");

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("🔄 Reconnecting WebSocket…");
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
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      eventHandlersRef.current.clear();
    };
  }, [userId]);

  const emit = (event: string, data?: any) => {
    const handlers = eventHandlersRef.current.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  };

  const send = (message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log("📤 WS Sending:", message);
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.error("❌ Cannot send – WebSocket not connected");
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