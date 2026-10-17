"use client";

import Form from "next/form";
import { selectBase } from "@/components/ui";
import { UNCATEGORIZED } from "@expense/shared/categories";
import type { CategoryRow } from "@/lib/data";

export function CategoryPicker({ categories, value }: { categories: CategoryRow[]; value: string }) {
  return (
    <Form action="/dashboard/trends">
      <label>
        <span className="sr-only">Category</span>
        <select
          name="category"
          defaultValue={value}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className={`${selectBase} w-auto py-1.5 text-xs`}
        >
          <option value="">All spending</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={UNCATEGORIZED}>Uncategorized</option>
        </select>
      </label>
      <noscript>
        <button type="submit">Apply</button>
      </noscript>
    </Form>
  );
}
