import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { LanguageSelector } from "@/components/ui/language-selector";

import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { X, KeyRound, Key, Shield, Trash2, Info } from "lucide-react";
import type { User } from "@shared/schema";

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
  const [username, setUsername] = useState(currentUser.username);
  const [defaultTimer, setDefaultTimer] = useState("86400");
  const [screenLock, setScreenLock] = useState(true);
  const [incognitoKeyboard, setIncognitoKeyboard] = useState(true);
  const [readReceipts, setReadReceipts] = useState(false);
  const [typingIndicators, setTypingIndicators] = useState(true);



  const handleSaveProfile = async () => {
    if (!username.trim()) {
      toast({
        title: t('error'),
        description: t('usernameEmpty'),
        variant: "destructive",
      });
      return;
    }

    try {
      console.log("💾 Saving profile with username:", username);
      
      // Update user in backend
      const response = await fetch(`/api/users/${currentUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update username");
      }

      const updatedServerUser = await response.json();
      console.log("✅ Username updated on server:", updatedServerUser);

      // Update local storage
      const updatedUser = { ...currentUser, username: username.trim() };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      
      // Update parent component
      onUpdateUser(updatedUser);
      
      toast({
        title: t('success'),
        description: t('usernameUpdated'),
      });
      
      onClose();
    } catch (error) {
      console.error("❌ Failed to save profile:", error);
      toast({
        title: t('error'), 
        description: error instanceof Error ? error.message : t('profileSaveError'),
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async () => {
    // WICKR-ME-STYLE: No account deletion - profiles are permanent
    toast({
      title: t('info'),
      description: "Account deletion is disabled. Usernames are permanent like Wickr Me. Use logout to clear local data.",
      variant: "default",
    });
  };

  const handleDeleteAllData = () => {
    // WICKR-ME-STYLE: Never delete user profiles completely
    console.log("🚫 WICKR-ME-PROTECTION: Only clearing session data, preserving profile");
    // Only redirect to login, don't clear localStorage
    window.location.href = "/";
  };

  const formatTimerOption = (seconds: string) => {
    const num = parseInt(seconds);
    if (num < 60) return `${num} second${num > 1 ? 's' : ''}`;
    if (num < 3600) return `${num / 60} minute${num / 60 > 1 ? 's' : ''}`;
    if (num < 86400) return `${num / 3600} hour${num / 3600 > 1 ? 's' : ''}`;
    return `${num / 86400} day${num / 86400 > 1 ? 's' : ''}`;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-surface border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold text-text-primary">{t('settingsTitle')}</DialogTitle>
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
          {/* Profile Section */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">{t('profile')}</h3>
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                    <KeyRound className="w-8 h-8 text-white" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      {t('username')}
                    </label>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t('newUsername')}
                      style={{
                        backgroundColor: 'hsl(215, 28%, 17%)',
                        color: 'hsl(210, 40%, 98%)',
                        borderColor: 'hsl(240, 3.7%, 15.9%)'
                      }}
                      className="!bg-surface !text-text-primary !border-border"
                    />
                  </div>
                </div>
                <div className="bg-muted/30 p-3 rounded-lg border border-border">
                  <p className="text-sm text-text-primary font-medium mb-1">💡 {t('changeUsername')}</p>
                  <p className="text-xs text-text-muted">
                    {t('usernameDescription')}
                  </p>
                </div>
              </div>
              <Button onClick={handleSaveProfile} className="w-full">
{t('saveProfile')}
              </Button>
            </div>
          </div>

          {/* Language Settings */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">{t('language')}</h3>
            <div className="flex justify-start">
              <LanguageSelector />
            </div>
          </div>

          {/* Security Settings */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">{t('security')}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-text-primary">{t('defaultTimer')}</h4>
                  <p className="text-sm text-text-muted">{t('autoDestructTime')}</p>
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
                  <h4 className="font-medium text-text-primary">{t('screenLock')}</h4>
                  <p className="text-sm text-text-muted">{t('screenLockDesc')}</p>
                </div>
                <Switch checked={screenLock} onCheckedChange={setScreenLock} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-text-primary">{t('incognitoKeyboard')}</h4>
                  <p className="text-sm text-text-muted">{t('incognitoKeyboardDesc')}</p>
                </div>
                <Switch checked={incognitoKeyboard} onCheckedChange={setIncognitoKeyboard} />
              </div>
            </div>
          </div>

          {/* Privacy Settings */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">{t('privacy')}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-text-primary">{t('readReceipts')}</h4>
                  <p className="text-sm text-text-muted">{t('readReceiptsDesc')}</p>
                </div>
                <Switch checked={readReceipts} onCheckedChange={setReadReceipts} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-text-primary">{t('typingIndicators')}</h4>
                  <p className="text-sm text-text-muted">{t('typingIndicatorsDesc')}</p>
                </div>
                <Switch checked={typingIndicators} onCheckedChange={setTypingIndicators} />
              </div>
            </div>
          </div>

          {/* Advanced Options */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">{t('about')}</h3>
            <div className="space-y-4">
              <Button
                variant="outline"
                className="w-full justify-between bg-bg-dark border-border hover:bg-muted/50 text-left h-auto p-4"
              >
                <div>
                  <h4 className="font-medium text-text-primary">{t('exportKeys')}</h4>
                  <p className="text-sm text-text-muted">{t('exportKeysDesc')}</p>
                </div>
                <Key className="w-5 h-5 text-text-muted" />
              </Button>
              <Button
                variant="outline"
                className="w-full justify-between bg-bg-dark border-border hover:bg-muted/50 text-left h-auto p-4"
              >
                <div>
                  <h4 className="font-medium text-text-primary">{t('verifySecurityNumber')}</h4>
                  <p className="text-sm text-text-muted">{t('verifySecurityNumberDesc')}</p>
                </div>
                <Shield className="w-5 h-5 text-accent" />
              </Button>
              <Button
                variant="outline"
                className="w-full justify-between bg-bg-dark border-border hover:bg-muted/50 text-left h-auto p-4"
                onClick={handleDeleteAccount}
              >
                <div>
                  <h4 className="font-medium text-text-primary">{t('permanentAccount')}</h4>
                  <p className="text-sm text-text-muted">{t('permanentAccountDescription')}</p>
                </div>
                <Info className="w-5 h-5 text-primary" />
              </Button>
            </div>
          </div>

          {/* About */}
          <div className="border-t border-border pt-6">
            <div className="text-center space-y-2">
              <p className="text-sm text-text-muted">Whispergram v1.0.0</p>
              <div className="flex justify-center space-x-4 text-sm">
                <Button variant="link" className="text-primary hover:text-primary/80 p-0 h-auto">
                  {t('privacyPolicy')}
                </Button>
                <Button variant="link" className="text-primary hover:text-primary/80 p-0 h-auto">
                  {t('sourceCode')}
                </Button>
                <Button variant="link" className="text-primary hover:text-primary/80 p-0 h-auto">
                  {t('securityAudit')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
