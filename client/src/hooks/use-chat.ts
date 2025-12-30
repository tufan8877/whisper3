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
    if (!message.expiresAt) return;

    const timeUntilExpiry =
      new Date(message.expiresAt).getTime() - Date.now();

    if (!Number.isFinite(timeUntilExpiry)) return;

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

  // aggressive Dedupe: nach ID + "fast gleiche" Nachricht
  const mergeMessages = useCallback(
    (existing: Message[], incoming: Message[]): Message[] => {
      const result: Message[] = [...existing];

      for (const msg of incoming) {
        let isDuplicate = false;

        // 1) gleiche ID schon vorhanden
        if (msg.id != null && existing.some((m) => m.id === msg.id)) {
          continue;
        }

        // 2) selbe Chat-Kombi, Inhalt & ~gleiche Zeit (± 2 Sekunden)
        for (const m of existing) {
          if (
            m.chatId === msg.chatId &&
            m.senderId === msg.senderId &&
            m.receiverId === msg.receiverId &&
            (m.content || "") === (msg.content || "")
          ) {
            const t1 = new Date(m.createdAt).getTime();
            const t2 = new Date(msg.createdAt).getTime();
            if (Math.abs(t1 - t2) < 2000) {
              isDuplicate = true;
              break;
            }
          }
        }

        if (!isDuplicate) {
          result.push(msg);
        }
      }

      // nach createdAt sortieren
      result.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() -
          new Date(b.createdAt).getTime()
      );
      return result;
    },
    []
  );

  // CHATS
  const { data: chats = [], isLoading } = useQuery({
    queryKey: ["chats", userId],
    enabled: !!userId,
    refetchInterval: 10000,
    queryFn: async () => authedFetch(`/api/chats/${userId}`),
  });

  // MESSAGES – leichtes Polling für Sync, aber dedupe!
  const { data: chatMessages = [] } = useQuery({
    queryKey: ["messages", selectedChatId],
    enabled: !!selectedChatId,
    refetchInterval: 5000,
    queryFn: async () =>
      authedFetch(`/api/chats/${selectedChatId}/messages`),
  });

  // HTTP-Messages verarbeiten (Decrypt + Dedupe)
  useEffect(() => {
    const processMessages = async () => {
      if (!Array.isArray(chatMessages)) {
        setMessages([]);
        return;
      }

      const processed = await Promise.all(
        chatMessages.map(async (message: any) => {
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

      setMessages((prev) => {
        const merged = mergeMessages(prev, processed as any);
        merged.forEach((m) => {
          if (!messageTimers.current.has(m.id)) {
            scheduleMessageDeletion(m);
          }
        });
        return merged;
      });
    };

    processMessages();
  }, [chatMessages, mergeMessages, scheduleMessageDeletion]);

  // WEBSOCKET EVENTS
  useEffect(() => {
    if (!socket || !userId) return;

    const handleNewMessage = async (data: any) => {
      if (!data || data.type !== "new_message" || !data.message) return;

      const message = data.message as Message;

      // 🔥 WICHTIG: eigene Nachrichten vom WebSocket IGNORIEREN,
      // die kommen ohnehin über HTTP-Polling rein -> sonst Doppel-Effekt
      if (message.senderId === userId) {
        return;
      }

      let decrypted: any = { ...message };

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

      setMessages((prev) => {
        const merged = mergeMessages(prev, [decrypted]);
        merged.forEach((m) => {
          if (!messageTimers.current.has(m.id)) {
            scheduleMessageDeletion(m);
          }
        });
        return merged;
      });

      // Chat-Liste / Badges refreshed
      queryClient.invalidateQueries({ queryKey: ["chats", userId] });
      if (selectedChatId && message.chatId === selectedChatId) {
        queryClient.invalidateQueries({
          queryKey: ["messages", selectedChatId],
        });
      }
    };

    const handleUserStatus = (data: any) => {
      if (data.type === "user_status") {
        queryClient.invalidateQueries({ queryKey: ["chats", userId] });
      }
    };

    // nur diese beiden Listener – KEIN "message" mehr
    socket.on("new_message", handleNewMessage);
    socket.on("user_status", handleUserStatus);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("user_status", handleUserStatus);
    };
  }, [
    socket,
    userId,
    selectedChatId,
    queryClient,
    mergeMessages,
    scheduleMessageDeletion,
  ]);

  // SENDEN – kein optimistisches Duplikat
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

          const newChat = await res.json();
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
        };

        const connected =
          typeof socket.isConnected === "function"
            ? socket.isConnected()
            : socket.isConnected;

        if (!connected) throw new Error("WebSocket not connected");

        const ok = socket.send(data);
        if (!ok) throw new Error("Failed to send message");

        // kein setMessages hier – Anzeige kommt über HTTP/WS oben
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