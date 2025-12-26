import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/alert-dialog";
import { LanguageSelector } from "@/components/ui/language-selector";

import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { X, KeyRound, Trash2 } from "lucide-react";
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

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ---------- Account löschen ----------
  const handleDeleteAccount = async () => {
    try {
      setIsDeleting(true);

      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Missing auth token");
      }

      const res = await fetch("/api/users/me", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to delete account");
      }

      // alles lokal weg
      localStorage.removeItem("user");
      localStorage.removeItem("token");

      toast({
        title: t("success"),
        description: t("accountDeleted"),
      });

      // zurück zum Start
      window.location.href = "/";
    } catch (err) {
      console.error("Delete account error:", err);
      toast({
        title: t("error"),
        description:
          err instanceof Error
            ? err.message
            : t("accountDeleteError"),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-surface border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold text-text-primary">
              {t("settingsTitle")}
            </DialogTitle>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-text-muted hover:text-text-primary hover:bg-muted/40 transition"
              aria-label="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-8 pb-4">
          {/* Profil */}
          <section>
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              {t("profile")}
            </h3>

            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center">
                <KeyRound className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  {t("username")}
                </label>
                <Input
                  value={currentUser.username}
                  disabled
                  className="bg-surface text-text-primary border-border opacity-80 cursor-not-allowed"
                />
                <p className="text-xs text-text-muted mt-1">
                  {t("anonymousIdentifier")}
                </p>
              </div>
            </div>

            {/* Profil löschen Button */}
            <AlertDialog
              open={isDeleteDialogOpen}
              onOpenChange={setIsDeleteDialogOpen}
            >
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
                  <AlertDialogCancel className="bg-muted text-text-primary border-border">
                    {t("cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    {isDeleting ? t("deleting") : t("deleteAccountForever")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>

              <Button
                variant="destructive"
                className="w-full justify-center mt-2"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t("deleteAccount")}
              </Button>
            </AlertDialog>
          </section>

          {/* Sprache */}
          <section>
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              {t("language")}
            </h3>
            <LanguageSelector />
          </section>

          {/* About / Version */}
          <section className="border-t border-border pt-4">
            <div className="text-center space-y-2">
              <p className="text-sm text-text-muted">
                VelumChat v1.0.0
              </p>
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
