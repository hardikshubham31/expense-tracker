import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "../db.js";
import { isProduction } from "../env.js";

export const SESSION_COOKIE = "session";
const DAY = 24 * 60 * 60 * 1000;
const REMEMBER_FOR = 30 * DAY;
/** "Keep me signed in" off: a browser-session cookie, and the server row expires after a day */
const SHORT_SESSION = DAY;

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export async function createSession(res: Response, req: Request, userId: string, remember = true) {
  const token = newToken();
  const ttl = remember ? REMEMBER_FOR : SHORT_SESSION;
  await prisma.session.create({
    data: {
      id: randomUUID(),
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + ttl),
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
    },
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: ttl } : {}),
  });
}

/**
 * The signed-in user for this request, or null. Expired rows are deleted;
 * long-lived sessions slide forward when more than half used.
 */
export async function readSession(req: Request) {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length < 20) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      expiresAt: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, image: true, emailVerified: true, timezone: true, budgetAlerts: true } },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  const remaining = session.expiresAt.getTime() - Date.now();
  const lifetime = session.expiresAt.getTime() - session.createdAt.getTime();
  if (lifetime > SHORT_SESSION && remaining < lifetime / 2) {
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + REMEMBER_FOR) } });
  }
  return { id: session.id, createdAt: session.createdAt, user: session.user };
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof readSession>>>["user"];

export async function destroySession(req: Request, res: Response) {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  clearSessionCookie(res);
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" });
}
