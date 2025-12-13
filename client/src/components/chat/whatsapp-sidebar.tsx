import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { 
  Search, Plus, Settings, LogOut, MessageCircle, 
  ChevronRight, KeyRound, Users, Clock, MoreVertical, Trash2, UserX
} from "lucide-react";
import type { User, Chat } from "@shared/schema";

interface WhatsAppSidebarProps {
  currentUser: User;
  chats: Array<Chat & { otherUser: User; lastMessage?: any; unreadCount?: number }>;
  selectedChat: Chat & { otherUser: User } | null;
  onSelectChat: (chat: Chat & { otherUser: User }) => void;
  onOpenSettings: () => void;
  isConnected: boolean;
  isLoading: boolean;
  unreadCounts?: Map<number, number>; // WhatsApp-style unread message counts (kept for backward compatibility)
  onRefreshChats?: () => void; // Callback to refresh chat list after operations
}

export default function WhatsAppSidebar({
  currentUser,
  chats,
  selectedChat,
  onSelectChat,
  onOpenSettings,
  isConnected,
  isLoading,
  unreadCounts = new Map(),
  onRefreshChats
}: WhatsAppSidebarProps) {
  
  // DEBUG: Log incoming data
  console.log('🚨 SIDEBAR RECEIVES:', {
    chatsCount: chats?.length,
    firstChat: chats?.[0],
    unreadCounts: Array.from(unreadCounts.entries())
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const { t } = useLanguage();

  // Search for users
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      setSearchLoading(true);
      const searchUsers = async () => {
        try {
          const response = await fetch(`/api/search-users?q=${encodeURIComponent(searchQuery)}&exclude=${currentUser.id}`);
          if (response.ok) {
            const users = await response.json();
            setSearchResults(users);
          }
        } catch (error) {
          console.error("Search error:", error);
          setSearchResults([]);
        } finally {
          setSearchLoading(false);
        }
      };
      const timeoutId = setTimeout(searchUsers, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, currentUser.id]);

  const handleStartChat = async (user: User) => {
    try {
      console.log(`🚀 Starting chat with user: ${user.username} (ID: ${user.id})`);
      
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant1Id: currentUser.id,
          participant2Id: user.id,
        }),
      });

      if (response.ok) {
        const chat = await response.json();
        console.log(`✅ Chat created:`, chat);
        
        const chatWithUser = { ...chat, otherUser: user };
        
        // Close dialog first
        setShowNewChatDialog(false);
        setSearchQuery("");
        setSearchResults([]);
        
        // Force refresh chat list to ensure it appears
        setTimeout(async () => {
          await queryClient.invalidateQueries({ queryKey: [`/api/chats/${currentUser.id}`] });
          await queryClient.refetchQueries({ queryKey: [`/api/chats/${currentUser.id}`] });
        }, 100);
        
        // Select the chat immediately - FORCE MULTIPLE CALLS
        console.log("🎯 CRITICAL: About to call onSelectChat with:", chatWithUser);
        onSelectChat(chatWithUser);
        
        // Force multiple calls to ensure it works
        setTimeout(() => {
          console.log("🎯 CRITICAL: Second onSelectChat call");
          onSelectChat(chatWithUser);
        }, 10);
        
        setTimeout(() => {
          console.log("🎯 CRITICAL: Third onSelectChat call");
          onSelectChat(chatWithUser);
        }, 100);
        
        console.log("✅ CHAT SELECTED:", chatWithUser.id);
        
      } else {
        console.error("❌ Chat creation failed:", response.status);
        alert(t('chatCreateError'));
      }
    } catch (error) {
      console.error("❌ Fehler beim Chat-Start:", error);
      alert(t('connectionError'));
    }
  };

  const handleLogout = () => {
    // WICKR-ME-STYLE: Never delete user data, only clear session temporarily
    console.log("🚫 WICKR-ME-LOGOUT: Preserving user profile, only ending session");
    // Just reload page - user can login again with same credentials
    window.location.href = "/";
  };

  // Delete chat for current user
  const handleDeleteChat = async (chatId: number) => {
    try {
      const response = await fetch(`/api/chats/${chatId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });

      if (response.ok) {
        console.log(`✅ Chat ${chatId} deleted for user ${currentUser.id}`);
        // Refresh chat list
        onRefreshChats?.();
      } else {
        console.error('❌ Failed to delete chat');
      }
    } catch (error) {
      console.error('❌ Error deleting chat:', error);
    }
  };

  // Block user
  const handleBlockUser = async (userId: number, username: string) => {
    try {
      const response = await fetch(`/api/users/${userId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockerId: currentUser.id })
      });

      if (response.ok) {
        console.log(`✅ User ${username} blocked`);
        // Refresh chat list
        onRefreshChats?.();
      } else {
        console.error('❌ Failed to block user');
      }
    } catch (error) {
      console.error('❌ Error blocking user:', error);
    }
  };

  const formatLastMessageTime = (date: string | Date) => {
    const now = new Date();
    const messageDate = new Date(date);
    const diffMs = now.getTime() - messageDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('now');
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return messageDate.toLocaleDateString();
  };

  return (
    <>
      <div className="w-full md:w-80 bg-background border-r border-border flex flex-col h-full md:h-screen">
        {/* WhatsApp-Style Header */}
        <div className="p-4 bg-primary/5 dark:bg-primary/10 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-primary/30 to-primary/50 rounded-full flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-lg">
                  {currentUser.username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h2 className="font-semibold text-foreground text-lg">{currentUser.username}</h2>
                <div className="flex items-center space-x-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    isConnected ? "bg-green-500" : "bg-red-500"
                  )} />
                  <span className="text-xs text-muted-foreground font-medium">
                    {isConnected ? t('online') : t('connecting')}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNewChatDialog(true)}
                className="text-muted-foreground hover:text-foreground hover:bg-primary/10"
              >
                <Plus className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenSettings}
                className="text-muted-foreground hover:text-foreground hover:bg-primary/10"
              >
                <Settings className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* WhatsApp-Style Suche */}
        <div className="p-3 bg-background">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
            <Input
              placeholder={t('searchChats')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 pr-4 py-3 bg-muted/30 border-border focus:bg-background text-foreground placeholder:text-muted-foreground h-12 text-sm indent-2"
              style={{ textIndent: '8px' }}
            />
          </div>
        </div>

        {/* WhatsApp-Style Chat-Liste */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
              <p className="text-muted-foreground">{t('loadingChats')}</p>
            </div>
          ) : chats.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{t('noChats')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('noChatDescription')}
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowNewChatDialog(true)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                {t('newChat')}
              </Button>
            </div>
          ) : (
            <div>
              {chats.map((chat) => {
                const apiUnreadCount = chat.unreadCount || 0;
                const mapUnreadCount = unreadCounts?.get(chat.id) || 0;
                const finalUnreadCount = Math.max(apiUnreadCount, mapUnreadCount);
                console.log(`🔍 SIDEBAR DEBUG: Chat ${chat.id} - ${chat.otherUser.username}`);
                console.log(`   API unreadCount: ${apiUnreadCount}`);
                console.log(`   Map unreadCount: ${mapUnreadCount}`);
                console.log(`   Final count: ${finalUnreadCount}`);
                console.log(`   Should show badge: ${finalUnreadCount > 0}`);
                return (
                <div
                  key={chat.id}
                  className={cn(
                    "relative px-4 py-4 cursor-pointer transition-all duration-200 border-l-4 border-transparent hover:bg-muted/30 group",
                    selectedChat?.id === chat.id && "bg-primary/5 border-l-primary"
                  )}
                  onClick={async () => {
                    console.log(`💬 WHATSAPP: Chat opened - ${chat.otherUser.username}`);
                    
                    // Mark chat as read when clicked - WhatsApp style
                    try {
                      const markReadResponse = await fetch(`/api/chats/${chat.id}/mark-read`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: currentUser?.id })
                      });
                      
                      if (markReadResponse.ok) {
                        console.log(`✅ Chat ${chat.id} marked as read - badge will disappear`);
                        // Refresh chat list to update badge immediately
                        if (onRefreshChats) {
                          onRefreshChats();
                        }
                      }
                    } catch (error) {
                      console.error('Failed to mark chat as read:', error);
                    }
                    
                    onSelectChat(chat);
                  }}
                >
              
                  <div className="flex items-center space-x-3">
                    {/* Avatar mit Online-Status */}
                    <div className="relative flex-shrink-0">
                      <div className="w-14 h-14 bg-gradient-to-br from-primary/20 via-primary/30 to-primary/40 rounded-full flex items-center justify-center shadow-sm">
                        <span className="text-primary font-bold text-xl">
                          {chat.otherUser.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background shadow-sm"></div>
                    </div>
                    
                    {/* Chat-Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-base text-foreground truncate">
                          {chat.otherUser.username}
                        </h3>
                        {chat.lastMessage && (
                          <span className="text-xs text-muted-foreground font-medium">
                            {formatLastMessageTime(chat.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        {chat.lastMessage ? (
                          <p className="text-sm text-muted-foreground truncate flex-1">
                            {chat.lastMessage.content}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground/70 italic flex items-center gap-1">
                            <KeyRound className="w-3 h-3" />
                            {t('encryptedChat')}
                          </p>
                        )}
                        
                        {/* UNREAD INDICATOR - GREEN DOT */}
                        {finalUnreadCount > 0 && (
                          <div className="bg-green-500 rounded-full w-2.5 h-2.5 ml-2 flex-shrink-0 shadow-sm" />
                        )}
                      </div>
                    </div>
                    
                    {/* WhatsApp-style 3-Punkte-Menü - Immer sichtbar */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-70 hover:opacity-100 transition-opacity h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent chat selection
                          }}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteChat(chat.id);
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t('deleteChat')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBlockUser(chat.otherUser.id, chat.otherUser.username);
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <UserX className="w-4 h-4 mr-2" />
                          {t('blockUser', { username: chat.otherUser.username })}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Neuer Chat Dialog */}
      <Dialog open={showNewChatDialog} onOpenChange={setShowNewChatDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {t('newChat')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
              <Input
                placeholder={t('searchUsers')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-4 py-3 bg-white dark:bg-gray-800 text-black dark:text-white placeholder:text-gray-500 h-12 text-sm"
                style={{ textIndent: '8px' }}
              />
            </div>
            
            {searchLoading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {searchResults.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleStartChat(user)}
                  >
                    <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                      <span className="text-primary font-medium">
                        {user.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{user.username}</p>
                      <p className="text-xs text-muted-foreground">{t('startEncryptedChat')}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-xs px-3 py-1 h-7"
                    >
                      {t('startChat')}
                    </Button>
                  </div>
                ))}
              </div>
            ) : searchQuery && !searchLoading ? (
              <div className="text-center py-4 text-muted-foreground">
                {t('noUsersFound')}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-sm">
                {t('enterUsernameToSearch')}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}