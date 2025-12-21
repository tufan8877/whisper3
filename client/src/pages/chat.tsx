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

  const [currentUser, setCurrentUser] = useState<(User & { privateKey: string }) | null>(null);

  useEffect(() => {
    const initializeUser = async () => {
      const userData = localStorage.getItem("user");

      if (!userData) {
        const { profileProtection } = await import("@/lib/profile-protection");
        const recovered = profileProtection.retrieveProfile();
        if (recovered) {
          setCurrentUser(recovered);
          return;
        }
        setLocation("/");
        return;
      }

      try {
        const user = JSON.parse(userData);
        setCurrentUser(user);
      } catch {
        setLocation("/");
      }
    };

    initializeUser();
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
    deleteChat, // ✅ wichtig
  } = usePersistentChats(currentUser?.id, socket);

  useEffect(() => {
    if (!currentUser?.id) return;

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      const mobileRefreshInterval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/chats/${currentUser.id}`] });
        queryClient.refetchQueries({ queryKey: [`/api/chats/${currentUser.id}`] });
      }, 2000);

      return () => clearInterval(mobileRefreshInterval);
    }
  }, [currentUser?.id]);

  const handleSendMessage = (content: string, type: string, destructTimer: number, file?: File) => {
    if (!currentUser?.id) {
      setLocation("/");
      return;
    }

    if (!selectedChat?.otherUser?.id) return;

    const destructTimerSec = Math.max(Number(destructTimer) || 0, 5);
    sendMessage(content, type, destructTimerSec, file);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center overflow-x-hidden">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
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
          currentUser={currentUser}
          chats={chats as any}
          selectedChat={selectedChat}
          onSelectChat={(chat: any) => selectChat(chat)}
          onOpenSettings={() => setShowSettings(true)}
          isConnected={socket?.isConnected || false}
          isLoading={isLoading}
          unreadCounts={unreadCounts}
          onRefreshChats={() => loadPersistentContacts()}
          onDeleteChat={async (chatId) => {
            // ✅ Fix: nutzt Hook deleteChat -> cutoff + lokale messages sauber weg
            await deleteChat(chatId);
          }}
        />
      </div>

      <div
        className={`${
          selectedChat ? "flex" : "hidden md:flex"
        } flex-1 min-w-0 w-full max-w-full overflow-x-hidden chat-safe`}
      >
        <ChatView
          currentUser={currentUser}
          selectedChat={selectedChat}
          messages={messages}
          onSendMessage={handleSendMessage}
          isConnected={socket?.isConnected || false}
          onBackToList={() => selectChat(null as any)}
        />
      </div>

      {showSettings && currentUser && (
        <SettingsModal
          currentUser={currentUser}
          onClose={() => setShowSettings(false)}
          onUpdateUser={(user) => localStorage.setItem("user", JSON.stringify(user))}
        />
      )}

      <Toaster />
    </div>
  );
}
