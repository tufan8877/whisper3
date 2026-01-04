import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import type { Chat, Message, User } from "@shared/schema";

export function useChat(userId?: number, socket?: any) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);

  const messageTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const getToken = useCallback(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      return user?.token || user?.accessToken || localStorage.getItem("token") || null;
    } catch {
      return localStorage.getItem("token");
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

  const idKey = (m: any) => String(m?.id ?? "");

  const scheduleMessageDeletion = useCallback((message: Message) => {
    const key = idKey(message);
    if (!key) return;

    // Timer schon vorhanden?
    if (messageTimers.current.has(key)) return;

    const timeUntilExpiry = new Date(message.expiresAt).getTime() - Date.now();

    if (timeUntilExpiry <= 0) {
      setMessages((prev) => prev.filter((x) => idKey(x) !== key));
      return;
    }

    const timer = setTimeout(() => {
      setMessages((prev) => prev.filter((x) => idKey(x) !== key));
      messageTimers.current.delete(key);
    }, timeUntilExpiry);

    messageTimers.current.set(key, timer);
  }, []);

  // CHATS
  const { data: chats = [], isLoading } = useQuery({
    queryKey: ["chats", userId],
    enabled: !!userId,
    refetchInterval: 10000,
    queryFn: async () => authedFetch(`/api/chats/${userId}`),
  });

  // MESSAGES (Polling)
  const { data: chatMessages = [] } = useQuery({
    queryKey: ["messages", selectedChatId],
    enabled: !!selectedChatId,
    refetchInterval: 3000,
    queryFn: async () => authedFetch(`/api/chats/${selectedChatId}/messages`),
  });

  // Polling -> decrypt + setMessages (Server Source of Truth)
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
                  const decrypted = await decryptMessage(message.content, u.privateKey);
                  return { ...message, content: decrypted };
                }
              }
            } catch {
              return { ...message, content: "[Decryption failed - Invalid key or corrupted data]" };
            }
          }
          return message;
        })
      );

      // Dedup + stable sort
      const map = new Map<string, any>();
      for (const m of processed) {
        const k = idKey(m);
        if (k) map.set(k, m);
      }
      const uniq = Array.from(map.values()).sort(
        (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      setMessages(uniq);

      uniq.forEach((m: any) => scheduleMessageDeletion(m));
    };

    processMessages();
  }, [chatMessages, scheduleMessageDeletion]);

  // WEBSOCKET EVENTS (NUR "message" abhören!)
  useEffect(() => {
    if (!socket || !userId) return;

    const handleWS = async (data: any) => {
      if (!data || data.type !== "new_message" || !data.message) return;

      const message = data.message;
      let decrypted = { ...message };

      if (message.messageType === "text" && message.isEncrypted) {
        try {
          const raw = localStorage.getItem("user");
          if (raw) {
            const u = JSON.parse(raw);
            if (u.privateKey) {
              decrypted.content = await decryptMessage(message.content, u.privateKey);
            }
          }
        } catch {
          decrypted.content = "[Decryption failed - Invalid key or corrupted data]";
        }
      }

      // nur Messages vom aktuell offenen Chat anzeigen
      if (selectedChatId && decrypted.chatId !== selectedChatId) {
        queryClient.invalidateQueries({ queryKey: ["chats", userId] });
        return;
      }

      const dk = idKey(decrypted);

      setMessages((prev) => {
        // harte Dedup
        if (prev.some((m) => idKey(m) === dk)) return prev;
        const next = [...prev, decrypted as any].sort(
          (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return next;
      });

      scheduleMessageDeletion(decrypted as any);

      queryClient.invalidateQueries({ queryKey: ["chats", userId] });
      if (selectedChatId) {
        queryClient.invalidateQueries({ queryKey: ["messages", selectedChatId] });
      }
    };

    const handleStatus = (data: any) => {
      if (!data || data.type !== "user_status") return;
      queryClient.invalidateQueries({ queryKey: ["chats", userId] });
    };

    socket.on("message", handleWS);
    socket.on("user_status", handleStatus); // user_status kommt evtl als eigenes Event

    return () => {
      socket.off("message", handleWS);
      socket.off("user_status", handleStatus);
    };
  }, [socket, userId, selectedChatId, queryClient, scheduleMessageDeletion]);

  // SENDEN
  const sendMessage = useCallback(
    async (content: string, messageType: string, destructTimer: number, receiverId: number, file?: File) => {
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

          const out = await res.json();
          const newChat = out?.chat ?? out; // falls {ok:true,chat}
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
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.readAsDataURL(file);
            });
            fileName = file.name;
            fileSize = file.size;
          } else {
            const formData = new FormData();
            formData.append("file", file);
            const uploadResponse = await apiRequest("POST", "/api/upload", formData);
            const fileInfo = await uploadResponse.json();
            messageContent = fileInfo.url;
            fileName = fileInfo.originalName;
            fileSize = fileInfo.size;
          }
        }

        let finalContent = messageContent;

        if (messageType === "text") {
          try {
            const chat: any = (chats as any[]).find((c) => c.id === chatId);
            if (chat?.otherUser?.publicKey) {
              finalContent = await encryptMessage(messageContent, chat.otherUser.publicKey);
            }
          } catch {
            // plain fallback
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
          typeof socket.isConnected === "function" ? socket.isConnected() : socket.isConnected;

        if (!connected) throw new Error("WebSocket not connected");

        const ok = socket.send(data);
        if (!ok) throw new Error("Failed to send message");

        // KEIN optimistisches setMessages – wir warten auf new_message
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