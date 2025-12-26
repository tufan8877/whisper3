import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { X, KeyRound, Shield, Trash2 } from "lucide-react";
import type { User } from "@shared/schema";

interface SettingsModalProps {
  currentUser: User & { privateKey: string };
  onClose: () => void;
  onUpdateUser: (user: User & { privateKey: string }) => void;
}

export default function SettingsModal({
  currentUser,
  onClose,
}: SettingsModalProps) {
  const { toast } = useToast();
  const { t } = useLanguage();

  // nur noch Anzeige, kein Username-Ändern mehr
  const [defaultTimer, setDefaultTimer] = useState("86400");
  const [screenLock, setScreenLock] = useState(true);
  const [incognitoKeyboard, setIncognitoKeyboard] = useState(true);
  const [readReceipts, setReadReceipts] = useState(false);
  const [typingIndicators, setTypingIndicators] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const formatTimerOption = (seconds: string) => {
    const num = parseInt(seconds);
    if (num < 60) return `${num} ${t("seconds")}`;
    if (num < 3600) return `${num / 60} ${t("minutes")}`;
    if (num < 86400) return `${num / 3600} ${t("hours")}`;
    return `${num / 86400} ${t("days")}`;
  };

  const handleDeleteAccount = async () => {
    try {
      setIsDeleting(true);

      // Token aus localStorage holen
      const raw = localStorage.getItem("user");
      let token: string | null = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          token = parsed?.token || null;
        } catch {
          token = null;
        }
      }

      if (!token) {
        toast({
          title: t("error"),
          description: t("accountDeleteError"),
          variant: "destructive",
        });
        setIsDeleting(false);
        return;
      }

      const res = await fetch("/api/me", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("Delete account failed:", res.status, txt);
        toast({
          title: t("error"),
          description: t("accountDeleteError"),
          variant: "destructive",
        });
        setIsDeleting(false);
        return;
      }

      // wirklich alles lokale löschen
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}

      toast({
        title: t("success"),
        description: t("accountDeleted"),
      });

      // auf Login-Seite
      window.location.href = "/";
    } catch (err) {
      console.error("❌ Failed to delete account:", err);
      toast({
        title: t("error"),
        description: t("accountDeleteError"),
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-surface border-border max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-text-primary">
              {t("settingsTitle")}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-text-muted hover:text-text-primary"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 pb-2">
          {/* Profile Section (nur Anzeige + Profil löschen) */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">
              {t("profile")}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
                  <KeyRound className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-text-muted mb-1">
                    {t("anonymousIdentifier")}
                  </p>
                  <Input
                    value={currentUser.username}
                    readOnly
                    className="!bg-surface !text-text-primary !border-border cursor-default"
                  />
                </div>
              </div>
            </div>

            {/* Profil löschen */}
            <div className="mt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t("deleteAccount")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-surface border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-text-primary">
                      {t("deleteAccountTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-text-muted whitespace-pre-line">
                      {t("deleteAccountConfirm")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                      {t("cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      disabled={isDeleting}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {isDeleting ? t("deleting") : t("deleteAccountForever")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <p className="mt-2 text-xs text-red-400">
                {/* kurze Warnung */}
                {t("deleteAccountDescription")}
              </p>
            </div>
          </div>

          {/* Language Settings */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">
              {t("language")}
            </h3>
            <div className="flex justify-start">
              <LanguageSelector />
            </div>
          </div>

          {/* Security Settings (nur Optik, keine Server-Logik nötig) */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">
              {t("security")}
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-medium text-text-primary">
                    {t("defaultTimer")}
                  </h4>
                  <p className="text-sm text-text-muted">
                    {t("autoDestructTime")}
                  </p>
                </div>
                <Select
                  value={defaultTimer}
                  onValueChange={setDefaultTimer}
                >
                  <SelectTrigger className="w-32 bg-surface border-border text-text-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{formatTimerOption("1")}</SelectItem>
                    <SelectItem value="10">{formatTimerOption("10")}</SelectItem>
                    <SelectItem value="60">{formatTimerOption("60")}</SelectItem>
                    <SelectItem value="3600">
                      {formatTimerOption("3600")}
                    </SelectItem>
                    <SelectItem value="86400">
                      {formatTimerOption("86400")}
                    </SelectItem>
                    <SelectItem value="518400">
                      {formatTimerOption("518400")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-medium text-text-primary">
                    {t("screenLock")}
                  </h4>
                  <p className="text-sm text-text-muted">
                    {t("screenLockDesc")}
                  </p>
                </div>
                <Switch
                  checked={screenLock}
                  onCheckedChange={setScreenLock}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-medium text-text-primary">
                    {t("incognitoKeyboard")}
                  </h4>
                  <p className="text-sm text-text-muted">
                    {t("incognitoKeyboardDesc")}
                  </p>
                </div>
                <Switch
                  checked={incognitoKeyboard}
                  onCheckedChange={setIncognitoKeyboard}
                />
              </div>
            </div>
          </div>

          {/* Privacy Settings */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">
              {t("privacy")}
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-medium text-text-primary">
                    {t("readReceipts")}
                  </h4>
                  <p className="text-sm text-text-muted">
                    {t("readReceiptsDesc")}
                  </p>
                </div>
                <Switch
                  checked={readReceipts}
                  onCheckedChange={setReadReceipts}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-medium text-text-primary">
                    {t("typingIndicators")}
                  </h4>
                  <p className="text-sm text-text-muted">
                    {t("typingIndicatorsDesc")}
                  </p>
                </div>
                <Switch
                  checked={typingIndicators}
                  onCheckedChange={setTypingIndicators}
                />
              </div>
            </div>
          </div>

          {/* About / Info sehr klein unten */}
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Shield className="w-4 h-4" />
                <span>VelumChat v1.0.0</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
