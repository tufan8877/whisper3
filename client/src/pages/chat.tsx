// client/src/pages/chat.tsx
import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import WhatsAppSidebar from "@/components/chat/whatsapp-sidebar";
import ChatView from "@/components/chat/chat-view";
import SettingsModal from "@/components/chat/settings-modal";
import { Toaster } from "@/components/ui/toaster";
import useWebSocketReliable from "@/hooks/use-websocket-reliable";
import usePersistentChats from "@/hooks/use-persistent-chats";
import type { User } from "@shared/schema";

export default function ChatPage() {
  const [, setLocation] = useLocation();
  const [showSettings, setShowSettings] = useState(false);

  const [currentUser, setCurrentUser] = useState<
    (User & { privateKey: string; token?: string }) | null
  >(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if (!userData || !token) {
      setLocation("/");
      return;
    }

    try {
      const user = JSON.parse(userData);
      setCurrentUser({ ...user, token });
    } catch {
      setLocation("/");
    }
  }, [setLocation]);

  // ✅ reliable websocket uses userId + token
  const socket = useWebSocketReliable(currentUser?.id, currentUser?.token);

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
  } = usePersistentChats(currentUser?.id, socket as any);

  // ✅ Mobile: sanfter refresh (nicht 2s)
  useEffect(() => {
    if (!currentUser?.id) return;

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    if (!isMobile) return;

    const t = window.setInterval(() => {
      if (socket?.isConnected) {
        loadPersistentContacts();
      }
    }, 5000);

    return () => window.clearInterval(t);
  }, [currentUser?.id, socket?.isConnected, loadPersistentContacts]);

  const handleSendMessage = (content: string, type: string, destructTimer: number, file?: File) => {
    if (!currentUser?.id) {
      setLocation("/");
      return;
    }
    if (!selectedChat?.otherUser?.id) return;

    const destructTimerSec = Math.max(Number(destructTimer) || 0, 5);
    sendMessage(content, type, destructTimerSec, file);
  };

  const isPartnerTyping = useMemo(() => {
    if (!selectedChat) return false;
    return typingByChat.get(selectedChat.id) ?? false;
  }, [typingByChat, selectedChat]);

  const handleTyping = (isTyping: boolean) => {
    if (!socket?.send) return;
    if (!currentUser?.id || !selectedChat?.otherUser?.id || !selectedChat?.id) return;

    socket.send({
      type: "typing",
      chatId: selectedChat.id,
      senderId: currentUser.id,
      receiverId: selectedChat.otherUser.id,
      isTyping,
    });
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
      <div className={`${selectedChat ? "hidden md:flex" : "flex"} md:flex w-full md:w-[380px] min-w-0 min-h-0 max-w-full overflow-x-hidden`}>
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
          onDeleteChat={(chatId: number) => deleteChat(chatId)}
        />
      </div>

      {/* Chat */}
      <div className={`${selectedChat ? "flex" : "hidden md:flex"} flex-1 min-w-0 min-h-0 w-full max-w-full overflow-hidden chat-safe`}>
        <ChatView
          currentUser={currentUser}
          selectedChat={selectedChat}
          messages={messages}
          onSendMessage={handleSendMessage}
          isConnected={socket?.isConnected || false}
          onBackToList={() => selectChat(null as any)}
          onTyping={handleTyping}
          isPartnerTyping={isPartnerTyping}
        />
      </div>

      {showSettings && currentUser && (
        <SettingsModal
          currentUser={currentUser}
          onClose={() => setShowSettings(false)}
        />
      )}

      <Toaster />
    </div>
  );
}