import { useState, useEffect, useRef } from "react";
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
    destructTimer: number,
    file?: File
  ) => void;
  isConnected: boolean;
  onBackToList: () => void;
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
  const [destructTimer, setDestructTimer] = useState("300"); // 5m in Sekunden
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tipp-Indikator (nur ans Backend senden – Anzeige kommt über isPartnerTyping)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingSelfRef = useRef(false);

  // Immer ans Ende scrollen, wenn Nachrichten kommen
  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length]);

  const handleSendMessage = () => {
    const text = messageInput.trim();
    if (!text || !selectedChat) return;

    if (!isConnected) {
      alert(t("notConnected"));
      return;
    }

    onSendMessage(text, "text", parseInt(destructTimer, 10));
    setMessageInput("");

    if (onTyping && isTypingSelfRef.current) {
      isTypingSelfRef.current = false;
      onTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
      return;
    }

    if (!onTyping) return;

    if (!isTypingSelfRef.current) {
      isTypingSelfRef.current = true;
      onTyping(true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingSelfRefRef.current) {
        isTypingSelfRef.current = false;
        onTyping(false);
      }
    }, 1500);
  };

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

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result as string;
        onSendMessage(base64String, "image", parseInt(destructTimer, 10));
      };
      reader.onerror = () => {
        alert(t("failedToReadFile"));
      };
      reader.readAsDataURL(file);
    } else {
      onSendMessage(
        `📎 ${file.name}`,
        "file",
        parseInt(destructTimer, 10),
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

    const cameraInput = document.createElement("input");
    cameraInput.type = "file";
    cameraInput.accept = "image/*";
    cameraInput.capture = "environment";
    cameraInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleFileUpload({ target: { files: [file] } } as any);
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
      <div className="flex-1 flex items-center justify-center bg-background text-foreground">
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
    <div className="flex-1 flex flex-col h-screen md:h-auto bg-background">
      {/* HEADER – extra Padding + Safe-Area, damit Timer nicht am Rand klebt */}
      <div
        className="bg-background border-b border-border flex-shrink-0"
        style={{
          paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right))",
          paddingTop: "0.5rem",
          paddingBottom: "0.5rem",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Links: Back + Avatar + Name/Status */}
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden mr-1 text-muted-foreground hover:text-foreground rounded-full flex-shrink-0"
              onClick={onBackToList}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>

            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-muted-foreground text-sm">👤</span>
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-foreground truncate max-w-[160px]">
                  {selectedChat.otherUser.username}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={isConnected ? "text-green-400" : "text-red-400"}>
                  {isConnected ? t("connected") : t("disconnected")}
                </span>
                <span>•</span>
                <span>{t("realTimeChat")}</span>
              </div>
            </div>
          </div>

          {/* Rechts: Timer + Menü, mit kleinem Abstand nach innen */}
          <div className="flex items-center gap-2 ml-2">
            <div className="flex items-center gap-1 bg-muted/20 rounded-lg px-2 py-1">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <Select value={destructTimer} onValueChange={setDestructTimer}>
                <SelectTrigger className="border-0 bg-transparent text-foreground text-xs h-auto p-0 min-w-[56px]">
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
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                const menu = document.getElementById("chat-menu");
                if (menu) {
                  menu.style.display =
                    menu.style.display === "block" ? "none" : "block";
                }
              }}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Optional: Chat-Menü */}
      <div
        id="chat-menu"
        className="hidden absolute right-4 top-16 w-48 bg-background border border-border rounded-lg shadow-lg z-20 py-2"
      />

      {/* MESSAGES */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 pb-20 md:pb-4"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="text-center mb-2">
          <div className="inline-flex items-center space-x-2 bg-surface rounded-full px-4 py-2 text-sm text-text-muted">
            <Shield className="w-4 h-4 text-accent" />
            <span>{t("endToEndEncrypted") ?? "This conversation is end-to-end encrypted"}</span>
          </div>
          <div
            className={`mt-2 text-xs px-3 py-1 rounded inline-block ${
              isConnected
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {isConnected ? "✅ WebSocket Connected" : "❌ WebSocket Disconnected"}
          </div>
        </div>

        {messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            isOwn={message.senderId === currentUser.id}
            otherUser={selectedChat.otherUser}
          />
        ))}

        {/* Tipp-Bubble nur für Partner */}
        {isPartnerTyping && (
          <div className="flex w-full justify-start animate-fade-in">
            <div className="flex items-end gap-2 max-w-[90%]">
              <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-muted-foreground text-xs">👤</span>
              </div>
              <div className="bg-surface rounded-2xl rounded-tl-md px-3 py-2">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* INPUT – wieder Safe-Area Padding, damit Senden-Button nicht am Rand hängt */}
      <div
        className="bg-background border-top border-border flex-shrink-0"
        style={{
          paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right))",
          paddingTop: "0.5rem",
          paddingBottom: "0.5rem",
        }}
      >
        <div className="flex items-end gap-2 md:gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-text-muted hover:text-text-primary p-2 md:p-3"
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCameraCapture}
            className="text-text-muted hover:text-text-primary p-2 md:p-3"
          >
            📷
          </Button>

          <div className="flex-1 relative">
            <Textarea
              placeholder={isConnected ? t("typeMessage") : t("connecting")}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyPress}
              rows={1}
              className="resize-none bg-background border-border text-foreground placeholder:text-muted-foreground pr-12 min-h-[44px] md:min-h-[40px] max-h-24 md:max-h-32 text-base leading-5 rounded-xl border-2 focus:border-primary focus:ring-2 focus:ring-primary/20"
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
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-muted disabled:opacity-50 text-white rounded-full p-3 min-w-[48px] min-h-[48px] md:min-w-[40px] md:min-h-[40px] md:p-2 flex items-center justify-center shadow-lg"
          >
            <Send className="w-5 h-5 md:w-4 md:h-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <Lock className="w-3 h-3 text-accent" />
            <span>{t("encryptionEnabled")}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>{t("autoDestruct")}:</span>
            <span className="text-destructive">
              {formatDestructTimer(parseInt(destructTimer, 10))}
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