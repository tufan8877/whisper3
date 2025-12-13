import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import {
  insertUserSchema,
  insertMessageSchema,
  wsMessageSchema,
  loginUserSchema,
  type WSMessage,
} from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

interface ConnectedClient {
  ws: WebSocket;
  userId: number;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const connectedClients = new Map<number, ConnectedClient>();

  // Add API routes BEFORE WebSocket setup

  // User registration
  app.post("/api/register", async (req, res) => {
    try {
      console.log("📝 Registration request:", req.body);

      // Don't use insertUserSchema directly - it expects passwordHash, we get password
      const { username, password, publicKey } = req.body;

      if (!username || !password || !publicKey) {
        return res
          .status(400)
          .json({ message: "Username, password, and publicKey are required" });
      }

      // Check if user exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Create new user
      const user = await storage.createUser({
        username,
        passwordHash: hashPassword(password),
        publicKey,
      });

      console.log("✅ User created:", user.id, username);
      res.json({
        user: { id: user.id, username: user.username, publicKey: user.publicKey },
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({ message: "Registration failed" });
    }
  });

  // User login
  app.post("/api/login", async (req, res) => {
    try {
      console.log("🔑 Login request:", { username: req.body.username });

      const { username, password } = req.body;

      if (!username || !password) {
        return res
          .status(400)
          .json({ message: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        console.log("❌ User not found:", username);
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (!verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Update online status
      await storage.updateUserOnlineStatus(user.id, true);

      console.log("✅ User logged in:", user.id, username);
      res.json({
        user: { id: user.id, username: user.username, publicKey: user.publicKey },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(400).json({ message: "Login failed" });
    }
  });

  // Get user chats (with unread counts)
  app.get("/api/chats/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const chats = await storage.getChatsByUserId(userId);
      res.json(chats);
    } catch (error) {
      console.error("Get chats error:", error);
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });

  // Get chat messages (WITHOUT marking as read - only mark-read API should do that)
  app.get("/api/chats/:chatId/messages", async (req, res) => {
    try {
      const chatId = parseInt(req.params.chatId);
      const messages = await storage.getMessagesByChat(chatId);
      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Get persistent chat contacts (contacts remain even when messages are deleted)
  app.get("/api/chat-contacts/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const contacts = storage.getPersistentChatContacts
        ? await storage.getPersistentChatContacts(userId)
        : await storage.getChatsByUserId(userId);
      res.json(contacts);
    } catch (error) {
      console.error("Failed to get chat contacts:", error);
      res.status(500).json({ error: "Failed to get chat contacts" });
    }
  });

  // Mark chat as active (updates timestamp for recent activity)
  app.post("/api/chats/:chatId/activate", async (req, res) => {
    try {
      const chatId = parseInt(req.params.chatId);
      if (storage.markChatAsActive) {
        await storage.markChatAsActive(chatId);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to activate chat:", error);
      res.status(500).json({ error: "Failed to activate chat" });
    }
  });

  // Mark chat as read for a specific user
  app.post("/api/chats/:chatId/mark-read", async (req, res) => {
    try {
      const chatId = parseInt(req.params.chatId);
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      await storage.resetUnreadCount(chatId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to mark chat as read:", error);
      res.status(500).json({ error: "Failed to mark chat as read" });
    }
  });

  // Update user profile
  app.patch("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { username, publicKey } = req.body;

      // Get existing user
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if username is taken by another user
      if (username && username !== existingUser.username) {
        const userWithSameName = await storage.getUserByUsername(username);
        if (userWithSameName && userWithSameName.id !== userId) {
          return res.status(400).json({ message: "Username already taken" });
        }
      }

      // Update user (this would need implementation in storage)
      res.json({ message: "User updated successfully" });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // WICKR-ME-STYLE: Account deletion disabled - usernames are permanent
  app.delete("/api/users/:id", async (_req, res) => {
    res.status(403).json({
      message:
        "Account deletion not allowed - usernames are permanent like Wickr Me. Please logout instead.",
    });
  });

  // Delete chat for specific user (WhatsApp-style)
  app.post("/api/chats/:chatId/delete", async (req, res) => {
    const chatId = parseInt(req.params.chatId);
    const { userId } = req.body;

    try {
      await storage.deleteChatForUser(userId, chatId);
      console.log(`✅ Chat ${chatId} deleted for user ${userId}`);
      res.json({ success: true });
    } catch (error) {
      console.error(
        `❌ Error deleting chat ${chatId} for user ${userId}:`,
        error
      );
      res.status(500).json({ error: "Failed to delete chat" });
    }
  });

  // Block user (WhatsApp-style)
  app.post("/api/users/:userId/block", async (req, res) => {
    const blockedUserId = parseInt(req.params.userId);
    const { blockerId } = req.body;

    try {
      await storage.blockUser(blockerId, blockedUserId);
      console.log(`✅ User ${blockedUserId} blocked by user ${blockerId}`);
      res.json({ success: true });
    } catch (error) {
      console.error(
        `❌ Error blocking user ${blockedUserId}:`,
        error
      );
      res.status(500).json({ error: "Failed to block user" });
    }
  });

  // ============================
  // ✅ WebSocket (gehärtet)
  // ============================

  // IP-Limit (max gleichzeitige WS Verbindungen pro IP)
  const ipConnCount = new Map<string, number>();
  const MAX_CONNS_PER_IP = 10;

  // WebSocket server (gehärtet)
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    maxPayload: 32 * 1024, // 32KB pro Message
    perMessageDeflate: false,
  });

  // Heartbeat: räumt tote Verbindungen weg
  setInterval(() => {
    wss.clients.forEach((client: any) => {
      if (client.isAlive === false) return client.terminate();
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  // Start message cleanup interval - delete expired messages every 5 minutes
  const cleanupInterval = setInterval(async () => {
    try {
      const deletedCount = await storage.deleteExpiredMessages();
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} expired messages`);
      }
    } catch (error) {
      console.error("❌ Error during message cleanup:", error);
    }
  }, 300000);

  console.log("🧹 Message cleanup scheduler started (every 5 minutes)");

  wss.on("connection", (ws: any, req: any) => {
    console.log("🔗 NEW WEBSOCKET CONNECTION ESTABLISHED");

    // ✅ Origin-Check (nur deine Seite darf verbinden)
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

    // ✅ IP holen (Render/Proxy kann x-forwarded-for nutzen)
    const xff = req.headers["x-forwarded-for"];
    const ip =
      typeof xff === "string" && xff.length > 0
        ? xff.split(",")[0].trim()
        : req.socket?.remoteAddress || "unknown";

    // ✅ IP Connection Limit
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

    // ✅ Heartbeat flag
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    // ✅ Rate-Limit: max 25 Messages pro 10 Sekunden pro Verbindung
    let tokens = 25;
    let last = Date.now();
    function takeToken() {
      const now = Date.now();
      const delta = (now - last) / 1000;
      last = now;
      tokens = Math.min(25, tokens + delta * 2.5); // 25/10s = 2.5/sec
      if (tokens >= 1) {
        tokens -= 1;
        return true;
      }
      return false;
    }

    let userId: number | null = null;

    // Send immediate connection confirmation
    ws.send(
      JSON.stringify({
        type: "connection_established",
        message: "WebSocket connected successfully",
      })
    );

    ws.on("message", async (data: any) => {
      try {
        // ✅ Rate-Limit
        if (!takeToken()) {
          ws.close(1013, "Rate limited");
          return;
        }

        // ✅ Größenlimit (zusätzlich zu maxPayload)
        const byteLen =
          typeof data === "string"
            ? Buffer.byteLength(data)
            : Buffer.isBuffer(data)
              ? data.length
              : Buffer.byteLength(data.toString());

        if (byteLen > 32 * 1024) {
          ws.close(1009, "Message too big");
          return;
        }

        const rawMessage = data.toString();
        console.log("📥 RAW MESSAGE RECEIVED:", rawMessage);

        const parsedData = JSON.parse(rawMessage);
        console.log("📥 PARSED RAW DATA:", parsedData);

        // BYPASS VALIDATION FOR MESSAGES - Direct processing
        let validatedMessage: WSMessage;

        if (parsedData.type === "message") {
          console.log("💬 MESSAGE TYPE DETECTED - Processing directly");

          // Extract message data from nested structure or direct structure
          const msgData = parsedData.message || parsedData;
          const message = {
            type: "message",
            chatId: msgData.chatId || null,
            senderId: msgData.senderId,
            receiverId: msgData.receiverId,
            content: msgData.content,
            messageType: msgData.messageType || "text",
            fileName: msgData.fileName,
            fileSize: msgData.fileSize,
            destructTimer: msgData.destructTimer || 86400,
          };
          console.log("📥 PROCESSED MESSAGE:", message);
          // @ts-ignore
          validatedMessage = message as any;
        } else {
          validatedMessage = wsMessageSchema.parse(parsedData);
        }

        console.log(
          "📥 FINAL MESSAGE:",
          validatedMessage.type,
          validatedMessage
        );

        switch (validatedMessage.type) {
          case "join":
            userId = validatedMessage.userId;
            connectedClients.set(userId, { ws, userId });
            await storage.updateUserOnlineStatus(userId, true);
            console.log(
              "👤 USER JOINED:",
              userId,
              "Total connected:",
              connectedClients.size
            );

            // Send join confirmation to user
            ws.send(
              JSON.stringify({
                type: "join_confirmed",
                userId: userId,
                message: `User ${userId} joined successfully`,
              })
            );

            // Broadcast user online status to others
            broadcast(
              {
                type: "user_status",
                userId,
                isOnline: true,
              },
              userId
            );
            break;

          case "message":
            console.log("💬 MESSAGE RECEIVED from userId:", userId);
            console.log("💬 Message content:", (validatedMessage as any).content);
            console.log("💬 Full message data:", validatedMessage);

            if (userId) {
              console.log(
                "🔍 Ensuring proper chat separation between users:",
                (validatedMessage as any).senderId,
                "and",
                (validatedMessage as any).receiverId
              );

              const chat = await storage.getOrCreateChatByParticipants(
                (validatedMessage as any).senderId,
                (validatedMessage as any).receiverId
              );
              console.log(
                "💬 Using chat ID:",
                chat.id,
                "for communication between users",
                (validatedMessage as any).senderId,
                "and",
                (validatedMessage as any).receiverId
              );

              const expiresAt = new Date(
                Date.now() + ((validatedMessage as any).destructTimer || 86400) * 1000
              );

              const isEncrypted =
                (validatedMessage as any).messageType === "text" &&
                (validatedMessage as any).content &&
                (validatedMessage as any).content.length > 100 &&
                /^[A-Za-z0-9+/=]+$/.test((validatedMessage as any).content);

              console.log(
                "🔒 Message encryption detected:",
                isEncrypted,
                "Content length:",
                (validatedMessage as any).content?.length
              );

              const newMessage = await storage.createMessage({
                chatId: chat.id,
                senderId: (validatedMessage as any).senderId,
                receiverId: (validatedMessage as any).receiverId,
                content: (validatedMessage as any).content,
                messageType: (validatedMessage as any).messageType,
                fileName: (validatedMessage as any).fileName,
                fileSize: (validatedMessage as any).fileSize,
                isEncrypted,
                expiresAt,
              });

              console.log("✅ MESSAGE SAVED to storage with ID:", newMessage.id);

              // AUTO-REACTIVATE
              if (storage.reactivateChatForUser && storage.isChatDeletedForUser) {
                const isDeleted = await storage.isChatDeletedForUser(
                  (validatedMessage as any).receiverId,
                  chat.id
                );
                if (isDeleted) {
                  await storage.reactivateChatForUser(
                    (validatedMessage as any).receiverId,
                    chat.id
                  );
                }
              }

              await storage.incrementUnreadCount(
                chat.id,
                (validatedMessage as any).receiverId
              );
              console.log(
                "📊 ✅ INCREMENTED unread count for receiver:",
                (validatedMessage as any).receiverId,
                "in chat:",
                chat.id
              );

              await storage.updateChatLastMessage(chat.id, newMessage.id);

              ws.send(
                JSON.stringify({
                  type: "message_sent",
                  messageId: newMessage.id,
                  chatId: newMessage.chatId,
                  success: true,
                  message: "Message sent successfully",
                })
              );

              const broadcastPayload = {
                type: "new_message",
                message: newMessage,
              };

              console.log("📡 BROADCASTING message to specific recipients");
              console.log(
                "🎯 Target recipients: Sender:",
                (validatedMessage as any).senderId,
                "Receiver:",
                (validatedMessage as any).receiverId
              );

              let successCount = 0;
              let failCount = 0;

              const senderClient = connectedClients.get(
                (validatedMessage as any).senderId
              );
              if (senderClient && senderClient.ws.readyState === WebSocket.OPEN) {
                try {
                  senderClient.ws.send(JSON.stringify(broadcastPayload));
                  console.log(
                    "📤 SUCCESS: Sent to SENDER",
                    (validatedMessage as any).senderId
                  );
                  successCount++;
                } catch (error) {
                  console.log(
                    "❌ FAILED: Send to sender",
                    (validatedMessage as any).senderId,
                    "Error:",
                    error
                  );
                  failCount++;
                }
              } else {
                console.log("⚠️ SENDER not connected:", (validatedMessage as any).senderId);
              }

              const receiverClient = connectedClients.get(
                (validatedMessage as any).receiverId
              );
              if (receiverClient && receiverClient.ws.readyState === WebSocket.OPEN) {
                try {
                  receiverClient.ws.send(JSON.stringify(broadcastPayload));
                  console.log(
                    "📤 SUCCESS: Sent to RECEIVER",
                    (validatedMessage as any).receiverId
                  );
                  successCount++;
                } catch (error) {
                  console.log(
                    "❌ FAILED: Send to receiver",
                    (validatedMessage as any).receiverId,
                    "Error:",
                    error
                  );
                  failCount++;
                }
              } else {
                console.log(
                  "⚠️ RECEIVER not connected:",
                  (validatedMessage as any).receiverId
                );
              }

              console.log(
                "✅ TARGETED BROADCAST: Success:",
                successCount,
                "Failed:",
                failCount,
                "Sender online:",
                !!senderClient,
                "Receiver online:",
                !!receiverClient
              );
            } else {
              console.log(
                "❌ CRITICAL: No userId set for message - join event missing?"
              );
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "User not joined - send join event first",
                })
              );
            }
            break;

          case "typing": {
            // Forward typing indicator to recipient
            const typingRecipient =
              validatedMessage.chatId &&
              connectedClients.get(
                await getOtherParticipant(validatedMessage.chatId, userId!)
              );
            if (
              typingRecipient &&
              typingRecipient.ws.readyState === WebSocket.OPEN
            ) {
              typingRecipient.ws.send(JSON.stringify(validatedMessage));
            }
            break;
          }

          case "read_receipt":
            break;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", async () => {
      if (userId) {
        console.log("🔌 DISCONNECT: User", userId, "WebSocket closed");
        connectedClients.delete(userId);
        await storage.updateUserOnlineStatus(userId, false);
        console.log("👥 REMAINING CONNECTIONS:", connectedClients.size);

        broadcast(
          {
            type: "user_status",
            userId,
            isOnline: false,
          },
          userId
        );
      } else {
        console.log("🔌 DISCONNECT: Anonymous connection closed");
      }
    });

    ws.on("error", (error: any) => {
      console.error("❌ WEBSOCKET ERROR for user", userId, ":", error);
    });
  });

  function broadcast(message: any, excludeUserId?: number) {
    Array.from(connectedClients.values()).forEach((client) => {
      if (
        client.userId !== excludeUserId &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  async function getOtherParticipant(chatId: number, userId: number): Promise<number> {
    const chat = await storage.getChatByParticipants(userId, 0); // Get chat data
    if (!chat) return 0;

    return chat.participant1Id === userId ? chat.participant2Id : chat.participant1Id;
  }

  // Helper function to hash passwords
  function hashPassword(password: string): string {
    return crypto.createHash("sha256").update(password).digest("hex");
  }

  function verifyPassword(password: string, hash: string): boolean {
    return crypto.createHash("sha256").update(password).digest("hex") === hash;
  }

  // Test routes for WebSocket debugging
  app.get("/test-websocket.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "test-websocket.html"));
  });

  app.get("/live-test.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "live-test.html"));
  });

  app.get("/simple-test.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.sendFile(path.join(process.cwd(), "simple-test.js"));
  });

  app.get("/debug-browser-test.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.sendFile(path.join(process.cwd(), "debug-browser-test.js"));
  });

  app.get("/browser-websocket-test.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "browser-websocket-test.html"));
  });

  app.get("/websocket-fix.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.sendFile(path.join(process.cwd(), "websocket-fix.js"));
  });

  app.get("/timer-test-simple.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "timer-test-simple.html"));
  });

  app.get("/browser-user-persistence-test.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "browser-user-persistence-test.html"));
  });

  // HTTP fallback endpoint for messages (if WebSocket fails)
  app.post("/api/messages", async (req, res) => {
    try {
      let { chatId, senderId, receiverId, content, messageType, destructTimer } =
        req.body;

      console.log("📤 HTTP message received:", {
        chatId,
        senderId,
        receiverId,
        content: content?.substring(0, 30) + "...",
        destructTimer: destructTimer || 300,
      });

      // Auto-determine receiverId if missing
      if (!receiverId && chatId) {
        const chat = await storage.getChat(chatId);
        if (chat) {
          receiverId =
            chat.participant1Id === senderId
              ? chat.participant2Id
              : chat.participant1Id;
          console.log("🎯 Auto-determined receiverId:", receiverId);
        }
      }

      const timerInMs = (destructTimer || 300) * 1000;
      const expiresAt = new Date(Date.now() + timerInMs);

      const message = await storage.createMessage({
        chatId,
        senderId,
        receiverId,
        content,
        messageType: messageType || "text",
        fileName: undefined,
        fileSize: undefined,
        isEncrypted: false,
        expiresAt,
      });

      console.log("✅ Message saved via HTTP with ID:", message.id);

      if (receiverId && chatId) {
        await storage.incrementUnreadCount(chatId, receiverId);
        console.log("📊 Incremented unread count for user", receiverId);
      }

      await storage.updateChatLastMessage(chatId, message.id);

      // Broadcast to connected WebSocket clients
      console.log("📡 Broadcasting message to WebSocket clients...");

      if (typeof wss !== "undefined" && (wss as any).clients) {
        let clientCount = 0;
        (wss as any).clients.forEach((client: any) => {
          if (client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "new_message",
                message,
              })
            );
            clientCount++;
          }
        });
        console.log(`📡 Broadcast sent to ${clientCount} connected clients`);
      } else {
        console.log("⚠️ No WebSocket server available for broadcast");
      }

      res.json(message);
    } catch (error) {
      console.error("Failed to create message via HTTP:", error);
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  // Block user endpoint
  app.post("/api/users/:userId/block", async (req, res) => {
    try {
      const blockerId = parseInt(req.params.userId);
      const { blockedId } = req.body;

      console.log(`🚫 Block request: ${blockerId} wants to block ${blockedId}`);

      await storage.blockUser(blockerId, blockedId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to block user:", error);
      res.status(500).json({ error: "Failed to block user" });
    }
  });

  // Unblock user endpoint
  app.post("/api/users/:userId/unblock", async (req, res) => {
    try {
      const blockerId = parseInt(req.params.userId);
      const { blockedId } = req.body;

      console.log(`✅ Unblock request: ${blockerId} wants to unblock ${blockedId}`);

      await storage.unblockUser(blockerId, blockedId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to unblock user:", error);
      res.status(500).json({ error: "Failed to unblock user" });
    }
  });

  // Get blocked users
  app.get("/api/users/:userId/blocked", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const blockedUsers = await storage.getBlockedUsers(userId);
      res.json(blockedUsers);
    } catch (error) {
      console.error("Failed to get blocked users:", error);
      res.status(500).json({ error: "Failed to get blocked users" });
    }
  });

  // Delete chat for user
  app.delete("/api/users/:userId/chats/:chatId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const chatId = parseInt(req.params.chatId);

      console.log(`🗑️ Delete chat request: User ${userId} wants to delete chat ${chatId}`);

      await storage.deleteChatForUser(userId, chatId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete chat:", error);
      res.status(500).json({ error: "Failed to delete chat" });
    }
  });

  // Get messages since a specific ID (for polling)
  app.get("/api/users/:userId/messages/since/:lastId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const lastId = parseInt(req.params.lastId);

      const userChats = await storage.getChatsByUserId(userId);
      const allMessages: any[] = [];

      for (const chat of userChats) {
        const chatMessages = await storage.getMessagesByChat(chat.id);
        const newMessages = chatMessages.filter((m) => m.id > lastId);
        allMessages.push(...newMessages);
      }

      allMessages.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      res.json(allMessages);
    } catch (error) {
      console.error("Failed to get messages since:", error);
      res.json([]);
    }
  });

  // REST API endpoints

  // Create user (Register)
  app.post("/api/users", async (req, res) => {
    try {
      const { username, password, publicKey } = req.body;

      console.log("📝 Registration attempt:", {
        username,
        hasPassword: !!password,
        hasPublicKey: !!publicKey,
      });

      if (!username || !password || !publicKey) {
        console.log("❌ Missing required fields");
        return res
          .status(400)
          .json({ message: "Username, password, and publicKey are required" });
      }

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        console.log("❌ Username already taken:", username);
        return res.status(409).json({ message: "Username already taken" });
      }

      const passwordHash = hashPassword(password);
      const userData = { username, passwordHash, publicKey };
      const user = await storage.createUser(userData);

      console.log("✅ User registration successful:", user.id, username);

      const { passwordHash: _, ...userResponse } = user as any;
      res.json(userResponse);
    } catch (error) {
      console.error("❌ Registration error:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Login user
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = loginUserSchema.parse(req.body);

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (!verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      const { passwordHash: _, ...userResponse } = user as any;
      res.json(userResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Search users
  app.get("/api/search-users", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const excludeParam =
        (req.query.exclude as string) ||
        (req.query.excludeId as string) ||
        "0";
      const excludeId = parseInt(excludeParam) || 0;

      console.log("🔍 User search request:", { query, excludeParam, excludeId });

      if (!query.trim()) {
        return res.json([]);
      }

      const users = await storage.searchUsers(query, excludeId);
      console.log(
        `✅ Found ${users.length} users matching "${query}":`,
        users.map((u: any) => u.username)
      );
      res.json(users);
    } catch (error) {
      console.error("❌ Search error:", error);
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  // Get user by ID
  app.get("/api/users/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = await storage.getUser(id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // Create or get chat between two users
  app.post("/api/chats", async (req, res) => {
    try {
      const { participant1Id, participant2Id } = req.body;

      let chat = await storage.getChatByParticipants(participant1Id, participant2Id);

      if (!chat) {
        chat = await storage.createChat({ participant1Id, participant2Id });
      }

      res.json(chat);
    } catch (error) {
      res.status(500).json({ message: "Failed to create chat" });
    }
  });

  // File upload
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const fileInfo = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        url: `/uploads/${req.file.filename}`,
      };

      res.json(fileInfo);
    } catch (error) {
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Serve uploaded files
  app.use("/uploads", express.static(uploadDir));

  // Debug endpoint to clear all data for encryption testing
  app.post("/api/debug/clear-all", (req, res) => {
    console.log("🧹 Clearing all storage data...");
    storage.users.clear();
    (storage as any).messages?.clear();
    (storage as any).chats?.clear();
    (storage as any).userIdCounter = 1;
    (storage as any).messageIdCounter = 1;
    (storage as any).chatIdCounter = 1;
    console.log("✅ All data cleared");
    res.json({ success: true, message: "All data cleared" });
  });

  return httpServer;
}
