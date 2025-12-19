import { useEffect, useState } from "react";
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

  const [currentUser, setCurrentUser] = useState<(User & { privateKey: string; token?: string }) | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) {
      setLocation("/");
      return;
    }
    try {
      const u = JSON.parse(raw);
      if (!u?.id) {
        setLocation("/");
        return;
      }
      setCurrentUser(u);
    } catch {
      setLocation("/");
    }
  }, [setLocation]);

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
  } = usePersistentChats(currentUser?.id, socket);

  // Mobile refresh optional
  useEffect(() => {
    if (!currentUser?.id) return;

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (!isMobile) return;

    const i = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: [`/api/chats/${currentUser.id}`] });
      queryClient.refetchQueries({ queryKey: [`/api/chats/${currentUser.id}`] });
    }, 4000);

    return () => clearInterval(i);
  }, [currentUser?.id]);

  // ✅ FIX: Timer normalize
  // UI kann Minuten liefern (z.B. 5) ODER Sekunden (300).
  // Wir erkennen das automatisch.
  function normalizeToMs(destructValue: number) {
    const v = Number(destructValue);
    if (!Number.isFinite(v) || v <= 0) return 5_000;

    // Wenn jemand "5" auswählt und UI meint Minuten -> v <= 60 ist fast sicher Minuten
    const seconds = v <= 60 ? v * 60 : v;

    // Minimum 5 Sekunden
    const ms = Math.max(seconds * 1000, 5_000);
    return ms;
  }

  const handleSendMessage = (content: string, type: string, destructTimerValue: number, file?: File) => {
    if (!currentUser?.id) {
      setLocation("/");
      return;
    }
    if (!selectedChat?.otherUser?.id) return;

    const destructTimerMs = normalizeToMs(destructTimerValue);

    sendMessage(content, type, destructTimerMs, file);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center overflow-x-hidden">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-text-muted">Loading your secure session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col md:flex-row bg-background chat-container">
      <div
        className={`${
          selectedChat ? "hidden md:flex" : "flex"
        } md:flex w-full md:w-[380px] min-w-0 max-w-full overflow-x-hidden`}
      >
        <WhatsAppSidebar
          currentUser={currentUser as any}
          chats={chats as any}
          selectedChat={selectedChat as any}
          onSelectChat={(chat: any) => selectChat(chat)}
          onOpenSettings={() => setShowSettings(true)}
          isConnected={socket?.isConnected || false}
          isLoading={isLoading}
          unreadCounts={unreadCounts}
          onRefreshChats={() => loadPersistentContacts()}
        />
      </div>

      <div
        className={`${
          selectedChat ? "flex" : "hidden md:flex"
        } flex-1 min-w-0 w-full max-w-full overflow-x-hidden chat-safe`}
      >
        <ChatView
          currentUser={currentUser as any}
          selectedChat={selectedChat as any}
          messages={messages as any}
          onSendMessage={handleSendMessage}
          isConnected={socket?.isConnected || false}
          onBackToList={() => selectChat(null as any)}
        />
      </div>

      {showSettings && currentUser && (
        <SettingsModal
          currentUser={currentUser as any}
          onClose={() => setShowSettings(false)}
          onUpdateUser={(u) => localStorage.setItem("user", JSON.stringify(u))}
        />
      )}

      <Toaster />
    </div>
  );
}
