import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ✅ CORS (Production: nur deine Render-Domain, Dev: offen)
app.use((req, res, next) => {
  const allowedOrigin =
    process.env.NODE_ENV === "production"
      ? "https://whisper3.onrender.com"
      : "*";

  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, Sec-WebSocket-Protocol, Sec-WebSocket-Key, Sec-WebSocket-Version, Connection, Upgrade"
  );

  // Preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// ✅ API-GUARD: verhindert, dass /api/* jemals in SPA/Vite-Fallback landet
// und gibt bei kaputten URLs sauber JSON zurück.
app.use("/api", (req, res, next) => {
  // req.originalUrl ist am verlässlichsten bei Express
  const u = req.originalUrl || req.url || "";
  if (!u || u.includes("undefined") || u.includes("[object Object]")) {
    console.error("❌ Invalid API URL:", u);
    return res.status(400).json({ ok: false, message: "Invalid URL" });
  }
  next();
});

// ✅ Logger
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";
      log(logLine);
    }
  });

  next();
});

(async () => {
  // ✅ Register API routes FIRST before Vite middleware
  const server = await registerRoutes(app);

  // ✅ Error handling middleware (immer JSON für /api)
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    const message = err?.message || "Internal Server Error";

    if (req.path?.startsWith("/api")) {
      res.status(status).json({ ok: false, message });
      return;
    }

    res.status(status).json({ message });
  });

  // ✅ Setup Vite AFTER all API routes are registered
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Render: dynamischer Port; lokal fallback 5000
  const port = Number(process.env.PORT) || 5000;

  // Windows-friendly: lokal 127.0.0.1, production (Render) 0.0.0.0
  const host = app.get("env") === "development" ? "127.0.0.1" : "0.0.0.0";

  server.listen(port, host, () => {
    log(`serving on http://${host}:${port}`);
  });
})();