import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// One .env for the whole repo, at the root (the API reads the same file).
// Next has already loaded (and cached) apps/web/.env* by now, so force a reload
// from the root; without forceReload this call is silently a no-op.
loadEnvConfig(path.resolve(import.meta.dirname, "../.."), process.env.NODE_ENV !== "production", { info: () => {}, error: console.error }, true);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // /api/* is forwarded to the Express API at runtime by src/app/api/[...path]/route.ts
};

export default nextConfig;
