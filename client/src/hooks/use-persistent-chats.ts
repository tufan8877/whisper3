import { useState, useEffect, useCallback, useRef } from "react";
import type { User, Chat, Message } from "@shared/schema";

function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    return u?.token || u?.accessToken || null;
  } catch {
    return null;
  }
}

async function authedFetch(url: string, init?: RequestInit) {
  const token = getAuthToken();
  if (!token) throw new Error("Missing token");

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  return res.json();
}

export function usePersistentChats(userId?: number, socket?: any) {
  const [persistentContacts, setPersistentContacts] = useState<Array<Chat & { otherUser: User; unreadCount?: number }>>([]);
  const [activeMessages, setActiveMessages] = useState<Map<number, Message[]>>(new Map());
  const [selectedChat, setSelectedChat] = useState<(Chat & { otherUser: User }) | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Map<number, number>>(new Map());

  const deletionTimersRef = useRef<Map<number, any>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --------------------------
  // Helpers
  // --------------------------
  const clearTimer = (messageId: number) => {
    const t = deletionTimersRef.current.get(messageId);
    if (t) clearTimeout(t);
    deletionTimersRef.current.delete(messageId);
  };

  const scheduleMessageDeletion = useCallback((message: Message) => {
    try {
      const expiresAtMs = new Date((message as any).expiresAt).getTime();
      const now = Date.now();
      const ms = Math.max(expiresAtMs - now, 200);

      clearTimer(message.id);

      const timer = setTimeout(() => {
        setActiveMessages((prev) => {
          const next = new Map(prev);
          const arr = next.get(message.chatId) || [];
          next.set(message.chatId, arr.filter((m) => m.id !== message.id));
          return next;
        });
        clearTimer(message.id);
      }, ms);

      deletionTimersRef.current.set(message.id, timer);
    } catch (e) {
      console.error("scheduleMessageDeletion error:", e);
    }
  }, []);

  // --------------------------
  // Load contacts + unread
  // --------------------------
  const loadPersistentContacts = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      const contacts = await authedFetch(`/api/chats/${userId}`);

      // unreadCount sauber setzen
      const newUnread = new Map<number, number>();
      (contacts || []).forEach((c: any) => {
        let unread = 0;
        if (userId === c.participant1Id) unread = c.unreadCount1 || 0;
        else if (userId === c.participant2Id) unread = c.unreadCount2 || 0;
        c.unreadCount = unread;
        if (unread > 0) newUnread.set(c.id, unread);
      });

      // WhatsApp Sorting
      const sorted = (contacts || []).sort((a: any, b: any) => {
        const aTime = a.lastMessage?.createdAt || a.lastMessageTimestamp || a.createdAt;
        const bTime = b.lastMessage?.createdAt || b.lastMessageTimestamp || b.createdAt;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      setUnreadCounts(newUnread);
      setPersistentContacts(sorted);

      // messages für existierende chats laden (optional, aber ok)
      for (const c of sorted) {
        await loadActiveMessages(c.id);
      }
    } catch (e) {
      console.error("❌ loadPersistentContacts:", e);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // --------------------------
  // Load messages
  // --------------------------
  const loadActiveMessages = useCallback(
    async (chatId: number) => {
      try {
        // ✅ Auth + richtiger Endpoint (server: /api/chats/:chatId/messages)
        const msgs = await authedFetch(`/api/chats/${chatId}/messages`);

        setActiveMessages((prev) => {
          const next = new Map(prev);
          next.set(chatId, Array.isArray(msgs) ? msgs : []);
          return next;
        });

        (Array.isArray(msgs) ? msgs : []).forEach((m: Message) => scheduleMessageDeletion(m));
      } catch (e) {
        console.error(`❌ loadActiveMessages chat=${chatId}:`, e);
        setActiveMessages((prev) => {
          const next = new Map(prev);
          next.set(chatId, []);
          return next;
        });
      }
    },
    [scheduleMessageDeletion]
  );

  // --------------------------
  // Select chat
  // --------------------------
  const selectChat = useCallback(
    async (chat: (Chat & { otherUser: User }) | null) => {
      setSelectedChat(chat);

      if (!chat || !userId) return;

      // mark-read (auth)
      try {
        await authedFetch(`/api/chats/${chat.id}/mark-read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } catch (e) {
        console.log("mark-read failed:", e);
      }

      // local badge reset
      setUnreadCounts((prev) => {
        const next = new Map(prev);
        next.delete(chat.id);
        return next;
      });
      setPersistentContacts((prev) =>
        prev.map((c: any) => (c.id === chat.id ? { ...c, unreadCount: 0 } : c))
      );

      await loadActiveMessages(chat.id);

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    },
    [userId, loadActiveMessages]
  );

  // --------------------------
  // Send message (SECONDS!)
  // --------------------------
  const sendMessage = useCallback(
    async (content: string, type: string = "text", destructTimerSec: number, file?: File) => {
      if (!selectedChat || !userId) {
        console.error("❌ sendMessage: no selectedChat or no userId");
        return;
      }
      if (!socket?.send) {
        console.error("❌ sendMessage: no socket");
        return;
      }

      const secs = Math.max(Number(destructTimerSec) || 0, 5);

      // optimistic
      const optimistic: any = {
        id: Date.now(),
        chatId: selectedChat.id,
        senderId: userId,
        receiverId: selectedChat.otherUser.id,
        content,
        messageType: type,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + secs * 1000).toISOString(),
      };

      setActiveMessages((prev) => {
        const next = new Map(prev);
        const arr = next.get(selectedChat.id) || [];
        next.set(selectedChat.id, [...arr, optimistic]);
        return next;
      });
      scheduleMessageDeletion(optimistic);

      // ✅ WebSocket send OBJECT (nicht JSON.stringify!)
      const wsPayload = {
        type: "message",
        chatId: selectedChat.id, // ✅ schick chatId mit
        senderId: userId,
        receiverId: selectedChat.otherUser.id,
        content,
        messageType: type,
        destructTimer: secs, // ✅ SEKUNDEN
      };

      console.log("📤 WS send:", wsPayload);
      const ok = socket.send(wsPayload);

      if (!ok) {
        console.warn("⚠️ WS not open -> queued (useWebSocketReliable queues)");
      }
    },
    [selectedChat, userId, socket, scheduleMessageDeletion]
  );

  // --------------------------
  // Incoming messages (WS)
  // --------------------------
  useEffect(() => {
    if (!socket?.on || !userId) return;

    const onMsg = (data: any) => {
      if (data?.type !== "new_message" || !data.message) return;

      const m: any = data.message;

      // ✅ nur wenn an mich
      if (m.receiverId !== userId) return;

      setActiveMessages((prev) => {
        const next = new Map(prev);
        const arr = next.get(m.chatId) || [];
        if (!arr.some((x: any) => x.id === m.id)) {
          next.set(m.chatId, [...arr, m]);
        }
        return next;
      });

      scheduleMessageDeletion(m);

      // badge up (wenn chat nicht offen)
      if (!selectedChat || selectedChat.id !== m.chatId) {
        setUnreadCounts((prev) => {
          const next = new Map(prev);
          const c = next.get(m.chatId) || 0;
          next.set(m.chatId, c + 1);
          return next;
        });
      }

      // contacts refresh (last message etc.)
      setTimeout(() => loadPersistentContacts(), 100);
    };

    socket.on("message", onMsg);
    return () => socket.off?.("message", onMsg);
  }, [socket, userId, scheduleMessageDeletion, selectedChat, loadPersistentContacts]);

  // --------------------------
  // Initial load
  // --------------------------
  useEffect(() => {
    if (userId) loadPersistentContacts();
  }, [userId, loadPersistentContacts]);

  useEffect(() => {
    return () => {
      deletionTimersRef.current.forEach((t) => clearTimeout(t));
      deletionTimersRef.current.clear();
    };
  }, []);

  const messages = selectedChat ? activeMessages.get(selectedChat.id) || [] : [];

  return {
    persistentContacts,
    messages,
    selectedChat,
    isLoading,
    selectChat,
    sendMessage,
    messagesEndRef,
    loadPersistentContacts,
    unreadCounts,
  };
}
