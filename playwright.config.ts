import { defineConfig } from "@playwright/test";

const PORT = 3100;
export const TEST_ENV = {
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://expense:expense@localhost:5432/expense_tracker_test?schema=public",
  BETTER_AUTH_URL: `http://localhost:${PORT}`,
  OUTBOX_DIR: "test-results/outbox",
  RECEIPTS_DIR: "test-results/receipts",
  RESEND_API_KEY: "",
  AUTH_RATE_LIMIT: "off",
};

/**
 * End-to-end suite. Runs the production build against a separate database
 * (docker compose creates it) and reads emails from test-results/outbox.
 *   npm run build && npm run test:e2e
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? "chrome",
    // Browser, server ("today" for a fresh account) and helpers all agree on UTC
    timezoneId: "UTC",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: TEST_ENV,
  },
});
