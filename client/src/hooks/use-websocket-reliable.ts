import { useState, useEffect, useRef, useCallback } from "react";

function getToken(): string | null {
  try {
    const direct = localStorage.getItem("token");
    if (direct) return direct;

    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);

    // akzeptiere mehrere mögliche Felder
    return u?.token || u?.accessToken || u?.jwt || null;
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
  const joinedRef = useRef(false);

  const emit = useCallback((event: string, data?: any) => {
    const handlers = eventHandlersRef.current.get(event) || [];
    handlers.forEach((h) => {
      try {
        h(data);
      } catch (e) {
        console.error("❌ WS handler error:", e);
      }
    });
  }, []);

  const connect = useCallback(() => {
    if (!userId) {
      console.log("❌ WS: no userId -> skip connect");
      return;
    }

    const token = getToken();
    if (!token) {
      console.error("❌ WS: No token in localStorage -> cannot join");
      setIsConnected(false);
      return;
    }

    try {
      // Render: ws/wss automatisch korrekt über window.location
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log("🔌 WS connecting:", wsUrl);
      joinedRef.current = false;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("✅ WS connected");
        setIsConnected(true);

        // ✅ JOIN MIT TOKEN (SERVER ERWARTET DAS!)
        const joinMessage = { type: "join", token };
        console.log("📤 WS join:", joinMessage);
        wsRef.current?.send(JSON.stringify(joinMessage));
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // join-confirmation merken
          if (data?.type === "join_confirmed") {
            joinedRef.current = true;
            console.log("✅ WS joined as user:", data.userId);

            // queued messages rausblasen
            while (messageQueueRef.current.length > 0) {
              const msg = messageQueueRef.current.shift();
              wsRef.current?.send(JSON.stringify(msg));
            }
          }

          // ✅ WICHTIG:
          // 1) spezifische Events (new_message, user_status, ...)
          if (data?.type) emit(data.type, data);

          // 2) und immer auch "message"
          emit("message", data);
        } catch (err) {
          console.error("❌ WS parse error:", err, event.data);
        }
      };

      wsRef.current.onclose = (evt) => {
        console.log("🔌 WS closed:", evt.code, evt.reason);
        setIsConnected(false);
        joinedRef.current = false;

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("🔄 WS reconnect...");
          connect();
        }, 3000);
      };

      wsRef.current.onerror = (err) => {
        console.error("❌ WS error:", err);
        setIsConnected(false);
      };
    } catch (err) {
      console.error("❌ WS create failed:", err);
      setIsConnected(false);
    }
  }, [userId, emit]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
      joinedRef.current = false;
    };
  }, [connect]);

  const send = useCallback((message: any) => {
    // wenn noch nicht joined -> queue
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !joinedRef.current) {
      console.log("⏳ WS not ready/joined -> queue message:", message?.type);
      messageQueueRef.current.push(message);
      return false;
    }

    try {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } catch (err) {
      console.error("❌ WS send failed:", err);
      return false;
    }
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
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
    eventHandlersRef.current.set(event, handlers);
  }, []);

  return {
    isConnected,
    send,
    on,
    off,
  };
}
