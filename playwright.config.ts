import path from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 3100;
const API_PORT = 4100;
const root = __dirname;

export const TEST_ENV = {
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://expense:expense@localhost:5432/expense_tracker_test?schema=public",
  APP_URL: `http://localhost:${PORT}`,
  API_URL: `http://localhost:${API_PORT}`,
  API_PORT: String(API_PORT),
  // Absolute: the API runs from apps/api, the helpers from the repo root
  OUTBOX_DIR: path.join(root, "test-results/outbox"),
  RECEIPTS_DIR: path.join(root, "test-results/receipts"),
  AUTH_RATE_LIMIT: "off",
  LOG_LEVEL: "warn",
};

/**
 * End-to-end suite. Runs the production builds of the API (:4100) and the web
 * app (:3100) against a separate database (docker compose creates it), and
 * reads emails from test-results/outbox.
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
  webServer: [
    {
      command: "node dist/index.js",
      cwd: path.join(root, "apps/api"),
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: TEST_ENV,
    },
    {
      command: `npx next start -p ${PORT}`,
      cwd: path.join(root, "apps/web"),
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: TEST_ENV,
    },
  ],
});
