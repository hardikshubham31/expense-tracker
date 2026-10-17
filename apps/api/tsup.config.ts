import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  sourcemap: true,
  clean: true,
  // Bundle the workspace package (it ships TypeScript source); keep npm deps external.
  noExternal: ["@expense/shared"],
});
