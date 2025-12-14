import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { wsMessageSchema, loginUserSchema, type WSMessage } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// ============================
// Uploads
// ============================
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

interface ConnectedClient {
  ws: WebSocket;
  userId: number;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const connectedClients = new Map<number, ConnectedClient>();

  // ============================
  // Helpers
  // ============================
  function hashPassword(password: string): string {
    return crypto.createHash("sha256").update(password).digest("hex");
  }

  function verifyPassword(password: string, hash: string): boolean {
    return crypto.createHash("sha256").update(password).digest("hex") === hash;
  }

  function safeJson(res: any, status: number, payload: any) {
    return res.status(status).json(payload);
  }

  function broadcast(message: any, excludeUserId?: number) {
    for (const client of connectedClients.values()) {
      if (excludeUserId && client.userId === excludeUserId) continue;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Client schickt bei dir manchmal Sekunden (text) und manchmal Millisekunden (image/file).
   * Damit es überall funktioniert, normalisieren wir hier:
   * - wenn Wert > 1_000_000 -> sehr wahrscheinlich ms -> in Sekunden umrechnen
   * - sonst als Sekunden behandeln
   * minimum 5s
   */
  function normalizeDestructTimerToSeconds(value: any): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 86400; // default 24h
    const seconds = n > 1_000_000 ? Math.floor(n / 1000) : Math.floor(n);
    return Math.max(5, seconds);
  }

  // ============================
  // REST API (NUR EIN LOGIN/REGISTER!)
  // ============================

  // Register
  app.post("/api/register", async (req, res) => {
    try {
      const { username, password, publicKey } = req.body;

      if (!username || !password || !publicKey) {
        return safeJson(res, 400, { message: "username, password, publicKey required" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) return safeJson(res, 409, { message: "Username already exists" });

      const user = await storage.createUser({
        username,
        passwordHash: hashPassword(password),
        publicKey,
      });

      return res.json({
        user: { id: user.id, username: user.username, publicKey: user.publicKey },
      });
    } catch (err) {
      console.error("❌ Registration error:", err);
      return safeJson(res, 500, { message: "Registration failed" });
    }
  });

  // Login
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = loginUserSchema.parse(req.body);

      const user = await storage.getUserByUsername(username);
      if (!user) return safeJson(res, 401, { message: "Invalid username or password" });

      if (!verifyPassword(password, (user as any).passwordHash)) {
        return safeJson(res, 401, { message: "Invalid username or password" });
      }

      await storage.updateUserOnlineStatus(user.id, true);

      return res.json({
        user: { id: user.id, username: user.username, publicKey: (user as any).publicKey },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return safeJson(res, 400, { message: "Invalid input", errors: err.errors });
      }
      console.error("❌ Login error:", err);
      return safeJson(res, 500, { message: "Login failed" });
    }
  });

  // Search users (für "Chat starten")
  app.get("/api/search-users", async (req, res) => {
    try {
      const query = String(req.query.q || "");
      const excludeId = Number(req.query.excludeId || req.query.exclude || 0) || 0;

      if (!query.trim()) return res.json([]);

      const users = await storage.searchUsers(query, excludeId);
      return res.json(users);
    } catch (err) {
      console.error("Search users error:", err);
      return safeJson(res, 500, { message: "Failed to search users" });
    }
  });

  // Create/Get chat between two users
  app.post("/api/chats", async (req, res) => {
    try {
      const { participant1Id, participant2Id } = req.body;
      if (!participant1Id || !participant2Id) {
        return safeJson(res, 400, { message: "participant1Id and participant2Id required" });
      }
      const chat = await storage.getOrCreateChatByParticipants(Number(participant1Id), Number(participant2Id));
      return res.json(chat);
    } catch (err) {
      console.error("Create chat error:", err);
      return safeJson(res, 500, { message: "Failed to create chat" });
    }
  });

  // Get chats (WhatsApp Sidebar)
  app.get("/api/chats/:userId", async (req, res) => {
    try {
      const userId = Number(req.params.userId);

      // Wenn dein Storage "deletedChats" unterstützt und filtern kann:
      const list =
        (storage as any).getPersistentChatContacts
          ? await (storage as any).getPersistentChatContacts(userId)
          : await storage.getChatsByUserId(userId);

      return res.json(list);
    } catch (err) {
      console.error("Get chats error:", err);
      return safeJson(res, 500, { message: "Failed to fetch chats" });
    }
  });

  // Get messages
  app.get("/api/chats/:chatId/messages", async (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const msgs = await storage.getMessagesByChat(chatId);
      return res.json(msgs);
    } catch (err) {
      console.error("Get messages error:", err);
      return safeJson(res, 500, { message: "Failed to fetch messages" });
    }
  });

  // Mark chat read
  app.post("/api/chats/:chatId/mark-read", async (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = Number(req.body.userId);
      if (!userId) return safeJson(res, 400, { error: "userId required" });

      await storage.resetUnreadCount(chatId, userId);
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to mark chat as read:", err);
      return safeJson(res, 500, { error: "Failed to mark chat as read" });
    }
  });

  // Delete chat for user (WhatsApp-style)
  app.post("/api/chats/:chatId/delete", async (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const userId = Number(req.body.userId);

      if (!userId || !chatId) return safeJson(res, 400, { error: "userId and chatId required" });

      await storage.deleteChatForUser(userId, chatId);
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete chat:", err);
      return safeJson(res, 500, { error: "Failed to delete chat" });
    }
  });

  // Block user
  app.post("/api/users/:userId/block", async (req, res) => {
    try {
      const blockedUserId = Number(req.params.userId);
      const blockerId = Number(req.body.blockerId);
      if (!blockerId || !blockedUserId) return safeJson(res, 400, { error: "blockerId and userId required" });

      await storage.blockUser(blockerId, blockedUserId);
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to block user:", err);
      return safeJson(res, 500, { error: "Failed to block user" });
    }
  });

  // Upload
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return safeJson(res, 400, { message: "No file uploaded" });

      return res.json({
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        url: `/uploads/${req.file.filename}`,
      });
    } catch (err) {
      console.error("Upload error:", err);
      return safeJson(res, 500, { message: "Failed to upload file" });
    }
  });

  app.use("/uploads", express.static(uploadDir));

  // Debug clear-all (nur wenn MemStorage)
  app.post("/api/debug/clear-all", (_req, res) => {
    try {
      console.log("🧹 Clearing all storage data...");
      if ((storage as any).users?.clear) (storage as any).users.clear();
      if ((storage as any).messages?.clear) (storage as any).messages.clear();
      if ((storage as any).chats?.clear) (storage as any).chats.clear();
      if ("userIdCounter" in (storage as any)) (storage as any).userIdCounter = 1;
      if ("messageIdCounter" in (storage as any)) (storage as any).messageIdCounter = 1;
      if ("chatIdCounter" in (storage as any)) (storage as any).chatIdCounter = 1;
      console.log("✅ All data cleared");
      return res.json({ success: true, message: "All data cleared" });
    } catch (e) {
      console.error("clear-all error:", e);
      return safeJson(res, 500, { success: false });
    }
  });

  // ============================
  // WebSocket (gehärtet + typing realtime)
  // ============================

  const ipConnCount = new Map<string, number>();
  const MAX_CONNS_PER_IP = 10;

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    maxPayload: 32 * 1024, // 32KB
    perMessageDeflate: false,
  });

  // Heartbeat
  setInterval(() => {
    wss.clients.forEach((client: any) => {
      if (client.isAlive === false) return client.terminate();
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  // Cleanup expired messages (robust bei void-return)
  setInterval(async () => {
    try {
      const result = await (storage as any).deleteExpiredMessages?.();
      const deletedCount = typeof result === "number" ? result : 0;
      if (deletedCount > 0) console.log(`🧹 Cleaned up ${deletedCount} expired messages`);
    } catch (err) {
      console.error("❌ Error during message cleanup:", err);
    }
  }, 300000);

  console.log("🧹 Message cleanup scheduler started (every 5 minutes)");

  wss.on("connection", (ws: any, req: any) => {
    // Origin allowlist
    const origin = req.headers.origin;
    const allowedOrigins = new Set([
      "https://whisper3.onrender.com",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);

    if (origin && !allowedOrigins.has(origin)) {
      ws.close(1008, "Origin not allowed");
      return;
    }

    // IP detect
    const xff = req.headers["x-forwarded-for"];
    const ip =
      typeof xff === "string" && xff.length > 0
        ? xff.split(",")[0].trim()
        : req.socket?.remoteAddress || "unknown";

    // IP conn limit
    const curr = ipConnCount.get(ip) ?? 0;
    if (curr >= MAX_CONNS_PER_IP) {
      ws.close(1013, "Too many connections");
      return;
    }
    ipConnCount.set(ip, curr + 1);

    ws.on("close", () => {
      const now = (ipConnCount.get(ip) ?? 1) - 1;
      if (now <= 0) ipConnCount.delete(ip);
      else ipConnCount.set(ip, now);
    });

    // heartbeat flag
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));

    // rate limit: 25 msgs / 10s
    let tokens = 25;
    let last = Date.now();
    function takeToken() {
      const now = Date.now();
      const delta = (now - last) / 1000;
      last = now;
      tokens = Math.min(25, tokens + delta * 2.5);
      if (tokens >= 1) {
        tokens -= 1;
        return true;
      }
      return false;
    }

    let userId: number | null = null;

    ws.send(JSON.stringify({ type: "connection_established", message: "WebSocket connected successfully" }));

    ws.on("message", async (data: any) => {
      try {
        if (!takeToken()) {
          ws.close(1013, "Rate limited");
          return;
        }

        const raw = data.toString();
        const parsed = JSON.parse(raw);

        // ✅ TYPING: direkt an receiverId
        if (parsed?.type === "typing") {
          const receiverId = Number(parsed.receiverId);
          const senderId = Number(parsed.senderId);
          const chatId = Number(parsed.chatId);
          const isTypingNow = Boolean(parsed.isTyping);

          const receiverClient = connectedClients.get(receiverId);
          if (receiverClient?.ws?.readyState === WebSocket.OPEN) {
            receiverClient.ws.send(JSON.stringify({ type: "typing", chatId, senderId, receiverId, isTyping: isTypingNow }));
          }
          return;
        }

        // Normal WS messages (join, message, etc.)
        let validatedMessage: WSMessage;

        if (parsed.type === "message") {
          const msgData = parsed.message || parsed;
          validatedMessage = {
            // @ts-ignore
            type: "message",
            chatId: msgData.chatId || null,
            senderId: msgData.senderId,
            receiverId: msgData.receiverId,
            content: msgData.content,
            messageType: msgData.messageType || "text",
            fileName: msgData.fileName,
            fileSize: msgData.fileSize,
            destructTimer: msgData.destructTimer || 86400,
          } as any;
        } else {
          validatedMessage = wsMessageSchema.parse(parsed);
        }

        switch (validatedMessage.type) {
          case "join": {
            userId = validatedMessage.userId;
            connectedClients.set(userId, { ws, userId });
            await storage.updateUserOnlineStatus(userId, true);

            ws.send(JSON.stringify({ type: "join_confirmed", userId, message: `User ${userId} joined successfully` }));
            broadcast({ type: "user_status", userId, isOnline: true }, userId);
            break;
          }

          case "message": {
            if (!userId) {
              ws.send(JSON.stringify({ type: "error", message: "User not joined - send join first" }));
              return;
            }

            const senderId = Number((validatedMessage as any).senderId);
            const receiverId = Number((validatedMessage as any).receiverId);

            const chat = await storage.getOrCreateChatByParticipants(senderId, receiverId);

            // ✅ robust
            const destructSeconds = normalizeDestructTimerToSeconds((validatedMessage as any).destructTimer);
            const expiresAt = new Date(Date.now() + destructSeconds * 1000);

            const content = (validatedMessage as any).content;
            const isEncrypted =
              (validatedMessage as any).messageType === "text" &&
              content &&
              content.length > 100 &&
              /^[A-Za-z0-9+/=]+$/.test(content);

            const newMessage = await storage.createMessage({
              chatId: chat.id,
              senderId,
              receiverId,
              content,
              messageType: (validatedMessage as any).messageType,
              fileName: (validatedMessage as any).fileName,
              fileSize: (validatedMessage as any).fileSize,
              isEncrypted,
              expiresAt,
            });

            // unread receiver
            await storage.incrementUnreadCount(chat.id, receiverId);
            await storage.updateChatLastMessage(chat.id, newMessage.id);

            // ack sender
            ws.send(JSON.stringify({ type: "message_sent", messageId: newMessage.id, chatId: newMessage.chatId, success: true }));

            // realtime push (sender + receiver)
            const payload = { type: "new_message", message: newMessage };

            const senderClient = connectedClients.get(senderId);
            if (senderClient?.ws?.readyState === WebSocket.OPEN) senderClient.ws.send(JSON.stringify(payload));

            const receiverClient = connectedClients.get(receiverId);
            if (receiverClient?.ws?.readyState === WebSocket.OPEN) receiverClient.ws.send(JSON.stringify(payload));

            break;
          }

          case "read_receipt":
            // optional later
            break;
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });

    ws.on("close", async () => {
      if (userId) {
        connectedClients.delete(userId);
        await storage.updateUserOnlineStatus(userId, false);
        broadcast({ type: "user_status", userId, isOnline: false }, userId);
      }
    });

    ws.on("error", (err: any) => {
      console.error("❌ WEBSOCKET ERROR:", err);
    });
  });

  return httpServer;
}
