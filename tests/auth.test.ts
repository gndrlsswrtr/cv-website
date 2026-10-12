import { createHash, randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  getSessionUser,
} from "@/lib/auth/session";
import { applyMigrations, resetMigrationMemo } from "@/lib/db/migrate";
import { clearAttempts, registerAttempt } from "@/lib/security";
import { adminQuery, marker, resetMigrationBookkeeping } from "./helpers/db";

/**
 * Authentication: scrypt password hashing, opaque DB-backed sessions and the
 * in-memory login throttle.
 */

// `cookies()` from `next/headers` needs a live Next.js request context. Backing
// it with an in-memory jar lets these tests drive the real session code —
// create → resolve → destroy — without a running server.
const cookieJar = vi.hoisted(() => new Map<string, string>());

// Counts jar writes so a test can prove `getSessionUser()` never mutates the
// cookie. Mutating here would throw inside a Server Component ("Cookies can
// only be modified in a Server Action or Route Handler") and 500 the admin.
const cookieWrites = vi.hoisted(() => ({ set: 0, delete: 0 }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieWrites.set += 1;
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieWrites.delete += 1;
      cookieJar.delete(name);
    },
  }),
}));

beforeAll(async () => {
  resetMigrationMemo();
  await applyMigrations();
});

afterEach(async () => {
  cookieJar.clear();
  cookieWrites.set = 0;
  cookieWrites.delete = 0;
  // Sessions cascade from users; wipe both so every test starts empty.
  await adminQuery(`DELETE FROM sessions`);
  await adminQuery(`DELETE FROM users`);
});

afterAll(async () => {
  await resetMigrationBookkeeping();
});

/** The session tests never verify the password, so a placeholder hash suffices. */
async function createUser(email: string): Promise<string> {
  await adminQuery(`INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)`, [
    email,
    "Test Admin",
    "scrypt$16384$8$1$c2FsdFNhbHQ$aGFzaEhhc2g",
  ]);
  const rows = await adminQuery<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  return rows[0]!.id;
}

describe("password hashing", () => {
  it("verifies the right password and rejects wrong ones", () => {
    const plain = "correct-horse-battery-staple";
    const stored = hashPassword(plain);

    expect(verifyPassword(plain, stored)).toBe(true);
    expect(verifyPassword("correct-horse-battery-stapl", stored)).toBe(false);
    expect(verifyPassword(`${plain}!`, stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it("never stores the plaintext and keeps the documented scrypt shape", () => {
    const plain = `s3cret-${marker()}`;
    const stored = hashPassword(plain);

    expect(stored).not.toContain(plain);
    expect(stored).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);

    // A fresh random salt: hashing the same password twice differs.
    expect(hashPassword(plain)).not.toBe(stored);
  });

  it("returns false for malformed or corrupt stored values instead of throwing", () => {
    for (const stored of [
      "",
      "plaintext",
      "bcrypt$10$c2FsdHNhbHQ$aGFzaA",
      "scrypt$not-a-number$8$1$c2FsdA$aGFzaA",
      "scrypt$16384$8$1$only-five-parts",
    ]) {
      expect(verifyPassword("whatever", stored), stored).toBe(false);
    }
  });

  it("enforces password strength", () => {
    expect(validatePasswordStrength("short1")).toMatch(/at least 10/i);
    expect(validatePasswordStrength("abcdefghi")).toMatch(/at least 10/i);
    expect(validatePasswordStrength("password123")).toMatch(/too common/i);
    // The common list is matched case-insensitively.
    expect(validatePasswordStrength("PASSWORD123")).toMatch(/too common/i);
    expect(validatePasswordStrength("x".repeat(201))).toMatch(/200/i);

    expect(validatePasswordStrength("correct-horse-battery-staple")).toBeNull();
  });
});

describe("sessions", () => {
  it("uses the documented cookie name", () => {
    expect(SESSION_COOKIE).toBe("cv_session");
  });

  it("creates a session, resolves the user, and destroys both on logout", async () => {
    const email = `admin-${marker()}@example.test`;
    const userId = await createUser(email);

    await createSession(userId);
    expect(cookieJar.has(SESSION_COOKIE)).toBe(true);

    const user = await getSessionUser();
    expect(user).not.toBeNull();
    expect(user?.id).toBe(userId);
    expect(user?.email).toBe(email);
    expect(user?.role).toBe("admin");

    await destroySession();
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect(await getSessionUser()).toBeNull();
    expect(await adminQuery(`SELECT id FROM sessions`)).toEqual([]);
  });

  it("stores only the SHA-256 hash of the token, never the plaintext", async () => {
    const userId = await createUser(`admin-${marker()}@example.test`);
    await createSession(userId);

    const token = cookieJar.get(SESSION_COOKIE);
    expect(token).toBeTruthy();

    const digest = createHash("sha256").update(token!).digest("hex");
    const rows = await adminQuery<{ token_hash: string }>(`SELECT token_hash FROM sessions`);
    expect(rows.map((r) => r.token_hash)).toContain(digest);

    // The plaintext token exists nowhere in the table.
    const plaintextHits = await adminQuery(`SELECT id FROM sessions WHERE token_hash = $1`, [
      token,
    ]);
    expect(plaintextHits).toEqual([]);
    expect(rows.every((r) => !r.token_hash.includes(token!))).toBe(true);
  });

  it("returns null for a missing or unknown token without touching the cookie", async () => {
    expect(await getSessionUser()).toBeNull();

    // A cookie with no matching row (recreated database, revoked session, an
    // older sign-in that has since been purged) must resolve to null *and*
    // leave the jar alone. `getSessionUser()` runs from the admin layout — a
    // Server Component — where `cookies().delete()` throws, turning every
    // stale-cookie request into a 500 instead of a redirect to /login.
    cookieJar.set(SESSION_COOKIE, randomBytes(32).toString("base64url"));
    expect(await getSessionUser()).toBeNull();
    expect(cookieJar.has(SESSION_COOKIE)).toBe(true);
    expect(cookieWrites).toEqual({ set: 0, delete: 0 });
  });

  it("rejects an expired session, removes the row, and leaves the cookie alone", async () => {
    const userId = await createUser(`admin-${marker()}@example.test`);
    const expiredToken = randomBytes(32).toString("base64url");
    await adminQuery(
      `INSERT INTO sessions (id, token_hash, user_id, expires_at)
       VALUES ($1, $2, $3, now() - interval '1 day')`,
      [
        randomBytes(16).toString("base64url"),
        createHash("sha256").update(expiredToken).digest("hex"),
        userId,
      ],
    );
    cookieJar.set(SESSION_COOKIE, expiredToken);

    expect(await getSessionUser()).toBeNull();
    // The stale row is removed, not merely ignored.
    expect(await adminQuery(`SELECT id FROM sessions`)).toEqual([]);
    // ...but the jar is still untouched (see the note above).
    expect(cookieJar.has(SESSION_COOKIE)).toBe(true);
    expect(cookieWrites).toEqual({ set: 0, delete: 0 });
  });
});

describe("login rate limiting", () => {
  it("allows exactly `limit` attempts, then refuses", () => {
    const key = `login:${marker()}`;
    expect(registerAttempt(key, 3, 60_000)).toBe(true);
    expect(registerAttempt(key, 3, 60_000)).toBe(true);
    expect(registerAttempt(key, 3, 60_000)).toBe(true);
    expect(registerAttempt(key, 3, 60_000)).toBe(false);
    expect(registerAttempt(key, 3, 60_000)).toBe(false);
  });

  it("clearAttempts resets the counter", () => {
    const key = `login:${marker()}`;
    expect(registerAttempt(key, 1, 60_000)).toBe(true);
    expect(registerAttempt(key, 1, 60_000)).toBe(false);

    clearAttempts(key);
    expect(registerAttempt(key, 1, 60_000)).toBe(true);
  });

  it("keeps buckets isolated per key", () => {
    const first = `login:${marker()}`;
    const second = `login:${marker()}`;
    expect(registerAttempt(first, 1, 60_000)).toBe(true);
    expect(registerAttempt(first, 1, 60_000)).toBe(false);
    expect(registerAttempt(second, 1, 60_000)).toBe(true);
  });
});
