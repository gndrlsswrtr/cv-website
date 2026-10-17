import { createHash, randomBytes } from "node:crypto";

import { all, dbUnavailableMessage, get, run } from "@/lib/db";
import { delay, registerAttempt } from "@/lib/security";

/**
 * Contact form: validation, spam defences and the private inbox.
 *
 * There is no third-party mail service wired in — that would mean claiming an
 * integration this project never set up. Instead a message is written to the
 * `contact_messages` table and read in the admin dashboard, and the owner's
 * public email address is offered as a direct alternative on the same page.
 *
 * Spam defences, all server-side:
 *   1. a honeypot field that humans never fill in,
 *   2. a per-IP send limit,
 *   3. a global burst limit,
 *   4. hard length caps, so the inbox cannot be flooded with megabytes.
 */

const PER_IP_LIMIT = 4;
const PER_IP_WINDOW_MS = 10 * 60 * 1000;
const GLOBAL_LIMIT = 40;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;

const GLOBAL_KEY = "contact:global";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_NAME = 200;
const MAX_SUBJECT = 300;
const MAX_MESSAGE = 10_000;

/**
 * IPs are stored as a salted digest, never raw: a database leak cannot be
 * correlated back to a visitor. The salt comes from `CONTACT_HASH_SALT`, or a
 * per-process random value if unset (hashes then stop matching after a restart,
 * which is an acceptable trade-off for throttling that already resets).
 */
function hashIp(ip: string): string {
  const salt =
    process.env.CONTACT_HASH_SALT?.trim() ||
    (globalThis as { __contactSalt?: string }).__contactSalt ||
    ((globalThis as { __contactSalt?: string }).__contactSalt = randomBytes(16).toString("hex"));
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export type ContactResult =
  | { ok: true }
  | { ok: false; errors?: Record<string, string>; throttled?: boolean; message?: string };

export type ContactInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
  /** Honeypot. Must stay empty; the input is visually hidden. */
  website?: string;
};

/**
 * Validate and store one message.
 *
 * Returns `{ ok: true }` even when the submission was dropped as spam, so a
 * bot learns nothing — only a genuine validation failure produces errors.
 */
export async function submitContact(
  input: ContactInput,
  clientIp: string,
  userAgent = "",
): Promise<ContactResult> {
  // 1. Honeypot — accept silently and discard.
  if ((input.website ?? "").trim() !== "") {
    await delay(400);
    return { ok: true };
  }

  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim();
  const subject = (input.subject ?? "").trim();
  const message = (input.message ?? "").trim();

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Please tell me who you are.";
  else if (name.length > MAX_NAME) errors.name = `Keep your name under ${MAX_NAME} characters.`;

  if (!email) errors.email = "An email address is required so I can reply.";
  else if (email.length > 254 || !EMAIL.test(email)) errors.email = "Enter a valid email address.";

  if (subject.length > MAX_SUBJECT) {
    errors.subject = `Keep the subject under ${MAX_SUBJECT} characters.`;
  }

  if (!message) errors.message = "Please write a message.";
  else if (message.length > MAX_MESSAGE) {
    errors.message = `Keep the message under ${MAX_MESSAGE.toLocaleString("en-US")} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // No database: refuse honestly. The INSERT below reports 0 affected rows
  // without throwing, so this used to answer `{ ok: true }` — telling a
  // visitor their message was sent when it was never stored.
  const unavailable = await dbUnavailableMessage();
  if (unavailable) {
    await delay(400);
    return { ok: false, message: unavailable };
  }

  // 2. Per-IP limit — increments even on later failures, so it cannot be
  //    bypassed by re-submitting invalid input.
  const ipKey = `contact:ip:${clientIp}`;
  if (!registerAttempt(ipKey, PER_IP_LIMIT, PER_IP_WINDOW_MS)) {
    await delay(400);
    return { ok: false, throttled: true };
  }

  // 3. Global burst limit.
  if (!registerAttempt(GLOBAL_KEY, GLOBAL_LIMIT, GLOBAL_WINDOW_MS)) {
    await delay(400);
    return { ok: false, throttled: true };
  }

  try {
    await run(
      `INSERT INTO contact_messages ("name", "email", "subject", "message", "ip_hash", "user_agent")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, email, subject, message, hashIp(clientIp), userAgent.slice(0, 300)],
    );
  } catch (error) {
    // Never leak internals to the visitor; log for the operator instead.
    console.error("contact: failed to store message", error);
    return { ok: false, message: "Something went wrong sending your message. Please try again." };
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Inbox (admin)                                                       */
/* ------------------------------------------------------------------ */

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

export async function listContactMessages(limit = 100): Promise<ContactMessage[]> {
  const rows = await all<ContactMessage>(
    `SELECT "id", "name", "email", "subject", "message", "read_at", "created_at"
       FROM contact_messages
      ORDER BY "created_at" DESC
      LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function countUnreadMessages(): Promise<number> {
  const row = await get<{ n: string }>(
    `SELECT COUNT(*) AS n FROM contact_messages WHERE "read_at" IS NULL`,
  );
  return Number(row?.n ?? 0);
}

export async function markMessageRead(id: string): Promise<void> {
  await run(`UPDATE contact_messages SET "read_at" = now() WHERE "id" = $1 AND "read_at" IS NULL`, [
    id,
  ]);
}

export async function deleteMessage(id: string): Promise<void> {
  await run(`DELETE FROM contact_messages WHERE "id" = $1`, [id]);
}

/** Best-effort caller identifier for throttling. Never written to a log. */
export function clientIpOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
