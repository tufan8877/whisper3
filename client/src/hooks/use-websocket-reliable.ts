import { useState, useEffect, useRef, useCallback } from "react";

function getAuthToken(): string | null {
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
  const reconnectTimeoutRef = useRef<any>(null);
  const messageQueueRef = useRef<any[]>([]);

  const connect = useCallback(() => {
    if (!userId) {
      console.log("❌ No userId provided for WebSocket connection");
      return;
    }

    const token = getAuthToken();
    if (!token) {
      console.log("❌ No token in localStorage -> cannot join websocket");
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

        // ✅ WICHTIG: Server erwartet token, NICHT userId
        const joinMessage = { type: "join", token };
        wsRef.current?.send(JSON.stringify(joinMessage));
        console.log("📤 Join sent (token)");

        // Send queued messages
        while (messageQueueRef.current.length > 0) {
          const queued = messageQueueRef.current.shift();
          wsRef.current?.send(JSON.stringify(queued));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Erst general handler
          const msgHandlers = eventHandlersRef.current.get("message") || [];
          msgHandlers.forEach((h) => h(data));

          // Dann typed handler
          if (data?.type) {
            const handlers = eventHandlersRef.current.get(data.type) || [];
            handlers.forEach((h) => h(data));
          }
        } catch (err) {
          console.error("❌ Failed to parse WebSocket message:", err);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason);
        setIsConnected(false);

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("🔄 Reconnecting WS...");
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
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    // queue while disconnected
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