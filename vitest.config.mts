import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Node-only test suite.
 *
 * Every acceptance criterion that matters here (authorization, publishing,
 * upload validation, visibility, RLS) is server-side logic, so the tests run
 * against a real PostgreSQL instance spun up by `tests/global-setup.ts` — not
 * a mock. See `tests/helpers/db.ts`.
 *
 * Files run sequentially against that one shared instance so a `resetContent()`
 * in one suite can never race an assertion in another.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    include: ["tests/**/*.test.ts"],
    pool: "forks",
    fileParallelism: false,
    // The first run initialises a PostgreSQL data directory; later runs start
    // the server and apply migrations.
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
