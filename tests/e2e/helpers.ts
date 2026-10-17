import fs from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { TEST_ENV } from "../../playwright.config";

type Email = { to: string | string[]; subject: string; text: string; html: string };

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

async function readOutbox(): Promise<Email[]> {
  const dir = TEST_ENV.OUTBOX_DIR;
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).sort();
  const emails = await Promise.all(files.map(async (f) => JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as Email));
  return emails;
}

export async function emailsTo(address: string) {
  return (await readOutbox()).filter((e) => [e.to].flat().includes(address));
}

/** Wait for an email to `address` whose subject matches, and return it. */
export async function waitForEmail(address: string, subject: RegExp, { count = 1 } = {}) {
  let found: Email[] = [];
  await expect
    .poll(
      async () => {
        found = (await emailsTo(address)).filter((e) => subject.test(e.subject));
        return found.length;
      },
      { timeout: 15_000, message: `email to ${address} matching ${subject}` },
    )
    .toBeGreaterThanOrEqual(count);
  return found.at(-1)!;
}

export function linkIn(email: Email) {
  const url = email.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error(`No link in email "${email.subject}"`);
  return url;
}

/** Sign up through the UI; accounts are signed in right away (no email verification). */
export async function signUp(page: Page, { name = "Test User", email = uniqueEmail("user"), password = "test-password-1", redirectTo = "" } = {}) {
  await page.goto(redirectTo ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}` : "/signup");
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(redirectTo ? `**${redirectTo}` : "**/dashboard**");
  await page.waitForLoadState("networkidle"); // hydrated, so keyboard shortcuts work
  return { name, email, password };
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard**");
}

export async function noDialogOpen(page: Page) {
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}

/** Add an expense through the global "Add expense" dialog. */
export async function addExpense(
  page: Page,
  { amount, description, category, date }: { amount: string; description: string; category?: string; date?: string },
) {
  await page.getByRole("button", { name: "Add expense" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("#amount").fill(amount);
  await dialog.locator("#description").fill(description);
  if (category) await dialog.locator("#categoryId").selectOption({ label: category });
  if (date) await dialog.locator("#date").fill(date);
  await dialog.getByRole("button", { name: "Add expense" }).click();
  await noDialogOpen(page);
}

/** "YYYY-MM-DD" for a day of the current UTC month, capped at today. */
export function dayThisMonth(day: number) {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, d.getUTCDate())).padStart(2, "0")}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" `months` before today's date (same day, clamped). */
export function monthsAgo(months: number) {
  const d = new Date();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return target.toISOString().slice(0, 10);
}

export async function heroTotal(page: Page) {
  return page.locator('section[aria-label="Monthly total"] p').nth(1).textContent();
}
