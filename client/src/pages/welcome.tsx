import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { generateKeyPair } from "@/lib/crypto";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { LanguageSelector } from "@/components/ui/language-selector";
import { profileProtection } from "@/lib/profile-protection";
import { SessionPersistence } from "@/lib/session-persistence";
import { EyeOff, Shield, KeyRound, Clock, Database, LogIn, UserPlus } from "lucide-react";
import logoPath from "@assets/whispergram Logo_1752171096580.jpg";

export default function WelcomePage() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();
  
  // Initialize session persistence on mount
  useEffect(() => {
    SessionPersistence.getInstance().initialize();
  }, []);
  useEffect(() => {
    SessionPersistence.getInstance().initialize();
  }, []);



  const handleLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      toast({
        title: t('usernameEmpty'),
        description: t('usernameEmpty'),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Login with username and password
      const response = await apiRequest("POST", "/api/login", {
        username: loginUsername,
        password: loginPassword,
      });

      const user = await response.json();

      // Check if user data exists in localStorage for private key
      const existingData = localStorage.getItem("user");
      let privateKey = "";
      
      if (existingData) {
        const parsed = JSON.parse(existingData);
        if (parsed.username === loginUsername) {
          privateKey = parsed.privateKey;
        }
      }

      if (!privateKey) {
        // Generate new key pair if not found
        const { privateKey: newPrivateKey } = await generateKeyPair();
        privateKey = newPrivateKey;
      }

      // Store user data with maximum protection (Wickr-Me style)
      const userProfile = {
        ...user.user,
        privateKey,
      };
      
      profileProtection.storeProfile(userProfile);
      console.log("✅ User logged in successfully with encryption keys:", user.user.username);

      toast({
        title: t('welcomeBack'),
        description: t('loginSuccess'),
      });

      console.log("🎯 Navigating to chat page from login...");
      setLocation("/chat");
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message || t('loginFailed'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartChatting = async () => {
    if (!registerPassword.trim()) {
      toast({
        title: t('passwordRequired'),
        description: t('enterPassword'),
        variant: "destructive",
      });
      return;
    }

    if (registerPassword.length < 6) {
      toast({
        title: t('passwordTooShort'),
        description: t('passwordMinLength'),
        variant: "destructive",
      });
      return;
    }

    if (!username.trim()) {
      toast({
        title: t('usernameRequired'),
        description: t('enterUsername'),
        variant: "destructive",
      });
      return;
    }

    if (username.length < 3) {
      toast({
        title: t('usernameTooShort'),
        description: t('usernameMinLength'),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const finalUsername = username.trim();
      const { publicKey, privateKey } = await generateKeyPair();

      // Create user account
      console.log("👤 Creating user account:", finalUsername);
      const response = await apiRequest("POST", "/api/register", {
        username: finalUsername,
        password: registerPassword,
        publicKey,
      });

      const user = await response.json();
      console.log("✅ User created successfully:", user.id, username);

      // Store user data with maximum protection (Wickr-Me style)
      const userProfile = {
        ...user.user,
        privateKey,
      };
      
      profileProtection.storeProfile(userProfile);
      console.log("✅ User registered successfully with encryption keys:", user.user.username);

      toast({
        title: t('welcomeToWhispergram'),
        description: t('accountCreated'),
      });

      console.log("🎯 Navigating to chat page from registration...");
      setLocation("/chat");
    } catch (error: any) {
      toast({
        title: t('registrationFailed'),
        description: error.message || t('accountCreationFailed'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-3 py-4 sm:px-4 sm:py-8">
      <div className="max-w-6xl w-full space-y-6 sm:space-y-8">
        {/* Logo and Brand */}
        <div className="text-center">
          <div className="mx-auto h-32 w-32 sm:h-40 sm:w-40 bg-primary rounded-xl flex items-center justify-center mb-4 sm:mb-6 overflow-hidden shadow-lg">
            <img 
              src={logoPath} 
              alt="Whispergram Logo" 
              className="w-full h-full object-cover rounded-xl"
            />
          </div>
          <p className="text-text-muted text-base sm:text-lg px-2">{t('welcomeDescription')}</p>
        </div>

        {/* Language Selector - Mobile optimized */}
        <div className="flex justify-center mb-4 sm:mb-8">
          <div className="bg-surface/80 border border-border rounded-xl p-3 sm:p-4 shadow-lg backdrop-blur-sm">
            <LanguageSelector />
          </div>
        </div>

        {/* Login/Register Form - Mobile optimized */}
        <div className="max-w-md mx-auto">
          <Card className="bg-surface border-border">
          <CardContent className="p-4 sm:p-6">
            <Tabs defaultValue="register" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 bg-background">
                <TabsTrigger value="register" className="flex items-center space-x-2">
                  <UserPlus className="w-4 h-4" />
                  <span>{t('createAccount')}</span>
                </TabsTrigger>
                <TabsTrigger value="login" className="flex items-center space-x-2">
                  <LogIn className="w-4 h-4" />
                  <span>{t('login')}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="register" className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">{t('createAccount')}</h3>
                <div className="space-y-3">
                  <Input
                    placeholder={t('enterUsername')}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-gray-800 border-border text-white placeholder:text-gray-400"
                  />
                  <Input
                    type="password"
                    placeholder={t('enterPassword')}
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    className="bg-gray-800 border-border text-white placeholder:text-gray-400"
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('chooseUsernameHint')}
                  </p>
                </div>
                <Button
                  onClick={handleStartChatting}
                  disabled={isLoading || !registerPassword || !username.trim()}
                  className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3"
                >
{isLoading ? t('createAccount') + "..." : t('createAccount')}
                </Button>
              </TabsContent>

              <TabsContent value="login" className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">{t('login')}</h3>
                <div className="space-y-3">
                  <Input
                    placeholder={t('enterUsername')}
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="bg-gray-800 border-border text-white placeholder:text-gray-400"
                  />
                  <Input
                    type="password"
                    placeholder={t('enterPassword')}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="bg-gray-800 border-border text-white placeholder:text-gray-400"
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('enterCredentials')}
                  </p>
                </div>
                <Button
                  onClick={handleLogin}
                  disabled={isLoading || !loginUsername.trim() || !loginPassword.trim()}
                  className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3"
                >
                  {isLoading ? t('login') + "..." : t('login')}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        </div>

        {/* Features Section - Professional Grid Layout */}
        <div className="mt-12 mb-8">
          <h3 className="text-2xl font-bold text-foreground mb-8 text-center">{t('features')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-5xl mx-auto">
            {/* Feature 1: End-to-End Encryption */}
            <Card className="bg-surface/50 border-border hover:bg-surface/70 transition-colors">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold text-foreground mb-2">{t('endToEndEncryption')}</h4>
                <p className="text-muted-foreground text-sm leading-relaxed">{t('encryptionEnabled')}</p>
              </CardContent>
            </Card>

            {/* Feature 2: Anonymous Access */}
            <Card className="bg-surface/50 border-border hover:bg-surface/70 transition-colors">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <EyeOff className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold text-foreground mb-2">{t('anonymousAccess')}</h4>
                <p className="text-muted-foreground text-sm leading-relaxed">{t('noPhoneRequired')}</p>
              </CardContent>
            </Card>

            {/* Feature 3: Auto-Destruct Messages */}
            <Card className="bg-surface/50 border-border hover:bg-surface/70 transition-colors">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold text-foreground mb-2">{t('autoDestruct')}</h4>
                <p className="text-muted-foreground text-sm leading-relaxed">{t('selfDestructing')}</p>
              </CardContent>
            </Card>

            {/* Feature 4: Zero Data Storage */}
            <Card className="bg-surface/50 border-border hover:bg-surface/70 transition-colors">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <Database className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold text-foreground mb-2">{t('zeroStorage')}</h4>
                <p className="text-muted-foreground text-sm leading-relaxed">{t('zeroDataRetention')}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Security Notice and Links */}
        <div className="text-center space-y-4 pt-8 border-t border-border/50">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('messagesNotStored')}</p>
            <p className="text-sm text-muted-foreground">{t('openSourceAudited')}</p>
          </div>
          <div className="flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-6">
            <button 
              onClick={() => setLocation("/faq")}
              className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
            >
              {t('frequentlyAskedQuestions')}
            </button>
            <div className="hidden sm:block w-1 h-1 bg-muted-foreground rounded-full"></div>
            <button 
              onClick={() => setLocation("/imprint")}
              className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
            >
              {t('imprint')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
