import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import WhatsAppSidebar from "@/components/chat/whatsapp-sidebar";
import ChatView from "@/components/chat/chat-view";
import SettingsModal from "@/components/chat/settings-modal";
import { Toaster } from "@/components/ui/toaster";
import { useWebSocketReliable } from "@/hooks/use-websocket-reliable";
import { usePersistentChats } from "@/hooks/use-persistent-chats";
import { queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export default function ChatPage() {
  const [, setLocation] = useLocation();
  const [showSettings, setShowSettings] = useState(false);

  const [currentUser, setCurrentUser] = useState<
    (User & { privateKey: string; token?: string }) | null
  >(null);

  // ✅ Fix: Beim Eintritt auf die ChatPage IMMER nach oben (Safari merkt manchmal Scroll)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const initializeUser = async () => {
      let userData = localStorage.getItem("user");

      if (!userData) {
        console.log("🔍 WICKR-ME-RECOVERY: Searching for profile in backup locations...");
        const { profileProtection } = await import("@/lib/profile-protection");
        const recovered = profileProtection.retrieveProfile();
        if (recovered) {
          setCurrentUser(recovered);
          console.log("✅ Profile recovered from backup storage:", recovered.username);
          // ✅ Scroll Fix
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          return;
        }
        console.log("⚠️ No user profile found, redirecting to login");
        setLocation("/");
        return;
      }

      try {
        const user = JSON.parse(userData);
        console.log("👤 Loaded user from localStorage:", user.username, "ID:", user.id);
        setCurrentUser(user);

        // ✅ Scroll Fix (Safari/Browser kann sonst unten starten)
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      } catch (error) {
        console.error("Failed to parse user data:", error);
        console.log("🚫 WICKR-ME-PROTECTION: NOT removing user data on parse error");
        setLocation("/");
      }
    };

    initializeUser();
  }, [setLocation]);

  // ✅ WebSocket
  // (Dein Hook muss intern korrekt wss://host/ws machen – das hast du ja schon angepasst)
  const socket = useWebSocketReliable(currentUser?.id);

  const {
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
  } = usePersistentChats(currentUser?.id, socket);

  // ✅ HARD FIX gegen doppelte Anzeige:
  // Wir deduplizieren Messages vorm Rendern.
  // Das fängt ab:
  // - optimistic UI + server echo
  // - WebSocket event doppelt
  // - REST refetch + WebSocket gleichzeitig
  const dedupedMessages = useMemo(() => {
    const list = Array.isArray(messages) ? messages : [];
    const map = new Map<string, any>();

    for (const m of list) {
      if (!m) continue;

      // Priorität: DB id
      // Fallback: kombinierter Key (damit auch "optimistic" nicht doppelt steht)
      const key =
        m.id != null
          ? `id:${m.id}`
          : `fallback:${m.chatId ?? "x"}:${m.senderId ?? "x"}:${m.receiverId ?? "x"}:${m.createdAt ?? "x"}:${String(
              m.content ?? ""
            ).slice(0, 80)}`;

      // Wenn bereits vorhanden, behalten wir die "bessere" Version:
      // - wenn eine Version eine id hat und die andere nicht -> die mit id gewinnt
      const existing = map.get(key);
      if (!existing) {
        map.set(key, m);
      } else {
        const existingHasId = existing?.id != null;
        const currentHasId = m?.id != null;
        if (!existingHasId && currentHasId) {
          map.set(key, m);
        } else if (existingHasId && currentHasId) {
          // beide haben id -> nimm die neuere createdAt falls vorhanden
          const a = new Date(existing.createdAt || 0).getTime();
          const b = new Date(m.createdAt || 0).getTime();
          if (b >= a) map.set(key, m);
        }
      }
    }

    // Sortierung nach createdAt, falls vorhanden
    const out = Array.from(map.values());
    out.sort((a: any, b: any) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return ta - tb;
    });

    return out;
  }, [messages]);

  useEffect(() => {
    console.log("🚨 CHAT PAGE STATE CHECK:", {
      userId: currentUser?.id,
      chatsCount: (chats as any)?.length || 0,
      messagesCount: (messages as any)?.length || 0,
      dedupedMessagesCount: (dedupedMessages as any)?.length || 0,
      selectedChatId: (selectedChat as any)?.id,
      isConnected: (socket as any)?.isConnected,
    });
  }, [currentUser?.id, chats, messages, dedupedMessages, selectedChat, socket]);

  // ✅ Mobile Refresh System – NICHT alle 2 Sekunden (das macht bei dir Chaos)
  // Besser: refresh wenn die App wieder sichtbar wird / Fokus bekommt
  useEffect(() => {
    if (!currentUser?.id) return;

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const refreshChats = () => {
      try {
        queryClient.invalidateQueries({ queryKey: [`/api/chats/${currentUser.id}`] });
        queryClient.refetchQueries({ queryKey: [`/api/chats/${currentUser.id}`] });
      } catch (e) {
        console.warn("refreshChats failed:", e);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("👁️ Visibility visible -> refreshing chats");
        refreshChats();
      }
    };

    const onFocus = () => {
      console.log("🎯 Window focus -> refreshing chats");
      refreshChats();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    // Optional: sanftes Intervall nur auf Mobile (viel weniger aggressiv)
    let interval: any = null;
    if (isMobile) {
      interval = setInterval(() => {
        // nur wenn sichtbar, sonst nicht
        if (document.visibilityState === "visible") {
          console.log("📱 Mobile gentle refresh");
          refreshChats();
        }
      }, 10000); // ✅ 10 Sekunden statt 2 Sekunden
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      if (interval) clearInterval(interval);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    console.log("Chat status:", {
      user: currentUser?.username,
      connected: (socket as any)?.isConnected,
    });
  }, [currentUser, socket]);

  // ✅ Senden (Sekunden)
  const handleSendMessage = (content: string, type: string, destructTimer: number, file?: File) => {
    console.log("📤 NEUE NACHRICHT:", {
      content: content.substring(0, 20),
      type,
      receiverId: (selectedChat as any)?.otherUser?.id,
      destructTimer: destructTimer + "s",
      currentUserId: currentUser?.id,
    });

    if (!currentUser?.id) {
      console.log("❌ Benutzer nicht angemeldet");
      setLocation("/");
      return;
    }

    if (!(selectedChat as any)?.otherUser?.id) {
      console.log("❌ Kein Chat oder Empfänger ausgewählt");
      return;
    }

    const destructTimerSec = Math.max(Number(destructTimer) || 0, 5);

    console.log(`⏰ SELBSTLÖSCHUNG in ${destructTimerSec}s konfiguriert (Sekunden)`);

    sendMessage(content, type, destructTimerSec, file);
  };

  // ✅ Tipp-Status des Partners (für aktuellen Chat)
  const isPartnerTyping = useMemo(() => {
    if (!selectedChat) return false;
    return typingByChat.get((selectedChat as any).id) ?? false;
  }, [typingByChat, selectedChat]);

  // ✅ Tipp-Events vom Input nach WebSocket schicken
  const handleTyping = (isTyping: boolean) => {
    if (!(socket as any)?.send) return;
    if (!currentUser?.id || !(selectedChat as any)?.otherUser?.id || !(selectedChat as any)?.id) return;

    const payload = {
      type: "typing",
      chatId: (selectedChat as any).id,
      senderId: currentUser.id,
      receiverId: (selectedChat as any).otherUser.id,
      isTyping,
    };

    console.log("⌨️ TYPING EVENT:", payload);
    (socket as any).send(payload);
  };

  if (!currentUser) {
    return (
      <div className="h-[100dvh] md:h-screen flex items-center justify-center overflow-x-hidden">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-text-muted">Loading your secure session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] md:h-screen w-full max-w-full overflow-hidden flex flex-col md:flex-row bg-background chat-container">
      {/* Sidebar */}
      <div
        className={`${
          selectedChat ? "hidden md:flex" : "flex"
        } md:flex w-full md:w-[380px] min-w-0 min-h-0 max-w-full overflow-x-hidden`}
      >
        <WhatsAppSidebar
          currentUser={currentUser}
          chats={chats as any}
          selectedChat={selectedChat as any}
          onSelectChat={(chat: any) => {
            console.log(`💬 WHATSAPP-CHAT: ${chat.otherUser.username} einzeln beigetreten`);
            selectChat(chat);
          }}
          onOpenSettings={() => setShowSettings(true)}
          isConnected={(socket as any)?.isConnected || false}
          isLoading={isLoading}
          unreadCounts={unreadCounts}
          onRefreshChats={() => {
            console.log("🔄 Refreshing chat list after context menu action");
            loadPersistentContacts();
          }}
          onDeleteChat={(chatId: number) => {
            console.log("🗑 Deleting chat from sidebar:", chatId);
            deleteChat(chatId);
          }}
        />
      </div>

      {/* Chat */}
      <div
        className={`${
          selectedChat ? "flex" : "hidden md:flex"
        } flex-1 min-w-0 min-h-0 w-full max-w-full overflow-hidden chat-safe`}
      >
        <ChatView
          currentUser={currentUser}
          selectedChat={selectedChat as any}
          messages={dedupedMessages as any}  // ✅ HIER: deduped statt raw
          onSendMessage={handleSendMessage}
          isConnected={(socket as any)?.isConnected || false}
          onBackToList={() => {
            console.log("📱 MOBILE: Zurück zur Chat-Liste - nur ein Schritt");
            selectChat(null as any);
          }}
          onTyping={handleTyping}
          isPartnerTyping={isPartnerTyping}
        />
      </div>

      {showSettings && currentUser && (
        <SettingsModal
          currentUser={currentUser}
          onClose={() => setShowSettings(false)}
          onUpdateUser={(user: any) => {
            localStorage.setItem("user", JSON.stringify(user));
            setCurrentUser(user as any);
          }}
        />
      )}

      <Toaster />
    </div>
  );
}