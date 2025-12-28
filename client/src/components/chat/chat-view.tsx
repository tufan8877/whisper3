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
    destructTimerSec: number,
    file?: File
  ) => void;
  isConnected: boolean;
  onBackToList: () => void;

  // 👇 neu für Tipp-System
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
  const [destructTimer, setDestructTimer] = useState("300"); // 5 min standard

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // für Tipp-Timeout (damit nach ~1.5s "tippt" wieder verschwindet)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingLocalRef = useRef(false);

  /* -------------------- Scroll immer nach unten -------------------- */
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, isPartnerTyping, selectedChat?.id]);

  /* -------------------- Senden -------------------- */
  const handleSendMessage = () => {
    const trimmed = messageInput.trim();
    if (!trimmed || !selectedChat) return;
    if (!isConnected) {
      alert(t("notConnected"));
      return;
    }

    onSendMessage(trimmed, "text", parseInt(destructTimer, 10) || 300);
    setMessageInput("");

    // Tipp-Status aus
    if (onTyping && isTypingLocalRef.current) {
      onTyping(false);
      isTypingLocalRef.current = false;
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  /* -------------------- Tipp-Status senden -------------------- */
  const handleChangeInput = (value: string) => {
    setMessageInput(value);

    if (!onTyping) return;

    if (!isTypingLocalRef.current) {
      isTypingLocalRef.current = true;
      onTyping(true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingLocalRef.current) {
        isTypingLocalRef.current = false;
        onTyping(false);
      }
    }, 1500);
  };

  /* -------------------- Datei / Kamera -------------------- */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;
    if (!isConnected) {
      alert(t("notConnected"));
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(t("fileTooLarge"));
      return;
    }

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result as string;
        // ❗ destruktTimer in SEKUNDEN, NICHT *1000
        onSendMessage(
          base64String,
          "image",
          parseInt(destructTimer, 10) || 300
        );
      };
      reader.readAsDataURL(file);
    } else {
      onSendMessage(
        `📎 ${file.name}`,
        "file",
        parseInt(destructTimer, 10) || 300,
        file
      );
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCameraCapture = () => {
    if (!selectedChat || !isConnected) {
      alert(t("selectChatPhoto"));
      return;
    }

    const cam = document.createElement("input");
    cam.type = "file";
    cam.accept = "image/*";
    (cam as any).capture = "environment";
    cam.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) {
        handleFileUpload({ target: { files: [f] } } as any);
      }
    };
    cam.click();
  };

  const formatDestructTimer = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  if (!selectedChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4 p-8">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t("welcome")}</h3>
          <p className="text-muted-foreground">{t("selectChatToStart")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="bg-background border-b border-border px-3 py-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* Back (mobile) */}
          <div className="md:hidden flex items-center mr-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackToList}
              className="w-9 h-9 rounded-full"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-muted-foreground text-xl">👤</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground truncate">
                  {selectedChat.otherUser.username}
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span
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
                <span className="text-muted-foreground text-xs">
                  {t("realTimeChat")}
                </span>
              </div>
            </div>
          </div>

          {/* Timer + Menü */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-muted/30 rounded-lg px-2 py-1">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <Select
                value={destructTimer}
                onValueChange={setDestructTimer}
              >
                <SelectTrigger className="border-0 bg-transparent text-xs h-6 px-1 min-w-[56px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5s</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="60">1m</SelectItem>
                  <SelectItem value="300">5m</SelectItem>
                  <SelectItem value="1800">30m</SelectItem>
                  <SelectItem value="3600">1h</SelectItem>
                  <SelectItem value="21600">6h</SelectItem>
                  <SelectItem value="86400">1d</SelectItem>
                  <SelectItem value="604800">1w</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              onClick={() => {
                const el = document.getElementById("chat-menu");
                if (!el) return;
                el.style.display =
                  el.style.display === "block" ? "none" : "block";
              }}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>

            <div
              id="chat-menu"
              className="absolute right-3 top-14 w-48 bg-background border border-border rounded-lg shadow-lg z-20 py-2 hidden"
            >
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() => {
                  navigator.clipboard.writeText(
                    t("chatWith", {
                      username: selectedChat.otherUser.username,
                    })
                  );
                  const el = document.getElementById("chat-menu");
                  if (el) el.style.display = "none";
                }}
              >
                📋 {t("copyInviteLink")}
              </button>
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() => {
                  alert(
                    t("chatStatsText", {
                      messages: messages.length.toString(),
                      partner: selectedChat.otherUser.username,
                    })
                  );
                  const el = document.getElementById("chat-menu");
                  if (el) el.style.display = "none";
                }}
              >
                📊 {t("chatStatistics")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div
        className="flex-1 overflow-y-auto px-3 pb-3 pt-3 space-y-3 bg-background"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {/* System Banner */}
        <div className="text-center mb-2">
          <div className="inline-flex items-center gap-2 bg-surface rounded-full px-4 py-2 text-sm text-text-muted">
            <Shield className="w-4 h-4 text-accent" />
            <span>{t("endToEndEncrypted")}</span>
          </div>
          <div className="mt-2 text-xs px-3 py-1 rounded bg-green-100/80 text-green-800 inline-block">
            ✅ WebSocket Connected
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

        {/* Typing-Indicator NUR für Partner */}
        {isPartnerTyping && (
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-muted-foreground text-xs">👤</span>
            </div>
            <div className="bg-surface rounded-2xl rounded-tl-md px-3 py-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.1s]" />
                <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input-Leiste */}
      <div className="bg-background border-t border-border px-3 py-2 flex-shrink-0">
        <div className="flex items-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="text-text-muted"
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleCameraCapture}
            className="text-text-muted"
          >
            📷
          </Button>

          <div className="flex-1 relative">
            <Textarea
              placeholder={
                isConnected ? t("typeMessage") : t("connecting")
              }
              value={messageInput}
              onChange={(e) => handleChangeInput(e.target.value)}
              onKeyDown={handleKeyPress}
              rows={1}
              className="resize-none bg-background border-border text-foreground placeholder:text-muted-foreground min-h-[40px] max-h-24 rounded-xl border-2 focus:border-primary focus:ring-2 focus:ring-primary/20 text-base"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 bottom-1.5 text-text-muted hidden md:flex"
            >
              <Smile className="w-4 h-4" />
            </Button>
          </div>

          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || !isConnected}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-muted disabled:opacity-50 text-white rounded-full w-11 h-11 flex items-center justify-center shadow-lg"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between mt-1 text-xs text-text-muted">
          <div className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-accent" />
            <span>{t("encryptionEnabled")}</span>
          </div>
          <div className="flex items-center gap-1">
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