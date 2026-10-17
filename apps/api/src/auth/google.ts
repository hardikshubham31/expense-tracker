import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { safeRedirect } from "@expense/shared/redirect";
import { prisma } from "../db.js";
import { env, isProduction } from "../env.js";
import { createPersonalLedger } from "../services/ledgers.js";

/**
 * Google sign-in (OpenID Connect authorization-code flow with PKCE).
 * The redirect URI goes through the web app's /api rewrite, so it's the same
 * one registered in Google Cloud: <APP_URL>/api/auth/callback/google
 */
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const STATE_COOKIE = "oauth_google";
const STATE_TTL_MS = 10 * 60 * 1000;

const redirectUri = () => `${env.APP_URL}/api/auth/callback/google`;
const b64url = (buf: Buffer) => buf.toString("base64url");
const sign = (payload: string) => createHmac("sha256", env.AUTH_SECRET).update(payload).digest("base64url");

type OAuthState = { state: string; verifier: string; redirectTo: string; exp: number };

/** Signed, short-lived cookie holding state + PKCE verifier between redirect and callback. */
function writeState(res: Response, value: OAuthState) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  res.cookie(STATE_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax", // must survive the top-level redirect back from Google
    path: "/api/auth",
    maxAge: STATE_TTL_MS,
  });
}

function readState(req: Request): OAuthState | null {
  const raw: unknown = req.cookies?.[STATE_COOKIE];
  if (typeof raw !== "string") return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as OAuthState;
  return value.exp > Date.now() ? value : null;
}

export function startGoogleSignIn(req: Request, res: Response) {
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const redirectTo = safeRedirect(typeof req.query.redirectTo === "string" ? req.query.redirectTo : null);
  writeState(res, { state, verifier, redirectTo, exp: Date.now() + STATE_TTL_MS });

  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  res.redirect(url.toString());
}

type GoogleProfile = { sub: string; email: string; name: string; picture: string | null };

async function exchangeCode(code: string, verifier: string): Promise<GoogleProfile> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  const { id_token } = (await response.json()) as { id_token?: string };
  if (!id_token) throw new Error("Google returned no ID token");

  const { payload } = await jwtVerify(id_token, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.GOOGLE_CLIENT_ID!,
  });
  if (typeof payload.sub !== "string" || typeof payload.email !== "string" || payload.email_verified !== true) {
    throw new Error("Google account has no verified email");
  }
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" && payload.name ? payload.name : payload.email.split("@")[0],
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}

/**
 * Find or create the user for a Google profile.
 * Sign-up doesn't verify emails, so an existing *unverified* password account
 * with this address may belong to someone else: Google proves ownership, so
 * that password is removed when linking.
 */
async function userForGoogle(profile: GoogleProfile) {
  const linked = await prisma.account.findFirst({
    where: { providerId: "google", accountId: profile.sub },
    select: { userId: true },
  });
  if (linked) return linked.userId;

  const existing = await prisma.user.findFirst({
    where: { email: { equals: profile.email, mode: "insensitive" } },
    select: { id: true, emailVerified: true },
  });
  if (existing) {
    await prisma.$transaction([
      ...(existing.emailVerified ? [] : [prisma.account.deleteMany({ where: { userId: existing.id, providerId: "credential" } })]),
      prisma.user.update({ where: { id: existing.id }, data: { emailVerified: true } }),
      prisma.account.create({ data: { id: randomUUID(), userId: existing.id, providerId: "google", accountId: profile.sub } }),
    ]);
    return existing.id;
  }

  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: profile.name,
      email: profile.email,
      emailVerified: true,
      image: profile.picture,
      accounts: { create: { id: randomUUID(), providerId: "google", accountId: profile.sub } },
    },
    select: { id: true, name: true },
  });
  await createPersonalLedger(user.id, user.name);
  return user.id;
}

/** Returns the user id and where to send them, or throws (caller redirects to /login?error=oauth). */
export async function finishGoogleSignIn(req: Request, res: Response) {
  const saved = readState(req);
  res.clearCookie(STATE_COOKIE, { path: "/api/auth" });
  const { code, state, error } = req.query;
  if (error) throw new Error(`Google returned ${String(error)}`);
  if (!saved || typeof state !== "string" || state !== saved.state || typeof code !== "string") {
    throw new Error("Invalid OAuth state");
  }
  const profile = await exchangeCode(code, saved.verifier);
  return { userId: await userForGoogle(profile), redirectTo: saved.redirectTo };
}
