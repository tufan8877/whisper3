import { useState, useEffect, useRef, useCallback } from "react";

function getToken(): string | null {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    return u?.token || u?.accessToken || localStorage.getItem("token") || null;
  } catch {
    return null;
  }
}

export function useWebSocketReliable(userId?: number) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const eventHandlersRef = useRef<Map<string, Function[]>>(new Map());
  const reconnectTimeoutRef = useRef<any>(null);
  const messageQueueRef = useRef<any[]>([]);

  const connect = useCallback(() => {
    if (!userId) {
      console.log("❌ No userId provided for WebSocket connection");
      return;
    }

    const token = getToken();
    if (!token) {
      console.log("❌ No token in localStorage -> cannot JOIN websocket");
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

        // ✅ Server erwartet token (nicht userId)
        const joinMessage = { type: "join", token };
        wsRef.current?.send(JSON.stringify(joinMessage));
        console.log("📤 JOIN sent with token");

        // queued messages senden
        while (messageQueueRef.current.length > 0) {
          const queued = messageQueueRef.current.shift();
          wsRef.current?.send(JSON.stringify(queued));
          console.log("📤 Sent queued message");
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          const handlers = eventHandlersRef.current.get("message") || [];
          handlers.forEach((h) => {
            try {
              h(data);
            } catch (e) {
              console.error("❌ WS handler failed:", e);
            }
          });
        } catch (error) {
          console.error("❌ Failed to parse WebSocket message:", error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason);
        setIsConnected(false);

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("🔄 Reconnecting WebSocket...");
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
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    };
  }, [connect]);

  const send = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    // queue wenn nicht open
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
      eventHandlersRef.current.set(event, []);
      return;
    }
    const handlers = eventHandlersRef.current.get(event) || [];
    const idx = handlers.indexOf(handler);
    if (idx > -1) handlers.splice(idx, 1);
    eventHandlersRef.current.set(event, handlers);
  }, []);

  return { isConnected, send, on, off };
}
