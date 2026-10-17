import "server-only";
import { cache } from "react";
import type { Month } from "@expense/shared/dates";
import { apiGet } from "@/lib/api";

/** Cookie (set by the web app) choosing the active ledger; the API verifies membership. */
export const LEDGER_COOKIE = "ledger";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
  timezone: string | null;
  budgetAlerts: boolean;
};

type Member = { id: string; name: string; userId: string | null; role: "OWNER" | "MEMBER"; leftAt: Date | null };

export type LedgerContext = {
  user: SessionUser;
  ledger: { id: string; name: string; kind: "PERSONAL" | "SHARED"; currency: string; monthlyBudget: number | null };
  member: { id: string; role: "OWNER" | "MEMBER" };
  /** Everyone who has ever been in the ledger (labels old expenses) */
  allMembers: Member[];
  /** Current members */
  members: Member[];
  ledgers: { id: string; name: string; kind: "PERSONAL" | "SHARED" }[];
  isShared: boolean;
  isOwner: boolean;
  /** "Today" in the user's time zone */
  today: { input: string; date: Date; month: Month; timeZone: string };
};

/**
 * Who's signed in and which ledger they're in, from the API (which checks the
 * session and membership). Deduped per request; redirects to /login if signed out.
 */
export const requireLedger = cache(() => apiGet<LedgerContext>("/api/context"));

export const requireUser = cache(async () => (await requireLedger()).user);
