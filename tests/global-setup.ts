import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";

/**
 * Boots a real PostgreSQL instance for the test run.
 *
 * Not a mock: migrations, Row Level Security and every query in `src/lib/db`
 * are exercised against a genuine PostgreSQL 17 server, so a policy that
 * would fail in production fails here too.
 *
 * The data directory lives in the OS temp folder and is wiped on teardown, so
 * every run starts from an empty database.
 */

const PORT = 20_000 + (process.pid % 20_000);
const DATA_DIR = path.join(os.tmpdir(), `portfolio-pg-${process.pid}`);

export default async function globalSetup(): Promise<() => Promise<void>> {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  const server = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "password",
    port: PORT,
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });

  await server.initialise();
  await server.start();
  await server.createDatabase("portfolio_test");

  process.env.DATABASE_URL = `postgresql://postgres:password@127.0.0.1:${PORT}/portfolio_test`;
  // Tests must never inherit a developer's production settings.
  process.env.AUTO_MIGRATE = "true";
  process.env.NODE_ENV = "test";

  return async () => {
    await server.stop().catch(() => undefined);
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  };
}
