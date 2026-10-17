import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { safeRedirect } from "@expense/shared/redirect";
import { prisma } from "../db.js";
import { env, googleEnabled } from "../env.js";
import { logger } from "../logger.js";
import { getAuth, requireAuth } from "../middleware/context.js";
import { emails, sendEmail } from "../services/email.js";
import { LedgerError, createPersonalLedger, prepareAccountDeletion } from "../services/ledgers.js";
import { HttpError, badRequest, firstErrors, forbidden, invalid } from "../http.js";
import { bodyOf, str } from "../routes/body.js";
import { MAX_PASSWORD, MIN_PASSWORD, dummyPasswordCheck, hashPassword, verifyPassword } from "./passwords.js";
import { clearSessionCookie, createSession, destroySession, newToken, sha256 } from "./sessions.js";
import { finishGoogleSignIn, startGoogleSignIn } from "./google.js";

export const authRouter = Router();

const RESET_TTL_MS = 60 * 60 * 1000;
/** Deleting a password-less (Google) account needs a session at most this old */
const FRESH_SESSION_MS = 24 * 60 * 60 * 1000;

/** Brute-force protection for endpoints that take a password or send email. */
const strict = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.AUTH_RATE_LIMIT === "off",
  handler: (_req, res) => {
    res.status(429).json({ ok: false, error: "Too many attempts. Please wait a minute and try again." });
  },
});

const email = z.email("Enter a valid email address.").transform((e) => e.trim().toLowerCase());
const password = z
  .string()
  .min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters.`)
  .max(MAX_PASSWORD, "Password is too long.");

function credentialAccount(userId: string) {
  return prisma.account.findFirst({ where: { userId, providerId: "credential" }, select: { id: true, password: true } });
}

/** GET /api/auth/providers */
authRouter.get("/providers", (_req, res) => {
  res.json({ google: googleEnabled });
});

/** GET /api/auth/session: the signed-in user, or 401 */
authRouter.get("/session", requireAuth, (req, res) => {
  res.json({ user: getAuth(req).user });
});

/** POST /api/auth/signup { name, email, password }: creates the account and signs in. */
authRouter.post("/signup", strict, async (req, res) => {
  const body = bodyOf(req);
  const parsed = z
    .object({ name: z.string().trim().min(1, "Enter your name.").max(80, "Keep it under 80 characters."), email, password })
    .safeParse({ name: str(body, "name"), email: str(body, "email"), password: str(body, "password") });
  if (!parsed.success) throw invalid(firstErrors(parsed.error));

  const taken = await prisma.user.findFirst({ where: { email: { equals: parsed.data.email, mode: "insensitive" } }, select: { id: true } });
  if (taken) throw new HttpError(409, "An account with this email already exists. Try signing in instead.", { email: "An account with this email already exists." });

  const userId = randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      name: parsed.data.name,
      email: parsed.data.email,
      // No email provider yet, so addresses aren't verified (see google.ts for why that matters)
      emailVerified: false,
      accounts: { create: { id: randomUUID(), providerId: "credential", accountId: userId, password: await hashPassword(parsed.data.password) } },
    },
  });
  await createPersonalLedger(userId, parsed.data.name);
  await createSession(res, req, userId, true);
  res.status(201).json({ ok: true });
});

/** POST /api/auth/login { email, password, remember } */
authRouter.post("/login", strict, async (req, res) => {
  const body = bodyOf(req);
  const address = str(body, "email").trim().toLowerCase();
  const pass = str(body, "password");
  if (!address || !pass) throw badRequest("Enter your email and password.");

  const user = await prisma.user.findFirst({ where: { email: { equals: address, mode: "insensitive" } }, select: { id: true } });
  const account = user ? await credentialAccount(user.id) : null;
  // Same work whether or not the account exists, so timing doesn't reveal which emails are registered
  const ok = account?.password ? await verifyPassword(pass, account.password) : await dummyPasswordCheck(pass);
  if (!user || !ok) throw new HttpError(401, "That email and password don't match. Please try again.");

  await createSession(res, req, user.id, body.remember !== false);
  res.json({ ok: true });
});

authRouter.post("/logout", async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

/**
 * POST /api/auth/forgot-password { email }: always 200 (doesn't reveal accounts).
 * Also how Google-only users set a first password.
 */
authRouter.post("/forgot-password", strict, async (req, res) => {
  const address = str(bodyOf(req), "email").trim().toLowerCase();
  const user = address
    ? await prisma.user.findFirst({ where: { email: { equals: address, mode: "insensitive" } }, select: { id: true, email: true } })
    : null;
  if (user) {
    const token = newToken();
    // Only the newest link works
    await prisma.verification.deleteMany({ where: { value: user.id, identifier: { startsWith: "reset-password:" } } });
    await prisma.verification.create({
      data: { id: randomUUID(), identifier: `reset-password:${sha256(token)}`, value: user.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    await sendEmail(emails.resetPassword(user.email, `${env.APP_URL}/reset-password?token=${token}`));
  }
  res.json({ ok: true });
});

/** POST /api/auth/reset-password { token, password }: single use; signs out every session. */
authRouter.post("/reset-password", strict, async (req, res) => {
  const body = bodyOf(req);
  const token = str(body, "token");
  const parsed = password.safeParse(str(body, "password"));
  if (!parsed.success) throw invalid({ password: parsed.error.issues[0].message });

  const record = token ? await prisma.verification.findFirst({ where: { identifier: `reset-password:${sha256(token)}` } }) : null;
  if (!record || record.expiresAt < new Date()) {
    if (record) await prisma.verification.delete({ where: { id: record.id } });
    throw badRequest("This reset link is invalid or has expired. Request a new one.");
  }

  const userId = record.value;
  const hash = await hashPassword(parsed.data);
  const existing = await credentialAccount(userId);
  await prisma.$transaction([
    existing
      ? prisma.account.update({ where: { id: existing.id }, data: { password: hash } })
      : prisma.account.create({ data: { id: randomUUID(), userId, providerId: "credential", accountId: userId, password: hash } }),
    prisma.verification.delete({ where: { id: record.id } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** POST /api/auth/change-password { currentPassword, newPassword, revokeOtherSessions } */
authRouter.post("/change-password", strict, requireAuth, async (req, res) => {
  const { user, sessionId } = getAuth(req);
  const body = bodyOf(req);
  const parsed = password.safeParse(str(body, "newPassword"));
  if (!parsed.success) throw invalid({ newPassword: parsed.error.issues[0].message });

  const account = await credentialAccount(user.id);
  if (!account?.password || !(await verifyPassword(str(body, "currentPassword"), account.password))) {
    throw invalid({ currentPassword: "Your current password is incorrect." });
  }
  await prisma.account.update({ where: { id: account.id }, data: { password: await hashPassword(parsed.data) } });
  if (body.revokeOtherSessions === true) await prisma.session.deleteMany({ where: { userId: user.id, id: { not: sessionId } } });
  res.json({ ok: true });
});

/**
 * DELETE /api/auth/account { password? }: needs the password, or for Google-only
 * accounts a recent sign-in. Leaves shared households (blocked if unsettled).
 */
authRouter.delete("/account", strict, requireAuth, async (req: Request, res) => {
  const { user, sessionCreatedAt } = getAuth(req);
  const account = await credentialAccount(user.id);
  if (account?.password) {
    if (!(await verifyPassword(str(bodyOf(req), "password"), account.password))) throw invalid({ password: "That password is incorrect." });
  } else if (Date.now() - sessionCreatedAt.getTime() > FRESH_SESSION_MS) {
    throw forbidden("For your security, sign out and sign back in, then try again.");
  }

  try {
    await prepareAccountDeletion(user.id);
  } catch (error) {
    if (error instanceof LedgerError) throw badRequest(error.message);
    throw error;
  }
  await prisma.user.delete({ where: { id: user.id } }); // sessions and accounts cascade
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ─── Google ──────────────────────────────────────────────────────────────────

authRouter.get("/google", (req, res) => {
  if (!googleEnabled) {
    res.redirect(`${env.APP_URL}/login?error=oauth`);
    return;
  }
  startGoogleSignIn(req, res);
});

/** Registered redirect URI: <APP_URL>/api/auth/callback/google */
authRouter.get("/callback/google", async (req, res) => {
  try {
    const { userId, redirectTo } = await finishGoogleSignIn(req, res);
    await createSession(res, req, userId, true);
    res.redirect(`${env.APP_URL}${safeRedirect(redirectTo)}`);
  } catch (error) {
    logger.warn({ err: error }, "google sign-in failed");
    res.redirect(`${env.APP_URL}/login?error=oauth`);
  }
});
