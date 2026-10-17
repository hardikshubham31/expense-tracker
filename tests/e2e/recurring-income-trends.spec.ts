import { expect, test } from "@playwright/test";
import { addExpense, heroTotal, monthsAgo, noDialogOpen, signUp, today } from "./helpers";

test("recurring rules back-fill, pause and resume", async ({ page }) => {
  await signUp(page);
  await page.goto("/dashboard/recurring");
  await page.getByRole("button", { name: "New recurring" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("#rule-amount").fill("15000");
  await dialog.locator("#rule-description").fill("Rent");
  await dialog.locator("#rule-category").selectOption({ label: "Bills & Utilities" });
  await dialog.locator("#rule-start").fill(monthsAgo(2));
  await dialog.getByRole("button", { name: "Create" }).click();
  await noDialogOpen(page);

  // Visiting fills in the 3 occurrences up to today: 2 months ago, last month, this month
  await page.goto("/dashboard/expenses");
  await expect(page.getByRole("button", { name: /Rent.*recurring/ })).toHaveCount(1);
  await page.getByRole("link", { name: /Previous month/ }).click();
  await expect(page.getByRole("button", { name: /Rent/ })).toHaveCount(1);

  // Reloading never duplicates
  await page.reload();
  await expect(page.getByRole("button", { name: /Rent/ })).toHaveCount(1);

  await page.goto("/dashboard/recurring");
  await expect(page.getByText(/About ₹15,000\.00 a month/)).toBeVisible();
  await page.getByRole("button", { name: "Pause Rent" }).click();
  await expect(page.getByText(/Paused/)).toBeVisible();
  await page.getByRole("button", { name: "Resume Rent" }).click();
  await expect(page.getByText(/Next /)).toBeVisible();
});

test("income, savings rate and 12-month trends", async ({ page }) => {
  await signUp(page);
  await page.goto("/dashboard/income");
  await page.getByRole("button", { name: "Add income" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("#income-amount").fill("50000");
  await dialog.locator("#income-source").fill("Salary");
  await dialog.locator("#income-date").fill(today());
  await dialog.getByRole("button", { name: "Add income" }).click();
  await noDialogOpen(page);
  await expect(page.getByRole("button", { name: /Salary/ })).toBeVisible();

  await page.goto("/dashboard");
  await addExpense(page, { amount: "12500", description: "Groceries run", category: "Groceries" });
  await expect.poll(() => heroTotal(page)).toContain("12,500.00");
  const headline = page.locator('section[aria-label="Monthly total"]');
  await expect(headline.getByText("₹50,000.00")).toBeVisible();
  await expect(headline.getByText("(75%)")).toBeVisible();

  await page.goto("/dashboard/trends");
  const chart = page.getByRole("group", { name: /Monthly totals/ });
  await chart.focus();
  await page.keyboard.press("End");
  const tip = chart.getByRole("status");
  await expect(tip).toContainText("₹12,500.00");
  await expect(tip).toContainText("₹50,000.00");
  await expect(tip).toContainText("Saved");

  await page.locator('select[name="category"]').selectOption({ label: "Groceries" });
  await page.waitForURL(/category=/);
  await expect(page.getByRole("heading", { name: "Groceries by month" })).toBeVisible();
});
