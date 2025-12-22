import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LanguageSelector } from "@/components/ui/language-selector";

import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { X, Shield, Trash2, Info, Clock } from "lucide-react";
import type { User } from "@shared/schema";

interface SettingsModalProps {
  currentUser: User & { privateKey: string };
  onClose: () => void;
  onUpdateUser: (user: User & { privateKey: string }) => void;
}

function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    return u?.token || u?.accessToken || localStorage.getItem("token") || null;
  } catch {
    return localStorage.getItem("token");
  }
}

export default function SettingsModal({ currentUser, onClose }: SettingsModalProps) {
  const { toast } = useToast();
  const { t } = useLanguage();

  const [defaultTimer, setDefaultTimer] = useState("86400");
  const [screenLock, setScreenLock] = useState(true);
  const [incognitoKeyboard, setIncognitoKeyboard] = useState(true);
  const [readReceipts, setReadReceipts] = useState(false);
  const [typingIndicators, setTypingIndicators] = useState(true);

  const formatTimerOption = (seconds: string) => {
    const num = parseInt(seconds);
    if (num < 60) return `${num} second${num > 1 ? "s" : ""}`;
    if (num < 3600) return `${num / 60} minute${num / 60 > 1 ? "s" : ""}`;
    if (num < 86400) return `${num / 3600} hour${num / 3600 > 1 ? "s" : ""}`;
    return `${num / 86400} day${num / 86400 > 1 ? "s" : ""}`;
  };

  const handleDeleteProfile = async () => {
    try {
      const token = getAuthToken();
      if (!token) throw new Error("Missing token");

      const res = await fetch("/api/me", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      // local wipe
      localStorage.removeItem("user");
      localStorage.removeItem("token");

      toast({
        title: t("success") ?? "Success",
        description: t("profileDeleted") ?? "Profile deleted permanently.",
      });

      window.location.href = "/";
    } catch (err: any) {
      toast({
        title: t("error") ?? "Error",
        description: err?.message || (t("profileDeleteError") ?? "Failed to delete profile."),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="
          bg-surface border-border
          w-[94vw] max-w-md sm:max-w-2xl
          max-h-[88vh] overflow-y-auto
          p-0
        "
      >
        {/* Sticky header for mobile */}
        <div className="sticky top-0 z-10 bg-surface border-b border-border">
          <DialogHeader className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-xl sm:text-2xl font-bold text-text-primary">
                {t("settingsTitle") ?? "Settings"}
              </DialogTitle>
              <Button variant="ghost" size="sm" onClick={onClose} className="text-text-muted hover:text-text-primary">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogHeader>
        </div>

        <div className="p-4 sm:p-6 space-y-7 sm:space-y-8">
          {/* Language */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">{t("language") ?? "Language"}</h3>
            <div className="flex justify-start">
              <LanguageSelector />
            </div>
          </div>

          {/* Security */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">{t("security") ?? "Security"}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-medium text-text-primary">{t("defaultTimer") ?? "Default timer"}</h4>
                  <p className="text-sm text-text-muted">{t("autoDestructTime") ?? "Auto destruct time"}</p>
                </div>
                <Select value={defaultTimer} onValueChange={setDefaultTimer}>
                  <SelectTrigger className="w-36 bg-surface border-border text-text-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{formatTimerOption("1")}</SelectItem>
                    <SelectItem value="10">{formatTimerOption("10")}</SelectItem>
                    <SelectItem value="60">{formatTimerOption("60")}</SelectItem>
                    <SelectItem value="3600">{formatTimerOption("3600")}</SelectItem>
                    <SelectItem value="86400">{formatTimerOption("86400")}</SelectItem>
                    <SelectItem value="518400">{formatTimerOption("518400")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-medium text-text-primary">{t("screenLock") ?? "Screen lock"}</h4>
                  <p className="text-sm text-text-muted">{t("screenLockDesc") ?? "Lock the screen"}</p>
                </div>
                <Switch checked={screenLock} onCheckedChange={setScreenLock} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-medium text-text-primary">{t("incognitoKeyboard") ?? "Incognito keyboard"}</h4>
                  <p className="text-sm text-text-muted">{t("incognitoKeyboardDesc") ?? "Disable suggestions"}</p>
                </div>
                <Switch checked={incognitoKeyboard} onCheckedChange={setIncognitoKeyboard} />
              </div>
            </div>
          </div>

          {/* Privacy */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">{t("privacy") ?? "Privacy"}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-medium text-text-primary">{t("readReceipts") ?? "Read receipts"}</h4>
                  <p className="text-sm text-text-muted">{t("readReceiptsDesc") ?? "Show read receipts"}</p>
                </div>
                <Switch checked={readReceipts} onCheckedChange={setReadReceipts} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-medium text-text-primary">{t("typingIndicators") ?? "Typing indicators"}</h4>
                  <p className="text-sm text-text-muted">{t("typingIndicatorsDesc") ?? "Show typing"}</p>
                </div>
                <Switch checked={typingIndicators} onCheckedChange={setTypingIndicators} />
              </div>
            </div>
          </div>

          {/* Profile deletion (NEW) */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">{t("profile") ?? "Profile"}</h3>

            <div className="bg-muted/25 border border-border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-text-primary font-medium">
                <Trash2 className="w-4 h-4 text-red-500" />
                <span>{t("deleteProfile") ?? "Delete profile"}</span>
              </div>

              <p className="text-sm text-text-muted">
                {t("deleteProfileDesc") ??
                  "This permanently deletes your profile, chats and messages. Your username becomes available again."}
              </p>

              <div className="flex items-start gap-2 text-xs text-text-muted">
                <Clock className="w-3.5 h-3.5 mt-0.5" />
                <span>
                  {t("autoDelete20Days") ??
                    "Inactive profiles are automatically deleted after 20 days (username becomes free)."}
                </span>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full mt-2 bg-red-600 hover:bg-red-700 text-white">
                    {t("deleteProfile") ?? "Delete profile"}
                  </Button>
                </AlertDialogTrigger>

                <AlertDialogContent className="max-w-[92vw] sm:max-w-lg">
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("confirmDeleteProfileTitle") ?? "Delete profile permanently?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("confirmDeleteProfileDesc") ??
                        "This will permanently delete your account, all chats and messages. This cannot be undone."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("cancel") ?? "Cancel"}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteProfile}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {t("delete") ?? "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* About */}
          <div className="border-t border-border pt-6">
            <div className="text-center space-y-2">
              <p className="text-sm text-text-muted">VelumChat v1.0.0</p>
              <div className="flex justify-center gap-4 text-sm">
                <Button variant="link" className="text-primary hover:text-primary/80 p-0 h-auto">
                  {t("privacyPolicy") ?? "Privacy policy"}
                </Button>
                <Button variant="link" className="text-primary hover:text-primary/80 p-0 h-auto">
                  {t("sourceCode") ?? "Source code"}
                </Button>
                <Button variant="link" className="text-primary hover:text-primary/80 p-0 h-auto">
                  {t("securityAudit") ?? "Security audit"}
                </Button>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-text-muted pt-1">
                <Info className="w-3.5 h-3.5" />
                <span>{t("loggedInAs") ?? "Logged in as"}: {currentUser.username}</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}