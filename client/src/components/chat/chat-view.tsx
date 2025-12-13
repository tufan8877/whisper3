import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/lib/i18n";
import Message from "./message";
import { Paperclip, Send, Smile, Lock, Clock, MoreVertical, Shield, ArrowLeft } from "lucide-react";
import type { User, Chat, Message as MessageType } from "@shared/schema";

interface ChatViewProps {
  currentUser: User;
  selectedChat: Chat & { otherUser: User } | null;
  messages: MessageType[];
  onSendMessage: (content: string, type: string, destructTimer: number, file?: File) => void;
  isConnected: boolean;
  onBackToList: () => void;
}

export default function ChatView({
  currentUser,
  selectedChat,
  messages,
  onSendMessage,
  isConnected,
  onBackToList,
}: ChatViewProps) {
  
  // CRITICAL DEBUG LOG
  console.log('🎯 CHATVIEW RENDER:', {
    selectedChat: selectedChat ? selectedChat.id : 'NULL',
    otherUser: selectedChat?.otherUser?.username || 'NULL',
    hasMessages: messages?.length || 0
  });
  const [messageInput, setMessageInput] = useState("");
  const [destructTimer, setDestructTimer] = useState("300"); // 5 minutes default
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  // Enhanced auto-scroll for mobile with smooth behavior
  useEffect(() => {
    if (messages.length > 0) {
      console.log('📱 MOBILE: Auto-scrolling to bottom with new messages');
      
      // Multiple scroll attempts for better mobile compatibility  
      const scrollAttempts = [0, 100, 300, 500];
      scrollAttempts.forEach(delay => {
        setTimeout(() => {
          scrollToBottom();
        }, delay);
      });
    }
  }, [messages]);

  // Force scroll on mobile when chat becomes active
  useEffect(() => {
    if (selectedChat && messages.length > 0) {
      console.log('📱 MOBILE: Chat activated, ensuring scroll to bottom');
      setTimeout(() => scrollToBottom(), 200);
    }
  }, [selectedChat]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      console.log('📱 MOBILE: Executing scroll to bottom');
      
      // Enhanced scroll for mobile devices
      messagesEndRef.current.scrollIntoView({ 
        behavior: "smooth",
        block: "end",
        inline: "nearest"
      });
      
      // Force scroll for stubborn mobile browsers
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "auto" });
        }
      }, 100);
    }
  };

  const handleSendMessage = () => {
    console.log("🚀 Send button clicked:", {
      messageInput: messageInput.trim(),
      selectedChat: selectedChat?.id,
      otherUserId: selectedChat?.otherUser?.id,
      destructTimer: parseInt(destructTimer) // Already in seconds
    });

    if (!messageInput.trim() || !selectedChat) {
      console.log("❌ Send blocked: missing message or chat");
      return;
    }

    if (!isConnected) {
      alert(t('notConnected'));
      return;
    }

    console.log("✅ Calling onSendMessage with timer:", parseInt(destructTimer), "seconds");
    onSendMessage(messageInput.trim(), "text", parseInt(destructTimer)); // Timer in seconds
    setMessageInput(""); // Clear input field
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log("📁 File selected:", file?.name, file?.type, "Size:", file?.size);
    
    if (!file) {
      console.log("❌ No file selected");
      return;
    }

    if (!selectedChat || !isConnected) {
      alert(t('selectChatFirst'));
      return;
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      alert(t('fileTooLarge'));
      return;
    }
    
    if (file.type.startsWith("image/")) {
      console.log("📸 Converting image to Base64...");
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result as string;
        console.log("✅ Image converted to Base64, sending...");
        // Send image as base64
        onSendMessage(base64String, "image", parseInt(destructTimer) * 1000); // Convert to milliseconds
      };
      reader.onerror = () => {
        console.error("❌ Failed to read image file");
        alert(t('failedToReadFile'));
      };
      reader.readAsDataURL(file);
    } else {
      console.log("📄 Handling file upload...");
      // For non-image files, send file name and let backend handle
      onSendMessage(`📎 ${file.name}`, "file", parseInt(destructTimer) * 1000, file);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Camera capture function
  const handleCameraCapture = () => {
    if (!selectedChat || !isConnected) {
      alert(t('selectChatPhoto'));
      return;
    }

    // Create camera input
    const cameraInput = document.createElement('input');
    cameraInput.type = 'file';
    cameraInput.accept = 'image/*';
    cameraInput.capture = 'environment'; // Use back camera
    cameraInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        console.log("📷 Camera photo captured:", file.name);
        handleFileUpload({ target: { files: [file] } } as any);
      }
    };
    cameraInput.click();
  };

  const formatDestructTimer = (seconds: number) => {
    if (seconds < 60) return `${seconds} sec`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hour${Math.floor(seconds / 3600) > 1 ? 's' : ''}`;
    return `${Math.floor(seconds / 86400)} day${Math.floor(seconds / 86400) > 1 ? 's' : ''}`;
  };

  if (!selectedChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4 p-8">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t('welcome')}
            </h3>
            <p className="text-muted-foreground">
              {t('selectChatToStart')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen md:h-auto bg-background">
      {/* Chat Header */}
      <div className="bg-background border-b border-border p-3 md:p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* MOBILE: Zurück-Button neben Profilbild */}
          <div className="md:hidden flex items-center mr-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                console.log('📱 MOBILE: Zurück zur Chat-Liste vom Header');
                onBackToList();
              }}
              className="w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full flex-shrink-0 back-button-mobile touch-target"
            >
              <ArrowLeft className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center avatar-mobile">
              <span className="text-muted-foreground">👤</span>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                {selectedChat.otherUser.username}
              </h3>
              <div className="flex items-center space-x-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className={isConnected ? "text-green-400" : "text-red-400"}>
                  {isConnected ? t('connected') : t('disconnected')}
                </span>
                <span className="text-muted-foreground">•</span>
                <Lock className="w-3 h-3 text-accent" />
                <span className="text-muted-foreground">{t('realTimeChat')}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {/* Timer Settings - Visible on all devices */}
            <div className="flex items-center space-x-2 bg-muted/30 rounded-lg px-2 md:px-3 py-1 md:py-2">
              <Clock className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />
              <Select value={destructTimer} onValueChange={setDestructTimer}>
                <SelectTrigger className="border-0 bg-transparent text-foreground text-xs md:text-sm h-auto p-0 min-w-[50px] md:min-w-[60px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 sec</SelectItem>
                  <SelectItem value="30">30 sec</SelectItem>
                  <SelectItem value="60">1 min</SelectItem>
                  <SelectItem value="300">5 min</SelectItem>
                  <SelectItem value="1800">30 min</SelectItem>
                  <SelectItem value="3600">1 hour</SelectItem>
                  <SelectItem value="21600">6 hours</SelectItem>
                  <SelectItem value="86400">1 day</SelectItem>
                  <SelectItem value="604800">1 week</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const menu = document.getElementById('chat-menu');
                  if (menu) {
                    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
                  }
                }}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
              
              {/* Dropdown Menu */}
              <div 
                id="chat-menu"
                className="absolute right-0 top-full mt-2 w-48 bg-background border border-border rounded-lg shadow-lg z-10 py-2"
                style={{ display: 'none' }}
              >
                <button 
                  className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    navigator.clipboard.writeText(t('chatWith', { username: selectedChat.otherUser.username }));
                    document.getElementById('chat-menu')!.style.display = 'none';
                  }}
                >
                  📋 {t('copyInviteLink')}
                </button>
                <button 
                  className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-bg-dark transition-colors"
                  onClick={() => {
                    const allMessages = messages.length;
                    alert(t('chatStatsText', { 
                      messages: allMessages.toString(), 
                      partner: selectedChat.otherUser.username 
                    }));
                    document.getElementById('chat-menu')!.style.display = 'none';
                  }}
                >
                  📊 {t('chatStatistics')}
                </button>
                <div className="border-t border-border my-1"></div>
                <button 
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  onClick={() => {
                    if (confirm(t('clearChatConfirm', { username: selectedChat.otherUser.username }))) {
                      // This would trigger a chat clear function
                      alert(t('clearChatImplemented'));
                    }
                    document.getElementById('chat-menu')!.style.display = 'none';
                  }}
                >
                  🗑️ {t('clearChat')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area - Mobile Optimized */}
      <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-2 md:space-y-4 custom-scrollbar pb-safe bg-background" 
           style={{ 
             WebkitOverflowScrolling: 'touch',
             overscrollBehavior: 'contain',
             height: 'calc(100vh - 160px)', // Fixed height for mobile
           }}>
        {/* System Message */}
        <div className="text-center">
          <div className="inline-flex items-center space-x-2 bg-surface rounded-full px-4 py-2 text-sm text-text-muted">
            <Shield className="w-4 h-4 text-accent" />
            <span>This conversation is end-to-end encrypted</span>
          </div>
          {/* DEBUG: Connection Status */}
          <div className={`mt-2 text-xs px-3 py-1 rounded ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {isConnected ? '✅ WebSocket Connected' : '❌ WebSocket Disconnected - Check console for errors'}
          </div>
        </div>

        {/* Messages */}
        {messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            isOwn={message.senderId === currentUser.id}
            otherUser={selectedChat.otherUser}
          />
        ))}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex items-start space-x-2">
            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-muted-foreground text-xs">👤</span>
            </div>
            <div className="bg-surface rounded-2xl rounded-tl-md p-3">
              <div className="typing-indicator">
                <div className="typing-dot" />
                <div className="typing-dot" style={{ animationDelay: "0.1s" }} />
                <div className="typing-dot" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input - Mobile Optimized */}
      <div className="bg-background border-t border-border p-2 md:p-4 flex-shrink-0 safe-area-inset-bottom sticky bottom-0 chat-input-area">
        <div className="flex items-end space-x-1 md:space-x-3">
          {/* File Upload Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-text-muted hover:text-text-primary p-2 md:p-3 touch-target"
            title="Upload file"
          >
            <Paperclip className="w-4 h-4 md:w-4 md:h-4" />
          </Button>
          
          {/* Camera Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCameraCapture}
            className="text-text-muted hover:text-text-primary p-2 md:p-3 touch-target"
            title="Take photo"
          >
            📷
          </Button>
          <div className="flex-1 relative">
            <Textarea
              placeholder={isConnected ? t('typeMessage') : t('connecting')}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyPress}
              className="resize-none bg-background border-border text-foreground placeholder:text-muted-foreground pr-12 min-h-[44px] md:min-h-[40px] max-h-24 md:max-h-32 text-base leading-5 rounded-xl border-2 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 chat-input touch-target"
              rows={1}
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-3 bottom-2 text-text-muted hover:text-primary hidden md:flex"
            >
              <Smile className="w-4 h-4" />
            </Button>
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || !isConnected}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-muted disabled:opacity-50 text-white rounded-full p-3 min-w-[48px] min-h-[48px] md:min-w-[40px] md:min-h-[40px] md:p-2 flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 touch-target"
          >
            <Send className="w-5 h-5 md:w-4 md:h-4" />
          </Button>
        </div>

        {/* Encryption Status */}
        <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
          <div className="flex items-center space-x-2">
            <Lock className="w-3 h-3 text-accent" />
            <span className="hidden md:inline">{t('encryptionEnabled')}</span>
            <span className="md:hidden">🔒 {t('encryptionEnabled')}</span>
          </div>
          <div className="flex items-center space-x-1 md:space-x-2">
            <span className="hidden md:inline">{t('autoDestruct')}:</span>
            <span className="md:hidden text-sm">⏱️</span>
            <span className="text-destructive text-xs md:text-xs">{formatDestructTimer(parseInt(destructTimer))}</span>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileUpload}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
      </div>
    </div>
  );
}
