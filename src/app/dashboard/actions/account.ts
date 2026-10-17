"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isValidTimeZone, normalizeTimeZone } from "@/lib/dates";
import { fail, firstErrors, text, type ActionResult } from "@/lib/action-utils";

const accountSchema = z.object({
  name: text(80).min(1, "Enter your name."),
  timezone: z.string().refine(isValidTimeZone, "Pick a valid time zone."),
  budgetAlerts: z.enum(["on"]).optional(),
});

export async function updateAccount(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstErrors(parsed.error));

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name, timezone: normalizeTimeZone(parsed.data.timezone), budgetAlerts: parsed.data.budgetAlerts === "on" },
    }),
    // Keep the display name in current households in sync
    prisma.ledgerMember.updateMany({ where: { userId: user.id, leftAt: null }, data: { name: parsed.data.name } }),
  ]);
  refresh();
  return { ok: true };
}

/** Called once from the browser when the account has no time zone yet. */
export async function saveDetectedTimezone(timezone: string) {
  const user = await requireUser();
  if (user.timezone || !isValidTimeZone(timezone)) return;
  await prisma.user.update({ where: { id: user.id }, data: { timezone: normalizeTimeZone(timezone) } });
  refresh();
}
