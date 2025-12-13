import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocketReliable(userId?: number) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const eventHandlersRef = useRef<Map<string, Function[]>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const messageQueueRef = useRef<any[]>([]);

  const connect = useCallback(() => {
    if (!userId) {
      console.log('❌ No userId provided for WebSocket connection');
      return;
    }

    try {
      // Fix WebSocket URL for Replit environment
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      console.log("🔌 Connecting to WebSocket:", wsUrl, "for user:", userId);
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("✅ WebSocket connected");
        setIsConnected(true);
        
        // Send join message
        const joinMessage = { type: "join", userId };
        wsRef.current?.send(JSON.stringify(joinMessage));
        console.log("📤 Join message sent for user:", userId);

        // Send queued messages
        while (messageQueueRef.current.length > 0) {
          const queuedMessage = messageQueueRef.current.shift();
          wsRef.current?.send(JSON.stringify(queuedMessage));
          console.log("📤 Sent queued message");
        }
      };

      wsRef.current.onmessage = (event) => {
        console.log("📥 WebSocket RAW received:", event.data);
        
        try {
          const data = JSON.parse(event.data);
          console.log("📥 WebSocket PARSED:", data.type, data);
          
          // Special mobile handling for new messages
          if (data.type === 'new_message') {
            console.log('📱 MOBILE: New message detected, triggering UI updates');
            
            // Force page visibility for mobile browsers
            if (document.hidden) {
              console.log('📱 MOBILE: Document hidden, forcing visibility event');
              document.dispatchEvent(new Event('visibilitychange'));
            }
            
            // Force focus event for mobile refresh
            window.dispatchEvent(new Event('focus'));
          }
          
          // Notify all message handlers
          const messageHandlers = eventHandlersRef.current.get('message') || [];
          console.log(`📡 Broadcasting to ${messageHandlers.length} handlers`);
          
          if (messageHandlers.length === 0) {
            console.log("⚠️ NO MESSAGE HANDLERS REGISTERED!");
          }
          
          messageHandlers.forEach((handler, index) => {
            try {
              console.log(`🔄 Calling handler ${index}...`);
              handler(data);
              console.log(`✅ Handler ${index} executed successfully`);
            } catch (error) {
              console.error(`❌ Handler ${index} failed:`, error);
            }
          });
          
        } catch (error) {
          console.error("❌ Failed to parse WebSocket message:", error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason);
        console.log("🔌 Was connected to:", wsUrl);
        setIsConnected(false);
        
        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("🔄 Attempting to reconnect...");
          connect();
        }, 3000);
      };

      wsRef.current.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        console.error("❌ WebSocket URL was:", wsUrl);
        console.error("❌ Current location:", window.location.href);
        setIsConnected(false);
      };

    } catch (error) {
      console.error("❌ Failed to create WebSocket:", error);
    }
  }, [userId]);

  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      wsRef.current.send(messageStr);
      console.log("📤 Message sent via WebSocket:", typeof message === 'string' ? 'raw' : message.type);
      return true;
    } else {
      console.log("❌ WebSocket not ready, queueing message");
      messageQueueRef.current.push(message);
      return false;
    }
  }, []);

  const on = useCallback((event: string, handler: Function) => {
    const handlers = eventHandlersRef.current.get(event) || [];
    handlers.push(handler);
    eventHandlersRef.current.set(event, handlers);
    console.log(`📝 Registered handler for '${event}', total: ${handlers.length}`);
  }, []);

  const off = useCallback((event: string, handler?: Function) => {
    if (handler) {
      const handlers = eventHandlersRef.current.get(event) || [];
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        eventHandlersRef.current.set(event, handlers);
        console.log(`📝 Removed specific handler for '${event}'`);
      }
    } else {
      eventHandlersRef.current.set(event, []);
      console.log(`📝 Removed all handlers for '${event}'`);
    }
  }, []);

  return {
    isConnected,
    send,
    on,
    off
  };
}