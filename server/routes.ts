import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import { z } from "zod";

import { storage } from "./storage";
import { loginUserSchema, wsMessageSchema, type WSMessage } from "@shared/schema";

/* =========================
   Helpers
========================= */

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

function toInt(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function json(res: any, status: number, payload: any) {
  return res.status(status).json(payload);
}

/* =========================
   Routes
========================= */

export async function registerRoutes(app: Express): Promise<Server> {
  const server = createServer(app);

  /* -------------------------
     HEALTH (WICHTIG!)
  -------------------------- */
  app.get("/api/health", (_req, res) => {
    res.json({
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

      if (!username || !password || !publicKey) {
        return json(res, 400, {
          ok: false,
          message: "username, password and publicKey are required",
        });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return json(res, 409, {
          ok: false,
          message: "Username already exists",
        });
      }

      const user = await storage.createUser({
        username,
        passwordHash: hashPassword(password),
        publicKey,
      });

      return json(res, 200, {
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          publicKey: user.publicKey,
        },
      });
    } catch (err: any) {
      console.error("REGISTER ERROR:", err);
      return json(res, 500, {
        ok: false,
        message: "Registration failed",
      });
    }
  });

  /* -------------------------
     LOGIN
  -------------------------- */
  app.post("/api/login", async (req, res) => {
    try {
      const parsed = loginUserSchema.parse(req.body);

      const user = await storage.getUserByUsername(parsed.username);
      if (!user) {
        return json(res, 401, {
          ok: false,
          message: "Invalid username or password",
        });
      }

      if (!verifyPassword(parsed.password, user.passwordHash)) {
        return json(res, 401, {
          ok: false,
          message: "Invalid username or password",
        });
      }

      return json(res, 200, {
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          publicKey: user.publicKey,
        },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return json(res, 400, {
          ok: false,
          message: "Invalid request body",
        });
      }

      console.error("LOGIN ERROR:", err);
      return json(res, 500, {
        ok: false,
        message: "Login failed",
      });
    }
  });

  /* =========================
     WEBSOCKET (minimal stabil)
  ========================= */

  const clients = new Map<number, WebSocket>();

  const wss = new WebSocketServer({
    server,
    path: "/ws",
  });

  wss.on("connection", (ws) => {
    let userId: number | null = null;

    ws.on("message", async (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        const msg = wsMessageSchema.parse(data) as WSMessage;

        if (msg.type === "join") {
          userId = msg.userId;
          clients.set(userId, ws);
          return;
        }

        if (msg.type === "message") {
          if (!userId) return;

          const chat = await storage.getOrCreateChatByParticipants(
            msg.senderId,
            msg.receiverId
          );

          const saved = await storage.createMessage({
            chatId: chat.id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            content: msg.content,
            messageType: msg.messageType,
            expiresAt: new Date(Date.now() + 86400 * 1000),
          });

          const target = clients.get(msg.receiverId);
          if (target?.readyState === WebSocket.OPEN) {
            target.send(JSON.stringify({ type: "new_message", message: saved }));
          }
        }
      } catch (e) {
        console.error("WS ERROR:", e);
      }
    });

    ws.on("close", () => {
      if (userId) clients.delete(userId);
    });
  });

  return server;
}