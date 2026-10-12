import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { get, now, run } from "@/lib/db";

/**
 * Opaque, DB-backed sessions.
 *
 * A 32-byte random token lives in an httpOnly cookie; only its SHA-256 digest
 * is persisted. Because sessions are rows, signing out (or revoking a device)
 * is a real revocation rather than waiting for a token to expire.
 */

export const SESSION_COOKIE = "cv_session";
const SESSION_TTL_DAYS = 14;
const HALF_LIFE_MS = (SESSION_TTL_DAYS * 24 * 60 * 60 * 1000) / 2;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

type SessionRow = {
  user_id: string;
  expires_at: string;
  email: string;
  name: string;
  role: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isSecureCookie(): boolean {
  // Secure cookies require HTTPS, but browsers treat `localhost` as a secure
  // origin, so `npm start` on localhost still works with the default.
  if (process.env.NODE_ENV !== "production") return false;
  return process.env.ALLOW_INSECURE !== "true";
}

function sessionExpiry(from = Date.now()): string {
  return new Date(from + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Removes expired sessions. Cheap enough to call on every login. */
export async function purgeExpiredSessions(): Promise<void> {
  await run(`DELETE FROM sessions WHERE "expires_at" <= $1`, [now()]);
}

export async function createSession(userId: string): Promise<void> {
  await purgeExpiredSessions();

  const token = randomBytes(32).toString("base64url");
  const expiresAt = sessionExpiry();

  await run(
    `INSERT INTO sessions ("id", "token_hash", "user_id", "expires_at", "created_at", "last_seen_at")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      randomBytes(16).toString("base64url"),
      hashToken(token),
      userId,
      expiresAt,
      now(),
      now(),
    ],
  );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await run(`DELETE FROM sessions WHERE "token_hash" = $1`, [hashToken(token)]);
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * Resolve the signed-in user, or `null`.
 * Never throws — callers decide whether absence is fatal.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await get<SessionRow>(
    `SELECT s.user_id, s.expires_at, u.email, u.name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1`,
    [hashToken(token)],
  );

  // This must stay a *pure read*. `cookies().delete()` is only legal inside a
  // Server Action or Route Handler; `requireUser()` also runs from Server
  // Components (the admin layout), where mutating the jar throws
  // "Cookies can only be modified in a Server Action or Route Handler" and
  // turns every stale-cookie request into a 500 instead of a redirect to
  // /login. Stale cookies are harmless here — they resolve to `null`, and the
  // next successful sign-in overwrites them via `createSession()`.
  if (!row) return null;

  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await run(`DELETE FROM sessions WHERE "token_hash" = $1`, [hashToken(token)]);
    return null;
  }

  // Sliding expiry: only write when we are past the half-life.
  if (expiresAt - Date.now() < HALF_LIFE_MS) {
    await run(
      `UPDATE sessions SET "last_seen_at" = $1, "expires_at" = $2 WHERE "token_hash" = $3`,
      [now(), sessionExpiry(), hashToken(token)],
    );
  }

  return { id: row.user_id, email: row.email, name: row.name, role: row.role };
}

/** Guard for Server Components / pages. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Guard for Route Handlers — returns `null` instead of throwing/redirecting. */
export async function requireUserOrNull(): Promise<SessionUser | null> {
  return getSessionUser();
}

export async function countUsers(): Promise<number> {
  const row = await get<{ n: string }>(`SELECT COUNT(*) AS n FROM users`);
  return Number(row?.n ?? 0);
}
