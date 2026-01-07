// client/src/hooks/use-persistent-chats.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chat, Message, User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

type ChatWithOther = Chat & { otherUser: User; lastMessage?: any; unreadCount?: number };

function toMs(date: any) {
  const d = new Date(date);
  const t = d.getTime();
  return Number.isFinite(t) ? t : Date.now();
}

function makeClientMessageId() {
  // crypto.randomUUID() support (fallback ok)
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function usePersistentChats(userId?: number, socket?: any) {
  const [persistentContacts, setPersistentContacts] = useState<ChatWithOther[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatWithOther | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [unreadCounts, setUnreadCounts] = useState<Map<number, number>>(new Map());
  const [typingByChat, setTypingByChat] = useState<Map<number, boolean>>(new Map());

  const lastSelectedChatIdRef = useRef<number | null>(null);

  const getCutoffMs = useCallback((m: any) => {
    // expiresAt basiert auf server time; client nimmt createdAt/expiresAt
    if (m?.expiresAt) return toMs(m.expiresAt);
    return Date.now() + 24 * 60 * 60 * 1000;
  }, []);

  const scheduleMessageDeletion = useCallback(
    (m: any) => {
      const expiresAtMs = getCutoffMs(m);
      const now = Date.now();
      const delay = Math.max(0, expiresAtMs - now);

      setTimeout(() => {
        setMessages((prev) => prev.filter((x: any) => x.id !== m.id));
      }, delay + 50);
    },
    [getCutoffMs]
  );

  const loadPersistentContacts = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await apiRequest("GET", `/api/chats/${userId}`);
      const data = await res.json();
      setPersistentContacts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("loadPersistentContacts failed:", e);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const loadMessages = useCallback(
    async (chatId: number) => {
      try {
        const res = await apiRequest("GET", `/api/chats/${chatId}/messages`);
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("loadMessages failed:", e);
        setMessages([]);
      }
    },
    []
  );

  const selectChat = useCallback(
    async (chat: ChatWithOther | null) => {
      setSelectedChat(chat);
      if (!chat?.id || !userId) return;

      lastSelectedChatIdRef.current = chat.id;

      await loadMessages(chat.id);

      // mark read
      try {
        await apiRequest("POST", `/api/chats/${chat.id}/mark-read`, {});
      } catch {}
      setUnreadCounts((prev) => {
        const next = new Map(prev);
        next.set(chat.id, 0);
        return next;
      });
    },
    [loadMessages, userId]
  );

  const sendMessage = useCallback(
    async (content: string, type: string, destructTimer: number, file?: File) => {
      if (!userId) return;
      if (!selectedChat?.otherUser?.id || !selectedChat?.id) return;
      if (!socket?.send) return;

      const receiverId = selectedChat.otherUser.id;
      const chatId = selectedChat.id;

      // ✅ NEW: clientMessageId for dedupe
      const clientMessageId = makeClientMessageId();

      // ✅ optimistic message (negative id)
      const optimistic: any = {
        id: -Date.now(),
        chatId,
        senderId: userId,
        receiverId,
        content,
        messageType: type,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + Math.max(5, Number(destructTimer) || 5) * 1000).toISOString(),
        clientMessageId, // store locally
      };

      setMessages((prev) => [...prev, optimistic]);
      scheduleMessageDeletion(optimistic);

      // Update chat list last message instantly
      setPersistentContacts((prev) =>
        prev.map((c: any) =>
          c.id === chatId
            ? { ...c, lastMessage: optimistic, lastMessageTimestamp: new Date().toISOString() }
            : c
        )
      );

      const wsPayload: any = {
        type: "message",
        chatId,
        senderId: userId,
        receiverId,
        content,
        messageType: type,
        destructTimer,
        clientMessageId, // ✅ send to server
      };

      if (file) {
        // optional: if you use /api/upload, do it here (your current code already handles files elsewhere)
      }

      socket.send(wsPayload);
    },
    [socket, userId, selectedChat, scheduleMessageDeletion]
  );

  // --------------------------
  // WebSocket incoming
  // --------------------------
  useEffect(() => {
    if (!socket || !userId) return;

    const onMsg = (data: any) => {
      if (!data?.type) return;

      // Typing indicator
      if (data.type === "typing") {
        const chatId = Number(data.chatId);
        const isTyping = Boolean(data.isTyping);
        const senderId = Number(data.senderId);

        // only show partner typing
        if (senderId !== userId && Number.isFinite(chatId)) {
          setTypingByChat((prev) => {
            const next = new Map(prev);
            next.set(chatId, isTyping);
            return next;
          });
        }
        return;
      }

      if (data.type !== "new_message") return;

      const m: any = data.message;
      if (!m?.chatId || !m?.id) return;

      const incomingClientMessageId = String(data.clientMessageId || "");

      setMessages((prev: any[]) => {
        // ✅ if this is our own message: replace optimistic instead of adding
        if (m.senderId === userId) {
          // 1) match via clientMessageId
          if (incomingClientMessageId) {
            const idx = prev.findIndex((x) => x?.clientMessageId === incomingClientMessageId);
            if (idx !== -1) {
              const copy = prev.slice();
              copy[idx] = { ...m, clientMessageId: incomingClientMessageId };
              return copy;
            }
          }

          // 2) fallback heuristic: replace first pending message with same content/receiver in last ~10s
          const now = Date.now();
          const idx2 = prev.findIndex((x) => {
            if (!x) return false;
            if (x.id >= 0) return false; // pending only
            if (x.senderId !== userId) return false;
            if (x.receiverId !== m.receiverId) return false;
            if (String(x.content) !== String(m.content)) return false;
            const dt = Math.abs(now - toMs(x.createdAt));
            return dt < 10_000;
          });
          if (idx2 !== -1) {
            const copy = prev.slice();
            copy[idx2] = { ...m };
            return copy;
          }
        }

        // ✅ for everyone: don't add if already present
        if (prev.some((x) => x?.id === m.id)) return prev;

        return [...prev, m];
      });

      scheduleMessageDeletion(m);

      // unread counts
      if (!selectedChat || selectedChat.id !== m.chatId) {
        setUnreadCounts((prev) => {
          const next = new Map(prev);
          const c = next.get(m.chatId) || 0;
          next.set(m.chatId, c + 1);
          return next;
        });
      }

      // refresh chat list (last message)
      setTimeout(() => loadPersistentContacts(), 100);
    };

    socket.on("message", onMsg);
    return () => socket.off?.("message", onMsg);
  }, [socket, userId, scheduleMessageDeletion, selectedChat, loadPersistentContacts]);

  // --------------------------
  // Initial load
  // --------------------------
  useEffect(() => {
    if (!userId) return;
    loadPersistentContacts();
  }, [userId, loadPersistentContacts]);

  // when chat list loads first time, keep selected chat stable
  const chats = useMemo(() => persistentContacts || [], [persistentContacts]);

  // delete chat helper (your app uses it)
  const deleteChat = useCallback(
    async (chatId: number) => {
      if (!chatId) return;
      try {
        await apiRequest("POST", `/api/chats/${chatId}/delete`, {});
        await loadPersistentContacts();

        if (selectedChat?.id === chatId) {
          setSelectedChat(null);
          setMessages([]);
        }
      } catch (e) {
        console.error("deleteChat failed:", e);
      }
    },
    [loadPersistentContacts, selectedChat]
  );

  return {
    persistentContacts: chats,
    messages,
    sendMessage,
    selectChat,
    isLoading,
    selectedChat,
    loadPersistentContacts,
    unreadCounts,
    deleteChat,
    typingByChat,
  };
}
