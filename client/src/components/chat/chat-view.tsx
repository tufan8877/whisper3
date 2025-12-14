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
  selectedChat: (Chat & { otherUser: User }) | null;
  messages: MessageType[];
  onSendMessage: (content: string, type: string, destructTimer: number, file?: File) => void;
  isConnected: boolean;
  onBackToList: () => void;

  // ✅ NEU: socket rein
  socket: any;
}

export default function ChatView({
  currentUser,
  selectedChat,
  messages,
  onSendMessage,
  isConnected,
  onBackToList,
  socket,
}: ChatViewProps) {
  const [messageInput, setMessageInput] = useState("");
  const [destructTimer, setDestructTimer] = useState("300"); // seconds
  const [isTypingRemote, setIsTypingRemote] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounce timer fürs "tippt"
  const typingTimeoutRef = useRef<any>(null);
  const typingStateRef = useRef(false);

  const { t } = useLanguage();

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
  }, [messages, selectedChat?.id]);

  // ✅ TYPING: Receiver-Listener
  useEffect(() => {
    if (!socket || !selectedChat) return;

    const handler = (payload: any) => {
      if (!payload) return;

      // Nur wenn es vom aktuellen Chat-Partner kommt
      if (payload.senderId === selectedChat.otherUser.id && payload.chatId === selectedChat.id) {
        setIsTypingRemote(!!payload.isTyping);
      }
    };

    socket.on?.("typing", handler);

    return () => {
      socket.off?.("typing", handler);
    };
  }, [socket, selectedChat?.id]);

  // ✅ Senden typing true/false
  const sendTyping = (isTyping: boolean) => {
    if (!socket || !selectedChat || !currentUser?.id) return;
    if (!isConnected) return;

    // nicht ständig spammen
    if (typingStateRef.current === isTyping) return;
    typingStateRef.current = isTyping;

    socket.send?.({
      type: "typing",
      chatId: selectedChat.id,
      senderId: currentUser.id,
      receiverId: selectedChat.otherUser.id,
      isTyping,
    });
  };

  // Wenn User tippt: typing:true senden + nach 800ms ohne Input typing:false
  useEffect(() => {
    if (!selectedChat) return;

    const hasText = messageInput.trim().length > 0;

    if (hasText) {
      sendTyping(true);

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(false);
      }, 800);
    } else {
      sendTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  }, [messageInput, selectedChat?.id, isConnected]);

  // Beim Chatwechsel sicher "typing:false"
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      sendTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?.id]);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedChat) return;
    if (!isConnected) {
      alert(t("notConnected"));
      return;
    }

    // ✅ Beim Senden sofort typing:false
    sendTyping(false);

    onSendMessage(messageInput.trim(), "text", parseInt(destructTimer));
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
    if (!file || !selectedChat || !isConnected) return;

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(t("fileTooLarge"));
      return;
    }

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        onSendMessage(reader.result as string, "image", parseInt(destructTimer) * 1000);
      };
      reader.readAsDataURL(file);
    } else {
      onSendMessage(`📎 ${file.name}`, "file", parseInt(destructTimer) * 1000, file);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCameraCapture = () => {
    if (!selectedChat || !isConnected) return;

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
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
    return `${Math.floor(seconds / 86400)} d`;
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
    <div className="flex-1 flex flex-col h-screen md:h-auto bg-background">
      {/* Header */}
      <div className="bg-background border-b border-border p-3 md:p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="md:hidden flex items-center mr-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackToList}
              className="w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
              <span className="text-muted-foreground">👤</span>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{selectedChat.otherUser.username}</h3>

              <div className="flex items-center space-x-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
                <span className={isConnected ? "text-green-400" : "text-red-400"}>
                  {isConnected ? t("connected") : t("disconnected")}
                </span>

                {/* ✅ TYPING TEXT */}
                {isTypingRemote && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground italic">tippt…</span>
                  </>
                )}

                <span className="text-muted-foreground">•</span>
                <Lock className="w-3 h-3 text-accent" />
                <span className="text-muted-foreground">{t("realTimeChat")}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-muted/30 rounded-lg px-3 py-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Select value={destructTimer} onValueChange={setDestructTimer}>
                <SelectTrigger className="border-0 bg-transparent text-foreground text-sm h-auto p-0 min-w-[60px]">
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

            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 custom-scrollbar"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
      >
        {messages.map((m) => (
          <Message key={m.id} message={m} isOwn={m.senderId === currentUser.id} otherUser={selectedChat.otherUser} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-background border-t border-border p-2 md:p-4 flex-shrink-0 sticky bottom-0">
        <div className="flex items-end space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-muted-foreground hover:text-foreground p-2"
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="sm" onClick={handleCameraCapture} className="text-muted-foreground p-2">
            📷
          </Button>

          <div className="flex-1 relative">
            <Textarea
              placeholder={isConnected ? t("typeMessage") : t("connecting")}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyPress}
              className="resize-none bg-background border-border text-foreground placeholder:text-muted-foreground pr-12 min-h-[48px] rounded-xl border-2 focus:border-primary focus:ring-2 focus:ring-primary/20"
              rows={1}
            />
            <Button variant="ghost" size="sm" className="absolute right-3 bottom-2 text-muted-foreground hidden md:flex">
              <Smile className="w-4 h-4" />
            </Button>
          </div>

          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || !isConnected}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-muted disabled:opacity-50 text-white rounded-full p-3 min-w-[48px] min-h-[48px]"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <div className="flex items-center space-x-2">
            <Lock className="w-3 h-3 text-accent" />
            <span>Ende-zu-Ende-Verschlüsselung aktiviert</span>
          </div>
          <div className="flex items-center space-x-2">
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
