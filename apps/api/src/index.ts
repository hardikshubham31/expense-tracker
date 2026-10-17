import { env, googleEnabled } from "./env.js";
import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";

const server = createApp().listen(env.API_PORT, () => {
  logger.info(`API listening on http://localhost:${env.API_PORT} (app: ${env.APP_URL}, Google sign-in: ${googleEnabled ? "on" : "off"})`);
});

// Finish in-flight requests, then close the database pool.
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
