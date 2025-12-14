import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/lib/i18n";
import Message from "./message";
import { Paperclip, Send, Smile, Lock, Clock, MoreVertical, Shield, ArrowLeft, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
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
  const [menuOpen, setMenuOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    // immer nach unten wenn neue msg kommt
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
  }, [messages.length, selectedChat?.id]);

  // Klick außerhalb schließt Menü
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = () => setMenuOpen(false);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuOpen]);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedChat) return;
    if (!isConnected) {
      alert(t("notConnected"));
      return;
    }

    onSendMessage(messageInput.trim(), "text", parseInt(destructTimer));
    setMessageInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDeleteChatForMe = async () => {
    if (!selectedChat) return;

    const ok = confirm(`Chat mit ${selectedChat.otherUser.username} wirklich löschen?`);
    if (!ok) return;

    try {
      // ✅ nutzt deinen vorhandenen Endpoint
      await apiRequest("POST", `/api/chats/${selectedChat.id}/delete`, {
        userId: currentUser.id,
      });

      setMenuOpen(false);
      onBackToList();
      alert("Chat gelöscht ✅");
    } catch (e) {
      console.error(e);
      alert("Chat löschen hat nicht geklappt ❌");
    }
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
        onSendMessage(base64String, "image", parseInt(destructTimer) * 1000);
      };
      reader.onerror = () => alert(t("failedToReadFile"));
      reader.readAsDataURL(file);
    } else {
      onSendMessage(`📎 ${file.name}`, "file", parseInt(destructTimer) * 1000, file);
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
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleFileUpload({ target: { files: [file] } } as any);
    };
    cameraInput.click();
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
            <h3 className="text-lg font-semibold text-foreground mb-2">{t("welcome")}</h3>
            <p className="text-muted-foreground">{t("selectChatToStart")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container bg-background">
      {/* Header */}
      <div className="chat-header bg-background border-b border-border p-3 md:p-4">
        <div className="flex items-center justify-between gap-2">
          {/* Back mobile */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackToList}
              className="w-10 h-10 rounded-full text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>

          {/* User */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-muted-foreground">👤</span>
            </div>

            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">
                {selectedChat.otherUser.username}
              </h3>
              <div className="flex items-center gap-2 text-sm min-w-0">
                <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
                <span className={isConnected ? "text-green-400" : "text-red-400"}>
                  {isConnected ? t("connected") : t("disconnected")}
                </span>
                <span className="text-muted-foreground">•</span>
                <Lock className="w-3 h-3 text-accent" />
                <span className="text-muted-foreground truncate">{t("realTimeChat")}</span>
              </div>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-2 py-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Select value={destructTimer} onValueChange={setDestructTimer}>
                <SelectTrigger className="border-0 bg-transparent text-foreground text-sm h-auto p-0 min-w-[70px]">
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

            {/* ✅ React Menu */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="w-10 h-10 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreVertical className="w-5 h-5" />
              </Button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                  <button
                    className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-muted/40 flex items-center gap-2"
                    onClick={() => {
                      setMenuOpen(false);
                      handleDeleteChatForMe();
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                    <span className="text-red-400">Chat löschen</span>
                  </button>

                  <button
                    className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-muted/40 flex items-center gap-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <X className="w-4 h-4" />
                    Schließen
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages custom-scrollbar px-3 md:px-4 py-3 space-y-3">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-surface rounded-full px-4 py-2 text-sm text-text-muted">
            <Shield className="w-4 h-4 text-accent" />
            <span>This conversation is end-to-end encrypted</span>
          </div>

          <div className={`mt-2 text-xs px-3 py-1 rounded inline-block ${isConnected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {isConnected ? "✅ WebSocket Connected" : "❌ WebSocket Disconnected"}
          </div>
        </div>

        {messages.map((m) => (
          <Message key={m.id} message={m} isOwn={m.senderId === currentUser.id} otherUser={selectedChat.otherUser} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area bg-background border-t border-border p-2 md:p-4">
        <div className="flex items-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="text-text-muted hover:text-text-primary w-11 h-11 rounded-full"
          >
            <Paperclip className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleCameraCapture}
            className="text-text-muted hover:text-text-primary w-11 h-11 rounded-full"
            title="Take photo"
          >
            📷
          </Button>

          <div className="flex-1 relative">
            <Textarea
              placeholder={isConnected ? t("typeMessage") : t("connecting")}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyPress}
              className="chat-input resize-none pr-12 min-h-[44px] max-h-28 text-base leading-5 rounded-2xl"
              rows={1}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 bottom-1.5 text-text-muted hover:text-primary hidden md:flex"
            >
              <Smile className="w-5 h-5" />
            </Button>
          </div>

          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || !isConnected}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-muted disabled:opacity-50 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <Lock className="w-3 h-3 text-accent" />
            <span>{t("encryptionEnabled")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>⏱️</span>
            <span className="text-destructive">{formatDestructTimer(parseInt(destructTimer))}</span>
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
