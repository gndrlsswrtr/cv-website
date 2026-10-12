import fs from "node:fs";
import path from "node:path";

/**
 * Minimal `.env` loader for the CLI scripts.
 *
 * `tsx` does not read `.env.local` the way `next dev` does, so without this
 * `npm run db:migrate` would ignore the `DATABASE_URL` sitting right there.
 *
 * Precedence: real environment variables win, then `.env.local`, then `.env` —
 * matching Next.js, so a value set in a shell behaves identically.
 */
export function loadEnv(): void {
  for (const name of [".env", ".env.local"]) {
    const file = path.join(process.cwd(), name);
    if (!fs.existsSync(file)) continue;

    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;

      const equals = line.indexOf("=");
      if (equals < 1) continue;

      const key = line.slice(0, equals).trim();
      let value = line.slice(equals + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
