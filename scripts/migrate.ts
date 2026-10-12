/**
 * Apply pending SQL migrations.
 *
 *   npm run db:migrate
 *
 * This is a convenience wrapper around `src/lib/db/migrate.ts`, which is the
 * same code path the app runs automatically on first query. Running it here is
 * useful as a Railway release step so a bad migration fails the deploy instead
 * of surfacing on the first visitor's request.
 *
 * `AUTO_MIGRATE=false` in the environment disables the automatic path and
 * leaves this script as the only way to migrate.
 */

import { closePool } from "@/lib/db/pool";
import { applyMigrations } from "@/lib/db/migrate";
import { loadEnv } from "./lib/load-env";

async function main(): Promise<void> {
  loadEnv();

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set.\n" +
        "  Local:  copy .env.example to .env.local and fill it in.\n" +
        "  Railway: add a PostgreSQL service — DATABASE_URL is injected for you.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("Applying migrations from db/migrations ...");
  const applied = await applyMigrations();

  if (applied.length === 0) {
    console.log("Database is already up to date.");
  } else {
    for (const name of applied) console.log(`  applied ${name}`);
    console.log(`Done — ${applied.length} migration(s).`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("Migration failed:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
