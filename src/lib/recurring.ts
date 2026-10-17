import "server-only";
import type { Frequency } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, addMonthsClamped } from "@/lib/dates";
import { equalSplit } from "@/lib/splits";

/** Most occurrences materialized per rule per call (a rule backdated years still terminates). */
const MAX_CATCH_UP = 120;

/** The occurrence after `date`, keeping the start date's day-of-month for monthly/yearly rules. */
export function nextOccurrence(date: Date, frequency: Frequency, startDate: Date) {
  const anchorDay = startDate.getUTCDate();
  if (frequency === "WEEKLY") return addDays(date, 7);
  if (frequency === "MONTHLY") return addMonthsClamped(date, 1, anchorDay);
  return addMonthsClamped(date, 12, anchorDay);
}

/**
 * Create every due occurrence up to and including `today` for the ledger's active
 * rules. Safe to call on every page view: (recurringId, date) is unique, so
 * concurrent calls can't double-insert. Returns the months that gained expenses.
 */
export async function materializeRecurring(ledgerId: string, today: Date, activeMemberIds: string[]) {
  const rules = await prisma.recurringRule.findMany({
    where: { ledgerId, active: true, nextDate: { lte: today } },
  });
  const touchedMonths = new Set<string>();

  for (const rule of rules) {
    const dates: Date[] = [];
    let next = rule.nextDate;
    while (next <= today && (!rule.endDate || next <= rule.endDate) && dates.length < MAX_CATCH_UP) {
      dates.push(next);
      next = nextOccurrence(next, rule.frequency, rule.startDate);
    }
    const finished = Boolean(rule.endDate && next > rule.endDate);

    if (rule.type === "INCOME") {
      await prisma.income.createMany({
        data: dates.map((date) => ({ ledgerId, amount: rule.amount, source: rule.description, date, recurringId: rule.id })),
        skipDuplicates: true,
      });
    } else {
      // A payer who has left falls back to the first active member.
      const payer = rule.paidById && activeMemberIds.includes(rule.paidById) ? rule.paidById : activeMemberIds[0];
      const shared = activeMemberIds.length > 1;
      for (const date of dates) {
        try {
          await prisma.expense.create({
            data: {
              ledgerId,
              amount: rule.amount,
              description: rule.description,
              categoryId: rule.categoryId,
              date,
              paidById: payer,
              recurringId: rule.id,
              splits: shared ? { createMany: { data: equalSplit(rule.amount, activeMemberIds) } } : undefined,
            },
          });
          touchedMonths.add(date.toISOString().slice(0, 7));
        } catch (error) {
          // P2002: another request already created this occurrence
          if (!(error instanceof Error && "code" in error && error.code === "P2002")) throw error;
        }
      }
    }

    await prisma.recurringRule.update({
      where: { id: rule.id },
      data: { nextDate: next, ...(finished ? { active: false } : {}) },
    });
  }
  return [...touchedMonths];
}
