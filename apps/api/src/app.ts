import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { authenticate, requireAuth, requireLedger } from "./middleware/context.js";
import { errorHandler, notFoundHandler } from "./http.js";
import { authRouter } from "./auth/routes.js";
import { accountRouter } from "./routes/account.js";
import { categoriesRouter } from "./routes/categories.js";
import { expensesRouter } from "./routes/expenses.js";
import { ledgerRouter } from "./routes/ledger.js";
import { incomeRouter, recurringRouter, settlementsRouter, summaryRouter } from "./routes/money.js";
import { receiptsRouter } from "./routes/receipts.js";

export function createApp() {
  const app = express();

  // The browser reaches us through the web app's /api rewrite on the same machine:
  // trust only that hop for the client IP (rate limits) and protocol.
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(authenticate);

  app.get("/api/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/account", requireAuth, accountRouter);
  app.use("/api/receipts", receiptsRouter);
  app.use("/api/expenses", requireLedger, expensesRouter);
  app.use("/api/categories", requireLedger, categoriesRouter);
  app.use("/api/income", requireLedger, incomeRouter);
  app.use("/api/recurring", requireLedger, recurringRouter);
  app.use("/api/settlements", requireLedger, settlementsRouter);
  app.use("/api", ledgerRouter); // /context, /ledger/*, /households, /invites/* (guards per route)
  app.use("/api", summaryRouter); // /summary, /trends, /balances

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
