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
} from "@/components/ui/alert-dialog";
import { LanguageSelector } from "@/components/ui/language-selector";

import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { X, KeyRound, Key, Shield, Info, Trash2 } from "lucide-react";
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

function authHeaders(extra?: Record<string, string>) {
  const token = getAuthToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

export default function SettingsModal({ currentUser, onClose }: SettingsModalProps) {
  const { toast } = useToast();
  const { t } = useLanguage();

  const [defaultTimer, setDefaultTimer] = useState("86400");
  const [screenLock, setScreenLock] = useState(true);
  const [incognitoKeyboard, setIncognitoKeyboard] = useState(true);
  const [readReceipts, setReadReceipts] = useState(false);
  const [typingIndicators, setTypingIndicators] = useState(true);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteProfile = async () => {
    try {
      setDeleting(true);

      const res = await fetch("/api/users/me", {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });

      const text = await res.text().catch(() => "");
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        throw new Error(json?.message || text || "Failed to delete profile");
      }

      // local cleanup
      try {
        localStorage.removeItem("user");
        localStorage.removeItem("token");
      } catch {}

      toast({
        title: t("success"),
        description: t("profileDeleted") || "Profil wurde gelöscht.",
      });

      window.location.href = "/";
    } catch (err: any) {
      toast({
        title: t("error"),
        description: err?.message || "Profil löschen fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  const formatTimerOption = (seconds: string) => {
    const num = parseInt(seconds, 10);
    if (num < 60) return `${num} second${num > 1 ? "s" : ""}`;
    if (num < 3600) return `${num / 60} minute${num / 60 > 1 ? "s" : ""}`;
    if (num < 86400) return `${num / 3600} hour${num / 3600 > 1 ? "s" : ""}`;
    return `${num / 86400} day${num / 86400 > 1 ? "s" : ""}`;
  };

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent
          className="
            bg-surface border-border
            w-[calc(100vw-24px)] sm:max-w-2xl
            max-h-[85dvh] overflow-y-auto
            p-4 sm:p-6
          "
        >
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-2xl font-bold text-text-primary">{t("settingsTitle")}</DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-text-muted hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-8">
            {/* Profile */}
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-4">{t("profile")}</h3>

              <div className="space-y-4">
                <div className="flex items-start sm:items-center gap-4">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                    <KeyRound className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-muted">
                      {t("loggedInAs") || "Angemeldet als"}:{" "}
                      <span className="text-text-primary font-medium break-all">{currentUser.username}</span>
                    </div>
                  </div>
                </div>

                {/* ✅ Profil löschen */}
                <div className="bg-muted/30 p-3 rounded-lg border border-border">
                  <p className="text-sm text-text-primary font-medium mb-1 flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-red-400" />
                    {t("deleteProfile") || "Profil löschen"}
                  </p>
                  <p className="text-xs text-text-muted break-words whitespace-normal">
                    {t("deleteProfileDesc") ||
                      "Dein Profil und alle Daten werden dauerhaft vom Server gelöscht. Dein Benutzername wird wieder frei."}
                  </p>

                  <Button
                    type="button"
                    variant="destructive"
                    className="mt-3 w-full"
                    onClick={() => setConfirmOpen(true)}
                    disabled={deleting}
                  >
                    {deleting ? (t("deleting") || "Lösche...") : (t("deleteProfile") || "Profil löschen")}
                  </Button>
                </div>
              </div>
            </div>

            {/* Language */}
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-4">{t("language")}</h3>
              <div className="flex justify-start">
                <LanguageSelector />
              </div>
            </div>

            {/* Security */}
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-4">{t("security")}</h3>

              <div className="space-y-4">
                <div className="flex items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-medium text-text-primary">{t("defaultTimer")}</h4>
                    <p className="text-sm text-text-muted break-words whitespace-normal">{t("autoDestructTime")}</p>
                  </div>

                  <Select value={defaultTimer} onValueChange={setDefaultTimer}>
                    <SelectTrigger className="w-40 sm:w-44 bg-surface border-border text-text-primary flex-shrink-0">
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

                <div className="flex items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-medium text-text-primary">{t("screenLock")}</h4>
                    <p className="text-sm text-text-muted break-words whitespace-normal">{t("screenLockDesc")}</p>
                  </div>
                  <Switch checked={screenLock} onCheckedChange={setScreenLock} className="flex-shrink-0" />
                </div>

                <div className="flex items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-medium text-text-primary">{t("incognitoKeyboard")}</h4>
                    <p className="text-sm text-text-muted break-words whitespace-normal">{t("incognitoKeyboardDesc")}</p>
                  </div>
                  <Switch
                    checked={incognitoKeyboard}
                    onCheckedChange={setIncognitoKeyboard}
                    className="flex-shrink-0"
                  />
                </div>
              </div>
            </div>

            {/* Privacy */}
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-4">{t("privacy")}</h3>

              <div className="space-y-4">
                <div className="flex items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-medium text-text-primary">{t("readReceipts")}</h4>
                    <p className="text-sm text-text-muted break-words whitespace-normal">{t("readReceiptsDesc")}</p>
                  </div>
                  <Switch checked={readReceipts} onCheckedChange={setReadReceipts} className="flex-shrink-0" />
                </div>

                <div className="flex items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-medium text-text-primary">{t("typingIndicators")}</h4>
                    <p className="text-sm text-text-muted break-words whitespace-normal">{t("typingIndicatorsDesc")}</p>
                  </div>
                  <Switch checked={typingIndicators} onCheckedChange={setTypingIndicators} className="flex-shrink-0" />
                </div>
              </div>
            </div>

            {/* About */}
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-4">{t("about")}</h3>

              <div className="space-y-4">
                <Button variant="outline" className="w-full bg-bg-dark border-border hover:bg-muted/50 text-left h-auto p-4">
                  <div className="w-full flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-text-primary">{t("exportKeys")}</h4>
                      <p className="text-sm text-text-muted break-words whitespace-normal">{t("exportKeysDesc")}</p>
                    </div>
                    <div className="self-end sm:self-auto flex-shrink-0">
                      <Key className="w-5 h-5 text-text-muted" />
                    </div>
                  </div>
                </Button>

                <Button variant="outline" className="w-full bg-bg-dark border-border hover:bg-muted/50 text-left h-auto p-4">
                  <div className="w-full flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-text-primary">{t("verifySecurityNumber")}</h4>
                      <p className="text-sm text-text-muted break-words whitespace-normal">{t("verifySecurityNumberDesc")}</p>
                    </div>
                    <div className="self-end sm:self-auto flex-shrink-0">
                      <Shield className="w-5 h-5 text-accent" />
                    </div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full bg-bg-dark border-border hover:bg-muted/50 text-left h-auto p-4"
                >
                  <div className="w-full flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-text-primary">{t("permanentAccount")}</h4>
                      <p className="text-sm text-text-muted break-words whitespace-normal">
                        {t("permanentAccountDescription")}
                      </p>
                    </div>
                    <div className="self-end sm:self-auto flex-shrink-0">
                      <Info className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                </Button>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border pt-6">
              <div className="text-center space-y-2">
                <p className="text-sm text-text-muted">VelumChat v1.0.0</p>
                <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
                  <Button variant="link" className="text-primary hover:text-primary/80 p-0 h-auto">
                    {t("privacyPolicy")}
                  </Button>
                  <Button variant="link" className="text-primary hover:text-primary/80 p-0 h-auto">
                    {t("sourceCode")}
                  </Button>
                  <Button variant="link" className="text-primary hover:text-primary/80 p-0 h-auto">
                    {t("securityAudit")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-surface border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">
              {t("deleteProfileConfirmTitle") || "Profil wirklich löschen?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-text-muted">
              {t("deleteProfileConfirmDesc") ||
                "Das löscht dein Profil UND alle Daten dauerhaft vom Server. Dein Benutzername wird wieder frei. Diese Aktion kann nicht rückgängig gemacht werden."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel") || "Abbrechen"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProfile}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting ? (t("deleting") || "Lösche...") : (t("delete") || "Löschen")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}