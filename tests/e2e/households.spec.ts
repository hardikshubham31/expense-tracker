import { expect, test } from "@playwright/test";
import { linkIn, noDialogOpen, signUp, uniqueEmail, waitForEmail } from "./helpers";

test("households: invite, split, balances, settle up, leave", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  const bobEmail = uniqueEmail("bob");

  await signUp(alice, { name: "Alice" });
  await alice.getByRole("button", { name: /Switch ledger/ }).click();
  await alice.getByRole("button", { name: "New household…" }).click();
  await alice.locator("dialog[open] #household-name").fill("Flat 4B");
  await alice.locator("dialog[open]").getByRole("button", { name: "Create household" }).click();
  await alice.waitForURL("**/dashboard/settings");
  await expect(alice.getByRole("heading", { name: "Household settings" })).toBeVisible();

  await alice.fill("#invite-email", bobEmail);
  await alice.getByRole("button", { name: "Create invite" }).click();
  await expect(alice.getByText(/Invite created/)).toBeVisible();

  // Bob opens the invite link (printed to the outbox), signs up, and lands back on the invite
  const invite = await waitForEmail(bobEmail, /Alice invited you to Flat 4B/);
  const invitePath = new URL(linkIn(invite)).pathname;
  await bob.goto(invitePath);
  await bob.waitForURL(/\/login\?redirectTo=/);
  await bob.getByRole("link", { name: "Create one" }).click();
  await signUp(bob, { name: "Bob", email: bobEmail, redirectTo: invitePath });
  await bob.getByRole("button", { name: "Accept and join" }).click();
  await bob.waitForURL("**/dashboard");
  await expect(bob.getByRole("heading", { name: "Flat 4B" })).toBeVisible();

  // Alice pays 1,000 split equally
  await alice.goto("/dashboard");
  await alice.getByRole("button", { name: "Add expense" }).first().click();
  const dialog = alice.locator("dialog[open]");
  await dialog.locator("#amount").fill("1000");
  await dialog.locator("#description").fill("Electricity bill");
  await expect(dialog.getByText("₹500.00")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Add expense" }).click();
  await noDialogOpen(alice);
  await expect(alice.getByText("You're owed ₹500.00")).toBeVisible();

  // Custom split must add up
  await alice.getByRole("button", { name: "Add expense" }).first().click();
  await dialog.locator("#amount").fill("300");
  await dialog.locator("#description").fill("Groceries");
  await dialog.getByText("Exact amounts").click();
  const [aliceSplit, bobSplit] = await dialog.locator('input[name^="split_"]').all();
  await aliceSplit.fill("100");
  await bobSplit.fill("100");
  await expect(dialog.getByText("₹100.00 left to assign")).toBeVisible();
  await dialog.getByRole("button", { name: "Add expense" }).click();
  await expect(dialog.getByText("The split amounts must add up to the total.")).toBeVisible();
  await bobSplit.fill("200");
  await dialog.getByRole("button", { name: "Add expense" }).click();
  await noDialogOpen(alice);

  // Bob sees it from his side and can't leave while he owes
  await bob.goto("/dashboard/balances");
  await expect(bob.getByText("owes ₹700.00")).toBeVisible();
  await expect(bob.getByText(/You\s+pay\s+Alice/)).toBeVisible();
  await bob.goto("/dashboard/settings");
  await bob.getByRole("button", { name: "Leave household" }).click();
  await bob.locator("main").getByRole("button", { name: "Leave household" }).last().click();
  await expect(bob.getByText(/Settle up in “Flat 4B” first/)).toBeVisible();

  // Record the suggested payment; everyone is settled
  await bob.goto("/dashboard/balances");
  await bob.getByRole("button", { name: "Record", exact: true }).click();
  await expect(bob.locator("dialog[open] #settle-amount")).toHaveValue("700.00");
  await bob.locator("dialog[open]").getByRole("button", { name: "Record payment" }).click();
  await noDialogOpen(bob);
  await expect(bob.getByText("Everyone is settled up.")).toBeVisible();

  // Now Bob can leave; Alice keeps the history
  await bob.goto("/dashboard/settings");
  await bob.getByRole("button", { name: "Leave household" }).click();
  await bob.locator("main").getByRole("button", { name: "Leave household" }).last().click();
  await bob.waitForURL("**/dashboard");
  await expect(bob.getByRole("heading", { name: /Hi, Bob/ })).toBeVisible();

  await alice.goto("/dashboard/settings");
  await expect(alice.getByText(/Former members: Bob/)).toBeVisible();
  await alice.goto("/dashboard/expenses");
  await expect(alice.getByRole("button", { name: /Electricity bill.*Alice paid/ })).toBeVisible();
});

test("invites only work for the invited email", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  const stranger = await (await browser.newContext()).newPage();
  const invitee = uniqueEmail("invitee");

  await signUp(owner, { name: "Owner" });
  await owner.getByRole("button", { name: /Switch ledger/ }).click();
  await owner.getByRole("button", { name: "New household…" }).click();
  await owner.locator("dialog[open] #household-name").fill("Club");
  await owner.locator("dialog[open]").getByRole("button", { name: "Create household" }).click();
  await owner.waitForURL("**/dashboard/settings");
  await owner.fill("#invite-email", invitee);
  await owner.getByRole("button", { name: "Create invite" }).click();
  const link = linkIn(await waitForEmail(invitee, /invited you to Club/));

  await signUp(stranger, { name: "Stranger" });
  await stranger.goto(new URL(link).pathname);
  await expect(stranger.getByText(/This invite is for/)).toBeVisible();
  await expect(stranger.getByRole("button", { name: "Accept and join" })).toHaveCount(0);
});
