import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with scrypt (memory-hard, built into Node — no dependency).
 *
 * Stored format: `scrypt$N$r$p$<salt base64url>$<hash base64url>`
 * so parameters can be raised later without invalidating existing hashes.
 */

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
// 128 * N * r = 16 MiB; scrypt's default maxmem (32 MiB) is enough.
const MAX_MEM = 64 * 1024 * 1024;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "1234567890",
  "12345678901",
  "qwertyuiop",
  "letmein123",
  "iloveyou123",
  "administrator",
  "portfolio123",
  "changeme123",
]);

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const [scheme, nRaw, rRaw, pRaw, saltRaw, hashRaw] = stored.split("$");
    if (scheme !== "scrypt" || !saltRaw || !hashRaw) return false;

    const n = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
      return false;
    }

    const salt = Buffer.from(saltRaw, "base64url");
    const expected = Buffer.from(hashRaw, "base64url");
    const actual = scryptSync(plain.normalize("NFKC"), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEM,
    });

    // Lengths are compared by timingSafeEqual's contract; guard anyway.
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Returns an error message, or `null` when the password is acceptable. */
export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < 10) {
    return "Password must be at least 10 characters long.";
  }
  if (plain.length > 200) {
    return "Password must be 200 characters or fewer.";
  }
  if (COMMON_PASSWORDS.has(plain.toLowerCase())) {
    return "That password is too common. Choose something less guessable.";
  }
  return null;
}
