import path from "node:path";
import { config } from "dotenv";
import { z } from "zod";

// One .env for the whole repo, at the root. Variables already set (tests, hosting) win.
config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  /** Not PORT: the web app shares this .env and `next start` reads PORT */
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  /** Public URL of the web app (links in emails, OAuth redirect URI) */
  APP_URL: z.url().default("http://localhost:3000"),
  /** Signs the short-lived OAuth state cookie */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  AUTH_RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  OUTBOX_DIR: z.string().optional(),
  RECEIPTS_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:\n" + parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
