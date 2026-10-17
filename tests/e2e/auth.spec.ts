import { expect, test } from "@playwright/test";
import { linkIn, signIn, signUp, waitForEmail } from "./helpers";

test("sign-up signs in right away with starter categories", async ({ page }) => {
  await signUp(page, { name: "Sana Signup" });
  await expect(page.getByRole("heading", { name: "Hi, Sana" })).toBeVisible();
  await page.goto("/dashboard/categories");
  await expect(page.getByRole("button", { name: /Groceries/ })).toBeVisible();
});

test("signing up twice with the same email is refused", async ({ page }) => {
  const { email } = await signUp(page);
  await page.context().clearCookies();
  await page.goto("/signup");
  await page.fill("#name", "Someone Else");
  await page.fill("#email", email);
  await page.fill("#password", "test-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/already exists/)).toBeVisible();
});

test("password reset by email", async ({ page }) => {
  const { email } = await signUp(page, { name: "Reese Et" });
  await page.context().clearCookies();

  await page.goto("/forgot-password");
  await page.fill("#email", email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const mail = await waitForEmail(email, /Reset your password/);
  await page.goto(linkIn(mail));
  await page.waitForURL("**/reset-password?token=**");
  await page.fill("#password", "brand-new-pass-2");
  await page.fill("#confirm", "brand-new-pass-2");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

  await signIn(page, email, "brand-new-pass-2");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("protected pages redirect, and redirectTo can't leave the site", async ({ page }) => {
  await page.goto("/dashboard/trends");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fdashboard%2Ftrends/);

  const { email, password } = await signUp(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");

  await page.goto("/login?redirectTo=//evil.example.com");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  expect(new URL(page.url()).host).toBe("localhost:3100");
});
