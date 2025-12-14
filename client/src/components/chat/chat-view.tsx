import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/lib/i18n";
import Message from "./message";
import { Paperclip, Send, Lock, Clock, MoreVertical, Shield, ArrowLeft } from "lucide-react";
import type { User, Chat, Message as MessageType } from "@shared/schema";

interface ChatViewProps {
  currentUser: User;
  selectedChat: (Chat & { otherUser: User }) | null;
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
  const [messageInput, setMessageInput] = useState("");
  const [destructTimer, setDestructTimer] = useState("300");
  const [isTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  const scrollToBottom = (smooth = true) => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  };

  useEffect(() => {
    // WhatsApp-like: immer runter wenn neue Nachricht kommt
    scrollToBottom(true);
  }, [messages.length]);

  useEffect(() => {
    // beim Chat öffnen einmal sofort runter
    if (selectedChat) setTimeout(() => scrollToBottom(false), 50);
  }, [selectedChat?.id]);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedChat) return;
    if (!isConnected) {
      alert(t("notConnected"));
      return;
    }
    onSendMessage(messageInput.trim(), "text", parseInt(destructTimer, 10));
    setMessageInput("");
    setTimeout(() => scrollToBottom(true), 50);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;

    if (!isConnected) {
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
        onSendMessage(reader.result as string, "image", parseInt(destructTimer, 10), file);
      };
      reader.readAsDataURL(file);
    } else {
      onSendMessage(`📎 ${file.name}`, "file", parseInt(destructTimer, 10), file);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatDestructTimer = (seconds: number) => {
    if (seconds < 60) return `${seconds} sec`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hour`;
    return `${Math.floor(seconds / 86400)} day`;
  };

  if (!selectedChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4 p-8">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{t("welcome")}</h3>
            <p className="text-muted-foreground">{t("selectChatToStart")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header bg-background border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackToList}
              className="md:hidden w-10 h-10 rounded-full"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>

            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white/70">👤</span>
            </div>

            <div className="min-w-0">
              <h3 className="font-semibold truncate">{selectedChat.otherUser.username}</h3>
              <div className="flex items-center gap-2 text-xs text-white/60">
                <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
                <span className={isConnected ? "text-green-400" : "text-red-400"}>
                  {isConnected ? t("connected") : t("disconnected")}
                </span>
                <span>•</span>
                <Lock className="w-3 h-3 text-emerald-400" />
                <span className="truncate">{t("realTimeChat")}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1">
              <Clock className="w-4 h-4 text-white/50" />
              <Select value={destructTimer} onValueChange={setDestructTimer}>
                <SelectTrigger className="border-0 bg-transparent text-white text-xs h-auto p-0 min-w-[60px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 sec</SelectItem>
                  <SelectItem value="30">30 sec</SelectItem>
                  <SelectItem value="60">1 min</SelectItem>
                  <SelectItem value="300">5 min</SelectItem>
                  <SelectItem value="1800">30 min</SelectItem>
                  <SelectItem value="3600">1 hour</SelectItem>
                  <SelectItem value="86400">1 day</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="ghost" size="icon" className="rounded-full">
              <MoreVertical className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="chat-messages flex-1 overflow-y-auto px-3 py-3"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="text-center mb-3">
          <div className="inline-flex items-center gap-2 bg-white/5 rounded-full px-4 py-2 text-xs text-white/70">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>This conversation is end-to-end encrypted</span>
          </div>

          <div className={`mt-2 text-xs px-3 py-1 rounded inline-block ${isConnected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {isConnected ? "✅ WebSocket Connected" : "❌ WebSocket Disconnected"}
          </div>
        </div>

        {messages.map((m) => (
          <Message key={m.id} message={m} isOwn={m.senderId === currentUser.id} otherUser={selectedChat.otherUser} />
        ))}

        {isTyping && <div className="text-white/60 text-sm">…</div>}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area bg-background border-t border-border p-2 pb-safe">
        <div className="flex items-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full w-11 h-11"
            title="Upload"
          >
            <Paperclip className="w-5 h-5" />
          </Button>

          <div className="flex-1 min-w-0">
            <Textarea
              placeholder={isConnected ? t("typeMessage") : t("connecting")}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyPress}
              className="chat-input resize-none w-full rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 min-h-[44px] max-h-32 px-4 py-3"
              rows={1}
            />
          </div>

          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || !isConnected}
            className="rounded-full w-11 h-11 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            title="Send"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs text-white/60">
          <div className="flex items-center gap-2">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>{t("encryptionEnabled")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>⏱️</span>
            <span className="text-red-300">{formatDestructTimer(parseInt(destructTimer, 10))}</span>
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
