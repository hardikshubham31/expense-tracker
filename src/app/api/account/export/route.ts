import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInput } from "@/lib/dates";

const date = (d: Date) => toDateInput(d);

/** Everything the user can see, as JSON: profile and every ledger they belong to. */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { name: true, email: true, timezone: true, createdAt: true },
  });
  const ledgers = await prisma.ledger.findMany({
    where: { members: { some: { userId: session.user.id, leftAt: null } } },
    select: {
      name: true,
      kind: true,
      currency: true,
      monthlyBudget: true,
      members: { select: { id: true, name: true, role: true, leftAt: true } },
      categories: { select: { id: true, name: true, color: true, budget: true } },
      expenses: {
        select: {
          date: true,
          description: true,
          amount: true,
          notes: true,
          categoryId: true,
          paidById: true,
          splits: { select: { memberId: true, amount: true } },
        },
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
      expenses: l.expenses.map((e) => ({ ...e, date: date(e.date) })),
      incomes: l.incomes.map((i) => ({ ...i, date: date(i.date) })),
      recurring: l.recurring.map((r) => ({ ...r, startDate: date(r.startDate), endDate: r.endDate ? date(r.endDate) : null })),
      settlements: l.settlements.map((s) => ({ ...s, date: date(s.date) })),
    })),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="expense-tracker-export.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
