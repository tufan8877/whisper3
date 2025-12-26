import { useState } from "react";
import type { User } from "@shared/schema";

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

import { KeyRound, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";

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

  const handleDeleteAccount = async () => {
    try {
      setIsDeleting(true);

      const token =
        localStorage.getItem("token") || localStorage.getItem("authToken");

      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Failed to delete account");
      }

      // Alles lokal aufräumen
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      localStorage.removeItem("authToken");

      toast({
        title: t("success"),
        description: t("accountDeleted"),
      });

      // Zur Welcome-Seite
      window.location.href = "/";
    } catch (err: any) {
      console.error("Delete account error:", err);
      toast({
        title: t("error"),
        description:
          err?.message || t("accountDeleteError") || "Failed to delete account",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-surface border-border max-w-lg w-[95vw]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold text-text-primary">
              {t("settingsTitle")}
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary text-xl"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-8">
          {/* Profil */}
          <section>
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              {t("profile")}
            </h3>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center">
                <KeyRound className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium text-text-primary">
                  {t("username")}
                </label>
                <Input
                  value={currentUser.username}
                  disabled
                  className="bg-muted/40 border-border text-text-primary cursor-default"
                />
                <p className="text-xs text-text-muted">
                  {t("anonymousIdentifier")}
                </p>
              </div>
            </div>

            {/* Delete Account Button */}
            <div className="mt-6">
              <AlertDialog
                open={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
              >
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
                    <AlertDialogDescription className="text-text-muted">
                      {t("deleteAccountConfirm")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                      {t("cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90"
                      onClick={handleDeleteAccount}
                      disabled={isDeleting}
                    >
                      {isDeleting ? t("deleting") : t("deleteAccountForever")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>

          {/* Sprache */}
          <section>
            <h3 className="text-lg font-semibold text-text-primary mb-3">
              {t("language")}
            </h3>
            <LanguageSelector />
          </section>

          {/* About */}
          <section className="border-t border-border pt-4">
            <div className="text-center space-y-2">
              <p className="text-sm text-text-muted">VelumChat v1.0.0</p>
              <div className="flex justify-center gap-4 text-sm">
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

// kleine Hilfs-Komponente, damit AlertDialogTrigger funktioniert
function AlertDialogTrigger(props: React.ComponentProps<"button">) {
  return <button {...props} />;
}
