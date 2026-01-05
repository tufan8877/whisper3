// client/src/hooks/use-persistent-chats.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chat, Message, User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

type ChatWithUser = Chat & { otherUser: User; lastMessage?: any; unreadCount?: number };

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function uniqById<T extends { id: any }>(arr: T[]) {
  const seen = new Set<any>();
  const out: T[] = [];
  for (const x of arr) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

export function usePersistentChats(
  userId?: number,
  socket?: { on: any; off?: any; send?: any; isConnected?: boolean }
) {
  const [persistentContacts, setPersistentContacts] = useState<ChatWithUser[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatWithUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [typingByChat, setTypingByChat] = useState<Map<number, boolean>>(new Map());
  const [unreadCounts, setUnreadCounts] = useState<Map<number, number>>(new Map());

  const selectedChatIdRef = useRef<number | null>(null);

  const loadPersistentContacts = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/chats/${userId}`, {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
      });

      const data = await res.json();
      // data ist Array
      setPersistentContacts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("loadPersistentContacts failed:", e);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const loadMessages = useCallback(async (chatId: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
      });
      const data = await res.json();
      setMessages(Array.isArray(data) ? uniqById(data) : []);
    } catch (e) {
      console.error("loadMessages failed:", e);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectChat = useCallback(
    async (chat: ChatWithUser | null) => {
      setSelectedChat(chat);
      if (!chat) {
        selectedChatIdRef.current = null;
        setMessages([]);
        return;
      }

      selectedChatIdRef.current = chat.id;

      // unread count reset lokal
      setUnreadCounts((prev) => {
        const n = new Map(prev);
        n.set(chat.id, 0);
        return n;
      });

      // Server mark-read
      try {
        await fetch(`/api/chats/${chat.id}/mark-read`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
        });
      } catch {}

      await loadMessages(chat.id);
    },
    [loadMessages]
  );

  const sendMessage = useCallback(
    (content: string, type: string, destructTimer: number, file?: File) => {
      if (!userId) return false;
      if (!socket?.send) return false;
      if (!selectedChat?.otherUser?.id) return false;

      const payload = {
        type: "message",
        senderId: userId,
        receiverId: selectedChat.otherUser.id,
        content,
        messageType: type,
        destructTimer,
      };

      // ✅ KEIN optimistisches setMessages hier -> verhindert Duplikate
      return socket.send(payload);
    },
    [socket, userId, selectedChat]
  );

  const deleteChat = useCallback(
    async (chatId: number) => {
      if (!chatId) return;
      try {
        await fetch(`/api/chats/${chatId}/delete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
        });
      } catch (e) {
        console.error("deleteChat failed:", e);
      } finally {
        await loadPersistentContacts();
        if (selectedChatIdRef.current === chatId) {
          setSelectedChat(null);
          setMessages([]);
          selectedChatIdRef.current = null;
        }
      }
    },
    [loadPersistentContacts]
  );

  // ✅ WebSocket: new_message, typing
  useEffect(() => {
    if (!socket?.on) return;

    const offNewMessage = socket.on("new_message", (data: any) => {
      const msg = data?.message;
      if (!msg?.id) return;

      // Chatliste refresh (lastMessage)
      loadPersistentContacts();

      // unread count
      const chatId = msg.chatId;
      const isActive = selectedChatIdRef.current === chatId;

      if (!isActive) {
        setUnreadCounts((prev) => {
          const n = new Map(prev);
          n.set(chatId, (n.get(chatId) || 0) + 1);
          return n;
        });
      }

      // wenn der Chat offen ist, add message (dedupe by id)
      if (isActive) {
        setMessages((prev) => {
          if (prev.some((m: any) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });

    const offTyping = socket.on("typing", (data: any) => {
      const chatId = Number(data?.chatId || 0);
      if (!chatId) return;
      const isTyping = Boolean(data?.isTyping);

      setTypingByChat((prev) => {
        const n = new Map(prev);
        n.set(chatId, isTyping);
        return n;
      });
    });

    return () => {
      // wenn socket.on unsubscribe-return unterstützt
      if (typeof offNewMessage === "function") offNewMessage();
      if (typeof offTyping === "function") offTyping();
    };
  }, [socket, loadPersistentContacts]);

  // initial load
  useEffect(() => {
    if (!userId) return;
    loadPersistentContacts();
  }, [userId, loadPersistentContacts]);

  return {
    persistentContacts,
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

export default usePersistentChats;