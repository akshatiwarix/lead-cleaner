import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors the `@/*` path alias in tsconfig.json — Vitest does not read
  // tsconfig paths on its own.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // The whole engine is framework-free and does no I/O, so a node
    // environment is enough — no jsdom, no React testing setup. See CLAUDE.md
    // on the lib/ purity boundary, which lib/clean/purity.test.ts enforces.
    environment: "node",
    include: ["lib/**/*.test.ts", "data/**/*.test.ts"],
  },
});
