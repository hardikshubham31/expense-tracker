import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPersonalLedger } from "@/lib/ledgers";
import { todayIn } from "@/lib/dates";

export const LEDGER_COOKIE = "ledger";

/**
 * Data Access Layer entry point: verifies the session against the database
 * and redirects to /login when there isn't one. Deduped per request.
 */
export const requireUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { id, name, email, image, emailVerified } = session.user;
  return {
    id,
    name,
    email,
    image,
    emailVerified,
    timezone: session.user.timezone ?? null,
    budgetAlerts: session.user.budgetAlerts ?? true,
  };
});

export type SessionUser = Awaited<ReturnType<typeof requireUser>>;

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

/**
 * The ledger the user is working in (cookie), verified against an active
 * membership; falls back to their personal ledger. Every data read and write
 * goes through this, so a user can never touch a ledger they don't belong to.
 */
export const requireLedger = cache(async () => {
  const user = await requireUser();
  const wanted = (await cookies()).get(LEDGER_COOKIE)?.value;

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
});

export type LedgerContext = Awaited<ReturnType<typeof requireLedger>>;
