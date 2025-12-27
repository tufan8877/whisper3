import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/lib/i18n";
import Message from "./message";
import {
  Paperclip,
  Send,
  Smile,
  Lock,
  Clock,
  MoreVertical,
  Shield,
  ArrowLeft,
} from "lucide-react";
import type { User, Chat, Message as MessageType } from "@shared/schema";

interface ChatViewProps {
  currentUser: User;
  selectedChat: (Chat & { otherUser: User }) | null;
  messages: MessageType[];
  onSendMessage: (
    content: string,
    type: string,
    destructTimerSeconds: number,
    file?: File
  ) => void;
  isConnected: boolean;
  onBackToList: () => void;

  // Tipp-Events
  onTyping?: (isTyping: boolean) => void;
  isPartnerTyping?: boolean;
}

export default function ChatView({
  currentUser,
  selectedChat,
  messages,
  onSendMessage,
  isConnected,
  onBackToList,
  onTyping,
  isPartnerTyping = false,
}: ChatViewProps) {
  const { t } = useLanguage();

  const [messageInput, setMessageInput] = useState("");
  // Selbstzerstörung in SEKUNDEN (Standard 5min)
  const [destructTimer, setDestructTimer] = useState("300");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tipp-Steuerung
  const typingTimeoutRef = useRef<number | undefined>(undefined);
  const isTypingRef = useRef(false);

  /* =================================
   * Scroll-Logik (nur nach unten)
   * ================================= */
  const scrollToBottom = () => {
    if (!messagesEndRef.current) return;

    messagesEndRef.current.scrollIntoView({
      behavior: "smooth",
      block: "end",
      inline: "nearest",
    });

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 80);
  };

  useEffect(() => {
    if (messages.length > 0) {
      const delays = [0, 80, 200];
      delays.forEach((d) => setTimeout(scrollToBottom, d));
    }
  }, [messages.length]);

  useEffect(() => {
    if (selectedChat && messages.length > 0) {
      setTimeout(scrollToBottom, 150);
    }
  }, [selectedChat?.id]);

  // Chat-Wechsel → Tippstatus resetten
  useEffect(() => {
    if (onTyping && isTypingRef.current) {
      onTyping(false);
      isTypingRef.current = false;
    }
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = undefined;
    }
  }, [selectedChat?.id, onTyping]);

  /* =================================
   * Eingabe & Tipp-Events
   * ================================= */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessageInput(value);

    if (!onTyping) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping(true);
    }

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTyping(false);
      }
    }, 1500);
  };

  const handleSendMessage = () => {
    const text = messageInput.trim();
    if (!text || !selectedChat) return;

    if (!isConnected) {
      alert(t("notConnected"));
      return;
    }

    const timerSeconds = parseInt(destructTimer, 10) || 300;
    onSendMessage(text, "text", timerSeconds);
    setMessageInput("");

    if (onTyping && isTypingRef.current) {
      isTypingRef.current = false;
      onTyping(false);
    }
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = undefined;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  /* =================================
   * Dateien & Kamera
   * ================================= */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedChat || !isConnected) {
      alert(t("selectChatFirst"));
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(t("fileTooLarge"));
      return;
    }

    const timerSeconds = parseInt(destructTimer, 10) || 300;

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result as string;
        onSendMessage(base64String, "image", timerSeconds);
      };
      reader.onerror = () => {
        alert(t("failedToReadFile"));
      };
      reader.readAsDataURL(file);
    } else {
      // andere Dateien: Timer bleibt in Sekunden
      onSendMessage(`📎 ${file.name}`, "file", timerSeconds, file);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCameraCapture = () => {
    if (!selectedChat || !isConnected) {
      alert(t("selectChatPhoto"));
      return;
    }

    const cameraInput = document.createElement("input");
    cameraInput.type = "file";
    cameraInput.accept = "image/*";
    cameraInput.capture = "environment";
    cameraInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleFileUpload({
          target: { files: [file] },
        } as any);
      }
    };
    cameraInput.click();
  };

  const formatDestructTimer = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  if (!selectedChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-foreground w-full max-w-full overflow-hidden">
        <div className="text-center space-y-4 p-8">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("welcome")}
            </h3>
            <p className="text-muted-foreground">{t("selectChatToStart")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-full w-full max-w-full bg-background overflow-hidden">
      {/* HEADER */}
      <div className="w-full bg-background border-b border-border px-3 py-2 md:px-4 md:py-3 flex-shrink-0">
        <div className="flex items-center justify-between w-full max-w-full">
          {/* Mobile Back */}
          <div className="md:hidden flex items-center mr-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackToList}
              className="w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-muted-foreground">👤</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">
                {selectedChat.otherUser.username}
              </h3>
              <div className="flex items-center space-x-2 text-xs md:text-sm">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span
                  className={
                    isConnected ? "text-green-400" : "text-red-400"
                  }
                >
                  {isConnected ? t("connected") : t("disconnected")}
                </span>
                <span className="text-muted-foreground">•</span>
                <Lock className="w-3 h-3 text-accent" />
                <span className="text-muted-foreground">
                  {t("realTimeChat")}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 md:space-x-3 flex-shrink-0">
            {/* Timer */}
            <div className="flex items-center space-x-1 md:space-x-2 bg-muted/30 rounded-lg px-2 py-1">
              <Clock className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />
              <Select value={destructTimer} onValueChange={setDestructTimer}>
                <SelectTrigger className="border-0 bg-transparent text-foreground text-xs md:text-sm h-auto p-0 min-w-[56px]">
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

            {/* Menu (optional) */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const menu = document.getElementById("chat-menu");
                  if (!menu) return;
                  menu.style.display =
                    menu.style.display === "block" ? "none" : "block";
                }}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>

              <div
                id="chat-menu"
                className="absolute right-0 top-full mt-2 w-48 bg-background border border-border rounded-lg shadow-lg z-10 py-2"
                style={{ display: "none" }}
              >
                <button
                  className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted/50"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      t("chatWith", {
                        username: selectedChat.otherUser.username,
                      })
                    );
                    const menu = document.getElementById("chat-menu");
                    if (menu) menu.style.display = "none";
                  }}
                >
                  📋 {t("copyInviteLink")}
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted/50"
                  onClick={() => {
                    alert(
                      t("chatStatsText", {
                        messages: messages.length.toString(),
                        partner: selectedChat.otherUser.username,
                      })
                    );
                    const menu = document.getElementById("chat-menu");
                    if (menu) menu.style.display = "none";
                  }}
                >
                  📊 {t("chatStatistics")}
                </button>
                <div className="border-t border-border my-1" />
                <button
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                  onClick={() => {
                    if (
                      confirm(
                        t("clearChatConfirm", {
                          username: selectedChat.otherUser.username,
                        })
                      )
                    ) {
                      alert(t("clearChatImplemented"));
                    }
                    const menu = document.getElementById("chat-menu");
                    if (menu) menu.style.display = "none";
                  }}
                >
                  🗑️ {t("clearChat")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* NACHRICHTEN-BEREICH */}
      <div
        className="flex-1 w-full max-w-full overflow-y-auto overflow-x-hidden px-2 md:px-4 py-2 md:py-4 space-y-3 md:space-y-4 bg-background"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {/* System-Banner */}
        <div className="flex flex-col items-center w-full max-w-full gap-2 mb-2">
          <div className="inline-flex items-center space-x-2 bg-surface rounded-full px-4 py-2 text-sm text-text-muted">
            <Shield className="w-4 h-4 text-accent" />
            <span>This conversation is end-to-end encrypted</span>
          </div>
          <div
            className={`text-xs px-3 py-1 rounded ${
              isConnected
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {isConnected
              ? "✅ WebSocket Connected"
              : "❌ WebSocket Disconnected"}
          </div>
        </div>

        {/* Nachrichten */}
        {messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            isOwn={message.senderId === currentUser.id}
            otherUser={selectedChat.otherUser}
          />
        ))}

        {/* Tipp-Bubble vom Partner */}
        {isPartnerTyping && (
          <div className="flex items-start space-x-2">
            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-muted-foreground text-xs">👤</span>
            </div>
            <div className="bg-surface rounded-2xl rounded-tl-md px-3 py-2">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-text-muted opacity-80 animate-bounce [animation-delay:-0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-text-muted opacity-80 animate-bounce [animation-delay:-0.1s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-text-muted opacity-80 animate-bounce" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* EINGABE-BEREICH */}
      <div className="w-full max-w-full bg-background border-t border-border p-2 md:p-4 flex-shrink-0">
        <div className="flex items-end space-x-1 md:space-x-3">
          {/* Datei */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-text-muted hover:text-text-primary p-2 md:p-3"
          >
            <Paperclip className="w-4 h-4 md:w-4 md:h-4" />
          </Button>

          {/* Kamera */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCameraCapture}
            className="text-text-muted hover:text-text-primary p-2 md:p-3"
          >
            📷
          </Button>

          {/* Textfeld */}
          <div className="flex-1 relative min-w-0">
            <Textarea
              placeholder={isConnected ? t("typeMessage") : t("connecting")}
              value={messageInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              className="resize-none bg-background border-border text-foreground placeholder:text-muted-foreground pr-12 min-h-[40px] max-h-28 text-base leading-5 rounded-xl border-2 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 w-full"
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

          {/* Senden */}
          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || !isConnected}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-muted disabled:opacity-50 text-white rounded-full p-3 min-w-[44px] min-h-[44px] flex items-center justify-center shadow-lg"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>

        {/* Statuszeile */}
        <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
          <div className="flex items-center space-x-2">
            <Lock className="w-3 h-3 text-accent" />
            <span>{t("encryptionEnabled")}</span>
          </div>
          <div className="flex items-center space-x-1 md:space-x-2">
            <span>{t("autoDestruct")}:</span>
            <span className="text-destructive">
              {formatDestructTimer(parseInt(destructTimer, 10) || 300)}
            </span>
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