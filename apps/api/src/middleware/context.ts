import type { NextFunction, Request, RequestHandler, Response } from "express";
import { todayIn } from "@expense/shared/dates";
import { prisma } from "../db.js";
import { readSession, type SessionUser } from "../auth/sessions.js";
import { createPersonalLedger } from "../services/ledgers.js";
import { unauthorized } from "../http.js";

/** Active ledger, chosen by the web app (cookie) and verified here against a membership. */
export const LEDGER_COOKIE = "ledger";

export type AuthInfo = { sessionId: string; sessionCreatedAt: Date; user: SessionUser };

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthInfo;
    ctx?: LedgerContext;
  }
}

/** Attach the session (if any) to every request. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const session = await readSession(req);
  if (session) req.auth = { sessionId: session.id, sessionCreatedAt: session.createdAt, user: session.user };
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw unauthorized();
  next();
};

export function getAuth(req: Request): AuthInfo {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

function findMemberships(userId: string) {
  return prisma.ledgerMember.findMany({
    where: { userId, leftAt: null },
    select: {
      id: true,
      role: true,
      ledger: { select: { id: true, name: true, kind: true, currency: true, monthlyBudget: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
}

async function buildContext(req: Request) {
  const { user } = getAuth(req);
  const wanted: unknown = req.cookies?.[LEDGER_COOKIE];

  let memberships = await findMemberships(user.id);
  if (!memberships.some((m) => m.ledger.kind === "PERSONAL")) {
    // Self-heal: every user has a personal ledger.
    await createPersonalLedger(user.id, user.name);
    memberships = await findMemberships(user.id);
  }
  const current = memberships.find((m) => m.ledger.id === wanted) ?? memberships.find((m) => m.ledger.kind === "PERSONAL")!;

  const allMembers = await prisma.ledgerMember.findMany({
    where: { ledgerId: current.ledger.id },
    select: { id: true, name: true, userId: true, role: true, leftAt: true },
    orderBy: { joinedAt: "asc" },
  });

  return {
    user,
    ledger: current.ledger,
    member: { id: current.id, role: current.role },
    /** Everyone who has ever been in the ledger (labels old expenses) */
    allMembers,
    /** Current members */
    members: allMembers.filter((m) => !m.leftAt),
    ledgers: memberships.map((m) => ({ id: m.ledger.id, name: m.ledger.name, kind: m.ledger.kind })),
    isShared: current.ledger.kind === "SHARED",
    isOwner: current.role === "OWNER",
    /** "Today" in the user's time zone */
    today: todayIn(user.timezone),
  };
}

export type LedgerContext = Awaited<ReturnType<typeof buildContext>>;

/** Authenticated + resolved ledger. Every data route uses this. */
export const requireLedger: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth) throw unauthorized();
  req.ctx = await buildContext(req);
  next();
};

export function getCtx(req: Request): LedgerContext {
  if (!req.ctx) throw unauthorized();
  return req.ctx;
}
