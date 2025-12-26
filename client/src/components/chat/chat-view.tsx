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
  onSendMessage: (content: string, type: string, destructTimerSec: number, file?: File) => void;
  isConnected: boolean;
  onBackToList: () => void;

  // ✅ neu für Typing
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

  // Immer nach unten scrollen, wenn sich Nachrichten ändern
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, isPartnerTyping]);

  useEffect(() => {
    // wenn Chat gewechselt wird -> Eingabe leeren & Tipp-Status beenden
    setText("");
    if (onTyping && isTypingRef.current) {
      onTyping(false);
      isTypingRef.current = false;
    }
  }, [selectedChat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Beim ersten Tastendruck: "isTyping = true"
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping(true);
    }

    // Timeout zurücksetzen: wenn X ms keine Eingabe => "isTyping = false"
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
    <div className="flex flex-col w-full h-full bg-[#0b141a]">
      {/* Header */}
      <div className="flex items-center px-3 py-2 border-b border-[#202c33] bg-[#202c33]">
        <button
          className="md:hidden mr-2 text-[#e9edef]"
          onClick={onBackToList}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#00a884]/20 flex items-center justify-center">
            <span className="text-sm font-semibold text-[#e9edef]">
              {selectedChat.otherUser.username.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm md:text-base font-semibold text-[#e9edef]">
              {selectedChat.otherUser.username}
            </span>
            <span className="text-[11px] text-[#8696a0]">
              {isConnected ? t("connected") : t("disconnected")}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 bg-[url('https://static.whatsapp.net/rsrc.php/v3/yl/r/gi_DckCwvlW.png')] bg-repeat bg-[length:400px_400px]"
      >
        <div className="flex flex-col gap-1 sm:gap-1.5">
          {messages.map((m) => {
            const isMine = m.senderId === currentUser.id;
            return (
              <div
                key={m.id}
                className={`flex w-full ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={
                    "max-w-[80%] rounded-lg px-2.5 py-1.5 text-[13px] sm:text-sm shadow-sm " +
                    (isMine
                      ? "bg-[#005c4b] text-[#e9edef] rounded-tr-none"
                      : "bg-[#202c33] text-[#e9edef] rounded-tl-none")
                  }
                >
                  <div className="whitespace-pre-wrap break-words">
                    {m.content}
                  </div>
                  <div className="flex justify-end mt-0.5">
                    <span className="text-[10px] text-[#8696a0]">
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* ✅ Tipp-Bubble des Partners */}
          {isPartnerTyping && (
            <div className="flex w-full justify-start mt-1">
              <div className="inline-flex items-center px-3 py-1.5 rounded-lg rounded-tl-none bg-[#202c33] text-[#e9edef] shadow-sm">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#e9edef] opacity-70 animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#e9edef] opacity-70 animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#e9edef] opacity-70 animate-bounce" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="px-2 sm:px-3 py-2 bg-[#202c33] border-t border-[#202c33] flex flex-col gap-2">
        {/* Selbstzerstörungs-Timer (ganz schlicht, kannst du später schöner machen) */}
        <div className="flex items-center justify-end gap-2 text-[11px] text-[#8696a0] mb-1">
          <span>{t("autoDestruct")}:</span>
          <select
            className="bg-[#111b21] text-[#e9edef] text-[11px] rounded px-2 py-1 border border-[#202c33]"
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
            className="flex-1 bg-[#111b21] border-none text-[#e9edef] placeholder:text-[#8696a0] text-sm h-10 sm:h-11 rounded-lg"
          />
          <Button
            size="icon"
            className="h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-[#00a884] hover:bg-[#02956f]"
            onClick={handleSend}
            disabled={!text.trim()}
          >
            <Send className="w-4 h-4 text-white" />
          </Button>
        </div>
      </div>
    </div>
  );
}
