import path from "node:path";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// One .env for the whole repo, at the root. Variables already set win (tests set their own).
config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
