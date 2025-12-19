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
  const eventHandlersRef = useRef<Map<string, Function[]>>(new Map());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageQueueRef = useRef<any[]>([]);
  const joinedRef = useRef(false);

  const emit = useCallback((event: string, data?: any) => {
    const handlers = eventHandlersRef.current.get(event) || [];
    handlers.forEach((h) => {
      try {
        h(data);
      } catch (e) {
        console.error(`❌ WS handler error (${event}):`, e);
      }
    });
  }, []);

  const connect = useCallback(() => {
    if (!userId) {
      console.log("❌ No userId for WebSocket");
      return;
    }

    const token = getToken();
    if (!token) {
      console.error("❌ No token found -> cannot join websocket");
      setIsConnected(false);
      return;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log("🔌 Connecting WS:", wsUrl, "user:", userId);

      // close old
      try {
        wsRef.current?.close();
      } catch {}

      joinedRef.current = false;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("✅ WS open");
        setIsConnected(true);

        // ✅ JOIN WITH TOKEN (SERVER EXPECTS THIS)
        const joinMessage = { type: "join", token };
        wsRef.current?.send(JSON.stringify(joinMessage));
        console.log("📤 WS join sent (token)");

        // flush queue after join_confirmed (optional) but we can also flush immediately;
        // server will ignore messages until join is done, so we wait for join_confirmed.
      };

      wsRef.current.onmessage = (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          console.error("❌ WS invalid JSON:", event.data);
          return;
        }

        // mark joined
        if (data?.type === "join_confirmed") {
          joinedRef.current = true;
          console.log("✅ WS joined confirmed:", data);

          // Send queued messages now
          while (messageQueueRef.current.length > 0) {
            const msg = messageQueueRef.current.shift();
            wsRef.current?.send(JSON.stringify(msg));
            console.log("📤 WS sent queued message:", msg?.type || "unknown");
          }
        }

        // emit typed + general
        if (data?.type) emit(data.type, data);
        emit("message", data);
      };

      wsRef.current.onclose = (event) => {
        console.log("🔌 WS closed:", event.code, event.reason);
        setIsConnected(false);
        joinedRef.current = false;
        emit("disconnected");

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("🔄 WS reconnecting...");
          connect();
        }, 3000);
      };

      wsRef.current.onerror = (err) => {
        console.error("❌ WS error:", err);
        setIsConnected(false);
        emit("error", err);
      };
    } catch (e) {
      console.error("❌ WS connect failed:", e);
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
    };
  }, [connect]);

  const send = useCallback((message: any) => {
    // if not open or not joined => queue
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !joinedRef.current) {
      console.log("⏳ WS not ready/joined -> queue message:", message?.type || "unknown");
      messageQueueRef.current.push(message);
      return false;
    }

    try {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } catch (e) {
      console.error("❌ WS send failed:", e);
      messageQueueRef.current.push(message);
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

  return { isConnected, send, on, off };
}
