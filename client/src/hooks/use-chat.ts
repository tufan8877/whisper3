import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import type { Chat, Message, User } from "@shared/schema";
import type { WebSocketClient } from "@/lib/websocket";

export function useChat(userId?: number, socket?: any) {
  const [messages, setMessages] = useState<Message[]>([]);
  const messageTimers = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);

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
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch user's chats (corrected endpoint)
  const { data: chats = [], isLoading } = useQuery({
    queryKey: [`/api/chats/${userId}`],
    enabled: !!userId,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Fetch messages for selected chat (corrected endpoint)
  const { data: chatMessages = [] } = useQuery({
    queryKey: [`/api/chats/${selectedChatId}/messages`],
    enabled: !!selectedChatId,
    refetchInterval: 3000, // Refetch every 3 seconds
  });

  useEffect(() => {
    const processMessages = async () => {
      if (Array.isArray(chatMessages)) {
        // Decrypt messages if needed
        const processedMessages = await Promise.all(
          chatMessages.map(async (message: Message) => {
            if (message.messageType === "text" && message.isEncrypted) {
              try {
                const userData = localStorage.getItem("user");
                if (userData) {
                  const user = JSON.parse(userData);
                  if (user.privateKey) {
                    const decryptedContent = await decryptMessage(message.content, user.privateKey);
                    return { ...message, content: decryptedContent };
                  }
                }
              } catch (error) {
                console.error("❌ Failed to decrypt message:", error);
                return { ...message, content: "[Decryption failed - Invalid key or corrupted data]" };
              }
            }
            return message;
          })
        );
        setMessages(processedMessages);
        
        // Schedule deletion timers for all messages
        processedMessages.forEach(message => {
          if (!messageTimers.current.has(message.id)) {
            scheduleMessageDeletion(message);
          }
        });
      } else {
        setMessages([]);
      }
    };
    
    processMessages();
  }, [chatMessages]);

  // WebSocket message handlers
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = async (data: any) => {
      console.log("📥 handleNewMessage called with:", data);
      
      if (data.type === "new_message" && data.message) {
        const message = data.message;
        console.log("📨 Processing new message:", {
          messageId: message.id,
          chatId: message.chatId,
          senderId: message.senderId,
          receiverId: message.receiverId,
          currentUserId: userId,
          selectedChatId: selectedChatId,
          content: message.content.substring(0, 30) + "..."
        });
        
        // Decrypt message if needed
        let decryptedMessage = { ...message };
        if (message.messageType === "text" && message.isEncrypted) {
          try {
            // Get current user's private key from localStorage
            const userData = localStorage.getItem("user");
            if (userData) {
              const user = JSON.parse(userData);
              if (user.privateKey) {
                decryptedMessage.content = await decryptMessage(message.content, user.privateKey);
                console.log("🔓 Message decrypted successfully");
              }
            }
          } catch (error) {
            console.error("❌ Decryption failed:", error);
            decryptedMessage.content = "[Decryption failed - Invalid key or corrupted data]";
          }
        }
        
        // CRITICAL: Show message IMMEDIATELY in chat UI
        console.log("✅ CRITICAL: Adding message to UI for user", userId);
        setMessages(prev => {
          // Avoid duplicates
          if (prev.find(m => m.id === message.id)) {
            console.log("⚠️ CRITICAL: Message already exists, skipping");
            return prev;
          }
          console.log("✅ CRITICAL: Adding message to UI - Total messages will be:", prev.length + 1);
          const newMessages = [...prev, decryptedMessage];
          console.log("📋 CRITICAL: Updated messages array length:", newMessages.length);
          
          // Schedule deletion timer for new message
          if (!messageTimers.current.has(decryptedMessage.id)) {
            scheduleMessageDeletion(decryptedMessage);
          }
          
          return newMessages;
        });
        
        // Invalidate chats query to update last message
        queryClient.invalidateQueries({ queryKey: [`/api/chats/${userId}`] });
        
        // Also invalidate messages query for current chat
        if (selectedChatId) {
          queryClient.invalidateQueries({ queryKey: [`/api/chats/${selectedChatId}/messages`] });
        }
      } else {
        console.log("❌ Invalid message structure:", data);
      }
    };

    const handleMessageSent = (data: any) => {
      console.log("✅ handleMessageSent called with:", data);
      // Message will be handled by handleNewMessage via broadcast
    };

    const handleUserStatus = (data: any) => {
      if (data.type === "user_status") {
        // Update user online status in chats
        queryClient.invalidateQueries({ queryKey: ["/api/chats", userId] });
      }
    };

    // Listen for specific event types
    socket.on("new_message", handleNewMessage);
    socket.on("message_sent", handleMessageSent);
    socket.on("user_status", handleUserStatus);
    
    // Also listen for general message events
    socket.on("message", (data: any) => {
      console.log("📨 General message event:", data);
      switch (data.type) {
        case "new_message":
          handleNewMessage(data);
          break;
        case "message_sent":
          handleMessageSent(data);
          break;
        case "user_status":
          handleUserStatus(data);
          break;
        case "typing":
          // Handle typing indicators
          break;
      }
    });

    return () => {
      socket.off("message");
      socket.off("new_message", handleNewMessage);
      socket.off("message_sent", handleMessageSent);
      socket.off("user_status", handleUserStatus);
    };
  }, [socket, userId, selectedChatId, queryClient, toast]);

  const sendMessage = useCallback(async (
    content: string,
    messageType: string,
    destructTimer: number,
    receiverId: number,
    file?: File
  ) => {
    console.log("🔄 CRITICAL: sendMessage called:", {
      content: content.substring(0, 30),
      messageType,
      destructTimer,
      receiverId,
      hasSocket: !!socket,
      socketConnected: socket?.isConnected(),
      userId,
      selectedChatId
    });

    if (!socket || !userId) {
      console.log("❌ No socket or userId");
      return;
    }

    if (!selectedChatId) {
      console.log("❌ No selected chat, creating chat first...");
      
      // Create chat if it doesn't exist
      try {
        const response = await apiRequest("POST", "/api/chats", {
          participant1Id: userId,
          participant2Id: receiverId
        });
        const newChat = await response.json();
        setSelectedChatId(newChat.id);
        console.log("✅ Chat created:", newChat.id);
      } catch (error) {
        console.error("Failed to create chat:", error);
        toast({
          title: "Failed to create chat",
          description: "Please try again",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      let messageContent = content;
      let fileName: string | undefined;
      let fileSize: number | undefined;

      // Handle file upload (Base64 for images)
      if (file && messageType !== "text") {
        if (file.type.startsWith('image/')) {
          // Convert image to Base64
          const reader = new FileReader();
          messageContent = await new Promise<string>((resolve) => {
            reader.onload = (e) => {
              resolve(e.target?.result as string);
            };
            reader.readAsDataURL(file);
          });
          fileName = file.name;
          fileSize = file.size;
          console.log("📸 Image converted to Base64:", messageContent.substring(0, 50) + "...");
        } else {
          // Upload other files normally
          const formData = new FormData();
          formData.append("file", file);

          const uploadResponse = await apiRequest("POST", "/api/upload", formData);
          const fileInfo = await uploadResponse.json();
          
          messageContent = fileInfo.url;
          fileName = fileInfo.originalName;
          fileSize = fileInfo.size;
        }
      }

      // Encrypt message content for text messages
      let finalContent = messageContent;
      let isEncrypted = false;
      
      if (messageType === "text") {
        // For text messages, we can encrypt them
        try {
          // Get receiver's public key from chats data
          const chat = chats.find(c => c.id === selectedChatId);
          if (chat?.otherUser?.publicKey) {
            finalContent = await encryptMessage(messageContent, chat.otherUser.publicKey);
            isEncrypted = true;
            console.log("🔒 Message encrypted successfully");
          } else {
            console.log("⚠️ No public key found, sending unencrypted");
          }
        } catch (error) {
          console.error("❌ Encryption failed, sending unencrypted:", error);
        }
      }
      
      console.log("📝 Message content ready:", finalContent.substring(0, 50));

      // Send via WebSocket - use current selectedChatId
      const chatId = selectedChatId!;
      const messageData = {
        type: "message" as const,
        chatId,
        senderId: userId,
        receiverId,
        content: finalContent,
        messageType,
        fileName,
        fileSize,
        destructTimer,
      };

      console.log("📤 Sending WebSocket message:", messageData);
      
      if (!socket?.isConnected) {
        console.error("❌ Socket not connected");
        throw new Error("WebSocket not connected");
      }
      
      const success = socket.send(messageData);
      console.log("📤 WebSocket send result:", success);

      if (!success) {
        console.error("❌ WebSocket send failed");
        throw new Error("Failed to send message");
      }
      
      console.log("✅ Message sent successfully");
      
      // Add message to local state immediately for instant UI feedback
      const tempMessage = {
        id: Date.now(),
        chatId,
        senderId: userId,
        receiverId,
        content: messageContent, // Keep original unencrypted content for local display
        messageType,
        fileName,
        fileSize,
        destructTimer,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + destructTimer * 1000),
        isEncrypted: isEncrypted
      };
      
      setMessages(prev => [...prev, tempMessage]);
      console.log("✅ Message added to UI");
      
      // Schedule deletion timer for sent message
      scheduleMessageDeletion(tempMessage);
    } catch (error: any) {
      console.error("Failed to send message:", error);
      toast({
        title: "Failed to send message",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
  }, [socket, userId, selectedChatId, toast]);

  const selectChat = useCallback((chat: Chat & { otherUser: User }) => {
    setSelectedChatId(chat.id);
    
    // Clear messages when switching chats
    setMessages([]);
    
    // Invalidate and refetch messages for new chat
    queryClient.invalidateQueries({ 
      queryKey: ["/api/chats", chat.id, "messages"] 
    });
  }, [queryClient]);

  return {
    chats,
    messages,
    sendMessage,
    selectChat,
    selectedChatId,
    isLoading,
  };
}
