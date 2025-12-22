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
import { profileProtection } from "@/lib/profile-protection";
import { SessionPersistence } from "@/lib/session-persistence";
import { X, KeyRound, Key, Shield, Trash2, Info } from "lucide-react";
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

async function authedFetch(url: string, init?: RequestInit) {
  const token = getAuthToken();
  if (!token) throw new Error("Missing token");

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(init?.headers?.["Content-Type"] ? {} : {}),
    } as any,
    credentials: "include",
  });

  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    const msg = json?.message || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json ?? { ok: true };
}

export default function SettingsModal({ currentUser, onClose }: SettingsModalProps) {
  const { toast } = useToast();
  const { t } = useLanguage();

  const [defaultTimer, setDefaultTimer] = useState("86400");
  const [screenLock, setScreenLock] = useState(true);
  const [incognitoKeyboard, setIncognitoKeyboard] = useState(true);
  const [readReceipts, setReadReceipts] = useState(false);
  const [typingIndicators, setTypingIndicators] = useState(true);

  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    try {
      setDeleting(true);

      // ✅ Backend muss den User + Chats + Messages wirklich löschen
      // Endpoint: DELETE /api/me
      await authedFetch("/api/me", { method: "DELETE" });

      // ✅ Danach ALLES lokal entfernen (auch Backup-Recovery)
      try {
        localStorage.removeItem("user");
        localStorage.removeItem("token");

        // cutoffs falls vorhanden
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith("chat_cutoffs_v1_")) localStorage.removeItem(k);
        });
      } catch {}

      try {
        // Backup/Recovery löschen (damit kein recover möglich ist)
        (profileProtection as any)?.clearProfile?.();
        (profileProtection as any)?.removeProfile?.();
        (profileProtection as any)?.deleteProfile?.();
        (profileProtection as any)?.purge?.();
      } catch {}

      try {
        // Session Persistence resetten, falls du da was speicherst
        SessionPersistence.getInstance()?.clear?.();
        SessionPersistence.getInstance()?.reset?.();
      } catch {}

      toast({
        title: t("success") || "Erfolg",
        description: t("profileDeleted") || "Profil wurde dauerhaft gelöscht. Benutzername ist wieder frei.",
      });

      window.location.href = "/";
    } catch (error: any) {
      console.error("❌ Failed to delete profile:", error);
      toast({
        title: t("error") || "Fehler",
        description: error?.message || (t("profileDeleteError") || "Profil konnte nicht gelöscht werden."),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAllData = () => {
    // optional: du kannst das weiterhin lassen
    window.location.href = "/";
  };

  const formatTimerOption = (seconds: string) => {
    const num = parseInt(seconds);
    if (num < 60) return `${num} second${num > 1 ? "s" : ""}`;
    if (num < 3600) return `${num / 60} minute${num / 60 > 1 ? "s" : ""}`;
    if (num < 86400) return `${num / 3600} hour${num / 3600 > 1 ? "s" : ""}`;
    return `${num / 86400} day${num / 86400 > 1 ? "s" : ""}`;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      {/* ✅ nur minimal mobile fix: width + max height */}
      <DialogContent className="bg-surface border-border w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            {/* ✅ Whispergram -> VelumChat */}
            <DialogTitle className="text-2xl font-bold text-text-primary">
              {t("settingsTitle") || "Einstellungen"} • VelumChat
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

        <div className="space-y-8">
          {/* Profile Section (✅ statt Username ändern: Profil löschen) */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">{t("profile") || "Profil"}</h3>

            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                    <KeyRound className="w-8 h-8 text-white" />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary mb-1">
                      {t("username") || "Benutzername"}:
                    </p>
                    <p className="text-text-muted text-sm">@{currentUser.username}</p>
                  </div>
                </div>

                <div className="bg-muted/30 p-3 rounded-lg border border-border">
                  <p className="text-sm text-text-primary font-medium mb-1">
                    💡 {t("deleteProfileTitle") || "Profil löschen"}
                  </p>
                  <p className="text-xs text-text-muted">
                    {t("deleteProfileDesc") ||
                      "Dabei wird dein Benutzername, alle Chats und Inhalte endgültig gelöscht. Danach ist der Benutzername wieder frei."}
                  </p>
                </div>
              </div>

              {/* ✅ Delete Profile with confirmation */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={deleting}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deleting ? (t("deleting") || "Lösche...") : (t("deleteProfile") || "Profil löschen")}
                  </Button>
                </AlertDialogTrigger>

                <AlertDialogContent className="bg-surface border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-text-primary">
                      {t("confirmDeleteProfileTitle") || "Profil wirklich löschen?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-text-muted">
                      {t("confirmDeleteProfileDesc") ||
                        "Das kann nicht rückgängig gemacht werden. Dein Benutzername wird freigegeben und kann von anderen genutzt werden."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-muted/30 border-border">
                      {t("cancel") || "Abbrechen"}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {t("deleteForever") || "Für immer löschen"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Language Settings */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">{t("language") || "Sprache"}</h3>
            <div className="flex justify-start">
              <LanguageSelector />
            </div>
          </div>

          {/* Security Settings (unverändert) */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">{t("security") || "Sicherheit"}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-text-primary">{t("defaultTimer") || "Standard Timer"}</h4>
                  <p className="text-sm text-text-muted">{t("autoDestructTime") || "Auto-Destruct Zeit"}</p>
                </div>
                <Select value={defaultTimer} onValueChange={setDefaultTimer}>
                  <SelectTrigger className="w-32 bg-surface border-border text-text-primary">
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

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-text-primary">{t("screenLock") || "Sperre"}</h4>
                  <p className="text-sm text-text-muted">{t("screenLockDesc") || "App-Sperre aktiv"}</p>
                </div>
                <Switch checked={screenLock} onCheckedChange={setScreenLock} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-text-primary">{t("incognitoKeyboard") || "Inkognito Tastatur"}</h4>
                  <p className="text-sm text-text-muted">{t("incognitoKeyboardDesc") || "Kein Lernen/Vorschläge"}</p>
                </div>
                <Switch checked={incognitoKeyboard} onCheckedChange={setIncognitoKeyboard} />
              </div>
            </div>
          </div>

          {/* Privacy Settings (unverändert) */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">{t("privacy") || "Privatsphäre"}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-text-primary">{t("readReceipts") || "Lesebestätigung"}</h4>
                  <p className="text-sm text-text-muted">{t("readReceiptsDesc") || "Gelesen Status"}</p>
                </div>
                <Switch checked={readReceipts} onCheckedChange={setReadReceipts} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-text-primary">{t("typingIndicators") || "Tippt..."}</h4>
                  <p className="text-sm text-text-muted">{t("typingIndicatorsDesc") || "Tippen anzeigen"}</p>
                </div>
                <Switch checked={typingIndicators} onCheckedChange={setTypingIndicators} />
              </div>
            </div>
          </div>

          {/* Advanced Options (unverändert) */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">{t("about") || "Über"}</h3>
            <div className="space-y-4">
              <Button
                variant="outline"
                className="w-full justify-between bg-bg-dark border-border hover:bg-muted/50 text-left h-auto p-4"
              >
                <div>
                  <h4 className="font-medium text-text-primary">{t("exportKeys") || "Keys exportieren"}</h4>
                  <p className="text-sm text-text-muted">{t("exportKeysDesc") || "Private/Public Keys export"}</p>
                </div>
                <Key className="w-5 h-5 text-text-muted" />
              </Button>

              <Button
                variant="outline"
                className="w-full justify-between bg-bg-dark border-border hover:bg-muted/50 text-left h-auto p-4"
              >
                <div>
                  <h4 className="font-medium text-text-primary">{t("verifySecurityNumber") || "Security Number"}</h4>
                  <p className="text-sm text-text-muted">{t("verifySecurityNumberDesc") || "Vergleichen"}</p>
                </div>
                <Shield className="w-5 h-5 text-accent" />
              </Button>

              <Button
                variant="outline"
                className="w-full justify-between bg-bg-dark border-border hover:bg-muted/50 text-left h-auto p-4"
                onClick={() =>
                  toast({
                    title: t("info") || "Info",
                    description:
                      t("profilesAutoDelete20Days") ||
                      "Profile werden nach 20 Tagen Inaktivität automatisch gelöscht.",
                    variant: "default",
                  })
                }
              >
                <div>
                  <h4 className="font-medium text-text-primary">{t("info") || "Info"}</h4>
                  <p className="text-sm text-text-muted">
                    {t("profilesAutoDelete20Days") || "Auto-Löschung nach 20 Tagen Inaktivität"}
                  </p>
                </div>
                <Info className="w-5 h-5 text-primary" />
              </Button>

              {/* optional: bleibt */}
              <Button
                variant="outline"
                className="w-full justify-between bg-bg-dark border-border hover:bg-muted/50 text-left h-auto p-4"
                onClick={handleDeleteAllData}
              >
                <div>
                  <h4 className="font-medium text-text-primary">{t("logout") || "Logout"}</h4>
                  <p className="text-sm text-text-muted">{t("logoutDesc") || "Zur Startseite"}</p>
                </div>
                <Info className="w-5 h-5 text-text-muted" />
              </Button>
            </div>
          </div>

          {/* About footer */}
          <div className="border-t border-border pt-6">
            <div className="text-center space-y-2">
              <p className="text-sm text-text-muted">VelumChat v1.0.0</p>
              <div className="flex justify-center space-x-4 text-sm">
                <Button variant="link" className="text-primary hover:text-primary/80 p-0 h-auto">
                  {t("privacyPolicy") || "Privacy Policy"}
                </Button>
                <Button variant="link" className="text-primary hover:text-primary/80 p-0 h-auto">
                  {t("sourceCode") || "Source Code"}
                </Button>
                <Button variant="link" className="text-primary hover:text-primary/80 p-0 h-auto">
                  {t("securityAudit") || "Security Audit"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}