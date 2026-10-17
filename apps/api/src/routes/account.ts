import { Router } from "express";
import { z } from "zod";
import { isValidTimeZone, normalizeTimeZone, toDateInput } from "@expense/shared/dates";
import { prisma } from "../db.js";
import { getAuth } from "../middleware/context.js";
import { firstErrors, invalid, text } from "../http.js";
import { bodyOf, str } from "./body.js";

export const accountRouter = Router();

/** GET /api/account: profile details the account page needs. */
accountRouter.get("/", async (req, res) => {
  const { user } = getAuth(req);
  const accounts = await prisma.account.findMany({ where: { userId: user.id }, select: { providerId: true } });
  res.json({
    ...user,
    hasPassword: accounts.some((a) => a.providerId === "credential"),
    providers: accounts.filter((a) => a.providerId !== "credential").map((a) => a.providerId),
  });
});

const accountSchema = z.object({
  name: text(80).min(1, "Enter your name."),
  timezone: z.string().refine(isValidTimeZone, "Pick a valid time zone."),
});

accountRouter.patch("/", async (req, res) => {
  const { user } = getAuth(req);
  const body = bodyOf(req);
  const parsed = accountSchema.safeParse({ name: str(body, "name"), timezone: str(body, "timezone") });
  if (!parsed.success) throw invalid(firstErrors(parsed.error));
  const budgetAlerts = body.budgetAlerts === "on" || body.budgetAlerts === true;

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { name: parsed.data.name, timezone: normalizeTimeZone(parsed.data.timezone), budgetAlerts } }),
    // Keep the display name in current households in sync
    prisma.ledgerMember.updateMany({ where: { userId: user.id, leftAt: null }, data: { name: parsed.data.name } }),
  ]);
  res.json({ ok: true });
});

/** POST /api/account/timezone { timezone }: saved once from the browser when unset. */
accountRouter.post("/timezone", async (req, res) => {
  const { user } = getAuth(req);
  const timezone = str(bodyOf(req), "timezone");
  if (!user.timezone && isValidTimeZone(timezone)) {
    await prisma.user.update({ where: { id: user.id }, data: { timezone: normalizeTimeZone(timezone) } });
  }
  res.json({ ok: true });
});

/** GET /api/account/export: everything the user can see, as JSON. */
accountRouter.get("/export", async (req, res) => {
  const { user: me } = getAuth(req);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { name: true, email: true, timezone: true, createdAt: true } });
  const ledgers = await prisma.ledger.findMany({
    where: { members: { some: { userId: me.id, leftAt: null } } },
    select: {
      name: true,
      kind: true,
      currency: true,
      monthlyBudget: true,
      members: { select: { id: true, name: true, role: true, leftAt: true } },
      categories: { select: { id: true, name: true, color: true, budget: true } },
      expenses: {
        select: { date: true, description: true, amount: true, notes: true, categoryId: true, paidById: true, splits: { select: { memberId: true, amount: true } } },
        orderBy: { date: "asc" },
      },
      incomes: { select: { date: true, source: true, amount: true, notes: true }, orderBy: { date: "asc" } },
      recurring: { select: { type: true, description: true, amount: true, frequency: true, startDate: true, endDate: true, active: true, categoryId: true } },
      settlements: { select: { date: true, fromMemberId: true, toMemberId: true, amount: true, note: true } },
    },
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    note: "Amounts are integers in hundredths of the ledger currency (e.g. 12345 = 123.45).",
    user,
    ledgers: ledgers.map((l) => ({
      ...l,
      expenses: l.expenses.map((e) => ({ ...e, date: toDateInput(e.date) })),
      incomes: l.incomes.map((i) => ({ ...i, date: toDateInput(i.date) })),
      recurring: l.recurring.map((r) => ({ ...r, startDate: toDateInput(r.startDate), endDate: r.endDate ? toDateInput(r.endDate) : null })),
      settlements: l.settlements.map((s) => ({ ...s, date: toDateInput(s.date) })),
    })),
  };

  res
    .type("application/json; charset=utf-8")
    .set("Content-Disposition", 'attachment; filename="expense-tracker-export.json"')
    .set("Cache-Control", "private, no-store")
    .send(JSON.stringify(payload, null, 2));
});
