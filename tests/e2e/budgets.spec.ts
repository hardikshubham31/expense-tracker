import { expect, test } from "@playwright/test";
import { addExpense, emailsTo, noDialogOpen, signUp, waitForEmail } from "./helpers";

test("budgets show status and email alerts once per threshold", async ({ page }) => {
  const { email } = await signUp(page);

  await page.goto("/dashboard/categories");
  await page.getByRole("button", { name: /Food & Dining/ }).click();
  await page.locator("dialog[open] #budget").fill("1000");
  await page.locator("dialog[open]").getByRole("button", { name: "Save changes" }).click();
  await noDialogOpen(page);

  await page.goto("/dashboard");
  await addExpense(page, { amount: "850", description: "Dinner party", category: "Food & Dining" });
  await expect(page.getByText(/85% used/)).toBeVisible();
  await waitForEmail(email, /Food & Dining: 80% of budget used/);

  // Still over 80%: no second 80% email
  await addExpense(page, { amount: "50", description: "Snacks", category: "Food & Dining" });
  await addExpense(page, { amount: "200", description: "Birthday cake", category: "Food & Dining" });
  await expect(page.getByText(/Over by ₹100\.00/)).toBeVisible();
  await waitForEmail(email, /Food & Dining: budget exceeded/);

  await page.waitForTimeout(1000);
  const alerts = (await emailsTo(email)).filter((e) => /Food & Dining/.test(e.subject));
  expect(alerts.map((e) => e.subject).toSorted()).toEqual(["Food & Dining: 80% of budget used", "Food & Dining: budget exceeded"]);
});

test("turning alerts off stops the emails", async ({ page }) => {
  const { email } = await signUp(page);
  await page.goto("/dashboard/account");
  await page.getByLabel("Email me budget alerts").uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.goto("/dashboard/settings");
  await page.fill("#monthlyBudget", "100");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await page.goto("/dashboard");
  await addExpense(page, { amount: "500", description: "Big shop" });
  await expect(page.getByText(/Over by/)).toBeVisible();
  await page.waitForTimeout(1500);
  expect((await emailsTo(email)).filter((e) => /budget/i.test(e.subject))).toHaveLength(0);
});
