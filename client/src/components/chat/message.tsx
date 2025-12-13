import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Clock, Download, Eye } from "lucide-react";
import type { Message as MessageType, User } from "@shared/schema";

interface MessageProps {
  message: MessageType;
  isOwn: boolean;
  otherUser: User;
}

export default function Message({ message, isOwn }: MessageProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const expiresAt = new Date(message.expiresAt);
      const remaining = expiresAt.getTime() - now.getTime();

      if (remaining <= 0) {
        setTimeRemaining("Expired");
        return;
      }

      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

      if (hours > 0) setTimeRemaining(`${hours}h ${minutes}m`);
      else if (minutes > 0) setTimeRemaining(`${minutes}m ${seconds}s`);
      else setTimeRemaining(`${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [message.expiresAt]);

  const formatTime = (date: string | Date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const Bubble = ({ children }: { children: React.ReactNode }) => (
    <div
      className={[
        "message-bubble",
        isOwn ? "sent" : "received",
        // ✅ wichtig: keine horizontale Überläufe
        "max-w-[80%] md:max-w-[60%]",
        "overflow-hidden",
        "break-words",
      ].join(" ")}
      style={{
        // ✅ harte Absicherung gegen seitliches Wischen
        wordBreak: "break-word",
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </div>
  );

  const renderMessageContent = () => {
    if (message.messageType === "text") {
      // ✅ Für lange Strings (z.B. Base64) zusätzlich break-all
      const looksLikeBase64 =
        typeof message.content === "string" &&
        message.content.length > 200 &&
        !message.content.includes(" ");

      return (
        <Bubble>
          <p className={looksLikeBase64 ? "break-all text-sm opacity-90" : ""}>
            {message.content}
          </p>
        </Bubble>
      );
    }

    if (message.messageType === "image") {
      return (
        <Bubble>
          <div className="space-y-2">
            <div className="bg-black/20 rounded-lg overflow-hidden w-full max-w-full">
              <img
                src={message.content}
                alt="Shared image"
                className="w-full h-auto max-h-64 object-cover block"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                  target.nextElementSibling?.classList.remove("hidden");
                }}
              />
              <div className="hidden flex items-center justify-center h-32 text-muted-foreground">
                <Eye className="w-8 h-8" />
              </div>
            </div>
          </div>
        </Bubble>
      );
    }

    if (message.messageType === "file") {
      return (
        <Bubble>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-xs">📄</span>
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {message.fileName || message.content}
              </p>
              <p className="text-xs opacity-70 truncate">
                {message.fileSize ? `${(message.fileSize / 1024).toFixed(1)} KB` : "File"} •
                Encrypted
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-current hover:bg-white/10 flex-shrink-0"
              type="button"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </Bubble>
      );
    }

    return null;
  };

  // ✅ Wrapper: überall min-w-0 + overflow-x-hidden
  if (isOwn) {
    return (
      <div className="flex justify-end w-full max-w-full overflow-x-hidden animate-fade-in">
        <div className="min-w-0 max-w-full flex justify-end">
          {renderMessageContent()}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 w-full max-w-full overflow-x-hidden animate-fade-in">
      <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-muted-foreground text-xs">👤</span>
      </div>

      <div className="flex-1 min-w-0 max-w-full overflow-x-hidden">
        {renderMessageContent()}

        <div className="flex items-center gap-2 mt-1 min-w-0">
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {formatTime(message.createdAt)}
          </span>
          <div className="flex items-center gap-1 min-w-0">
            <Clock className="w-3 h-3 text-destructive flex-shrink-0" />
            <span className="text-xs text-destructive truncate">{timeRemaining}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
