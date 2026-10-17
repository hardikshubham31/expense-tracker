import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireLedger } from "@/lib/session";
import { expenseWhere } from "@/lib/data";
import { monthKey, parseMonth, toDateInput } from "@/lib/dates";
import { currencyDigits } from "@/lib/money";

/** Quote every cell and neutralise spreadsheet formulas (CSV injection). */
function cell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  if (!(await auth.api.getSession({ headers: await headers() }))) return new Response("Unauthorized", { status: 401 });
  const { ledger, allMembers, isShared, today } = await requireLedger();

  const params = new URL(request.url).searchParams;
  const month = parseMonth(params.get("month")) ?? today.month;
  const q = params.get("q")?.trim().slice(0, 100) || undefined;
  const category = params.get("category") || undefined;

  const expenses = await prisma.expense.findMany({
    where: expenseWhere(ledger.id, { month, q, category }),
    select: { date: true, description: true, amount: true, notes: true, paidById: true, category: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const names = new Map(allMembers.map((m) => [m.id, m.name]));
  const digits = currencyDigits(ledger.currency);
  const header = ["Date", "Description", "Category", `Amount (${ledger.currency})`, ...(isShared ? ["Paid by"] : []), "Notes"];
  const lines = [
    header.map(cell).join(","),
    ...expenses.map((e) =>
      [
        cell(toDateInput(e.date)),
        cell(e.description),
        cell(e.category?.name ?? "Uncategorized"),
        (e.amount / 100).toFixed(digits),
        ...(isShared ? [cell(names.get(e.paidById) ?? "")] : []),
        cell(e.notes ?? ""),
      ].join(","),
    ),
  ];

  // BOM so Excel opens UTF-8 (₹, €) correctly
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expenses-${monthKey(month)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
