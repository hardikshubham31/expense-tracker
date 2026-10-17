import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { computeBalances } from "@/lib/splits";
import { deleteReceiptFile } from "@/lib/receipts";

/** Delete a ledger (rows cascade) and its receipt files. */
export async function deleteLedgerAndFiles(ledgerId: string) {
  const receipts = await prisma.receipt.findMany({ where: { ledgerId }, select: { storageKey: true } });
  await prisma.ledger.delete({ where: { id: ledgerId } });
  await Promise.all(receipts.map((r) => deleteReceiptFile(r.storageKey)));
}

/** Personal ledger + owner membership + starter categories, for a new user. */
export async function createPersonalLedger(userId: string, name: string) {
  return prisma.ledger.create({
    data: {
      name: "Personal",
      kind: "PERSONAL",
      members: { create: { userId, name, role: "OWNER" } },
      categories: { createMany: { data: DEFAULT_CATEGORIES } },
    },
    select: { id: true },
  });
}

export async function createSharedLedger(userId: string, userName: string, name: string, currency: string) {
  return prisma.ledger.create({
    data: {
      name,
      kind: "SHARED",
      currency,
      members: { create: { userId, name: userName, role: "OWNER" } },
      categories: { createMany: { data: DEFAULT_CATEGORIES } },
    },
    select: { id: true },
  });
}

/** Net balance per member id (positive = is owed). */
export async function getLedgerBalances(ledgerId: string) {
  const [members, expenses, settlements] = await Promise.all([
    prisma.ledgerMember.findMany({ where: { ledgerId }, select: { id: true } }),
    prisma.expense.findMany({
      where: { ledgerId, splits: { some: {} } },
      select: { paidById: true, amount: true, splits: { select: { memberId: true, amount: true } } },
    }),
    prisma.settlement.findMany({ where: { ledgerId }, select: { fromMemberId: true, toMemberId: true, amount: true } }),
  ]);
  return computeBalances(members.map((m) => m.id), expenses, settlements);
}

export class LedgerError extends Error {}

/**
 * Leave a shared ledger. Blocked while the member's balance isn't settled.
 * Hands ownership to the longest-standing member; deletes the ledger if nobody is left.
 */
export async function leaveSharedLedger(memberId: string) {
  const member = await prisma.ledgerMember.findUniqueOrThrow({
    where: { id: memberId },
    select: { id: true, role: true, leftAt: true, ledger: { select: { id: true, name: true, kind: true } } },
  });
  if (member.leftAt) return;
  if (member.ledger.kind !== "SHARED") throw new LedgerError("You can't leave your personal ledger.");

  const balance = (await getLedgerBalances(member.ledger.id)).get(member.id) ?? 0;
  if (balance !== 0) throw new LedgerError(`Settle up in “${member.ledger.name}” first.`);

  const others = await prisma.ledgerMember.findMany({
    where: { ledgerId: member.ledger.id, leftAt: null, id: { not: member.id } },
    orderBy: { joinedAt: "asc" },
    select: { id: true },
  });
  if (others.length === 0) {
    await deleteLedgerAndFiles(member.ledger.id);
    return;
  }
  await prisma.$transaction([
    prisma.ledgerMember.update({ where: { id: member.id }, data: { leftAt: new Date(), role: "MEMBER" } }),
    ...(member.role === "OWNER" ? [prisma.ledgerMember.update({ where: { id: others[0].id }, data: { role: "OWNER" } })] : []),
  ]);
}

/** Runs before Better Auth deletes a user: leave shared ledgers, drop personal ones. */
export async function prepareAccountDeletion(userId: string) {
  const memberships = await prisma.ledgerMember.findMany({
    where: { userId, leftAt: null },
    select: { id: true, ledger: { select: { id: true, kind: true, name: true } } },
  });
  // Check every shared balance first so nothing changes if one blocks.
  for (const m of memberships.filter((m) => m.ledger.kind === "SHARED")) {
    const balance = (await getLedgerBalances(m.ledger.id)).get(m.id) ?? 0;
    if (balance !== 0) throw new LedgerError(`Settle up in “${m.ledger.name}” before deleting your account.`);
  }
  for (const m of memberships) {
    if (m.ledger.kind === "SHARED") await leaveSharedLedger(m.id);
    else await deleteLedgerAndFiles(m.ledger.id);
  }
}
