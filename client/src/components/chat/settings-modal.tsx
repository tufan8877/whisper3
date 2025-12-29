import { useState } from "react";
import type { User } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSelector } from "@/components/ui/language-selector";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { X, KeyRound, Trash2 } from "lucide-react";

interface SettingsModalProps {
  currentUser: User & { privateKey: string };
  onClose: () => void;
}

export default function SettingsModal({ currentUser, onClose }: SettingsModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  // 🔐 Token sauber aus localStorage holen (token oder accessToken)
  const getToken = (): string | null => {
    try {
      const userRaw = localStorage.getItem("user");
      if (userRaw) {
        const u = JSON.parse(userRaw);
        if (u?.token) return u.token;
        if (u?.accessToken) return u.accessToken;
      }
      const plainToken = localStorage.getItem("token");
      return plainToken || null;
    } catch {
      return null;
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      t("deleteAccountConfirm") ||
        "Are you sure you want to permanently delete your account?"
    );
    if (!confirmed) return;

    const token = getToken();
    if (!token) {
      toast({
        title: t("error"),
        description: "Missing auth token – bitte neu einloggen.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsDeleting(true);

      const res = await fetch(`/api/users/${currentUser.id}/hard-delete`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        let msg = "Failed to delete account";
        try {
          const body = await res.json();
          if (body?.message) msg = body.message;
        } catch {}
        throw new Error(msg);
      }

      // 🧹 lokale Daten löschen
      localStorage.removeItem("user");
      localStorage.removeItem("token");

      toast({
        title: t("success"),
        description: t("accountDeleted"),
      });

      // zurück zur Startseite
      window.location.href = "/";
    } catch (err) {
      console.error("Delete account error:", err);
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
      <DialogContent className="bg-[#020617] border-slate-800 max-w-lg w-[95vw]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-slate-50">
              {t("settingsTitle")}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-slate-100"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Profil */}
          <section>
            <h3 className="text-sm font-semibold text-slate-200 mb-3">
              {t("profile")}
            </h3>
            <div className="flex items-center gap-4 mb-3">
              <div className="w-12 h-12 rounded-full bg-emerald-600/80 flex items-center justify-center">
                <KeyRound className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t("username")}
                </label>
                <Input
                  value={currentUser.username}
                  readOnly
                  className="bg-slate-900 border-slate-800 text-slate-100 cursor-default"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {t("anonymousIdentifier")}
                </p>
              </div>
            </div>

            <Button
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="w-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? t("deleting") : t("deleteAccount")}
            </Button>
          </section>

          {/* Sprache */}
          <section>
            <h3 className="text-sm font-semibold text-slate-200 mb-3">
              {t("language")}
            </h3>
            <LanguageSelector />
          </section>

          {/* Footer */}
          <section className="border-t border-slate-800 pt-4">
            <div className="text-center space-y-2">
              <p className="text-xs text-slate-500">VelumChat v1.0.0</p>
              <div className="flex justify-center gap-4 text-xs">
                <Button
                  variant="link"
                  className="text-emerald-400 hover:text-emerald-300 p-0 h-auto"
                >
                  {t("privacyPolicy")}
                </Button>
                <Button
                  variant="link"
                  className="text-emerald-400 hover:text-emerald-300 p-0 h-auto"
                >
                  {t("sourceCode")}
                </Button>
                <Button
                  variant="link"
                  className="text-emerald-400 hover:text-emerald-300 p-0 h-auto"
                >
                  {t("securityAudit")}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}