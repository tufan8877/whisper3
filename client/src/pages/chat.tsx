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

  // User aus localStorage (Wickr-Me Style)
  const [currentUser, setCurrentUser] = useState<
    (User & { privateKey: string }) | null
  >(null);

  // User nur einmal beim Mount laden
  useEffect(() => {
    const initializeUser = async () => {
      const userData = localStorage.getItem("user");

      if (!userData) {
        console.log(
          "🔍 WICKR-ME-RECOVERY: Searching for profile in backup locations..."
        );
        const { profileProtection } = await import("@/lib/profile-protection");
        const recovered = profileProtection.retrieveProfile();
        if (recovered) {
          setCurrentUser(recovered);
          console.log(
            "✅ Profile recovered from backup storage:",
            recovered.username
          );
          return;
        }
        console.log("⚠️ No user profile found, redirecting to login");
        setLocation("/");
        return;
      }

      try {
        const user = JSON.parse(userData);
        console.log(
          "👤 Loaded user from localStorage:",
          user.username,
          "ID:",
          user.id
        );
        setCurrentUser(user);
      } catch (error) {
        console.error("Failed to parse user data:", error);
        console.log(
          "🚫 WICKR-ME-PROTECTION: NOT removing user data on parse error"
        );
        setLocation("/");
      }
    };

    initializeUser();
  }, [setLocation]);

  // WebSocket + Chats
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
    deleteChat, // ✅ NEU: wichtig für "Chat löschen = alte Messages wirklich weg"
  } = usePersistentChats(currentUser?.id, socket);

  // Debug Logs
  useEffect(() => {
    console.log("🚨 CHAT PAGE STATE CHECK:", {
      userId: currentUser?.id,
      chatsCount: chats?.length || 0,
      messagesCount: messages?.length || 0,
      selectedChatId: selectedChat?.id,
      isConnected: socket?.isConnected,
      chatsWithUnreadCounts: chats?.map((c: any) => ({
        id: c.id,
        otherUser: c.otherUser?.username,
        unreadCount: c.unreadCount,
      })),
    });
  }, [currentUser?.id, chats, messages, selectedChat, socket]);

  // Aggressive mobile refresh
  useEffect(() => {
    if (!currentUser?.id) return;

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    if (isMobile) {
      console.log("📱 Mobile: Setting up chat list refresh system");
      const mobileRefreshInterval = setInterval(() => {
        console.log("📱 Mobile: Periodic chat list refresh");
        queryClient.invalidateQueries({
          queryKey: [`/api/chats/${currentUser.id}`],
        });
        queryClient.refetchQueries({
          queryKey: [`/api/chats/${currentUser.id}`],
        });
      }, 2000);

      return () => clearInterval(mobileRefreshInterval);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    console.log("Chat status:", {
      user: currentUser?.username,
      connected: socket?.isConnected,
    });
  }, [currentUser, socket]);

  // ✅ Senden (destructTimer in SEKUNDEN)
  const handleSendMessage = (
    content: string,
    type: string,
    destructTimer: number,
    file?: File
  ) => {
    console.log("📤 NEUE NACHRICHT:", {
      content: content.substring(0, 20),
      type,
      receiverId: selectedChat?.otherUser?.id,
      destructTimer: destructTimer + "s",
      currentUserId: currentUser?.id,
    });

    if (!currentUser?.id) {
      console.log("❌ Benutzer nicht angemeldet");
      setLocation("/");
      return;
    }

    if (!selectedChat?.otherUser?.id) {
      console.log("❌ Kein Chat oder Empfänger ausgewählt");
      return;
    }

    const destructTimerSec = Math.max(Number(destructTimer) || 0, 5);

    console.log(`⏰ SELBSTLÖSCHUNG in ${destructTimerSec}s (Sekunden)`);

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
      {/* Sidebar */}
      <div
        className={`${
          selectedChat ? "hidden md:flex" : "flex"
        } md:flex w-full md:w-[380px] min-w-0 max-w-full overflow-x-hidden`}
      >
        <WhatsAppSidebar
          currentUser={currentUser}
          chats={chats as any}
          selectedChat={selectedChat}
          onSelectChat={(chat: any) => {
            console.log(
              `💬 WHATSAPP-CHAT: ${chat.otherUser.username} einzeln beigetreten`
            );
            selectChat(chat);
          }}
          onOpenSettings={() => setShowSettings(true)}
          isConnected={socket?.isConnected || false}
          isLoading={isLoading}
          unreadCounts={unreadCounts}
          onRefreshChats={() => {
            console.log("🔄 Refreshing chat list");
            loadPersistentContacts();
          }}
          // ✅ NEU: Damit "Chat löschen" richtig funktioniert
          onDeleteChat={async (chatId: number) => {
            try {
              // 1) UI sofort "zurück", falls gerade dieser Chat offen ist
              if (selectedChat?.id === chatId) {
                selectChat(null as any);
              }

              // 2) Hook-Delete: setzt Cutoff + löscht lokale Messages + refresh
              if (deleteChat) {
                await deleteChat(chatId);
              } else {
                // Fallback: wenn deleteChat nicht existiert
                await fetch(`/api/chats/${chatId}/delete`, { method: "POST" });
                await loadPersistentContacts();
              }
            } catch (e) {
              console.error("❌ onDeleteChat error:", e);
            }
          }}
        />
      </div>

      {/* Chat */}
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
          onBackToList={() => {
            console.log("📱 MOBILE: Zurück zur Chat-Liste");
            selectChat(null as any);
          }}
        />
      </div>

      {showSettings && currentUser && (
        <SettingsModal
          currentUser={currentUser}
          onClose={() => setShowSettings(false)}
          onUpdateUser={(user) => {
            localStorage.setItem("user", JSON.stringify(user));
          }}
        />
      )}

      <Toaster />
    </div>
  );
}
