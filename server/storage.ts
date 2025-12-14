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

// ============================
// Helpers
// ============================
function isProd() {
  return process.env.NODE_ENV === "production";
}

function toInt(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password: string, hash: string): boolean {
  return crypto.createHash("sha256").update(password).digest("hex") === hash;
}

function safeJson(res: any, status: number, payload: any) {
  return res.status(status).json(payload);
}

function errMessage(err: any) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (typeof err?.message === "string") return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * destructTimer normalisieren:
 * - wenn Client ms sendet -> Sekunden
 * - clamp min/max
 */
function normalizeDestructTimerSeconds(raw: any) {
  let t = toInt(raw, 86400);

  // Wenn jemand ms schickt (z.B. 300000), dann umrechnen
  if (t > 100000) t = Math.floor(t / 1000);

  // Minimum 5 Sekunden
  if (t < 5) t = 5;

  // Maximum 7 Tage
  const max = 7 * 24 * 60 * 60;
  if (t > max) t = max;

  return t;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const connectedClients = new Map<number, ConnectedClient>();

  function broadcast(message: any, excludeUserId?: number) {
    for (const client of connectedClients.values()) {
      if (excludeUserId && client.userId === excludeUserId) continue;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    }
  }

  // ============================
  // REST API
  // ============================

  // ✅ Health (damit du immer testen kannst)
  app.get("/api/health", (_req, res) => {
    return res.json({ ok: true, service: "whisper3", time: new Date().toISOString() });
  });

  // Register
  app.post("/api/register", async (req, res) => {
    try {
      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "");
      const publicKey = String(req.body?.publicKey || "");

      if (username.length < 3) {
        return safeJson(res, 400, { ok: false, message: "Username too short (min 3)" });
      }
      if (password.length < 6) {
        return safeJson(res, 400, { ok: false, message: "Password too short (min 6)" });
      }
      if (!publicKey) {
        return safeJson(res, 400, { ok: false, message: "publicKey is required" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return safeJson(res, 409, { ok: false, message: "Username already exists" });
      }

      // ✅ DB-SAFE: NUR Felder die InsertUser kennt
      const user = await storage.createUser({
        username,
        passwordHash: hashPassword(password),
        publicKey,
      } as any);

      await storage.updateUserOnlineStatus(user.id, true);

      return res.json({
        ok: true,
        user: { id: user.id, username: user.username, publicKey: user.publicKey },
      });
    } catch (err: any) {
      console.error("❌ Registration error:", err);

      // In DEV zeigen wir mehr, PROD kürzer
      return safeJson(res, 500, {
        ok: false,
        message: isProd() ? "Registration failed" : `Registration failed: ${errMessage(err)}`,
      });
    }
  });

  // Login
  app.post("/api/login", async (req, res) => {
    try {
      const parsed = loginUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return safeJson(res, 400, { ok: false, message: "Invalid input", errors: parsed.error.errors });
      }

      const username = String(parsed.data.username || "").trim();
      const password = String(parsed.data.password || "");

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return safeJson(res, 401, { ok: false, message: "Invalid username or password" });
      }

      // ✅ passt zu MemStorage + DatabaseStorage Schema
      const storedHash = (user as any).passwordHash;
      if (!storedHash) {
        console.error("❌ User has no passwordHash field:", user);
        return safeJson(res, 500, { ok: false, message: "User passwordHash missing in storage" });
      }

      if (!verifyPassword(password, storedHash)) {
        return safeJson(res, 401, { ok: false, message: "Invalid username or password" });
      }

      await storage.updateUserOnlineStatus(user.id, true);

      return res.json({
        ok: true,
        user: { id: user.id, username: user.username, publicKey: user.publicKey },
      });
    } catch (err: any) {
      console.error("❌ Login error:", err);
      return safeJson(res, 500, {
        ok: false,
        message: isProd() ? "Login failed" : `Login failed: ${errMessage(err)}`,
      });
    }
  });

  // Search users
  app.get("/api/search-users", async (req, res) => {
    try {
      const q = String(req.query?.q || "").trim();
      const excludeId = toInt(req.query?.exclude ?? req.query?.excludeId, 0);

      if (!q) return res.json([]);

      const users = await storage.searchUsers(q, excludeId);
      return res.json(users);
    } catch (err) {
      console.error("Search users error:", err);
      return safeJson(res, 500, { ok: false, message: "Failed to search users" });
    }
  });

  // Create/get chat between 2 users
  app.post("/api/chats", async (req, res) => {
    try {
      const participant1Id = toInt(req.body?.participant1Id, 0);
      const participant2Id = toInt(req.body?.participant2Id, 0);
      if (!participant1Id || !participant2Id) {
        return safeJson(res, 400, { ok: false, message: "participant1Id and participant2Id are required" });
      }

      const chat = await storage.getOrCreateChatByParticipants(participant1Id, participant2Id);
      return res.json({ ok: true, chat });
    } catch (err) {
      console.error("Create chat error:", err);
      return safeJson(res, 500, { ok: false, message: "Failed to create chat" });
    }
  });

  // Get chats
  app.get("/api/chats/:userId", async (req, res) => {
    try {
      const userId = toInt(req.params.userId, 0);
      if (!userId) return safeJson(res, 400, { ok: false, message: "Invalid userId" });

      const chats = await storage.getChatsByUserId(userId);
      return res.json(chats);
    } catch (err) {
      console.error("Get chats error:", err);
      return safeJson(res, 500, { ok: false, message: "Failed to fetch chats" });
    }
  });

  // Get messages for chat
  app.get("/api/chats/:chatId/messages", async (req, res) => {
    try {
      const chatId = toInt(req.params.chatId, 0);
      if (!chatId) return safeJson(res, 400, { ok: false, message: "Invalid chatId" });

      const msgs = await storage.getMessagesByChat(chatId);
      return res.json(msgs);
    } catch (err) {
      console.error("Get messages error:", err);
      return safeJson(res, 500, { ok: false, message: "Failed to fetch messages" });
    }
  });

  // Mark chat read
  app.post("/api/chats/:chatId/mark-read", async (req, res) => {
    try {
      const chatId = toInt(req.params.chatId, 0);
      const userId = toInt(req.body?.userId, 0);
      if (!chatId || !userId) return safeJson(res, 400, { ok: false, message: "chatId and userId required" });

      await storage.resetUnreadCount(chatId, userId);
      return res.json({ ok: true, success: true });
    } catch (err) {
      console.error("Mark read error:", err);
      return safeJson(res, 500, { ok: false, message: "Failed to mark chat as read" });
    }
  });

  // Delete chat for user
  app.post("/api/chats/:chatId/delete", async (req, res) => {
    try {
      const chatId = toInt(req.params.chatId, 0);
      const userId = toInt(req.body?.userId, 0);
      if (!chatId || !userId) return safeJson(res, 400, { ok: false, message: "chatId and userId required" });

      await storage.deleteChatForUser(userId, chatId);
      return res.json({ ok: true, success: true });
    } catch (err) {
      console.error("Delete chat error:", err);
      return safeJson(res, 500, { ok: false, message: "Failed to delete chat" });
    }
  });

  // Block user
  app.post("/api/users/:userId/block", async (req, res) => {
    try {
      const blockedUserId = toInt(req.params.userId, 0);
      const blockerId = toInt(req.body?.blockerId, 0);
      if (!blockedUserId || !blockerId) {
        return safeJson(res, 400, { ok: false, message: "blocked userId and blockerId required" });
      }

      await storage.blockUser(blockerId, blockedUserId);
      return res.json({ ok: true, success: true });
    } catch (err) {
      console.error("Block user error:", err);
      return safeJson(res, 500, { ok: false, message: "Failed to block user" });
    }
  });

  // Upload
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return safeJson(res, 400, { ok: false, message: "No file uploaded" });

      return res.json({
        ok: true,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        url: `/uploads/${req.file.filename}`,
      });
    } catch (err) {
      console.error("Upload error:", err);
      return safeJson(res, 500, { ok: false, message: "Failed to upload file" });
    }
  });

  app.use("/uploads", express.static(uploadDir));

  // ============================
  // WebSocket
  // ============================
  const ipConnCount = new Map<string, number>();
  const MAX_CONNS_PER_IP = 10;

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    maxPayload: 32 * 1024,
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

  // Cleanup expired messages
  setInterval(async () => {
    try {
      const deletedCount = await storage.deleteExpiredMessages();
      if (deletedCount > 0) console.log(`🧹 Cleaned up ${deletedCount} expired messages`);
    } catch (err) {
      console.error("❌ Error during message cleanup:", err);
    }
  }, 300000);

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

    let joinedUserId: number | null = null;

    ws.send(JSON.stringify({ type: "connection_established", ok: true }));

    ws.on("message", async (data: any) => {
      try {
        if (!takeToken()) {
          ws.close(1013, "Rate limited");
          return;
        }

        const raw = data.toString();
        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
          return;
        }

        // Typing
        if (parsed?.type === "typing") {
          const receiverId = toInt(parsed.receiverId, 0);
          const senderId = toInt(parsed.senderId, 0);
          const chatId = toInt(parsed.chatId, 0);
          const isTyping = Boolean(parsed.isTyping);

          if (!joinedUserId) return;
          if (senderId !== joinedUserId) return; // anti-spoof

          const receiverClient = connectedClients.get(receiverId);
          if (receiverClient?.ws?.readyState === WebSocket.OPEN) {
            receiverClient.ws.send(JSON.stringify({ type: "typing", chatId, senderId, receiverId, isTyping }));
          }
          return;
        }

        // Normal WS messages
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
          const safe = wsMessageSchema.safeParse(parsed);
          if (!safe.success) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid WS message", errors: safe.error.errors }));
            return;
          }
          validatedMessage = safe.data;
        }

        switch (validatedMessage.type) {
          case "join": {
            joinedUserId = (validatedMessage as any).userId;
            if (!joinedUserId) {
              ws.send(JSON.stringify({ type: "error", message: "Missing userId" }));
              return;
            }

            connectedClients.set(joinedUserId, { ws, userId: joinedUserId });
            await storage.updateUserOnlineStatus(joinedUserId, true);

            ws.send(JSON.stringify({ type: "join_confirmed", ok: true, userId: joinedUserId }));
            broadcast({ type: "user_status", userId: joinedUserId, isOnline: true }, joinedUserId);
            break;
          }

          case "message": {
            if (!joinedUserId) {
              ws.send(JSON.stringify({ type: "error", message: "User not joined - send join first" }));
              return;
            }

            const senderId = toInt((validatedMessage as any).senderId, 0);
            const receiverId = toInt((validatedMessage as any).receiverId, 0);

            if (!senderId || senderId !== joinedUserId) {
              ws.send(JSON.stringify({ type: "error", message: "Sender mismatch" }));
              return;
            }
            if (!receiverId) {
              ws.send(JSON.stringify({ type: "error", message: "Missing receiverId" }));
              return;
            }

            const chat = await storage.getOrCreateChatByParticipants(senderId, receiverId);

            // Re-activate chat if deleted for receiver
            try {
              const wasDeleted = await storage.isChatDeletedForUser(receiverId, chat.id);
              if (wasDeleted) await storage.reactivateChatForUser(receiverId, chat.id);
            } catch {}

            const destructTimerSec = normalizeDestructTimerSeconds((validatedMessage as any).destructTimer);
            const expiresAt = new Date(Date.now() + destructTimerSec * 1000);

            const content = (validatedMessage as any).content;

            const isEncrypted =
              (validatedMessage as any).messageType === "text" &&
              typeof content === "string" &&
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
            } as any);

            // unread receiver (DB needs this here; MemStorage already increments internally too,
            // aber bei MemStorage ist es ok wenn doppelt? -> nein. MemStorage incrementiert bereits in createMessage.
            // Wir prüfen Storage-Klasse:
            const storageName = (storage as any)?.constructor?.name?.toLowerCase?.() || "";
            const isMem = storageName.includes("mem");
            if (!isMem) {
              await storage.incrementUnreadCount(chat.id, receiverId);
            }

            await storage.updateChatLastMessage(chat.id, (newMessage as any).id);

            // ack sender
            ws.send(JSON.stringify({ type: "message_sent", ok: true, messageId: (newMessage as any).id, chatId: chat.id }));

            // realtime push
            const payload = { type: "new_message", message: newMessage };

            const senderClient = connectedClients.get(senderId);
            if (senderClient?.ws?.readyState === WebSocket.OPEN) senderClient.ws.send(JSON.stringify(payload));

            const receiverClient = connectedClients.get(receiverId);
            if (receiverClient?.ws?.readyState === WebSocket.OPEN) receiverClient.ws.send(JSON.stringify(payload));

            break;
          }

          case "read_receipt":
            // optional später
            break;
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
        try {
          ws.send(JSON.stringify({ type: "error", message: "WebSocket processing error" }));
        } catch {}
      }
    });

    ws.on("close", async () => {
      if (joinedUserId) {
        connectedClients.delete(joinedUserId);
        try {
          await storage.updateUserOnlineStatus(joinedUserId, false);
        } catch {}
        broadcast({ type: "user_status", userId: joinedUserId, isOnline: false }, joinedUserId);
      }
    });

    ws.on("error", (err: any) => {
      console.error("❌ WEBSOCKET ERROR:", err);
    });
  });

  return httpServer;
}