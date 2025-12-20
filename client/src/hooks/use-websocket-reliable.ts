import { useState, useEffect, useRef, useCallback } from "react";

function getTokenFromStorage(): string | null {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    return u?.token || u?.accessToken || null;
  } catch {
    return null;
  }
}

export function useWebSocketReliable(userId?: number) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const eventHandlersRef = useRef<Map<string, Function[]>>(new Map());
  const reconnectTimeoutRef = useRef<number | null>(null);
  const messageQueueRef = useRef<any[]>([]);

  const connect = useCallback(() => {
    if (!userId) {
      console.log("❌ No userId provided for WebSocket connection");
      return;
    }

    const token = getTokenFromStorage();
    if (!token) {
      console.log("❌ No token in localStorage -> WebSocket cannot JOIN");
      setIsConnected(false);
      return;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log("🔌 Connecting to WebSocket:", wsUrl, "user:", userId);

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("✅ WebSocket connected");
        setIsConnected(true);

        // ✅ JOIN MIT TOKEN (SERVER ERWARTET DAS)
        const joinMessage = { type: "join", token };
        wsRef.current?.send(JSON.stringify(joinMessage));
        console.log("📤 Join message sent (token)");

        // queued messages senden
        while (messageQueueRef.current.length > 0) {
          const queuedMessage = messageQueueRef.current.shift();
          wsRef.current?.send(JSON.stringify(queuedMessage));
          console.log("📤 Sent queued message");
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Optional Debug:
          // console.log("📥 WS:", data);

          const messageHandlers = eventHandlersRef.current.get("message") || [];
          messageHandlers.forEach((handler) => {
            try {
              handler(data);
            } catch (err) {
              console.error("❌ WS handler failed:", err);
            }
          });
        } catch (error) {
          console.error("❌ Failed to parse WebSocket message:", error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason);
        setIsConnected(false);

        if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);

        reconnectTimeoutRef.current = window.setTimeout(() => {
          console.log("🔄 Attempting to reconnect...");
          connect();
        }, 3000);
      };

      wsRef.current.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        setIsConnected(false);
      };
    } catch (error) {
      console.error("❌ Failed to create WebSocket:", error);
      setIsConnected(false);
    }
  }, [userId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const send = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    // wenn noch nicht ready: queue
    messageQueueRef.current.push(message);
    return false;
  }, []);

  const on = useCallback((event: string, handler: Function) => {
    const handlers = eventHandlersRef.current.get(event) || [];
    handlers.push(handler);
    eventHandlersRef.current.set(event, handlers);
  }, []);

  const off = useCallback((event: string, handler?: Function) => {
    if (!handler) {
      eventHandlersRef.current.delete(event);
      return;
    }
    const handlers = eventHandlersRef.current.get(event) || [];
    const next = handlers.filter((h) => h !== handler);
    eventHandlersRef.current.set(event, next);
  }, []);

  return {
    isConnected,
    send,
    on,
    off,
  };
}