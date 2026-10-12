/**
 * Create the first administrator account.
 *
 *   npm run db:create-admin            # interactive prompts
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:create-admin
 *
 * Why this exists: there is deliberately no public registration endpoint and no
 * seeded default password anywhere in this repository. The account is created
 * out-of-band, by someone with shell access to the deployment, exactly once.
 * After that the dashboard itself handles password changes.
 *
 * The app also offers a browser-based first-run flow at `/setup`, which is only
 * reachable while the `users` table is empty. Use whichever is convenient.
 */

import { createInterface } from "node:readline/promises";

import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { closePool } from "@/lib/db/pool";
import { getPool } from "@/lib/db/pool";
import { applyMigrations } from "@/lib/db/migrate";
import { loadEnv } from "./lib/load-env";

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

const rl = () =>
  createInterface({ input: process.stdin, output: process.stdout });

async function ask(question: string, fallback = ""): Promise<string> {
  const interface_ = rl();
  try {
    const answer = (await interface_.question(question)).trim();
    return answer || fallback;
  } finally {
    interface_.close();
  }
}

async function main(): Promise<void> {
  loadEnv();

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set.\n" +
        "  Local:   copy .env.example to .env.local and fill it in.\n" +
        "  Railway: add a PostgreSQL service — DATABASE_URL is injected for you.",
    );
    process.exitCode = 1;
    return;
  }

  await applyMigrations();

  const pool = await getPool();
  if (!pool) throw new Error("Database pool could not be created.");

  const existing = await pool.query<{ n: string }>(
    "SELECT COUNT(*) AS n FROM users",
  );
  const count = Number(existing.rows[0].n);

  if (count > 0 && process.env.ALLOW_EXTRA_ADMIN !== "true") {
    console.error(
      `An administrator already exists (${count} account(s)).\n` +
        "Use the dashboard's Settings page to change the password, or set\n" +
        "ALLOW_EXTRA_ADMIN=true if you genuinely need a second account.",
    );
    process.exitCode = 1;
    return;
  }

  const email =
    argValue("--email") ??
    process.env.ADMIN_EMAIL ??
    (await ask("Email:    "));
  const name =
    argValue("--name") ?? process.env.ADMIN_NAME ?? (await ask("Name:     "));
  const password =
    argValue("--password") ?? process.env.ADMIN_PASSWORD ?? (await ask("Password: "));

  if (!email.includes("@")) {
    console.error("A valid email address is required.");
    process.exitCode = 1;
    return;
  }
  if (!name.trim()) {
    console.error("A name is required.");
    process.exitCode = 1;
    return;
  }
  const strength = validatePasswordStrength(password);
  if (strength) {
    console.error(strength);
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (email, name, password_hash, role, created_at, updated_at)
       VALUES ($1, $2, $3, 'admin', now(), now())`,
      [email.toLowerCase(), name.trim(), hashPassword(password)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  console.log(`\nAdministrator created: ${email.toLowerCase()}`);
  console.log("Sign in at /login — no account can ever be created from the public site.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
