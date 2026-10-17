import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { TEST_ENV } from "../../playwright.config";
import { linkIn, uniqueEmail, waitForEmail } from "./helpers";

// Security properties of the hand-written auth and the API's authorization,
// tested against the Express API directly (no browser).

const today = () => new Date().toISOString().slice(0, 10);

async function newUser(name: string) {
  const api = await request.newContext({ baseURL: TEST_ENV.API_URL });
  const email = uniqueEmail(name.toLowerCase());
  const res = await api.post("/api/auth/signup", { data: { name, email, password: "api-test-pass-1" } });
  expect(res.status()).toBe(201);
  const ctx = await (await api.get("/api/context")).json();
  return { api, email, ledgerId: ctx.ledger.id as string };
}

async function cookieValue(api: APIRequestContext, name: string) {
  return (await api.storageState()).cookies.find((c) => c.name === name)?.value;
}

test("one user can't read or change another user's data", async () => {
  const alice = await newUser("Alice");
  const mallory = await newUser("Mallory");

  const created = await alice.api.post("/api/expenses", { data: { amount: "500", description: "Alice's rent", date: today() } });
  const { id } = await created.json();

  // Mallory's list doesn't include it, and she can't edit or delete it
  expect(JSON.stringify(await (await mallory.api.get("/api/expenses")).json())).not.toContain("Alice's rent");
  expect((await mallory.api.patch(`/api/expenses/${id}`, { data: { amount: "1", description: "pwned", date: today() } })).status()).toBe(404);
  await mallory.api.delete(`/api/expenses/${id}`);
  const aliceList = await (await alice.api.get("/api/expenses")).json();
  expect(aliceList.map((e: { description: string }) => e.description)).toContain("Alice's rent");

  // Pointing her own expense at Alice's category is silently ignored
  const aliceCategory = (await (await alice.api.get("/api/categories")).json())[0].id;
  expect((await mallory.api.post("/api/expenses", { data: { amount: "5", description: "Sneaky", date: today(), categoryId: aliceCategory } })).status()).toBe(201);
  const mine = (await (await mallory.api.get("/api/expenses")).json()).find((e: { description: string }) => e.description === "Sneaky");
  expect(mine.category).toBeNull();
});

test("a forged ledger cookie can't open someone else's ledger", async () => {
  const alice = await newUser("Alicia");
  const mallory = await newUser("Mal");
  await alice.api.post("/api/expenses", { data: { amount: "700", description: "Private thing", date: today() } });

  const forged = await request.newContext({
    baseURL: TEST_ENV.API_URL,
    extraHTTPHeaders: { cookie: `session=${await cookieValue(mallory.api, "session")}; ledger=${alice.ledgerId}` },
  });
  const ctx = await (await forged.get("/api/context")).json();
  expect(ctx.ledger.id).toBe(mallory.ledgerId); // falls back to her own ledger
  expect(JSON.stringify(await (await forged.get("/api/expenses")).json())).not.toContain("Private thing");
});

test("logout revokes the session server-side", async () => {
  const user = await newUser("Leaver");
  const token = await cookieValue(user.api, "session");
  expect((await user.api.post("/api/auth/logout")).ok()).toBe(true);

  const replay = await request.newContext({ baseURL: TEST_ENV.API_URL, extraHTTPHeaders: { cookie: `session=${token}` } });
  expect((await replay.get("/api/context")).status()).toBe(401);
});

test("password reset is single-use and signs out every session", async () => {
  const user = await newUser("Resetter");
  const otherDevice = await request.newContext({ baseURL: TEST_ENV.API_URL });
  await otherDevice.post("/api/auth/login", { data: { email: user.email, password: "api-test-pass-1" } });
  expect((await otherDevice.get("/api/context")).ok()).toBe(true);

  await user.api.post("/api/auth/forgot-password", { data: { email: user.email } });
  const token = new URL(linkIn(await waitForEmail(user.email, /Reset your password/))).searchParams.get("token");

  const reset = await request.newContext({ baseURL: TEST_ENV.API_URL });
  expect((await reset.post("/api/auth/reset-password", { data: { token, password: "brand-new-pass-1" } })).ok()).toBe(true);
  expect((await reset.post("/api/auth/reset-password", { data: { token, password: "another-pass-12" } })).status()).toBe(400);

  expect((await user.api.get("/api/context")).status()).toBe(401);
  expect((await otherDevice.get("/api/context")).status()).toBe(401);
  expect((await reset.post("/api/auth/login", { data: { email: user.email, password: "api-test-pass-1" } })).status()).toBe(401);
  expect((await reset.post("/api/auth/login", { data: { email: user.email, password: "brand-new-pass-1" } })).ok()).toBe(true);
});

test("Google callback rejects a missing or tampered state", async () => {
  const api = await request.newContext({ baseURL: TEST_ENV.API_URL });
  const res = await api.get("/api/auth/callback/google?code=fake&state=forged", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe(`${TEST_ENV.APP_URL}/login?error=oauth`);
});

test("signed-out requests get 401, unknown routes 404", async () => {
  const api = await request.newContext({ baseURL: TEST_ENV.API_URL });
  for (const path of ["/api/context", "/api/expenses", "/api/summary", "/api/account", "/api/expenses/export"]) {
    expect((await api.get(path)).status(), path).toBe(401);
  }
  expect((await api.get("/api/does-not-exist")).status()).toBe(404);
});
