import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// ✅ Robust: trim + remove accidental surrounding quotes
const rawUrl = process.env.DATABASE_URL;
const DATABASE_URL = rawUrl ? rawUrl.trim().replace(/^"+|"+$/g, "") : "";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be set (Render → Environment).");
}

// Optional: quick sanity check to avoid Neon "Invalid URL" surprises
if (!/^postgres(ql)?:\/\//i.test(DATABASE_URL)) {
  throw new Error(
    `DATABASE_URL looks invalid (must start with postgres:// or postgresql://). Got: ${DATABASE_URL.slice(
      0,
      20
    )}...`
  );
}

export const pool = new Pool({ connectionString: DATABASE_URL });
export const db = drizzle({ client: pool, schema });
