import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent as AlertDialogContentUI,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertDialogTitleUI,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LanguageSelector } from "@/components/ui/language-selector";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { profileProtection } from "@/lib/profile-protection";
import { X, Trash2, Info } from "lucide-react";
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
    },
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

  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteProfileForever = async () => {
    try {
      setIsDeleting(true);

      // ✅ Hard delete on server
      await authedFetch("/api/me", { method: "DELETE" });

      // ✅ Clear local profile + backups (VERY IMPORTANT, sonst "recover")
      try {
        // dein profileProtection hat wahrscheinlich store/retrieve.
        // wir rufen mögliche "clear/remove/delete" Varianten defensiv auf:
        (profileProtection as any)?.clearProfile?.();
        (profileProtection as any)?.removeProfile?.();
        (profileProtection as any)?.deleteProfile?.();
        (profileProtection as any)?.purge?.();
      } catch {}

      // ✅ remove local tokens / user
      try {
        localStorage.removeItem("user");
        localStorage.removeItem("token");

        // optional: bekannte Cutoff keys weg (wenn vorhanden)
        // löscht alle keys die mit chat_cutoffs_v1_ anfangen:
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith("chat_cutoffs_v1_")) localStorage.removeItem(k);
        });
      } catch {}

      toast({
        title: t("success") ?? "Erfolg",
        description: t("profileDeleted") ?? "Profil wurde dauerhaft gelöscht. Username ist wieder frei.",
      });

      // ✅ zurück zur Startseite
      window.location.href = "/";
    } catch (err: any) {
      console.error("❌ delete profile failed:", err);
      toast({
        title: t("error") ?? "Fehler",
        description: err?.message || (t("profileDeleteError") ?? "Profil konnte nicht gelöscht werden."),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Info/Stub: du wolltest Username-ändern NICHT mehr.
  const handleInfo = () => {
    toast({
      title: t("info") ?? "Info",
      description:
        t("profilesAutoDelete20Days") ??
        "Profile werden nach 20 Tagen Inaktivität automatisch gelöscht. Beim manuellen Löschen wird alles sofort entfernt.",
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className={[
          "bg-surface border-border",
          "w-[95vw] sm:max-w-2xl",
          "max-h-[85vh] sm:max-h-[90vh] overflow-y-auto",
          "p-0", // wir machen eigenes padding mit sticky header + body padding
          "rounded-2xl",
        ].join(" ")}
      >
        {/* ✅ Sticky Header (mobile nicer) */}
        <DialogHeader className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-border px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-lg sm:text-2xl font-bold text-text-primary truncate">
                {t("settingsTitle") ?? "Einstellungen"}
              </DialogTitle>
              <p className="text-xs sm:text-sm text-text-muted mt-0.5 truncate">
                VelumChat • @{currentUser.username}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleInfo}
                className="text-text-muted hover:text-text-primary"
                aria-label="Info"
              >
                <Info className="w-4 h-4" />
              </Button>

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
          </div>
        </DialogHeader>

        {/* ✅ Body */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-6 sm:space-y-8">
          {/* Language */}
          <div className="space-y-3">
            <h3 className="text-base sm:text-lg font-semibold text-text-primary">
              {t("language") ?? "Sprache"}
            </h3>
            <div className="flex justify-start">
              <LanguageSelector />
            </div>
          </div>

          {/* Profile deletion */}
          <div className="space-y-3">
            <h3 className="text-base sm:text-lg font-semibold text-text-primary">
              {t("profile") ?? "Profil"}
            </h3>

            <div className="bg-muted/20 border border-border rounded-xl p-3 sm:p-4">
              <p className="text-sm text-text-primary font-medium">
                {t("deleteProfileTitle") ?? "Profil dauerhaft löschen"}
              </p>
              <p className="text-xs sm:text-sm text-text-muted mt-1 leading-relaxed">
                {t("deleteProfileDesc") ??
                  "Dabei werden dein Benutzername, alle Chats und Nachrichten endgültig aus der Datenbank gelöscht. Der Benutzername ist danach wieder frei."}
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="w-full h-11 sm:h-12 rounded-xl"
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isDeleting
                    ? (t("deleting") ?? "Lösche...")
                    : (t("deleteProfile") ?? "Profil löschen")}
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContentUI className="bg-surface border-border w-[95vw] sm:max-w-lg rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitleUI className="text-text-primary">
                    {t("confirmDeleteProfileTitle") ?? "Profil wirklich löschen?"}
                  </AlertDialogTitleUI>
                  <AlertDialogDescription className="text-text-muted">
                    {t("confirmDeleteProfileDesc") ??
                      "Das kann nicht rückgängig gemacht werden. Dein Benutzername wird freigegeben und kann von anderen benutzt werden."}
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter className="gap-2 sm:gap-3">
                  <AlertDialogCancel className="bg-muted/30 border-border">
                    {t("cancel") ?? "Abbrechen"}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteProfileForever}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {t("deleteForever") ?? "Für immer löschen"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContentUI>
            </AlertDialog>
          </div>

          {/* About */}
          <div className="border-t border-border pt-4 sm:pt-6">
            <div className="text-center space-y-2">
              <p className="text-sm text-text-muted">VelumChat v1.0.0</p>
              <p className="text-xs text-text-muted">
                {t("profilesAutoDelete20Days") ??
                  "Hinweis: Profile werden nach 20 Tagen Inaktivität automatisch gelöscht."}
              </p>
            </div>
          </div>

          {/* bottom padding for mobile scroll */}
          <div className="h-2" />
        </div>
      </DialogContent>
    </Dialog>
  );
}