// client/src/components/chat/chat-view.tsx
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
  Lock,
  Clock,
  MoreVertical,
  Shield,
  ArrowLeft,
  Camera,
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

  // Tipp-Funktion
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
  const [destructTimer, setDestructTimer] = useState("300"); // 5 min default

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Für Tipp-Status
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // Auto-scroll bei neuen Nachrichten
  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // Beim Chat-Wechsel Eingabe & Tipp-Status zurücksetzen
  useEffect(() => {
    setMessageInput("");
    if (onTyping && isTypingRef.current) {
      onTyping(false);
      isTypingRef.current = false;
    }
  }, [selectedChat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4 p-8">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">{t("welcome")}</h3>
            <p className="text-muted-foreground">{t("selectChatToStart")}</p>
          </div>
        </div>
      </div>
    );
  }

  const handleSendMessage = () => {
    const text = messageInput.trim();
    if (!text || !selectedChat) return;
    if (!isConnected) {
      alert(t("notConnected"));
      return;
    }

    onSendMessage(text, "text", parseInt(destructTimer, 10));
    setMessageInput("");

    // Tipp-Status beenden
    if (onTyping && isTypingRef.current) {
      onTyping(false);
      isTypingRef.current = false;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessageInput(value);

    if (!onTyping) return;

    // erstes Zeichen -> "tippt"
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping(true);
    }

    // wenn 1,5s keine Taste, dann "tippt nicht"
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTyping(false);
      }
    }, 1500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isConnected || !selectedChat) {
      alert(t("selectChatFirst"));
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
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
      reader.readAsDataURL(file);
    } else {
      onSendMessage(`📎 ${file.name}`, "file", parseInt(destructTimer, 10), file);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCameraCapture = () => {
    if (!isConnected || !selectedChat) {
      alert(t("selectChatPhoto"));
      return;
    }

    const cameraInput = document.createElement("input");
    cameraInput.type = "file";
    cameraInput.accept = "image/*";
    cameraInput.capture = "environment";
    cameraInput.onchange = (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
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

  return (
    <div className="flex flex-col h-full bg-background">
      {/* HEADER */}
      <div className="bg-background border-b border-border px-3 py-2 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Zurück (mobil) */}
            <button
              onClick={onBackToList}
              className="md:hidden text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Avatar + Name + Status */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-muted-foreground text-sm">👤</span>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-foreground truncate">
                    {selectedChat.otherUser.username}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={
                      isConnected ? "text-green-400 font-medium" : "text-red-400"
                    }
                  >
                    {isConnected ? t("connected") : t("disconnected")}
                  </span>
                  <span>•</span>
                  <span>{t("realTimeChat")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Timer + Menü rechts */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1 bg-muted/30 rounded-lg px-2 py-1">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <Select
                value={destructTimer}
                onValueChange={(v) => setDestructTimer(v)}
              >
                <SelectTrigger className="border-0 bg-transparent text-foreground text-xs h-auto p-0 min-w-[55px]">
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
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ENCRYPTION-BANNER */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-green-400">
          <Shield className="w-4 h-4" />
          <span>{t("endToEndEncrypted")}</span>
        </div>
        <div className="px-3 py-1 rounded bg-green-100 text-green-800 text-xs font-medium">
          ✅ WebSocket Connected
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-background">
        {messages.map((m) => (
          <Message
            key={m.id}
            message={m}
            isOwn={m.senderId === currentUser.id}
            otherUser={selectedChat.otherUser}
          />
        ))}

        {/* Tipp-Indikator – NUR Partner */}
        {isPartnerTyping && (
          <div className="flex w-full justify-start">
            <div className="flex items-end gap-2">
              <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-muted-foreground text-xs">👤</span>
              </div>
              <div className="bg-surface rounded-2xl rounded-tl-md px-3 py-2">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* INPUT-BEREICH – vollbreit, keine komischen Offsets */}
      <div className="bg-background border-t border-border px-3 py-2 flex-shrink-0">
        <div className="flex items-end gap-2 w-full">
          {/* Anhang */}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-5 h-5" />
          </Button>

          {/* Kamera */}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={handleCameraCapture}
          >
            <Camera className="w-5 h-5" />
          </Button>

          {/* Textarea nimmt ALLE Breite zwischen Icons & Button */}
          <div className="flex-1 min-w-0">
            <Textarea
              placeholder={
                isConnected ? t("typeMessage") : t("connecting")
              }
              value={messageInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              rows={1}
              className="w-full resize-none bg-background border-border text-foreground placeholder:text-muted-foreground rounded-xl border px-3 py-2 text-base leading-5 max-h-24"
            />
          </div>

          {/* Senden-Button immer sichtbar */}
          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || !isConnected}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-muted disabled:text-muted-foreground rounded-full w-11 h-11 flex-shrink-0 flex items-center justify-center"
          >
            <Send className="w-5 h-5 text-white" />
          </Button>
        </div>

        {/* Status-Zeile unten */}
        <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-green-500" />
            <span>{t("encryptionEnabled")}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>{t("autoDestruct")}:</span>
            <span className="text-destructive font-medium">
              {formatDestructTimer(parseInt(destructTimer, 10))}
            </span>
          </div>
        </div>

        {/* Hidden file input */}
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