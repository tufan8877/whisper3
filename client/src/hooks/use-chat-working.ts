import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import type { Chat, Message, User } from "@shared/schema";

export function useChatWorking(userId?: number) {
  const [messages, setMessages] = useState<Message[]>([]);
  const messageTimers = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Auto-delete expired messages from UI
  const scheduleMessageDeletion = useCallback((message: Message) => {
    const timeUntilExpiry = new Date(message.expiresAt).getTime() - Date.now();
    
    if (timeUntilExpiry > 0) {
      console.log(`⏱️ Scheduling deletion for message ${message.id} in ${timeUntilExpiry}ms`);
      
      const timer = setTimeout(() => {
        console.log(`🗑️ Auto-deleting expired message ${message.id}`);
        setMessages(prev => prev.filter(m => m.id !== message.id));
        messageTimers.current.delete(message.id);
      }, timeUntilExpiry);
      
      messageTimers.current.set(message.id, timer);
    } else {
      console.log(`⚠️ Message ${message.id} already expired, removing immediately`);
      setMessages(prev => prev.filter(m => m.id !== message.id));
    }
  }, []);

  // Fetch user's chats with proper error handling
  const { data: rawChats, isLoading, error: chatsError } = useQuery({
    queryKey: [`/api/chats/${userId}`],
    enabled: !!userId,
    retry: 3,
    refetchInterval: 5000,
  });

  // Process chats data safely
  const chats = Array.isArray(rawChats) ? rawChats : [];

  // Fetch messages for selected chat
  const { data: rawMessages, error: messagesError } = useQuery({
    queryKey: [`/api/chats/${selectedChatId}/messages`],
    enabled: !!selectedChatId,
    retry: 3,
    refetchInterval: 3000,
  });

  // Process messages data safely and decrypt them
  useEffect(() => {
    const processMessages = async () => {
      const processedMessages = Array.isArray(rawMessages) ? rawMessages : [];
      
      // Get current user's private key for decryption
      const userData = localStorage.getItem("user");
      if (!userData) {
        setMessages(processedMessages);
        return;
      }

      const currentUser = JSON.parse(userData);
      const privateKey = currentUser.privateKey;

      if (!privateKey) {
        setMessages(processedMessages);
        return;
      }

      // Decrypt all messages
      const decryptedMessages = await Promise.all(
        processedMessages.map(async (msg) => {
          try {
            // Only decrypt if message looks encrypted (base64 format)
            if (msg.content && msg.content.length > 100 && !msg.content.includes(' ')) {
              const decryptedContent = await decryptMessage(msg.content, privateKey);
              // Check if decryption actually worked
              if (decryptedContent.startsWith("[Decryption failed")) {
                console.warn(`⚠️ Decryption failed for message ${msg.id}. Content: ${msg.content.substring(0, 50)}...`);
                return { ...msg, content: "[Nachricht konnte nicht entschlüsselt werden]" };
              }
              return { ...msg, content: decryptedContent };
            }
            return msg;
          } catch (error) {
            console.error("Failed to decrypt message:", error);
            return { ...msg, content: "[Verschlüsselte Nachricht - Entschlüsselung fehlgeschlagen]" };
          }
        })
      );

      setMessages(decryptedMessages);
      console.log("💬 Messages loaded and decrypted:", decryptedMessages.length);
      
      // Schedule deletion timers for all messages
      decryptedMessages.forEach(message => {
        if (!messageTimers.current.has(message.id)) {
          scheduleMessageDeletion(message);
        }
      });
    };

    processMessages();
  }, [rawMessages]);

  const sendMessage = useCallback(async (
    content: string,
    type: string,
    destructTimer: number,
    receiverId?: number,
    file?: File
  ) => {
    if (!userId || !selectedChatId) {
      console.log("❌ Cannot send: missing userId or chatId");
      return false;
    }

    // Find receiver from current chat or use provided receiverId
    let targetReceiverId = receiverId;
    if (!targetReceiverId) {
      const chat = chats.find(c => c.id === selectedChatId);
      if (!chat) {
        console.log("❌ Chat not found");
        return false;
      }
      targetReceiverId = chat.participant1Id === userId ? chat.participant2Id : chat.participant1Id;
    }

    try {
      console.log("📤 Sending message via WebSocket to receiver:", targetReceiverId);
      
      // Try WebSocket first (direct connection)
      const wsUrl = `ws://${window.location.hostname}:5000/ws`;
      const ws = new WebSocket(wsUrl);
      
      const success = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          console.log("❌ WebSocket timeout");
          resolve(false);
        }, 3000);

        ws.onopen = () => {
          clearTimeout(timeout);
          
          // Join first
          ws.send(JSON.stringify({ type: "join", userId }));
          
          setTimeout(() => {
            // Send message
            ws.send(JSON.stringify({
              type: "message",
              chatId: selectedChatId,
              senderId: userId,
              receiverId: targetReceiverId,
              content: content,
              messageType: type,
              destructTimer
            }));
            
            console.log("✅ Message sent via WebSocket");
            ws.close();
            resolve(true);
          }, 100);
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          console.log("❌ WebSocket error:", error);
          resolve(false);
        };
      });

      if (success) {
        // Add message to UI immediately
        const tempMessage = {
          id: Date.now(),
          chatId: selectedChatId,
          senderId: userId,
          receiverId: targetReceiverId,
          content: content,
          messageType: type,
          destructTimer,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + destructTimer * 1000),
          isEncrypted: false
        };
        
        setMessages(prev => [...prev, tempMessage]);
        scheduleMessageDeletion(tempMessage);
        
        toast({
          title: "Message sent",
          description: "Your message has been delivered",
        });
        
        return true;
      } else {
        throw new Error("WebSocket connection failed");
      }
    } catch (error) {
      console.error("❌ Send error:", error);
      toast({
        title: "Send failed", 
        description: "Could not send message - check connection",
        variant: "destructive",
      });
      return false;
    }
  }, [userId, selectedChatId, chats, toast]);

  const selectChat = useCallback((chat: Chat & { otherUser: User }) => {
    console.log("📋 Selecting chat:", chat.id, "with", chat.otherUser.username);
    setSelectedChatId(chat.id);
  }, []);

  const selectedChat = chats.find(c => c.id === selectedChatId);

  console.log("🎯 Chat state:", {
    userId,
    chatsCount: chats.length,
    messagesCount: messages.length,
    selectedChatId,
    isLoading,
    chatsError: chatsError?.message,
    messagesError: messagesError?.message
  });

  return {
    chats,
    messages,
    sendMessage,
    selectChat,
    isLoading,
    selectedChat,
    selectedChatId
  };
}