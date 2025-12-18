export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor(private userId: number) {
    console.log("🎯 WebSocketClient constructor for user:", userId);
    this.connect();
  }

  private getToken(): string | null {
    try {
      // du speicherst token meistens im localStorage als "token" oder im "user" objekt
      const direct = localStorage.getItem("token");
      if (direct) return direct;

      const userRaw = localStorage.getItem("user");
      if (!userRaw) return null;
      const user = JSON.parse(userRaw);
      return user?.token ?? null;
    } catch {
      return null;
    }
  }

  private connect() {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log("🔌 ATTEMPTING WebSocket connection to:", wsUrl);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("🟢 WebSocket connected successfully! User:", this.userId);
        this.reconnectAttempts = 0;

        const token = this.getToken();
        if (!token) {
          console.error("❌ No JWT token found in localStorage. Cannot JOIN websocket.");
          // Optional: close connection to avoid server spam
          try { this.ws?.close(1008, "Missing token"); } catch {}
          return;
        }

        // ✅ NEW: join with token (server expects this)
        const joinMessage = { type: "join", token };
        console.log("📤 Sending join message:", joinMessage);
        this.ws!.send(JSON.stringify(joinMessage));

        this.emit("connected");
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type) this.emit(message.type, message);
          this.emit("message", message);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      this.ws.onclose = () => {
        console.log("WebSocket disconnected");
        this.emit("disconnected");
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        console.error("❌ WebSocket URL was:", wsUrl);
        console.error("❌ Current readyState:", this.ws?.readyState);
        this.emit("error", error);
      };
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), this.reconnectInterval);
    } else {
      console.error("Max reconnection attempts reached");
      this.emit("max_reconnect_attempts");
    }
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  on(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, []);
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler?: Function) {
    if (!handler) {
      this.eventHandlers.delete(event);
      return;
    }
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;
    const index = handlers.indexOf(handler);
    if (index > -1) handlers.splice(index, 1);
  }

  private emit(event: string, data?: any) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) handlers.forEach((handler) => handler(data));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.eventHandlers.clear();
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
