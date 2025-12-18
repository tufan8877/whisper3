import { useState, useEffect, useRef, useCallback } from "react";

function getAuthToken(): string | null {
  try {
    // Optional: falls du irgendwo token direkt speicherst
    const direct = localStorage.getItem("token");
    if (direct) return direct;

    const raw = localStorage.getItem("user");
    if (!raw) return null;

    const u = JSON.parse(raw);
    return u?.token || u?.accessToken || null;
  } catch {
    return null;
  }
}

export function useWebSocketReliable() {
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const eventHandlersRef = useRef<Map<string, Function[]>>(new Map());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageQueueRef = useRef<any[]>([]);
  const manualCloseRef = useRef(false);

  const emit = useCallback((event: string, data?: any) => {
    const handlers = eventHandlersRef.current.get(event) || [];
    handlers.forEach((h) => {
      try {
        h(data);
      } catch (e) {
        console.error(`❌ WS handler failed for event "${event}":`, e);
      }
    });
  }, []);

  const connect = useCallback(() => {
    // falls wir absichtlich schließen (unmount)
    if (manualCloseRef.current) return;

    const token = getAuthToken();
    if (!token) {
      console.log("❌ No JWT token found. WebSocket will not connect until login/register stores token.");
      setIsConnected(false);
      return;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log("🔌 Connecting to WebSocket:", wsUrl);

      // alte Verbindung sauber schließen
      try {
        wsRef.current?.close();
      } catch {}

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("✅ WebSocket connected");
        setIsConnected(true);

        // ✅ NEW JOIN: server expects token
        const joinMessage = { type: "join", token };
        wsRef.current?.send(JSON.stringify(joinMessage));
        console.log("📤 Join message sent (token)");

        // queued messages senden
        while (messageQueueRef.current.length > 0) {
          const queued = messageQueueRef.current.shift();
          wsRef.current?.send(JSON.stringify(queued));
          console.log("📤 Sent queued message");
        }

        emit("connected");
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // 1) spezifisches event (z.B. "new_message", "typing", "message_sent")
          if (data?.type) emit(data.type, data);

          // 2) generisches event
          emit("message", data);
        } catch (error) {
          console.error("❌ Failed to parse WebSocket message:", error, "RAW:", event.data);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason);
        setIsConnected(false);
        emit("disconnected");

        // Auto-reconnect (nur wenn nicht manuell geschlossen)
        if (!manualCloseRef.current) {
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("🔄 Attempting to reconnect...");
            connect();
          }, 3000);
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
  }, [emit]);

  useEffect(() => {
    manualCloseRef.current = false;
    connect();

    return () => {
      manualCloseRef.current = true;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      try {
        wsRef.current?.close();
      } catch {}

      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((message: any) => {
    const ws = wsRef.current;

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }

    // nicht ready -> queue
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
    if (next.length === 0) eventHandlersRef.current.delete(event);
    else eventHandlersRef.current.set(event, next);
  }, []);

  return {
    isConnected,
    send,
    on,
    off,
  };
}
