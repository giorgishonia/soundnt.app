import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // pglite + drizzle migrations can take a moment to spin up per suite.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
