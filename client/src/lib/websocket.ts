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

  private connect() {
    try {
      // Use current host for WebSocket connection in Replit environment
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      console.log("🔌 ATTEMPTING WebSocket connection to:", wsUrl);
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("🟢 WebSocket connected successfully! User:", this.userId);
        console.log("🟢 WebSocket readyState:", this.ws?.readyState, "OPEN should be:", WebSocket.OPEN);
        this.reconnectAttempts = 0;
        
        // Send join message immediately
        const joinMessage = { type: "join", userId: this.userId };
        console.log("📤 Sending join message:", joinMessage);
        this.ws!.send(JSON.stringify(joinMessage));
        
        this.emit("connected");
      };

      this.ws.onmessage = (event) => {
        try {
          console.log("📥 Raw WebSocket message received:", event.data);
          const message = JSON.parse(event.data);
          console.log("📥 Parsed WebSocket message:", message);
          
          // Emit specific event types
          if (message.type) {
            this.emit(message.type, message);
          }
          
          // Also emit general message event
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
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectInterval);
    } else {
      console.error("Max reconnection attempts reached");
      this.emit("max_reconnect_attempts");
    }
  }

  send(message: any) {
    console.log("🚀 WebSocket send() called with:", message);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const jsonMessage = JSON.stringify(message);
      console.log("📤 WebSocket sending JSON:", jsonMessage);
      this.ws.send(jsonMessage);
      console.log("✅ WebSocket message sent successfully");
      return true;
    } else {
      console.log("❌ WebSocket not ready to send:", {
        hasWs: !!this.ws,
        readyState: this.ws?.readyState,
        readyStateDescription: this.ws?.readyState === 0 ? "CONNECTING" : 
                              this.ws?.readyState === 1 ? "OPEN" : 
                              this.ws?.readyState === 2 ? "CLOSING" : 
                              this.ws?.readyState === 3 ? "CLOSED" : "UNKNOWN",
        OPEN: WebSocket.OPEN
      });
      return false;
    }
  }

  on(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler?: Function) {
    if (!handler) {
      this.eventHandlers.delete(event);
      return;
    }

    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
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
