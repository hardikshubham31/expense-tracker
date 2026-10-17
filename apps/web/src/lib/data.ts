import "server-only";
import { monthKey, type Month } from "@expense/shared/dates";
import { apiGet } from "@/lib/api";
import type { Transfer } from "@expense/shared/splits";

// Typed readers over the API. The API scopes everything to the signed-in
// user's active ledger; nothing here takes a ledger or user id.

export type CategoryRow = { id: string; name: string; color: string; budget: number | null };

export type ExpenseFilters = { month: Month; q?: string; category?: string };

export type ExpenseRow = {
  id: string;
  amount: number;
  description: string;
  notes: string | null;
  date: Date;
  paidById: string;
  recurringId: string | null;
  category: { id: string; name: string; color: string } | null;
  splits: { memberId: string; amount: number }[];
  receipt: { id: string; mimeType: string; originalName: string } | null;
};

export type IncomeRow = { id: string; amount: number; source: string; notes: string | null; date: Date; recurringId: string | null };

export type CategoryTotal = {
  id: string | null;
  name: string;
  color: string | null;
  budget: number | null;
  total: number;
  count: number;
};

export type MonthSummary = {
  total: number;
  myShare: number;
  count: number;
  income: number;
  previousTotal: number;
  byDay: number[];
  categories: CategoryTotal[];
  monthlyBudget: number | null;
  currency: string;
};

export type TrendMonth = { key: string; year: number; month: number; spent: number; income: number; byCategory: Record<string, number> };

export type RecurringRuleRow = {
  id: string;
  type: "EXPENSE" | "INCOME";
  amount: number;
  description: string;
  frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  startDate: Date;
  endDate: Date | null;
  nextDate: Date;
  active: boolean;
  paidById: string | null;
  category: { id: string; name: string; color: string } | null;
};

export type Settlement = { id: string; fromMemberId: string; toMemberId: string; amount: number; date: Date; note: string | null };

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : "";
};

export const getCategories = () => apiGet<CategoryRow[]>("/api/categories");

export const getExpenses = ({ month, q, category }: ExpenseFilters, take?: number) =>
  apiGet<ExpenseRow[]>(`/api/expenses${qs({ month: monthKey(month), q, category, take })}`);

export const getIncomes = (month: Month) => apiGet<IncomeRow[]>(`/api/income${qs({ month: monthKey(month) })}`);

export const getMonthSummary = (month: Month) => apiGet<MonthSummary>(`/api/summary${qs({ month: monthKey(month) })}`);

export const getTrends = (end: Month) =>
  apiGet<{ months: TrendMonth[]; categories: CategoryRow[]; currency: string }>(`/api/trends${qs({ end: monthKey(end) })}`);

export async function getBalances() {
  const data = await apiGet<{ net: Record<string, number>; mine: number; transfers: Transfer[]; settlements: Settlement[]; currency: string }>(
    "/api/balances",
  );
  return { ...data, net: new Map(Object.entries(data.net)) };
}

export const getRecurringRules = () => apiGet<RecurringRuleRow[]>("/api/recurring");

export const getDescriptionHints = () => apiGet<{ description: string; categoryId: string | null }[]>("/api/expenses/hints");

export const getLedgerDetails = () =>
  apiGet<{
    ledger: { id: string; name: string; kind: "PERSONAL" | "SHARED"; currency: string; monthlyBudget: number | null };
    members: { id: string; name: string; userId: string | null; role: "OWNER" | "MEMBER"; leftAt: Date | null }[];
    invites: { id: string; email: string; expiresAt: Date; token: string }[];
  }>("/api/ledger");

export const getAccount = () =>
  apiGet<{
    id: string;
    name: string;
    email: string;
    timezone: string | null;
    budgetAlerts: boolean;
    hasPassword: boolean;
    providers: string[];
  }>("/api/account");
