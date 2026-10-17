import { expect, test } from "@playwright/test";
import { addExpense, signUp } from "./helpers";

test("theme toggle applies before paint and persists", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // The inline script sets it from localStorage before React hydrates
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("time zone is detected, profile edits and data export", async ({ page }) => {
  await signUp(page, { name: "Tim Zone" });
  await page.goto("/dashboard/account");
  // Playwright runs the browser in UTC; the first dashboard visit saved it
  await expect(page.locator("#account-tz")).toHaveValue("UTC");
  await page.locator("#account-tz").selectOption("Asia/Kolkata");
  await page.fill("#account-name", "Tim Zoned");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.locator("#account-tz")).toHaveValue("Asia/Kolkata");

  await page.goto("/dashboard");
  await addExpense(page, { amount: "42", description: "Exported thing" });
  const data = await (await page.request.get("/api/account/export")).json();
  expect(data.user.timezone).toBe("Asia/Kolkata");
  expect(data.ledgers[0].expenses[0]).toMatchObject({ description: "Exported thing", amount: 4200 });
});

test("change password and delete account", async ({ page }) => {
  const { email, password } = await signUp(page);
  await page.goto("/dashboard/account");
  await page.fill("#current-password", "wrong-password");
  await page.fill("#new-password", "another-pass-9");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your current password is incorrect.")).toBeVisible();
  await page.fill("#current-password", password);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();

  await page.getByRole("button", { name: "Delete my account…" }).click();
  const confirm = page.getByRole("button", { name: "Delete account permanently" });
  await expect(confirm).toBeDisabled();
  await page.fill("#confirm-email", email);
  await page.fill("#delete-password", "another-pass-9");
  await confirm.click();
  await page.waitForURL("**/login");

  await page.fill("#email", email);
  await page.fill("#password", "another-pass-9");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
});
