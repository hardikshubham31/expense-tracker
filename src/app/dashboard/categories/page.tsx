import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { getMonthSummary } from "@/lib/data";
import { formatMonth } from "@/lib/dates";
import { requireLedger } from "@/lib/session";
import { CategoryList, NewCategoryButton, type ManagedCategory } from "./category-manager";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6" aria-busy="true" aria-label="Loading categories">
          <Skeleton className="h-14 w-72" />
          <Skeleton className="h-96" />
        </div>
      }
    >
      <Categories />
    </Suspense>
  );
}

async function Categories() {
  const { today } = await requireLedger();
  const month = today.month;
  const summary = await getMonthSummary(month);
  const categories: ManagedCategory[] = summary.categories
    .flatMap((c) => (c.id ? [{ id: c.id, name: c.name, color: c.color ?? "blue", budget: c.budget, spent: c.total, count: c.count }] : []))
    .toSorted((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description={`Organize expenses and set monthly budgets. Spending shown for ${formatMonth(month)}.`}
        actions={<NewCategoryButton usedColors={categories.map((c) => c.color)} currency={summary.currency} />}
      />
      <Card>
        <CategoryList categories={categories} currency={summary.currency} />
      </Card>
    </div>
  );
}
