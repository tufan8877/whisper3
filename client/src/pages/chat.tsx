import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import WhatsAppSidebar from "@/components/chat/whatsapp-sidebar";
import ChatView from "@/components/chat/chat-view";
import SettingsModal from "@/components/chat/settings-modal";
import { Toaster } from "@/components/ui/toaster";
import { useWebSocketReliable } from "@/hooks/use-websocket-reliable";
import { usePersistentChats } from "@/hooks/use-persistent-chats";
import { debugEncryptionKeys, testEncryptionRoundtrip } from "@/lib/crypto-debug";
import { repairEncryptionIssues } from "@/lib/crypto-repair";
import { queryClient } from "@/lib/queryClient";
import type { User, Chat, Message } from "@shared/schema";

export default function ChatPage() {
  const [, setLocation] = useLocation();
  // selectedChat now comes from useChatDebug hook
  const [showSettings, setShowSettings] = useState(false);

  // Initialize user once from localStorage
  const [currentUser, setCurrentUser] = useState<User & { privateKey: string } | null>(null);

  // Initialize user once from localStorage with profile protection - only on mount
  useEffect(() => {
    const initializeUser = async () => {
      // Try multiple sources to find user profile (Wickr-Me style persistence)
      let userData = localStorage.getItem("user");
      
      // If no localStorage data, try other sources
      if (!userData) {
        console.log("🔍 WICKR-ME-RECOVERY: Searching for profile in backup locations...");
        const { profileProtection } = await import("@/lib/profile-protection");
        const recovered = profileProtection.retrieveProfile();
        if (recovered) {
          setCurrentUser(recovered);
          console.log("✅ Profile recovered from backup storage:", recovered.username);
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
      } catch (error) {
        console.error("Failed to parse user data:", error);
        console.log("🚫 WICKR-ME-PROTECTION: NOT removing user data on parse error");
        // Just redirect to login, don't delete profile
        setLocation("/");
      }
    };
    
    initializeUser();
  }, []); // Run only once on mount

  const socket = useWebSocketReliable(currentUser?.id);
  const { 
    persistentContacts: chats, 
    messages, 
    sendMessage, 
    selectChat, 
    isLoading, 
    selectedChat,
    messagesEndRef,
    loadPersistentContacts,
    unreadCounts
  } = usePersistentChats(currentUser?.id, socket);
  
  // MASSIVE LOGGING for debugging
  useEffect(() => {
    console.log('🚨 CHAT PAGE STATE CHECK:', {
      userId: currentUser?.id,
      chatsCount: chats?.length || 0,
      messagesCount: messages?.length || 0,
      selectedChatId: selectedChat?.id,
      isConnected: socket?.isConnected,
      chatsWithUnreadCounts: chats?.map(c => ({
        id: c.id,
        otherUser: c.otherUser?.username,
        unreadCount: c.unreadCount
      }))
    });
  }, [currentUser?.id, chats, messages, selectedChat, socket]);
  
  // Aggressive mobile chat list refresh system
  useEffect(() => {
    if (!currentUser?.id) return;
    
    console.log('📱 Mobile: Setting up chat list refresh system');
    
    // Force refresh every 2 seconds when on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      const mobileRefreshInterval = setInterval(() => {
        console.log('📱 Mobile: Periodic chat list refresh');
        // Force refetch chats
        queryClient.invalidateQueries({ queryKey: [`/api/chats/${currentUser.id}`] });
        queryClient.refetchQueries({ queryKey: [`/api/chats/${currentUser.id}`] });
      }, 2000);
      
      return () => clearInterval(mobileRefreshInterval);
    }
  }, [currentUser?.id]);
  
  // Debug WebSocket connection status  
  useEffect(() => {
    console.log("Chat status:", {
      user: currentUser?.username,
      connected: socket?.isConnected
    });
  }, [currentUser, socket]);

  const handleSendMessage = (content: string, type: string, destructTimer: number, file?: File) => {
    console.log("📤 NEUE NACHRICHT:", {
      content: content.substring(0, 20),
      type,
      receiverId: selectedChat?.otherUser?.id,
      destructTimer: destructTimer + 's',
      currentUserId: currentUser?.id
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

    // SELBSTLÖSCHZEIT: Konfigurierbare Zeit in Millisekunden (minimum 5 Sekunden für Tests)
    const destructTimerMs = Math.max(destructTimer * 1000, 5000);
    console.log(`⏰ SELBSTLÖSCHUNG in ${destructTimer}s konfiguriert (Chat-Kanal bleibt bestehen)`);
    
    sendMessage(content, type, destructTimerMs, file);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-text-muted">Loading your secure session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* MOBILE RESPONSIVE: WhatsApp-Style Sidebar versteckt wenn Chat geöffnet */}
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} md:flex`}>
        <WhatsAppSidebar
          currentUser={currentUser}
          chats={chats as any}
          selectedChat={selectedChat}
          onSelectChat={(chat) => {
            console.log(`💬 WHATSAPP-CHAT: ${chat.otherUser.username} einzeln beigetreten`);
            console.log('DEBUG: Selected chat object:', chat);
            console.log('DEBUG: Chat unreadCount:', chat.unreadCount);
            selectChat(chat);
          }}
          onOpenSettings={() => setShowSettings(true)}
          isConnected={socket?.isConnected || false}
          isLoading={isLoading}
          unreadCounts={unreadCounts}
          onRefreshChats={() => {
            console.log('🔄 Refreshing chat list after context menu action');
            loadPersistentContacts();
          }}
        />
      </div>
      
      {/* MOBILE RESPONSIVE: Chat-Ansicht */}
      <div className={`${selectedChat ? 'flex' : 'hidden md:flex'} flex-1`}>
        <ChatView
          currentUser={currentUser}
          selectedChat={selectedChat}
          messages={messages}
          onSendMessage={handleSendMessage}
          isConnected={socket?.isConnected || false}
          onBackToList={() => {
            console.log('📱 MOBILE: Zurück zur Chat-Liste - nur ein Schritt');
            selectChat(null);
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
