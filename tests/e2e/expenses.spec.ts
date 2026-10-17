import { expect, test } from "@playwright/test";
import { addExpense, dayThisMonth, heroTotal, noDialogOpen, signUp, today } from "./helpers";

// 1×1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

test("add, validate, edit and delete expenses", async ({ page }) => {
  await signUp(page);

  // Validation reports every bad field at once
  await page.getByRole("button", { name: "Add expense" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: "Add expense" }).click();
  await expect(dialog.locator("#amount-error")).toBeVisible();
  await expect(dialog.locator("#description-error")).toBeVisible();
  await dialog.locator("#amount").fill("12.345");
  await dialog.locator("#description").fill("Too precise");
  await dialog.getByRole("button", { name: "Add expense" }).click();
  await expect(dialog.locator("#amount-error")).toBeVisible();
  await page.keyboard.press("Escape");
  await noDialogOpen(page);

  await addExpense(page, { amount: "450.50", description: "Team lunch", category: "Food & Dining", date: dayThisMonth(1) });
  await addExpense(page, { amount: "1,299", description: "Weekly groceries", category: "Groceries" });
  await expect.poll(() => heroTotal(page)).toContain("1,749.50");

  await page.getByRole("button", { name: /Team lunch/ }).click();
  await expect(page.locator("dialog[open] #amount")).toHaveValue("450.50");
  await page.locator("dialog[open] #amount").fill("500");
  await page.locator("dialog[open]").getByRole("button", { name: "Save changes" }).click();
  await noDialogOpen(page);
  await expect.poll(() => heroTotal(page)).toContain("1,799.00");

  await page.getByRole("button", { name: /Weekly groceries/ }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Yes, delete" }).click();
  await noDialogOpen(page);
  await expect(page.getByRole("button", { name: /Weekly groceries/ })).toHaveCount(0);
});

test("N shortcut, category suggestions and remembered category", async ({ page }) => {
  await signUp(page);
  await page.keyboard.press("n");
  const dialog = page.locator("dialog[open]");
  await expect(dialog.getByRole("heading", { name: "Add expense" })).toBeVisible();

  // Keyword suggestion
  await dialog.locator("#description").fill("Uber to airport");
  await expect(dialog.locator("#categoryId")).toHaveValue(await optionValue(page, "Transport"));
  await expect(dialog.getByText("Suggested from the description")).toBeVisible();
  await dialog.locator("#amount").fill("640");
  await dialog.getByRole("button", { name: "Add expense" }).click();
  await noDialogOpen(page);

  // Learned from history: the same first word gets the same category
  await page.keyboard.press("n");
  await page.locator("dialog[open] #description").fill("Uber home");
  await expect(page.locator("dialog[open] #categoryId")).toHaveValue(await optionValue(page, "Transport"));
  await page.keyboard.press("Escape");

  // The last category used is preselected
  await page.keyboard.press("n");
  await expect(page.locator("dialog[open] #categoryId")).toHaveValue(await optionValue(page, "Transport"));
});

async function optionValue(page: import("@playwright/test").Page, label: string) {
  return (await page.locator("dialog[open] #categoryId option", { hasText: label }).getAttribute("value"))!;
}

test("receipt upload, view and remove", async ({ page, request }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Add expense" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("#amount").fill("99");
  await dialog.locator("#description").fill("Pharmacy");
  await dialog.getByLabel("Attach receipt").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
  await dialog.getByRole("button", { name: "Add expense" }).click();
  await noDialogOpen(page);

  await page.getByRole("button", { name: /Pharmacy.*has receipt/ }).click();
  const img = page.locator("dialog[open] img[alt=Receipt]");
  await expect(img).toBeVisible();
  const src = (await img.getAttribute("src"))!;
  const res = await page.request.get(src);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");

  // Not visible to anyone signed out
  expect((await request.get(src)).status()).toBe(401);

  // Fake "image" that's really HTML is rejected by content sniffing
  await page.locator("dialog[open]").getByLabel("Replace receipt").setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") });
  await page.locator("dialog[open]").getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("dialog[open]").getByText(/Use a JPEG, PNG, WebP or PDF/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Pharmacy/ }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Remove" }).click();
  await expect(page.locator("dialog[open] img[alt=Receipt]")).toHaveCount(0);
  expect((await page.request.get(src)).status()).toBe(404);
});

test("search, filter and CSV export", async ({ page }) => {
  await signUp(page);
  await addExpense(page, { amount: "300", description: "Team lunch", category: "Food & Dining" });
  await addExpense(page, { amount: "200", description: "Coffee", category: "Food & Dining" });
  await addExpense(page, { amount: '50', description: '=HYPERLINK("x")', category: "Shopping" });

  await page.goto("/dashboard/expenses");
  await page.fill('input[name="q"]', "LUNCH");
  await page.keyboard.press("Enter");
  await page.waitForURL(/q=LUNCH/);
  await expect(page.getByRole("button", { name: /Team lunch/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Coffee/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page.locator('input[name="q"]')).toHaveValue("");
  await page.selectOption('select[name="category"]', { label: "Food & Dining" });
  await page.waitForURL(/category=/);
  await expect(page.locator("main ul li button")).toHaveCount(2);

  const csv = await (await page.request.get("/api/expenses/export")).text();
  expect(csv).toContain(`"${today()}","Team lunch","Food & Dining",300.00`);
  // Spreadsheet formulas are neutralised
  expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
});
