// client/src/hooks/useChat.ts
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

  /* --------------------------------------------------
   * Helpers
   * -------------------------------------------------- */
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

  const addMessagesDedup = useCallback(
    (incoming: Message | Message[]) => {
      const list = Array.isArray(incoming) ? incoming : [incoming];

      setMessages((prev) => {
        const existingIds = new Set(
          prev.filter((m) => m.id != null).map((m) => m.id as number)
        );

        const merged = [...prev];
        for (const msg of list) {
          if (msg.id != null && existingIds.has(msg.id)) continue;
          merged.push(msg);
        }

        merged.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() -
            new Date(b.createdAt).getTime()
        );

        merged.forEach((m) => {
          if (!messageTimers.current.has(m.id)) {
            scheduleMessageDeletion(m);
          }
        });

        return merged;
      });
    },
    [scheduleMessageDeletion]
  );

  /* --------------------------------------------------
   * CHATS LIST (React Query wie gehabt)
   * -------------------------------------------------- */
  const { data: chats = [], isLoading } = useQuery({
    queryKey: ["chats", userId],
    enabled: !!userId,
    refetchInterval: 10000,
    queryFn: async () => authedFetch(`/api/chats/${userId}`),
  });

  /* --------------------------------------------------
   * Nachrichten für einen Chat EINMAL laden
   * -------------------------------------------------- */
  const loadMessages = useCallback(
    async (chatId: number) => {
      try {
        const rawMessages: any[] = await authedFetch(
          `/api/chats/${chatId}/messages`
        );

        const processed = await Promise.all(
          rawMessages.map(async (message: any) => {
            if (message.messageType === "text" && message.isEncrypted) {
              try {
                const rawUser = localStorage.getItem("user");
                if (rawUser) {
                  const u = JSON.parse(rawUser);
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

        setMessages([]);
        addMessagesDedup(processed as any);
      } catch (err) {
        console.error("loadMessages error:", err);
      }
    },
    [authedFetch, addMessagesDedup]
  );

  useEffect(() => {
    if (!selectedChatId) return;
    loadMessages(selectedChatId);
  }, [selectedChatId, loadMessages]);

  /* --------------------------------------------------
   * WEBSOCKET EVENTS – EINZIGE Quelle für neue Nachrichten
   * -------------------------------------------------- */
  useEffect(() => {
    if (!socket || !userId) return;

    const handleNewMessage = async (data: any) => {
      if (!data || data.type !== "new_message" || !data.message) return;

      const message = data.message as Message;

      let decrypted: any = { ...message };

      if (message.messageType === "text" && message.isEncrypted) {
        try {
          const rawUser = localStorage.getItem("user");
          if (rawUser) {
            const u = JSON.parse(rawUser);
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

      // Nur anzeigen, wenn der Chat offen ist
      if (selectedChatId && message.chatId === selectedChatId) {
        addMessagesDedup(decrypted);
      }

      // Chats (unreadBadges usw.) aktualisieren
      queryClient.invalidateQueries({ queryKey: ["chats", userId] });
    };

    const handleUserStatus = (data: any) => {
      if (data.type === "user_status") {
        queryClient.invalidateQueries({ queryKey: ["chats", userId] });
      }
    };

    socket.on("new_message", handleNewMessage);
    socket.on("user_status", handleUserStatus);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("user_status", handleUserStatus);
    };
  }, [socket, userId, selectedChatId, addMessagesDedup, queryClient]);

  /* --------------------------------------------------
   * SENDEN – kein optimistisches setMessages
   * -------------------------------------------------- */
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

      // Chat ggf. anlegen
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

        // Datei oder Bild
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

        // Text ggf. verschlüsseln
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

        // Payload an WS
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

        // Anzeige kommt NUR über WebSocket -> kein setMessages hier!
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
      // loadMessages läuft automatisch über useEffect
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