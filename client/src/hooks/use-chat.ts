import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import type { Chat, Message, User } from "@shared/schema";

export function useChat(userId?: number, socket?: any) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);

  const messageTimers = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const getToken = useCallback(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      return user?.token || user?.accessToken || null;
    } catch {
      return null;
    }
  }, []);

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = getToken();
      if (!token) throw new Error("Missing token");

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
        } catch {}
        throw new Error(msg);
      }

      return res.json();
    },
    [getToken]
  );

  const scheduleMessageDeletion = useCallback((message: Message) => {
    const timeUntilExpiry =
      new Date(message.expiresAt).getTime() - Date.now();

    if (timeUntilExpiry <= 0) {
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      return;
    }

    const timer = setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      messageTimers.current.delete(message.id);
    }, timeUntilExpiry);

    messageTimers.current.set(message.id, timer);
  }, []);

  // ----------------- CHATS -----------------
  const { data: chats = [], isLoading } = useQuery({
    queryKey: ["chats", userId],
    enabled: !!userId,
    refetchInterval: 10000,
    queryFn: async () => authedFetch(`/api/chats/${userId}`),
  });

  // ----------------- MESSAGES: Initial-Load pro Chat -----------------
  useEffect(() => {
    const loadMessages = async () => {
      if (!selectedChatId) {
        setMessages([]);
        return;
      }

      try {
        const data = await authedFetch(`/api/chats/${selectedChatId}/messages`);
        if (!Array.isArray(data)) {
          setMessages([]);
          return;
        }

        const processed = await Promise.all(
          data.map(async (message: any) => {
            if (message.messageType === "text" && message.isEncrypted) {
              try {
                const raw = localStorage.getItem("user");
                if (raw) {
                  const u = JSON.parse(raw);
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

        setMessages(processed);

        processed.forEach((m: any) => {
          if (!messageTimers.current.has(m.id)) {
            scheduleMessageDeletion(m);
          }
        });
      } catch (err) {
        console.error("Load messages error:", err);
        setMessages([]);
      }
    };

    loadMessages();
  }, [selectedChatId, authedFetch, scheduleMessageDeletion]);

  // ----------------- WEBSOCKET EVENTS -----------------
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = async (data: any) => {
      if (!data.message) return;
      const message = data.message;
      let decrypted = { ...message };

      if (message.messageType === "text" && message.isEncrypted) {
        try {
          const raw = localStorage.getItem("user");
          if (raw) {
            const u = JSON.parse(raw);
            if (u.privateKey) {
              decrypted.content = await decryptMessage(
                message.content,
                u.privateKey
              );
            }
          }
        } catch {
          decrypted.content =
            "[Decryption failed - Invalid key or corrupted data]";
        }
      }

      // Chat nicht offen -> nur Liste aktualisieren
      if (decrypted.chatId !== selectedChatId) {
        queryClient.invalidateQueries({ queryKey: ["chats", userId] });
        return;
      }

      setMessages((prev) => {
        // 🔒 HARTE DEDUPE: gleiche ID ODER gleiche (sender,chat,createdAt,content)
        const exists = prev.some(
          (m) =>
            m.id === decrypted.id ||
            (m.senderId === decrypted.senderId &&
              m.chatId === decrypted.chatId &&
              String(m.createdAt) === String(decrypted.createdAt) &&
              m.content === decrypted.content)
        );
        if (exists) return prev;

        const next = [...prev, decrypted as Message];
        if (!messageTimers.current.has(decrypted.id)) {
          scheduleMessageDeletion(decrypted as any);
        }
        return next;
      });

      queryClient.invalidateQueries({ queryKey: ["chats", userId] });
    };

    const handleUserStatus = (data: any) => {
      if (data.type === "user_status") {
        queryClient.invalidateQueries({ queryKey: ["chats", userId] });
      }
    };

    // ❗️WICHTIG: Nur diese Listener – KEIN "message"-Event benutzen!
    socket.on("new_message", handleNewMessage);
    socket.on("user_status", handleUserStatus);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("user_status", handleUserStatus);
    };
  }, [socket, userId, selectedChatId, queryClient, scheduleMessageDeletion]);

  // ----------------- SENDEN -----------------
  const sendMessage = useCallback(
    async (
      content: string,
      messageType: string,
      destructTimer: number,
      receiverId: number,
      file?: File
    ) => {
      if (!socket || !userId) return;

      let chatId = selectedChatId;

      // neuen Chat anlegen falls nötig
      if (!chatId) {
        try {
          const token = getToken();
          if (!token) throw new Error("Missing token");

          const res = await fetch("/api/chats", {
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

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.message || "Failed to create chat");
          }

          const result = await res.json();
          const newChat = result.chat ?? result;
          chatId = newChat.id;
          setSelectedChatId(newChat.id);
          queryClient.invalidateQueries({ queryKey: ["chats", userId] });
        } catch (err: any) {
          toast({
            title: "Failed to create chat",
            description: err.message || "Please try again",
            variant: "destructive",
          });
          return;
        }
      }

      try {
        let messageContent = content;
        let fileName: string | undefined;
        let fileSize: number | undefined;

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

        let finalContent = messageContent;
        let isEncrypted = false;

        if (messageType === "text") {
          try {
            const chat: any = (chats as any[]).find(
              (c) => c.id === chatId
            );
            if (chat?.otherUser?.publicKey) {
              finalContent = await encryptMessage(
                messageContent,
                chat.otherUser.publicKey
              );
              isEncrypted = true;
            }
          } catch {
            // not encrypted -> plain
          }
        }

        const data = {
          type: "message" as const,
          chatId: chatId!,
          senderId: userId,
          receiverId,
          content: finalContent,
          messageType,
          fileName,
          fileSize,
          destructTimer,
          isEncrypted,
        };

        const connected =
          typeof socket.isConnected === "function"
            ? socket.isConnected()
            : socket.isConnected;

        if (!connected) throw new Error("WebSocket not connected");

        const ok = socket.send(data);
        if (!ok) throw new Error("Failed to send message");

        // ⚠️ Keine lokale Nachricht hinzufügen – wir warten auf "new_message"
      } catch (err: any) {
        toast({
          title: "Failed to send message",
          description: err.message || "Please try again",
          variant: "destructive",
        });
      }
    },
    [socket, userId, selectedChatId, chats, toast, getToken, queryClient]
  );

  const selectChat = useCallback(
    (chat: Chat & { otherUser: User }) => {
      setSelectedChatId(chat.id);
      setMessages([]);
    },
    []
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