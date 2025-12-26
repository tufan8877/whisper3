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

  // Typing-Support
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
  const [destructTimer, setDestructTimer] = useState<number>(86400); // 24h

  const listRef = useRef<HTMLDivElement | null>(null);

  // Typing-Steuerung
  const typingTimeoutRef = useRef<any>(null);
  const isTypingRef = useRef(false);

  // immer nach unten scrollen, wenn neue Nachrichten kommen oder Typing-Blase
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, isPartnerTyping]);

  // Chatwechsel -> Eingabe leeren + Tipp-Status zurücksetzen
  useEffect(() => {
    setText("");
    if (onTyping && isTypingRef.current) {
      onTyping(false);
      isTypingRef.current = false;
    }
  }, [selectedChat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#020617]">
        <p className="text-sm md:text-base text-slate-400 text-center px-4">
          {t("selectChatToStart")}
        </p>
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setText(value);

    if (!onTyping) return;

    // erstes Tippen -> isTyping = true
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping(true);
    }

    // wenn 1,5s nichts mehr getippt wird -> isTyping = false
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
    <div className="flex flex-col w-full h-full bg-[#020617]">
      {/* Header – dunkel wie dein Logo */}
      <div className="flex items-center px-3 py-2 border-b border-slate-800 bg-[#020617]">
        <button
          className="md:hidden mr-2 text-slate-100"
          onClick={onBackToList}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center">
            <span className="text-sm font-semibold text-slate-50">
              {selectedChat.otherUser.username.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm md:text-base font-semibold text-slate-50">
              {selectedChat.otherUser.username}
            </span>
            <span className="text-[11px] text-emerald-400">
              {isConnected ? t("connected") : t("disconnected")}
            </span>
          </div>
        </div>
      </div>

      {/* Messages – komplett dunkler Hintergrund, kein WhatsApp-Wallpaper */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-3 bg-[#020617]"
      >
        <div className="flex flex-col gap-2">
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
                    "max-w-[80%] rounded-2xl px-3 py-2 text-[13px] sm:text-sm shadow " +
                    (isMine
                      ? // eigene Nachrichten – dunkles Grün/Teal
                        "bg-emerald-700 text-slate-50 rounded-tr-sm"
                      : // Partner – dunkles Blau/Grau
                        "bg-slate-800 text-slate-50 rounded-tl-sm")
                  }
                >
                  <div className="whitespace-pre-wrap break-words">
                    {m.content}
                  </div>
                  <div className="flex justify-end mt-1">
                    <span className="text-[10px] text-slate-300">
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Tipp-Bubble des Partners – nur animierte Punkte */}
          {isPartnerTyping && (
            <div className="flex w-full justify-start mt-1">
              <div className="inline-flex items-center px-3 py-2 rounded-2xl rounded-tl-sm bg-slate-800 text-slate-50 shadow">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-50 opacity-80 animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-50 opacity-80 animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-50 opacity-80 animate-bounce" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input-Leiste – dunkel, schlicht */}
      <div className="px-3 py-2 bg-[#020617] border-t border-slate-800 flex flex-col gap-2">
        {/* Auto-Destruct Timer */}
        <div className="flex items-center justify-end gap-2 text-[11px] text-slate-300 mb-1">
          <span>{t("autoDestruct")}:</span>
          <select
            className="bg-slate-900 text-slate-100 text-[11px] rounded px-2 py-1 border border-slate-700"
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
            className="flex-1 bg-slate-900 border-none text-slate-100 placeholder:text-slate-500 text-sm h-11 rounded-xl"
          />
          <Button
            size="icon"
            className="h-11 w-11 rounded-full bg-emerald-600 hover:bg-emerald-500"
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