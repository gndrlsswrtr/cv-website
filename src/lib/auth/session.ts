import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { get, now, purgeExpiredSessions, run } from "@/lib/db";

/**
 * Opaque, DB-backed sessions.
 *
 * A 32-byte random token lives in an httpOnly cookie; only its SHA-256 digest
 * is persisted. Because sessions are rows, signing out (or banning a device)
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

export async function createSession(userId: string): Promise<void> {
  purgeExpiredSessions();

  const token = randomBytes(32).toString("base64url");
  const expiresAt = sessionExpiry();

  run(
    `INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
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
    run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
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

  const row = get<SessionRow>(
    `SELECT s.user_id, s.expires_at, u.email, u.name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    [hashToken(token)],
  );

  if (!row) {
    jar.delete(SESSION_COOKIE);
    return null;
  }

  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
    jar.delete(SESSION_COOKIE);
    return null;
  }

  // Sliding expiry: only write when we are past the half-life.
  if (expiresAt - Date.now() < HALF_LIFE_MS) {
    run("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?", [
      now(),
      sessionExpiry(),
      hashToken(token),
    ]);
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
  const row = get<{ n: number }>("SELECT COUNT(*) AS n FROM users");
  return Number(row?.n ?? 0);
}
