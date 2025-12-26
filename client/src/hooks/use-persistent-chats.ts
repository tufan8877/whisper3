import { useState, useEffect, useCallback, useRef } from "react";
import type { User, Chat, Message } from "@shared/schema";

/**
 * Lokaler Cutoff: Wenn du einen Chat löschst, merken wir uns "deletedAt".
 * Beim erneuten Öffnen werden alle Nachrichten mit createdAt <= deletedAt ausgefiltert,
 * damit alte Messages NIE wieder erscheinen (auch wenn Backend sie liefert).
 */
function storageKey(userId: number) {
  return `chat_cutoffs_v1_${userId}`;
}

function loadCutoffs(userId: number): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveCutoffs(userId: number, data: Record<string, string>) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(data));
  } catch {}
}

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

function toMs(dateLike: any): number {
  const t = new Date(dateLike).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function usePersistentChats(userId?: number, socket?: any) {
  const [persistentContacts, setPersistentContacts] = useState<
    Array<Chat & { otherUser: User; unreadCount?: number }>
  >([]);
  const [activeMessages, setActiveMessages] = useState<Map<number, Message[]>>(new Map());
  const [selectedChat, setSelectedChat] = useState<(Chat & { otherUser: User }) | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Map<number, number>>(new Map());

  // ✅ NEU: Wer tippt in welchem Chat?
  // chatId -> true (Partner tippt)
  const [typingByChat, setTypingByChat] = useState<Map<number, boolean>>(new Map());

  const deletionTimersRef = useRef<Map<number, any>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ✅ Cutoff Map (chatId -> deletedAt ISO)
  const cutoffsRef = useRef<Record<string, string>>({});

  // --------------------------
  // Timers
  // --------------------------
  const clearTimer = (messageId: number) => {
    const t = deletionTimersRef.current.get(messageId);
    if (t) clearTimeout(t);
    deletionTimersRef.current.delete(messageId);
  };

  const scheduleMessageDeletion = useCallback((message: Message) => {
    try {
      const expiresAtMs = toMs((message as any).expiresAt);
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
  // Cutoff helpers
  // --------------------------
  const getCutoffMs = useCallback(
    (chatId: number): number => {
      if (!userId) return 0;
      const iso = cutoffsRef.current[String(chatId)];
      return iso ? toMs(iso) : 0;
    },
    [userId]
  );

  const setCutoffNow = useCallback(
    (chatId: number) => {
      if (!userId) return;
      const nowIso = new Date().toISOString();
      cutoffsRef.current[String(chatId)] = nowIso;
      saveCutoffs(userId, cutoffsRef.current);
    },
    [userId]
  );

  const filterByCutoff = useCallback(
    (chatId: number, msgs: any[]): any[] => {
      const cutoff = getCutoffMs(chatId);
      if (!cutoff) return msgs;

      return (msgs || []).filter((m: any) => {
        const created = toMs(m.createdAt);
        return created > cutoff;
      });
    },
    [getCutoffMs]
  );

  // --------------------------
  // Load contacts + unread
  // --------------------------
  const loadPersistentContacts = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      const contacts = await authedFetch(`/api/chats/${userId}`);

      const newUnread = new Map<number, number>();
      (contacts || []).forEach((c: any) => {
        let unread = 0;
        if (userId === c.participant1Id) unread = c.unreadCount1 || 0;
        else if (userId === c.participant2Id) unread = c.unreadCount2 || 0;
        c.unreadCount = unread;
        if (unread > 0) newUnread.set(c.id, unread);
      });

      const sorted = (contacts || []).sort((a: any, b: any) => {
        const aTime = a.lastMessage?.createdAt || a.lastMessageTimestamp || a.createdAt;
        const bTime = b.lastMessage?.createdAt || b.lastMessageTimestamp || b.createdAt;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      setUnreadCounts(newUnread);
      setPersistentContacts(sorted);

      // Optional: Messages laden
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
        const msgsRaw = await authedFetch(`/api/chats/${chatId}/messages`);
        const msgs = filterByCutoff(chatId, Array.isArray(msgsRaw) ? msgsRaw : []);

        setActiveMessages((prev) => {
          const next = new Map(prev);
          next.set(chatId, msgs);
          return next;
        });

        msgs.forEach((m: Message) => scheduleMessageDeletion(m));
      } catch (e) {
        console.error(`❌ loadActiveMessages chat=${chatId}:`, e);
        setActiveMessages((prev) => {
          const next = new Map(prev);
          next.set(chatId, []);
          return next;
        });
      }
    },
    [scheduleMessageDeletion, filterByCutoff]
  );

  // --------------------------
  // Select chat
  // --------------------------
  const selectChat = useCallback(
    async (chat: (Chat & { otherUser: User }) | null) => {
      setSelectedChat(chat);
      if (!chat || !userId) return;

      // mark-read
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

      // Tipp-Status beim Öffnen dieses Chats löschen
      setTypingByChat((prev) => {
        const next = new Map(prev);
        next.delete(chat.id);
        return next;
      });

      await loadActiveMessages(chat.id);

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    },
    [userId, loadActiveMessages]
  );

  // --------------------------
  // Delete chat (CUT-OFF)
  // --------------------------
  const deleteChat = useCallback(
    async (chatId: number) => {
      if (!userId) return;

      // 1) Cutoff setzen
      setCutoffNow(chatId);

      // 2) lokale Nachrichten sofort leeren
      setActiveMessages((prev) => {
        const next = new Map(prev);
        next.set(chatId, []);
        return next;
      });

      // 3) Tipp-Status für diesen Chat entfernen
      setTypingByChat((prev) => {
        const next = new Map(prev);
        next.delete(chatId);
        return next;
      });

      // 4) Offener Chat schließen
      setSelectedChat((prev) => (prev?.id === chatId ? null : prev));

      // 5) Server
      try {
        await authedFetch(`/api/chats/${chatId}/delete`, { method: "POST" });
      } catch (e) {
        console.error("deleteChat server failed:", e);
      }

      // 6) Liste neu laden
      await loadPersistentContacts();
    },
    [userId, setCutoffNow, loadPersistentContacts]
  );

  // --------------------------
  // Send message (SECONDS)
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

      const wsPayload = {
        type: "message",
        chatId: selectedChat.id,
        senderId: userId,
        receiverId: selectedChat.otherUser.id,
        content,
        messageType: type,
        destructTimer: secs,
      };

      console.log("📤 WS send:", wsPayload);
      const ok = socket.send(wsPayload);
      if (!ok) console.warn("⚠️ WS not open -> queued (useWebSocketReliable queues)");
    },
    [selectedChat, userId, socket, scheduleMessageDeletion]
  );

  // --------------------------
  // Incoming WebSocket messages
  // --------------------------
  useEffect(() => {
    if (!socket?.on || !userId) return;

    const onMsg = (data: any) => {
      // ✅ Tipp-Events
      if (data?.type === "typing") {
        const { chatId, senderId, receiverId, isTyping } = data;

        // Nur interessant, wenn ICH der Empfänger bin
        if (receiverId === userId && chatId) {
          setTypingByChat((prev) => {
            const next = new Map(prev);
            if (isTyping) next.set(chatId, true);
            else next.delete(chatId);
            return next;
          });
        }
        return;
      }

      if (data?.type !== "new_message" || !data.message) return;

      const m: any = data.message;

      if (m.receiverId !== userId && m.senderId !== userId) return;

      // cutoff
      const cutoff = getCutoffMs(m.chatId);
      if (cutoff) {
        const created = toMs(m.createdAt);
        if (created && created <= cutoff) return;
      }

      setActiveMessages((prev) => {
        const next = new Map(prev);
        const arr = next.get(m.chatId) || [];
        if (!arr.some((x: any) => x.id === m.id)) {
          next.set(m.chatId, [...arr, m]);
        }
        return next;
      });

      scheduleMessageDeletion(m);

      if (!selectedChat || selectedChat.id !== m.chatId || m.senderId !== userId) {
        setUnreadCounts((prev) => {
          const next = new Map(prev);
          const c = next.get(m.chatId) || 0;
          next.set(m.chatId, c + 1);
          return next;
        });
      }

      setTimeout(() => loadPersistentContacts(), 100);
    };

    socket.on("message", onMsg);
    return () => socket.off?.("message", onMsg);
  }, [socket, userId, scheduleMessageDeletion, selectedChat, loadPersistentContacts, getCutoffMs]);

  // --------------------------
  // Initial load
  // --------------------------
  useEffect(() => {
    if (!userId) return;
    cutoffsRef.current = loadCutoffs(userId);
    loadPersistentContacts();
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
    deleteChat,

    // ✅ NEU: Tipp-Status nach außen
    typingByChat,
  };
}
