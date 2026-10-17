import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { TEST_ENV } from "../../playwright.config";

/**
 * Bring the test database's schema up to date (non-destructive) and empty the
 * outbox/receipts folders. Tests don't need an empty database: every test
 * signs up its own uniquely-emailed users. To wipe it, run yourself:
 *   DATABASE_URL=<test url> npx prisma migrate reset
 */
export default function globalSetup() {
  if (!TEST_ENV.DATABASE_URL.includes("test")) {
    throw new Error(`Refusing to use a database whose URL doesn't mention "test": ${TEST_ENV.DATABASE_URL}`);
  }
  execSync("npx prisma migrate deploy", {
    cwd: path.join(__dirname, "../../apps/api"),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_ENV.DATABASE_URL },
  });
  for (const dir of [TEST_ENV.OUTBOX_DIR, TEST_ENV.RECEIPTS_DIR]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
}
