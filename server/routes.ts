import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import { z } from "zod";

import { storage } from "./storage";
import { wsMessageSchema, loginUserSchema } from "@shared/schema";

/* =========================
   Utils
========================= */

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password: string, hash: string) {
  return hashPassword(password) === hash;
}

function ok(res: any, payload: any) {
  return res.status(200).json({ ok: true, ...payload });
}

function fail(res: any, status: number, message: string) {
  return res.status(status).json({ ok: false, message });
}

function toInt(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* =========================
   ROUTES
========================= */

export async function registerRoutes(app: Express): Promise<Server> {
  const server = createServer(app);

  /* -------------------------
     HEALTH CHECK (WICHTIG)
  -------------------------- */
  app.get("/api/health", (_req, res) => {
    return res.json({
      ok: true,
      service: "whisper3",
      time: new Date().toISOString(),
    });
  });

  /* -------------------------
     REGISTER
  -------------------------- */
  app.post("/api/register", async (req, res) => {
    try {
      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "");
      const publicKey = String(req.body?.publicKey || "");

      if (username.length < 3) {
        return fail(res, 400, "Username too short");
      }

      if (password.length < 6) {
        return fail(res, 400, "Password too short");
      }

      if (!publicKey) {
        return fail(res, 400, "publicKey missing");
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return fail(res, 409, "Username already exists");
      }

      const user = await storage.createUser({
        username,
        passwordHash: hashPassword(password),
        publicKey,
      });

      await storage.updateUserOnlineStatus(user.id, true);

      return ok(res, {
        user: {
          id: user.id,
          username: user.username,
          publicKey: user.publicKey,
        },
      });
    } catch (err) {
      console.error("❌ REGISTER ERROR:", err);
      return fail(res, 500, "Registration failed");
    }
  });

  /* -------------------------
     LOGIN
  -------------------------- */
  app.post("/api/login", async (req, res) => {
    try {
      const parsed = loginUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 400, "Invalid request body");
      }

      const username = parsed.data.username.trim();
      const password = parsed.data.password;

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return fail(res, 401, "Invalid username or password");
      }

      if (!verifyPassword(password, user.passwordHash)) {
        return fail(res, 401, "Invalid username or password");
      }

      await storage.updateUserOnlineStatus(user.id, true);

      return ok(res, {
        user: {
          id: user.id,
          username: user.username,
          publicKey: user.publicKey,
        },
      });
    } catch (err) {
      console.error("❌ LOGIN ERROR:", err);
      return fail(res, 500, "Login failed");
    }
  });

  /* =========================
     WEBSOCKET
========================= */

  const clients = new Map<number, WebSocket>();

  const wss = new WebSocketServer({
    server,
    path: "/ws",
  });

  wss.on("connection", (ws: any) => {
    let userId: number | null = null;

    ws.on("message", async (data: any) => {
      try {
        const parsed = JSON.parse(data.toString());

        if (parsed.type === "join") {
          userId = toInt(parsed.userId);
          if (!userId) return;

          clients.set(userId, ws);
          ws.send(JSON.stringify({ type: "join_ok", userId }));
          return;
        }

        const msg = wsMessageSchema.parse(parsed);

        if (!userId || msg.senderId !== userId) return;

        const chat = await storage.getOrCreateChatByParticipants(
          msg.senderId,
          msg.receiverId
        );

        const message = await storage.createMessage({
          chatId: chat.id,
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          content: msg.content,
          messageType: msg.messageType || "text",
          expiresAt: new Date(Date.now() + (msg.destructTimer || 86400) * 1000),
        } as any);

        const payload = JSON.stringify({
          type: "new_message",
          message,
        });

        ws.send(payload);
        const receiver = clients.get(msg.receiverId);
        if (receiver?.readyState === WebSocket.OPEN) {
          receiver.send(payload);
        }
      } catch (err) {
        console.error("❌ WS ERROR:", err);
      }
    });

    ws.on("close", () => {
      if (userId) clients.delete(userId);
    });
  });

  return server;
}