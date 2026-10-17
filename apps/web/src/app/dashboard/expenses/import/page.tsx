import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { CsvImporter } from "./csv-importer";

export const metadata: Metadata = { title: "Import expenses" };

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Import expenses"
        description={
          <>
            Upload a CSV export from your bank or another app. Nothing is saved until you confirm.{" "}
            <Link href="/dashboard/expenses" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Back to expenses
            </Link>
          </>
        }
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <CsvImporter />
      </Suspense>
    </div>
  );
}
