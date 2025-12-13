import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CheckCheck, Clock, Download, Eye } from "lucide-react";
import type { Message, User } from "@shared/schema";

interface MessageProps {
  message: Message;
  isOwn: boolean;
  otherUser: User;
}

export default function Message({ message, isOwn, otherUser }: MessageProps) {
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

      if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setTimeRemaining(`${minutes}m ${seconds}s`);
      } else {
        setTimeRemaining(`${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [message.expiresAt]);

  const formatTime = (date: string | Date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderMessageContent = () => {
    if (message.messageType === "text") {
      return (
        <div className={`message-bubble ${isOwn ? 'sent' : 'received'}`}>
          <p className="break-words">{message.content}</p>
        </div>
      );
    }

    if (message.messageType === "image") {
      return (
        <div className={`message-bubble ${isOwn ? 'sent' : 'received'}`}>
          <div className="space-y-2">
            <div className="bg-black/20 rounded-lg overflow-hidden max-w-xs">
              <img 
                src={message.content} 
                alt="Shared image" 
                className="w-full h-auto max-h-64 object-cover"
                onError={(e) => {
                  // Fallback for broken images
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden flex items-center justify-center h-32 text-muted-foreground">
                <Eye className="w-8 h-8" />
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (message.messageType === "file") {
      return (
        <div className={`message-bubble ${isOwn ? 'sent' : 'received'}`}>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
              <span className="text-xs">📄</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{message.fileName || message.content}</p>
              <p className="text-xs opacity-70">
                {message.fileSize ? `${(message.fileSize / 1024).toFixed(1)} KB` : 'File'} • Encrypted
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-current hover:bg-white/10"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      );
    }

    return null;
  };

  if (isOwn) {
    return (
      <div className="flex items-start space-x-2 justify-end animate-fade-in">
        <div className="flex-1 flex justify-end">
          {renderMessageContent()}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start space-x-2 animate-fade-in">
      <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-muted-foreground text-xs">👤</span>
      </div>
      <div className="flex-1">
        {renderMessageContent()}
        <div className="flex items-center space-x-2 mt-1">
          <span className="text-xs text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3 text-destructive" />
            <span className="text-xs text-destructive">{timeRemaining}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
