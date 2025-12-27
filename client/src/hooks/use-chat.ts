import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import type { Chat, Message, User } from "@shared/schema";

export function useChat(userId?: number, socket?: any) {
  const [messages, setMessages] = useState<Message[]>([]);
  const messageTimers = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ==========================
  // Token helper
  // ==========================
  const getToken = useCallback(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      return user?.token || user?.accessToken || null;
    } catch {
      return null;
    }
  }, []);

  // ==========================
  // Fetch helper mit Bearer-Token
  // ==========================
  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = getToken();
      if (!token) {
        throw new Error("Missing token");
      }

      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const body = await res.json();
          msg = body?.message || msg;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      return res.json();
    },
    [getToken]
  );

  // ==========================
  // Auto-delete (UI) planen
  // ==========================
  const scheduleMessageDeletion = useCallback((message: Message) => {
    const timeUntilExpiry =
      new Date(message.expiresAt).getTime() - Date.now();

    if (timeUntilExpiry > 0) {
      const timer = setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== message.id));
        messageTimers.current.delete(message.id);
      }, timeUntilExpiry);

      messageTimers.current.set(message.id, timer);
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
    }
  }, []);

  // ==========================
  // Chats holen
  // ==========================
  const { data: chats = [], isLoading } = useQuery({
    queryKey: ["chats", userId],
    enabled: !!userId,
    refetchInterval: 10000,
    queryFn: async () => {
      return authedFetch(`/api/chats/${userId}`);
    },
  });

  // ==========================
  // Messages für ausgewählten Chat holen
  // ==========================
  const { data: chatMessages = [] } = useQuery({
    queryKey: ["messages", selectedChatId],
    enabled: !!selectedChatId,
    refetchInterval: 3000,
    queryFn: async () => {
      return authedFetch(`/api/chats/${selectedChatId}/messages`);
    },
  });

  // ==========================
  // Messages entschlüsseln + Timer planen
  // ==========================
  useEffect(() => {
    const processMessages = async () => {
      if (Array.isArray(chatMessages)) {
        const processedMessages = await Promise.all(
          chatMessages.map(async (message: any) => {
            if (message.messageType === "text" && message.isEncrypted) {
              try {
                const userData = localStorage.getItem("user");
                if (userData) {
                  const u = JSON.parse(userData);
                  if (u.privateKey) {
                    const decrypted = await decryptMessage(
                      message.content,
                      u.privateKey
                    );
                    return { ...message, content: decrypted };
                  }
                }
              } catch {
                return {
                  ...message,
                  content:
                    "[Decryption failed - Invalid key or corrupted data]",
                };
              }
            }
            return message;
          })
        );

        setMessages(processedMessages);

        processedMessages.forEach((m: any) => {
          if (!messageTimers.current.has(m.id)) {
            scheduleMessageDeletion(m);
          }
        });
      } else {
        setMessages([]);
      }
    };

    processMessages();
  }, [chatMessages, scheduleMessageDeletion]);

  // ==========================
  // WebSocket-Handler
  // ==========================
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = async (data: any) => {
      if (data.type === "new_message" && data.message) {
        const message = data.message;
        let decryptedMessage = { ...message };

        if (message.messageType === "text" && message.isEncrypted) {
          try {
            const userData = localStorage.getItem("user");
            if (userData) {
              const u = JSON.parse(userData);
              if (u.privateKey) {
                decryptedMessage.content = await decryptMessage(
                  message.content,
                  u.privateKey
                );
              }
            }
          } catch {
            decryptedMessage.content =
              "[Decryption failed - Invalid key or corrupted data]";
          }
        }

        setMessages((prev) => {
          // ❗ kein Duplikat per ID
          if (prev.find((m) => m.id === message.id)) return prev;

          const next = [...prev, decryptedMessage];

          if (!messageTimers.current.has(decryptedMessage.id)) {
            scheduleMessageDeletion(decryptedMessage as any);
          }

          return next;
        });

        queryClient.invalidateQueries({ queryKey: ["chats", userId] });
        if (selectedChatId) {
          queryClient.invalidateQueries({
            queryKey: ["messages", selectedChatId],
          });
        }
      }
    };

    const handleMessageSent = (_data: any) => {
      // wir verlassen uns auf new_message Broadcast
    };

    const handleUserStatus = (data: any) => {
      if (data.type === "user_status") {
        queryClient.invalidateQueries({ queryKey: ["chats", userId] });
      }
    };

    socket.on("new_message", handleNewMessage);
    socket.on("message_sent", handleMessageSent);
    socket.on("user_status", handleUserStatus);

    socket.on("message", (data: any) => {
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
      }
    });

    return () => {
      socket.off("message");
      socket.off("new_message", handleNewMessage);
      socket.off("message_sent", handleMessageSent);
      socket.off("user_status", handleUserStatus);
    };
  }, [socket, userId, selectedChatId, queryClient, scheduleMessageDeletion]);

  // ==========================
  // Nachricht senden
  // ==========================
  const sendMessage = useCallback(
    async (
      content: string,
      messageType: string,
      destructTimer: number, // SECONDS!
      receiverId: number,
      file?: File
    ) => {
      if (!socket || !userId) return;

      // Chat ggf. zuerst anlegen
      if (!selectedChatId) {
        try {
          const token = getToken();
          if (!token) throw new Error("Missing token");

          const response = await fetch("/api/chats", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              participant1Id: userId,
              participant2Id: receiverId,
            }),
          });

          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body?.message || "Failed to create chat");
          }

          const newChat = await response.json();
          setSelectedChatId(newChat.id);
        } catch (error: any) {
          toast({
            title: "Failed to create chat",
            description: error.message || "Please try again",
            variant: "destructive",
          });
          return;
        }
      }

      try {
        let messageContent = content;
        let fileName: string | undefined;
        let fileSize: number | undefined;

        // ======================
        // Datei / Bild
        // ======================
        if (file && messageType !== "text") {
          if (file.type.startsWith("image/")) {
            const reader = new FileReader();
            messageContent = await new Promise<string>((resolve) => {
              reader.onload = (e) =>
                resolve(e.target?.result as string);
              reader.readAsDataURL(file);
            });
            fileName = file.name;
            fileSize = file.size;
          } else {
            const formData = new FormData();
            formData.append("file", file);

            const uploadResponse = await apiRequest(
              "POST",
              "/api/upload",
              formData
            );
            const fileInfo = await uploadResponse.json();

            messageContent = fileInfo.url;
            fileName = fileInfo.originalName;
            fileSize = fileInfo.size;
          }
        }

        // ======================
        // Text verschlüsseln
        // ======================
        let finalContent = messageContent;
        let isEncrypted = false;

        if (messageType === "text") {
          try {
            const chat: any = (chats as any[]).find(
              (c) => c.id === selectedChatId
            );
            if (chat?.otherUser?.publicKey) {
              finalContent = await encryptMessage(
                messageContent,
                chat.otherUser.publicKey
              );
              isEncrypted = true;
            }
          } catch {
            // not fatal
          }
        }

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
          destructTimer, // SECONDS an Server
        };

        if (
          !socket?.isConnected ||
          (typeof socket.isConnected === "function" &&
            !socket.isConnected())
        ) {
          throw new Error("WebSocket not connected");
        }

        const success = socket.send(messageData);
        if (!success) throw new Error("Failed to send message");

        // ❌ KEIN optimistic UI -> keine Doppel-Nachrichten mehr
        // Server schickt "new_message" mit richtiger ID, dann wird es angezeigt.
      } catch (error: any) {
        toast({
          title: "Failed to send message",
          description: error.message || "Please try again",
          variant: "destructive",
        });
      }
    },
    [socket, userId, selectedChatId, chats, toast, getToken]
  );

  // ==========================
  // Chat auswählen
  // ==========================
  const selectChat = useCallback(
    (chat: Chat & { otherUser: User }) => {
      setSelectedChatId(chat.id);
      setMessages([]);
      queryClient.invalidateQueries({ queryKey: ["messages", chat.id] });
    },
    [queryClient]
  );

  return {
    chats,
    messages,
    sendMessage,
    selectChat,
    selectedChatId,
    isLoading,
  };
}