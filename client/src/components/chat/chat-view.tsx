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
    destructTimer: number,
    file?: File
  ) => void;
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
  const [messageInput, setMessageInput] = useState("");
  const [destructTimer, setDestructTimer] = useState("300"); // seconds
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { t } = useLanguage();

  // Auto-scroll bottom on new messages / chat change
  useEffect(() => {
    if (!selectedChat) return;

    const scroll = () => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    };

    // multiple attempts for mobile
    const delays = [0, 80, 200, 400];
    delays.forEach((d) => setTimeout(scroll, d));
  }, [messages.length, selectedChat?.id]);

  const handleSendMessage = () => {
    if (!selectedChat) return;

    const content = messageInput.trim();
    if (!content) return;

    if (!isConnected) {
      alert(t("notConnected"));
      return;
    }

    // ✅ Immer Sekunden (kein *1000)
    const seconds = parseInt(destructTimer, 10);
    onSendMessage(content, "text", seconds);

    setMessageInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedChat || !isConnected) {
      alert(t("selectChatFirst"));
      return;
    }

    // 10MB limit
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(t("fileTooLarge"));
      return;
    }

    const seconds = parseInt(destructTimer, 10);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result as string;
        // ✅ Sekunden (kein *1000)
        onSendMessage(base64String, "image", seconds);
      };
      reader.onerror = () => {
        alert(t("failedToReadFile"));
      };
      reader.readAsDataURL(file);
    } else {
      // ✅ Sekunden (kein *1000)
      onSendMessage(`📎 ${file.name}`, "file", seconds, file);
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
    (cameraInput as any).capture = "environment";

    cameraInput.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;

      // reuse handler logic
      handleFileUpload({ target: { files: [f] } } as any);
    };

    cameraInput.click();
  };

  const formatDestructTimer = (seconds: number) => {
    if (seconds < 60) return `${seconds} sec`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
    if (seconds < 86400)
      return `${Math.floor(seconds / 3600)} hour${
        Math.floor(seconds / 3600) > 1 ? "s" : ""
      }`;
    return `${Math.floor(seconds / 86400)} day${
      Math.floor(seconds / 86400) > 1 ? "s" : ""
    }`;
  };

  if (!selectedChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-foreground overflow-x-hidden">
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
    // ✅ min-h-0 + overflow-x-hidden = kein seitliches Wischen / korrektes Scrollen
    <div className="flex-1 flex flex-col min-h-0 w-full max-w-full overflow-x-hidden bg-background">
      {/* HEADER */}
      <div className="bg-background border-b border-border p-3 md:p-4 flex-shrink-0 w-full max-w-full overflow-x-hidden">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Back */}
            <div className="md:hidden flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={onBackToList}
                className="w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-muted-foreground">👤</span>
            </div>

            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">
                {selectedChat.otherUser.username}
              </h3>
              <div className="flex items-center gap-2 text-sm min-w-0">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span
                  className={`truncate ${
                    isConnected ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {isConnected ? t("connected") : t("disconnected")}
                </span>
                <span className="text-muted-foreground">•</span>
                <Lock className="w-3 h-3 text-accent flex-shrink-0" />
                <span className="text-muted-foreground truncate">
                  {t("realTimeChat")}
                </span>
              </div>
            </div>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-2 md:px-3 py-1 md:py-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Select value={destructTimer} onValueChange={setDestructTimer}>
                <SelectTrigger className="border-0 bg-transparent text-foreground text-sm h-auto p-0 min-w-[64px]">
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
                  const menu = document.getElementById("chat-menu");
                  if (menu) menu.style.display = menu.style.display === "none" ? "block" : "none";
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
                  className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      t("chatWith", { username: selectedChat.otherUser.username })
                    );
                    document.getElementById("chat-menu")!.style.display = "none";
                  }}
                >
                  📋 {t("copyInviteLink")}
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    alert(
                      t("chatStatsText", {
                        messages: messages.length.toString(),
                        partner: selectedChat.otherUser.username,
                      })
                    );
                    document.getElementById("chat-menu")!.style.display = "none";
                  }}
                >
                  📊 {t("chatStatistics")}
                </button>
                <div className="border-t border-border my-1"></div>
                <button
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  onClick={() => {
                    if (confirm(t("clearChatConfirm", { username: selectedChat.otherUser.username }))) {
                      alert(t("clearChatImplemented"));
                    }
                    document.getElementById("chat-menu")!.style.display = "none";
                  }}
                >
                  🗑️ {t("clearChat")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      {/* ✅ Wichtig: min-h-0 damit overflow in Flex funktioniert */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 md:p-4 space-y-2 md:space-y-4 custom-scrollbar pb-24 bg-background">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-surface rounded-full px-4 py-2 text-sm text-text-muted">
            <Shield className="w-4 h-4 text-accent" />
            <span>This conversation is end-to-end encrypted</span>
          </div>

          <div
            className={`mt-2 text-xs px-3 py-1 rounded inline-block ${
              isConnected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}
          >
            {isConnected
              ? "✅ WebSocket Connected"
              : "❌ WebSocket Disconnected - Check console"}
          </div>
        </div>

        {messages.map((message) => (
          <div key={message.id} className="w-full max-w-full overflow-x-hidden">
            <Message
              message={message}
              isOwn={message.senderId === currentUser.id}
              otherUser={selectedChat.otherUser}
            />
          </div>
        ))}

        {isTyping && (
          <div className="flex items-start space-x-2 w-full overflow-x-hidden">
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

      {/* INPUT */}
      {/* ✅ Safe-Area + kein seitliches Abschneiden: min-w-0 + overflow-x-hidden */}
      <div className="bg-background border-t border-border p-2 md:p-4 flex-shrink-0 safe-area-inset-bottom sticky bottom-0 chat-input-area w-full max-w-full overflow-x-hidden">
        <div className="flex items-end gap-1 md:gap-3 w-full max-w-full min-w-0 overflow-x-hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-text-muted hover:text-text-primary p-2 md:p-3 touch-target flex-shrink-0"
            title="Upload file"
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCameraCapture}
            className="text-text-muted hover:text-text-primary p-2 md:p-3 touch-target flex-shrink-0"
            title="Take photo"
          >
            📷
          </Button>

          <div className="flex-1 relative min-w-0">
            <Textarea
              placeholder={isConnected ? t("typeMessage") : t("connecting")}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyPress}
              className="resize-none bg-background border-border text-foreground placeholder:text-muted-foreground pr-12 min-h-[48px] max-h-24 text-base leading-5 rounded-xl border-2 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 chat-input touch-target w-full min-w-0"
              rows={1}
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-3 bottom-2 text-text-muted hover:text-primary hidden md:flex"
              type="button"
            >
              <Smile className="w-4 h-4" />
            </Button>
          </div>

          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || !isConnected}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-muted disabled:opacity-50 text-white rounded-full p-3 min-w-[48px] min-h-[48px] flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 touch-target flex-shrink-0"
            type="button"
            aria-label="Send"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>

        {/* STATUS */}
        <div className="flex items-center justify-between mt-2 text-xs text-text-muted w-full max-w-full overflow-x-hidden">
          <div className="flex items-center gap-2 min-w-0">
            <Lock className="w-3 h-3 text-accent flex-shrink-0" />
            <span className="truncate">🔒 {t("encryptionEnabled")}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm">⏱️</span>
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
