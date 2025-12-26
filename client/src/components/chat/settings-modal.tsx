import { useState } from "react";
import type { User } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSelector } from "@/components/ui/language-selector";
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

import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";

import { X, KeyRound, Trash2 } from "lucide-react";

interface SettingsModalProps {
  currentUser: User & { privateKey: string };
  onClose: () => void;
  onUpdateUser: (user: User & { privateKey: string }) => void;
}

export default function SettingsModal({
  currentUser,
  onClose,
  onUpdateUser,
}: SettingsModalProps) {
  const { toast } = useToast();
  const { t } = useLanguage();

  // Username nur anzeigen, nicht mehr änderbar
  const [username] = useState(currentUser.username);

  // ============================
  // Account endgültig löschen
  // ============================
  const handleDeleteAccount = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        toast({
          title: t("error"),
          description: t("loginFailed"),
          variant: "destructive",
        });
        return;
      }

      const res = await fetch("/api/users/delete-self", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || t("accountDeleteError"));
      }

      // Lokale Daten löschen
      localStorage.removeItem("user");
      localStorage.removeItem("token");

      toast({
        title: t("success"),
        description: t("accountDeleted"),
      });

      // Zur Welcome-Seite
      window.location.href = "/";
    } catch (err) {
      console.error("❌ Delete account failed:", err);
      toast({
        title: t("error"),
        description:
          err instanceof Error ? err.message : t("accountDeleteError"),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-surface border-border max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-2xl font-bold text-text-primary">
            {t("settingsTitle")}
          </DialogTitle>
          {/* Nur EIN X-Button zum Schließen */}
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-muted text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        <div className="px-6 py-5 space-y-8">
          {/* Profil */}
          <section>
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              {t("profile")}
            </h3>

            <div className="flex items-center space-x-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                <KeyRound className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  {t("username")}
                </label>
                <Input
                  value={username}
                  readOnly
                  className="bg-surface text-text-primary border-border cursor-default"
                />
                <p className="mt-1 text-xs text-text-muted">
                  {t("anonymousIdentifier")}
                </p>
              </div>
            </div>

            {/* Profil löschen Button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="w-full justify-center flex items-center gap-2"
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
                  <AlertDialogDescription className="text-text-muted">
                    {t("deleteAccountConfirm")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-border">
                    {t("cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive hover:bg-destructive/90"
                    onClick={handleDeleteAccount}
                  >
                    {t("deleteAccountForever")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>

          {/* Sprache */}
          <section>
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              {t("language")}
            </h3>
            <div className="flex justify-start">
              <LanguageSelector />
            </div>
          </section>

          {/* Footer / About */}
          <section className="border-t border-border pt-4">
            <div className="text-center space-y-2">
              <p className="text-sm text-text-muted">VelumChat v1.0.0</p>
              <div className="flex justify-center space-x-4 text-sm">
                <Button
                  variant="link"
                  className="text-primary hover:text-primary/80 p-0 h-auto"
                >
                  {t("privacyPolicy")}
                </Button>
                <Button
                  variant="link"
                  className="text-primary hover:text-primary/80 p-0 h-auto"
                >
                  {t("sourceCode")}
                </Button>
                <Button
                  variant="link"
                  className="text-primary hover:text-primary/80 p-0 h-auto"
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
