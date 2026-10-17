import { expect, test } from "@playwright/test";
import { addExpense, dayThisMonth, signUp } from "./helpers";

test("CSV import maps columns, skips credits and detects duplicates", async ({ page }) => {
  await signUp(page);
  // Already in the ledger, so the matching CSV row is a duplicate
  await addExpense(page, { amount: "220", description: "Metro card", category: "Transport", date: dayThisMonth(1) });

  const [y, m] = dayThisMonth(1).split("-");
  const d = (day: number) => `${String(day).padStart(2, "0")}/${m}/${y}`;
  const csv = [
    "Txn Date,Narration,Amount (INR),Balance",
    `${d(1)},Metro card,-220.00,10000`,
    `${d(1)},"SWIGGY, ORDER 123",-345.50,9654.50`,
    `${d(1)},Salary credit,50000.00,59654.50`,
    `${d(1)},BigBasket groceries,"-1,299.00",58355.50`,
    `not a date,Broken row,-10,0`,
  ].join("\n");

  await page.goto("/dashboard/expenses/import");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("CSV file").setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });

  // Detected: DD/MM/YYYY, negatives are expenses
  await expect(page.getByLabel("Date format")).toHaveValue("dmy");
  await expect(page.getByText(/2 to import · 1 already exist · 1 skipped · 1 unreadable/)).toBeVisible();
  const rows = page.locator("tbody tr");
  await expect(rows.filter({ hasText: "Income or refund" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Already exists" })).toHaveCount(1);
  // Keyword suggestion picked a category for the Swiggy row
  await expect(rows.filter({ hasText: "SWIGGY" }).locator("select")).toHaveValue(
    (await rows.filter({ hasText: "SWIGGY" }).locator("option", { hasText: "Food & Dining" }).getAttribute("value"))!,
  );

  await page.getByRole("button", { name: "Import 2 expenses" }).click();
  await expect(page.getByText("Imported 2 expenses.")).toBeVisible();

  await page.goto("/dashboard/expenses");
  await expect(page.getByRole("button", { name: /SWIGGY, ORDER 123/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /BigBasket/ })).toContainText("₹1,299.00");
  await expect(page.getByRole("button", { name: /Metro card/ })).toHaveCount(1);
});
