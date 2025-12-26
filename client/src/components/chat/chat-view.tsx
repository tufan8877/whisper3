// client/src/components/chat/chat-view.tsx
import { useEffect, useRef, useState } from "react";
import type { User, Chat, Message } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/lib/i18n";
import { ArrowLeft, Send } from "lucide-react";

type ChatViewProps = {
  currentUser: User & { privateKey: string };
  selectedChat: (Chat & { otherUser: User }) | null;
  messages: Message[];
  onSendMessage: (
    content: string,
    type: string,
    destructTimerSec: number,
    file?: File
  ) => void;
  isConnected: boolean;
  onBackToList: () => void;

  // Tipp-Events
  onTyping?: (isTyping: boolean) => void;
  isPartnerTyping?: boolean;
};

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
  const [text, setText] = useState("");
  const [destructTimer, setDestructTimer] = useState<number>(86400); // 24h default

  const listRef = useRef<HTMLDivElement | null>(null);

  // Tipp-Steuerung
  const typingTimeoutRef = useRef<any>(null);
  const isTypingRef = useRef(false);

  // Immer ans Ende scrollen, wenn Nachrichten oder Typing-Bubble sich ändern
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, isPartnerTyping]);

  // Beim Chat-Wechsel: Eingabe leeren + Tipp-Status zurücksetzen
  useEffect(() => {
    setText("");
    if (onTyping && isTypingRef.current) {
      onTyping(false);
      isTypingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?.id]);

  if (!selectedChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <p className="text-sm md:text-base text-muted-foreground text-center px-4">
          {t("selectChatToStart")}
        </p>
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setText(value);

    if (!onTyping) return;

    // erstes Tastendrücken -> "isTyping = true"
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping(true);
    }

    // Timeout neu setzen: wenn 1,5s keine Eingabe -> "isTyping = false"
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTyping(false);
      }
    }, 1500);
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!isConnected) {
      console.log("❌ Not connected, cannot send");
      return;
    }

    onSendMessage(trimmed, "text", destructTimer);
    setText("");

    if (onTyping && isTypingRef.current) {
      isTypingRef.current = false;
      onTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: any) => {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col w-full h-full bg-background">
      {/* Header */}
      <div className="flex items-center px-3 py-2 border-b border-border bg-card/95">
        <button
          className="md:hidden mr-2 text-foreground"
          onClick={onBackToList}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary-foreground">
              {selectedChat.otherUser.username.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm md:text-base font-semibold text-foreground">
              {selectedChat.otherUser.username}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {isConnected ? t("connected") : t("disconnected")}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-3 bg-background"
      >
        <div className="flex flex-col gap-1.5">
          {messages.map((m) => {
            const isMine = m.senderId === currentUser.id;
            return (
              <div
                key={m.id}
                className={`flex w-full ${
                  isMine ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={
                    "max-w-[80%] rounded-lg px-3 py-1.5 text-[13px] sm:text-sm shadow-sm " +
                    (isMine
                      ? "bg-primary text-primary-foreground rounded-tr-none"
                      : "bg-muted text-foreground rounded-tl-none")
                  }
                >
                  <div className="whitespace-pre-wrap break-words">
                    {m.content}
                  </div>
                  <div className="flex justify-end mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Tipp-Bubble des Partners (nur Punkte, kein Text) */}
          {isPartnerTyping && (
            <div className="flex w-full justify-start mt-1">
              <div className="inline-flex items-center px-3 py-1.5 rounded-lg rounded-tl-none bg-muted text-foreground shadow-sm">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground/70 animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground/70 animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground/70 animate-bounce" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input + Selbstzerstörung */}
      <div className="px-2 sm:px-3 py-2 bg-card/95 border-t border-border flex flex-col gap-2">
        {/* Selbstzerstörungs-Timer */}
        <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground mb-1">
          <span>{t("autoDestruct")}:</span>
          <select
            className="bg-background text-foreground text-[11px] rounded px-2 py-1 border border-border"
            value={destructTimer}
            onChange={(e) => setDestructTimer(Number(e.target.value) || 86400)}
          >
            <option value={10}>10s</option>
            <option value={60}>1m</option>
            <option value={300}>5m</option>
            <option value={3600}>1h</option>
            <option value={86400}>24h</option>
            <option value={604800}>7d</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={t("typeMessage")}
            className="flex-1 bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm h-10 sm:h-11 rounded-lg"
          />
          <Button
            size="icon"
            className="h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-primary hover:bg-primary/90"
            onClick={handleSend}
            disabled={!text.trim()}
          >
            <Send className="w-4 h-4 text-primary-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
}