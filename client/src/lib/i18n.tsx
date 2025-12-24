export const languages = {
  en: "English",
  de: "Deutsch",
  ru: "Русский",
  es: "Español",
  tr: "Türkçe",
} as const;

export type Language = keyof typeof languages;

export const translations = {
  en: {
    // App / General
    appName: "VelumChat",
    versionLabel: "{app} v{version}",

    // Welcome Page
    welcome: "Welcome to Whispergram",
    welcomeDescription: "Secure, anonymous messaging with end-to-end encryption",
    createAccount: "Create Account",
    login: "Login",
    username: "Username",
    password: "Password",
    chooseUsername: "Choose your username",
    chooseUsernameHint: "Pick any username you like (minimum 3 characters)",
    usernameRequired: "Username required",
    enterUsername: "Please enter a username",
    usernameTooShort: "Username too short",
    usernameMinLength: "Username must be at least 3 characters",

    // Chat
    searchUsers: "Search users...",
    searchChats: "Search chats...",
    startChat: "Start Chat",
    typeMessage: "Type a message...",
    sendMessage: "Send",
    online: "Online",
    offline: "Offline",
    connecting: "Connecting...",
    settings: "Settings",
    newChat: "New Chat",
    noChats: "No chats yet",
    noChatDescription: "Search for users to start encrypted chats",
    encryptedChat: "Encrypted Chat",
    loadingChats: "Loading chats...",
    deleteChat: "Delete Chat",
    blockUser: "Block {username}",
    copyInviteLink: "Copy Invite Link",
    chatStatistics: "Chat Statistics",
    clearChat: "Clear Chat",
    autoDestruct: "Auto-destruct",
    chatWith: "Chat with {username}",
    chatStatsText:
      "Chat Statistics:\n- Total Messages: {messages}\n- Partner: {partner}\n- Encryption: Active",
    clearChatConfirm: "Are you sure you want to clear this chat with {username}?",
    clearChatImplemented: "Chat clearing would be implemented here",

    // Settings (minimal)
    settingsTitle: "Settings",
    profile: "Profile",
    language: "Language",
    about: "About",
    privacyPolicy: "Privacy Policy",
    sourceCode: "Source Code",
    securityAudit: "Security Audit",

    // Profile delete (NEW)
    deleteProfile: "Delete Profile",
    deleteProfileDesc:
      "Permanently delete your profile, chats and messages from the server. Your username will be available again.",
    deleteProfileConfirmTitle: "Delete Profile?",
    deleteProfileConfirmDescription:
      "This will permanently delete your profile, all chats and messages from the server. This cannot be undone.",
    deleteProfileConfirmButton: "Delete permanently",
    deletingProfile: "Deleting...",
    profileDeleted: "Profile deleted successfully",
    profileDeleteError: "Failed to delete profile",

    // Common
    cancel: "Cancel",
    error: "Error",
    success: "Success",

    // Welcome page additions
    welcomeBack: "Welcome back!",
    loginSuccess: "Successfully logged in",
    loginFailed: "Invalid username or password",
    passwordRequired: "Password required",
    enterPassword: "Please enter a password",
    passwordTooShort: "Password too short",
    passwordMinLength: "Password must be at least 6 characters long",
    accountCreated: "Your secure identity has been created",
    registrationFailed: "Registration Failed",
    accountCreationFailed: "Failed to create account",
    noPhoneRequired: "No phone or email required",
    selfDestructing: "Self-destructing messages",
    zeroDataRetention: "Zero data retention",
    chooseIdentity: "Choose Your Identity",
    enterCredentials: "Enter your existing username and password",
    features: "Features",

    // Security notice translations
    messagesNotStored: "Your messages are never stored on our servers",
    openSourceAudited: "Open source • Audited • Transparent",

    // Chat error messages
    notConnected: "Not connected! Please wait for connection to be established.",
    selectChatFirst: "Please select a chat and ensure you're connected before uploading files.",
    fileTooLarge: "File too large! Maximum size is 10MB.",
    failedToReadFile: "Failed to read image file",
    selectChatPhoto: "Please select a chat and ensure you're connected before taking photos.",

    // Feature titles
    endToEndEncryption: "End-to-End Encryption",
    anonymousAccess: "Anonymous Access",
    zeroStorage: "Zero Storage",

    // Chat management
    deleteChatTitle: "Delete Chat",
    deleteChatDescription:
      "Are you sure you want to delete this chat with {username}? This action cannot be undone and will only remove the chat from your side.",
    chatDeleted: "Chat deleted successfully",
    chatDeleteError: "Failed to delete chat",

    blockUserTitle: "Block User",
    blockUserDescription:
      "Are you sure you want to block {username}? They will no longer be able to send you messages.",
    userBlocked: "User {username} has been blocked",
    userBlockError: "Failed to block user",
    unblockUser: "Unblock User",
    userUnblocked: "User {username} has been unblocked",
    deleting: "Deleting...",
    blocking: "Blocking...",

    // Imprint and Legal
    imprint: "Imprint",
    frequentlyAskedQuestions: "Frequently Asked Questions",
    operatorInfo: "Operator Information",
    secureMessaging: "Secure Anonymous Messaging Service",
    anonymousService: "No registration required",
    contact: "Contact",
    contactInfo: "General inquiries",
    technicalSupport: "Technical support",
    dataProtection: "Data Protection",
    dataProtectionInfo:
      "We process no personal data. All messages are encrypted end-to-end and automatically deleted. No logs, no tracking, no data retention.",
    legalNotice: "Legal Notice",
    legalNoticeText:
      "This service is provided as-is. Users are responsible for complying with local laws. We do not monitor or store message content.",
    encryptionInfo:
      "All messages use RSA-2048 end-to-end encryption. Private keys are generated locally and never transmitted to our servers.",
    serverInfo: "Server Information",
    howItWorks: "How It Works",
    serverExplanation: "Whispergram uses a minimal server architecture designed for maximum privacy:",
    serverPoint1: "WebSocket connections for real-time messaging without data persistence",
    serverPoint2: "Temporary message routing - messages are deleted immediately after delivery",
    serverPoint3: "No user databases - only temporary session management",
    serverPoint4: "Automatic cleanup removes all traces of conversations",
    infrastructure: "Infrastructure",
    infrastructureInfo:
      "Our servers run on secure infrastructure with automated message deletion, zero-knowledge architecture, and no logging policies.",
    securityInfo:
      "End-to-end encryption ensures only you and your contact can read messages. Our servers cannot decrypt your communications.",
    back: "Back",

    // FAQ
    faq1Question: "How does end-to-end encryption work?",
    faq1Answer:
      "Every user generates a unique RSA-2048 key pair locally. Messages are encrypted with the recipient's public key and can only be decrypted with their private key, which never leaves their device.",
    faq2Question: "Are my messages stored on servers?",
    faq2Answer:
      "No. Messages are transmitted through our servers but are immediately deleted after delivery. We use temporary memory storage with automatic cleanup every 10 seconds.",
    faq3Question: "Can I recover deleted messages?",
    faq3Answer:
      "No. Self-destructing messages are permanently deleted and cannot be recovered. This is by design to ensure maximum privacy.",
    faq4Question: "Do I need to provide personal information?",
    faq4Answer:
      "No personal information required. You can use generated usernames or create your own. No email, phone number, or real name needed.",
    faq5Question: "How long do messages last?",
    faq5Answer:
      "Messages have a configurable expiration timer (default 24 hours). They are automatically deleted from all devices when the timer expires.",
    faq6Question: "Can I send files and images?",
    faq6Answer:
      "Yes. Images are converted to Base64 and encrypted. Other files are uploaded securely with a 10MB size limit. All files are automatically deleted with messages.",
    faq7Question: "Is the service really anonymous?",
    faq7Answer:
      "Yes. We don't collect IP addresses, don't require registration, and don't store any user data. Your identity remains completely private.",
    faq8Question: "What happens if I lose my private key?",
    faq8Answer:
      "If you lose your private key, you cannot decrypt old messages. This is the tradeoff for maximum security - we cannot help recover lost keys.",
    faq9Question: "Can the service be used for illegal activities?",
    faq9Answer:
      "Users are responsible for complying with local laws. While we provide privacy tools, we do not endorse illegal activities.",
    faq10Question: "Is the source code available?",
    faq10Answer:
      "Yes. Whispergram is open source and can be audited for security. The code is available for review and self-hosting.",
  },

  de: {
    // App / General
    appName: "VelumChat",
    versionLabel: "{app} v{version}",

    // Welcome Page
    welcome: "Willkommen bei Whispergram",
    welcomeDescription: "Sichere, anonyme Nachrichten mit Ende-zu-Ende-Verschlüsselung",
    createAccount: "Konto erstellen",
    login: "Anmelden",
    username: "Benutzername",
    password: "Passwort",
    chooseUsername: "Wählen Sie Ihren Benutzernamen",
    chooseUsernameHint: "Wählen Sie einen beliebigen Benutzernamen (mindestens 3 Zeichen)",
    usernameRequired: "Benutzername erforderlich",
    enterUsername: "Bitte geben Sie einen Benutzernamen ein",
    usernameTooShort: "Benutzername zu kurz",
    usernameMinLength: "Benutzername muss mindestens 3 Zeichen lang sein",

    // Chat
    searchUsers: "Benutzer suchen...",
    searchChats: "Chats durchsuchen...",
    startChat: "Chat starten",
    typeMessage: "Nachricht eingeben...",
    sendMessage: "Senden",
    online: "Online",
    offline: "Offline",
    connecting: "Verbindung...",
    settings: "Einstellungen",
    newChat: "Neuer Chat",
    noChats: "Noch keine Chats",
    noChatDescription: "Suchen Sie nach Benutzern um verschlüsselte Chats zu starten",
    encryptedChat: "Verschlüsselter Chat",
    loadingChats: "Lade Chats...",
    deleteChat: "Chat löschen",
    blockUser: "{username} blockieren",
    copyInviteLink: "Einladungslink kopieren",
    chatStatistics: "Chat-Statistiken",
    clearChat: "Chat leeren",
    autoDestruct: "Selbstzerstörung",
    chatWith: "Chat mit {username}",
    chatStatsText:
      "Chat-Statistiken:\n- Nachrichten insgesamt: {messages}\n- Partner: {partner}\n- Verschlüsselung: Aktiv",
    clearChatConfirm: "Sind Sie sicher, dass Sie diesen Chat mit {username} leeren möchten?",
    clearChatImplemented: "Chat-Leerung würde hier implementiert",

    // Settings (minimal)
    settingsTitle: "Einstellungen",
    profile: "Profil",
    language: "Sprache",
    about: "Über",
    privacyPolicy: "Datenschutz",
    sourceCode: "Quellcode",
    securityAudit: "Sicherheitsprüfung",

    // Profile delete (NEW)
    deleteProfile: "Profil löschen",
    deleteProfileDesc:
      "Löscht dein Profil, Chats und Nachrichten dauerhaft vom Server. Dein Benutzername wird wieder frei.",
    deleteProfileConfirmTitle: "Profil löschen?",
    deleteProfileConfirmDescription:
      "Damit wird dein Profil inkl. aller Chats und Nachrichten dauerhaft vom Server gelöscht. Das kann nicht rückgängig gemacht werden.",
    deleteProfileConfirmButton: "Endgültig löschen",
    deletingProfile: "Wird gelöscht...",
    profileDeleted: "Profil erfolgreich gelöscht",
    profileDeleteError: "Profil konnte nicht gelöscht werden",

    // Common
    cancel: "Abbrechen",
    error: "Fehler",
    success: "Erfolg",

    // Welcome page additions
    welcomeBack: "Willkommen zurück!",
    loginSuccess: "Erfolgreich angemeldet",
    loginFailed: "Ungültiger Benutzername oder Passwort",
    passwordRequired: "Passwort erforderlich",
    enterPassword: "Bitte geben Sie ein Passwort ein",
    passwordTooShort: "Passwort zu kurz",
    passwordMinLength: "Passwort muss mindestens 6 Zeichen lang sein",
    accountCreated: "Ihre sichere Identität wurde erstellt",
    registrationFailed: "Registrierung fehlgeschlagen",
    accountCreationFailed: "Konto konnte nicht erstellt werden",
    noPhoneRequired: "Keine Telefonnummer oder E-Mail erforderlich",
    selfDestructing: "Selbstzerstörende Nachrichten",
    zeroDataRetention: "Keine Datenspeicherung",
    chooseIdentity: "Wählen Sie Ihre Identität",
    enterCredentials: "Geben Sie Ihren vorhandenen Benutzernamen und Ihr Passwort ein",
    features: "Funktionen",

    // Security notice translations
    messagesNotStored: "Ihre Nachrichten werden niemals auf unseren Servern gespeichert",
    openSourceAudited: "Open Source • Geprüft • Transparent",

    // Chat error messages
    notConnected: "Nicht verbunden! Bitte warten Sie, bis die Verbindung hergestellt ist.",
    selectChatFirst:
      "Bitte wählen Sie einen Chat und stellen Sie sicher, dass Sie verbunden sind, bevor Sie Dateien hochladen.",
    fileTooLarge: "Datei zu groß! Maximale Größe ist 10MB.",
    failedToReadFile: "Fehler beim Lesen der Bilddatei",
    selectChatPhoto:
      "Bitte wählen Sie einen Chat und stellen Sie sicher, dass Sie verbunden sind, bevor Sie Fotos aufnehmen.",

    // Feature titles
    endToEndEncryption: "Ende-zu-Ende-Verschlüsselung",
    anonymousAccess: "Anonymer Zugang",
    zeroStorage: "Keine Speicherung",

    // Chat management
    deleteChatTitle: "Chat löschen",
    deleteChatDescription:
      "Sind Sie sicher, dass Sie diesen Chat mit {username} löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden und entfernt den Chat nur von Ihrer Seite.",
    chatDeleted: "Chat erfolgreich gelöscht",
    chatDeleteError: "Fehler beim Löschen des Chats",

    blockUserTitle: "Benutzer blockieren",
    blockUserDescription:
      "Sind Sie sicher, dass Sie {username} blockieren möchten? Sie können Ihnen dann keine Nachrichten mehr senden.",
    userBlocked: "Benutzer {username} wurde blockiert",
    userBlockError: "Fehler beim Blockieren des Benutzers",
    unblockUser: "Benutzer entsperren",
    userUnblocked: "Benutzer {username} wurde entsperrt",
    deleting: "Wird gelöscht...",
    blocking: "Wird blockiert...",

    // Imprint and Legal
    imprint: "Impressum",
    frequentlyAskedQuestions: "Häufig gestellte Fragen",
    operatorInfo: "Betreiberinformationen",
    secureMessaging: "Sichere anonyme Nachrichten-Service",
    anonymousService: "Keine Registrierung erforderlich",
    contact: "Kontakt",
    contactInfo: "Allgemeine Anfragen",
    technicalSupport: "Technischer Support",
    dataProtection: "Datenschutz",
    dataProtectionInfo:
      "Wir verarbeiten keine persönlichen Daten. Alle Nachrichten sind Ende-zu-Ende verschlüsselt und werden automatisch gelöscht. Keine Logs, kein Tracking, keine Datenspeicherung.",
    legalNotice: "Rechtlicher Hinweis",
    legalNoticeText:
      "Dieser Service wird wie besehen bereitgestellt. Nutzer sind für die Einhaltung örtlicher Gesetze verantwortlich. Wir überwachen oder speichern keine Nachrichteninhalte.",
    encryptionInfo:
      "Alle Nachrichten verwenden RSA-2048 Ende-zu-Ende-Verschlüsselung. Private Schlüssel werden lokal generiert und niemals an unsere Server übertragen.",
    serverInfo: "Server-Informationen",
    howItWorks: "Wie es funktioniert",
    serverExplanation:
      "Whispergram verwendet eine minimale Server-Architektur für maximale Privatsphäre:",
    serverPoint1: "WebSocket-Verbindungen für Echtzeit-Nachrichten ohne Datenpersistierung",
    serverPoint2: "Temporäre Nachrichtenweiterleitung - Nachrichten werden sofort nach Zustellung gelöscht",
    serverPoint3: "Keine Nutzerdatenbanken - nur temporäres Session-Management",
    serverPoint4: "Automatische Bereinigung entfernt alle Spuren von Unterhaltungen",
    infrastructure: "Infrastruktur",
    infrastructureInfo:
      "Unsere Server laufen auf sicherer Infrastruktur mit automatischer Nachrichtenlöschung, Zero-Knowledge-Architektur und No-Logging-Richtlinien.",
    securityInfo:
      "Ende-zu-Ende-Verschlüsselung stellt sicher, dass nur Sie und Ihr Kontakt Nachrichten lesen können. Unsere Server können Ihre Kommunikation nicht entschlüsseln.",
    back: "Zurück",

    // FAQ
    faq1Question: "Wie funktioniert Ende-zu-Ende-Verschlüsselung?",
    faq1Answer:
      "Jeder Nutzer generiert lokal ein einzigartiges RSA-2048-Schlüsselpaar. Nachrichten werden mit dem öffentlichen Schlüssel des Empfängers verschlüsselt und können nur mit dessen privatem Schlüssel entschlüsselt werden, der das Gerät nie verlässt.",
    faq2Question: "Werden meine Nachrichten auf Servern gespeichert?",
    faq2Answer:
      "Nein. Nachrichten werden über unsere Server übertragen, aber sofort nach Zustellung gelöscht. Wir verwenden temporären Arbeitsspeicher mit automatischer Bereinigung alle 10 Sekunden.",
    faq3Question: "Kann ich gelöschte Nachrichten wiederherstellen?",
    faq3Answer:
      "Nein. Selbstzerstörende Nachrichten werden dauerhaft gelöscht und können nicht wiederhergestellt werden. Das ist beabsichtigt für maximale Privatsphäre.",
    faq4Question: "Muss ich persönliche Informationen angeben?",
    faq4Answer:
      "Keine persönlichen Informationen erforderlich. Sie können generierte Benutzernamen verwenden oder eigene erstellen. Keine E-Mail, Telefonnummer oder echter Name nötig.",
    faq5Question: "Wie lange bleiben Nachrichten bestehen?",
    faq5Answer:
      "Nachrichten haben einen konfigurierbaren Ablauf-Timer (Standard 24 Stunden). Sie werden automatisch von allen Geräten gelöscht, wenn der Timer abläuft.",
    faq6Question: "Kann ich Dateien und Bilder senden?",
    faq6Answer:
      "Ja. Bilder werden zu Base64 konvertiert und verschlüsselt. Andere Dateien werden sicher hochgeladen mit einem 10MB-Limit. Alle Dateien werden automatisch mit Nachrichten gelöscht.",
    faq7Question: "Ist der Service wirklich anonym?",
    faq7Answer:
      "Ja. Wir sammeln keine IP-Adressen, benötigen keine Registrierung und speichern keine Nutzerdaten. Ihre Identität bleibt vollständig privat.",
    faq8Question: "Was passiert, wenn ich meinen privaten Schlüssel verliere?",
    faq8Answer:
      "Wenn Sie Ihren privaten Schlüssel verlieren, können Sie alte Nachrichten nicht entschlüsseln. Das ist der Kompromiss für maximale Sicherheit - wir können nicht bei der Wiederherstellung verlorener Schlüssel helfen.",
    faq9Question: "Kann der Service für illegale Aktivitäten genutzt werden?",
    faq9Answer:
      "Nutzer sind für die Einhaltung örtlicher Gesetze verantwortlich. Während wir Privatsphäre-Tools bereitstellen, unterstützen wir keine illegalen Aktivitäten.",
    faq10Question: "Ist der Quellcode verfügbar?",
    faq10Answer:
      "Ja. Whispergram ist Open Source und kann auf Sicherheit geprüft werden. Der Code ist für Überprüfung und Selbst-Hosting verfügbar.",
  },

  ru: {
    appName: "VelumChat",
    versionLabel: "{app} v{version}",

    welcome: "Добро пожаловать в Whispergram",
    welcomeDescription: "Безопасные анонимные сообщения с шифрованием точка-точка",
    createAccount: "Создать аккаунт",
    login: "Войти",
    username: "Имя пользователя",
    password: "Пароль",
    chooseUsername: "Выберите имя пользователя",
    chooseUsernameHint: "Выберите любое имя пользователя (минимум 3 символа)",
    enterCredentials: "Введите существующее имя пользователя и пароль",

    searchUsers: "Поиск пользователей...",
    searchChats: "Поиск чатов...",
    startChat: "Начать чат",
    typeMessage: "Введите сообщение...",
    sendMessage: "Отправить",
    online: "В сети",
    offline: "Не в сети",
    connecting: "Подключение...",
    settings: "Настройки",
    newChat: "Новый чат",
    noChats: "Пока нет чатов",
    noChatDescription: "Найдите пользователей для зашифрованных чатов",
    encryptedChat: "Зашифрованный чат",
    loadingChats: "Загрузка чатов...",
    deleteChat: "Удалить чат",

    settingsTitle: "Настройки",
    profile: "Профиль",
    language: "Язык",
    about: "О программе",
    privacyPolicy: "Политика конфиденциальности",
    sourceCode: "Исходный код",
    securityAudit: "Аудит безопасности",

    deleteProfile: "Удалить профиль",
    deleteProfileDesc:
      "Навсегда удаляет профиль, чаты и сообщения с сервера. Имя пользователя снова станет доступным.",
    deleteProfileConfirmTitle: "Удалить профиль?",
    deleteProfileConfirmDescription:
      "Профиль, все чаты и сообщения будут навсегда удалены с сервера. Отменить нельзя.",
    deleteProfileConfirmButton: "Удалить навсегда",
    deletingProfile: "Удаление...",
    profileDeleted: "Профиль успешно удалён",
    profileDeleteError: "Не удалось удалить профиль",

    cancel: "Отмена",
    error: "Ошибка",
    success: "Успех",
  },

  es: {
    appName: "VelumChat",
    versionLabel: "{app} v{version}",

    welcome: "Bienvenido a Whispergram",
    welcomeDescription: "Mensajería segura y anónima con cifrado de extremo a extremo",
    createAccount: "Crear cuenta",
    login: "Iniciar sesión",
    username: "Nombre de usuario",
    password: "Contraseña",
    chooseUsername: "Elige tu nombre de usuario",
    chooseUsernameHint: "Elige cualquier nombre de usuario (mínimo 3 caracteres)",
    enterCredentials: "Ingresa tu nombre de usuario y contraseña existentes",

    searchUsers: "Buscar usuarios...",
    searchChats: "Buscar chats...",
    startChat: "Iniciar chat",
    typeMessage: "Escribe un mensaje...",
    sendMessage: "Enviar",
    online: "En línea",
    offline: "Desconectado",
    connecting: "Conectando...",
    settings: "Configuración",
    newChat: "Nuevo chat",
    noChats: "Aún no hay chats",
    noChatDescription: "Busca usuarios para iniciar chats cifrados",
    encryptedChat: "Chat cifrado",
    loadingChats: "Cargando chats...",
    deleteChat: "Eliminar chat",

    settingsTitle: "Configuración",
    profile: "Perfil",
    language: "Idioma",
    about: "Acerca de",
    privacyPolicy: "Política de privacidad",
    sourceCode: "Código fuente",
    securityAudit: "Auditoría de seguridad",

    deleteProfile: "Eliminar perfil",
    deleteProfileDesc:
      "Elimina permanentemente tu perfil, chats y mensajes del servidor. Tu nombre de usuario quedará libre otra vez.",
    deleteProfileConfirmTitle: "¿Eliminar perfil?",
    deleteProfileConfirmDescription:
      "Tu perfil, todos los chats y mensajes serán eliminados permanentemente del servidor. No se puede deshacer.",
    deleteProfileConfirmButton: "Eliminar permanentemente",
    deletingProfile: "Eliminando...",
    profileDeleted: "Perfil eliminado correctamente",
    profileDeleteError: "No se pudo eliminar el perfil",

    cancel: "Cancelar",
    error: "Error",
    success: "Éxito",
  },

  tr: {
    appName: "VelumChat",
    versionLabel: "{app} v{version}",

    welcome: "Whispergram'a Hoş Geldiniz",
    welcomeDescription: "Uçtan uca şifrelemeli güvenli, anonim mesajlaşma",
    createAccount: "Hesap Oluştur",
    login: "Giriş Yap",
    username: "Kullanıcı Adı",
    password: "Şifre",
    chooseUsername: "Kullanıcı adınızı seçin",
    chooseUsernameHint: "Herhangi bir kullanıcı adı seçin (minimum 3 karakter)",
    enterCredentials: "Mevcut kullanıcı adınızı ve şifrenizi girin",

    searchUsers: "Kullanıcı ara...",
    searchChats: "Sohbet ara...",
    startChat: "Sohbet Başlat",
    typeMessage: "Mesaj yazın...",
    sendMessage: "Gönder",
    online: "Çevrimiçi",
    offline: "Çevrimdışı",
    connecting: "Bağlanıyor...",
    settings: "Ayarlar",
    newChat: "Yeni sohbet",
    noChats: "Henüz sohbet yok",
    noChatDescription: "Şifreli sohbet başlatmak için kullanıcı ara",
    encryptedChat: "Şifreli sohbet",
    loadingChats: "Sohbetler yükleniyor...",
    deleteChat: "Sohbeti sil",

    settingsTitle: "Ayarlar",
    profile: "Profil",
    language: "Dil",
    about: "Hakkında",
    privacyPolicy: "Gizlilik politikası",
    sourceCode: "Kaynak kod",
    securityAudit: "Güvenlik denetimi",

    deleteProfile: "Profili Sil",
    deleteProfileDesc:
      "Profilini, sohbetlerini ve mesajlarını sunucudan kalıcı olarak siler. Kullanıcı adın tekrar boşta olur.",
    deleteProfileConfirmTitle: "Profil silinsin mi?",
    deleteProfileConfirmDescription:
      "Profilin, tüm sohbetlerin ve mesajların sunucudan kalıcı olarak silinecek. Geri alınamaz.",
    deleteProfileConfirmButton: "Kalıcı olarak sil",
    deletingProfile: "Siliniyor...",
    profileDeleted: "Profil başarıyla silindi",
    profileDeleteError: "Profil silinemedi",

    cancel: "İptal",
    error: "Hata",
    success: "Başarılı",
  },
} as const;

// Language context and hook
import React, { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations.en, params?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("whispergram-language");
    // fallback falls jemand noch "fr" gespeichert hatte
    if (saved && (saved === "en" || saved === "de" || saved === "ru" || saved === "es" || saved === "tr")) {
      return saved as Language;
    }
    return "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("whispergram-language", lang);
  };

  const t = (key: keyof typeof translations.en, params?: Record<string, string>): string => {
    let text = (translations as any)[language]?.[key] || (translations as any).en?.[key] || String(key);

    if (params) {
      Object.entries(params).forEach(([param, value]) => {
        text = text.replace(`{${param}}`, value);
      });
    }

    return text;
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}