import { createHash } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  countUnreadMessages,
  deleteMessage,
  listContactMessages,
  markMessageRead,
  submitContact,
} from "@/lib/contact";
import { applyMigrations, resetMigrationMemo } from "@/lib/db/migrate";
import { adminQuery, marker, publicQuery, resetMigrationBookkeeping } from "./helpers/db";

/**
 * The contact form: validation, the honeypot, the per-IP throttle, salted
 * IP digests, the admin inbox, and the guarantee that the inbox is invisible
 * to the public role.
 */

// Mirrors PER_IP_LIMIT in src/lib/contact.ts (not exported from the module).
const PER_IP_LIMIT = 4;

// Pin the salt so the stored digest can be recomputed exactly. read per call,
// so setting it here changes every hash this suite produces.
const PREVIOUS_SALT = process.env.CONTACT_HASH_SALT;
const TEST_SALT = "vitest-contact-salt";

beforeAll(async () => {
  process.env.CONTACT_HASH_SALT = TEST_SALT;
  resetMigrationMemo();
  await applyMigrations();
});

afterEach(async () => {
  // The shared resetContent() helper does not cover contact_messages; this
  // suite owns every row it creates, so wipe the inbox between tests.
  await adminQuery(`DELETE FROM contact_messages`);
});

afterAll(async () => {
  if (PREVIOUS_SALT === undefined) delete process.env.CONTACT_HASH_SALT;
  else process.env.CONTACT_HASH_SALT = PREVIOUS_SALT;
  await resetMigrationBookkeeping();
});

/** The throttle keeps in-memory state per IP, so every test gets its own. */
function uniqueIp(): string {
  return `ip-${marker()}`;
}

async function messageCount(): Promise<number> {
  const rows = await adminQuery<{ n: string }>(`SELECT COUNT(*) AS n FROM contact_messages`);
  return Number(rows[0]?.n ?? 0);
}

async function insertMessage(name: string, createdAt?: string): Promise<string> {
  const rows = await adminQuery<{ id: string }>(
    `INSERT INTO contact_messages (name, email, message, created_at)
     VALUES ($1, 'someone@example.test', 'Body.', COALESCE($2::timestamptz, now()))
     RETURNING id`,
    [name, createdAt ?? null],
  );
  return rows[0]!.id;
}

describe("submitContact", () => {
  it("stores a valid submission", async () => {
    const tag = marker();
    const ip = uniqueIp();

    const result = await submitContact(
      {
        name: `${tag} Visitor`,
        email: "visitor@example.test",
        subject: "Hello from the tests",
        message: "Loved the site.",
      },
      ip,
      "vitest-agent/1.0",
    );
    expect(result).toEqual({ ok: true });

    const rows = await adminQuery<{
      name: string;
      email: string;
      subject: string;
      message: string;
      ip_hash: string;
      user_agent: string;
      read_at: string | null;
    }>(`SELECT * FROM contact_messages WHERE name LIKE $1`, [`${tag}%`]);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.email).toBe("visitor@example.test");
    expect(row.subject).toBe("Hello from the tests");
    expect(row.message).toBe("Loved the site.");
    expect(row.user_agent).toBe("vitest-agent/1.0");
    expect(row.read_at).toBeNull();

    // ip_hash is a salted SHA-256 hex digest — never the raw address.
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.ip_hash).not.toContain(ip);
    expect(row.ip_hash).toBe(
      createHash("sha256").update(`${TEST_SALT}:${ip}`).digest("hex"),
    );
  });

  it("rejects a bad email and an empty message without writing a row", async () => {
    const before = await messageCount();

    const result = await submitContact(
      { name: "Someone", email: "not-an-email", subject: "Hi", message: "   " },
      uniqueIp(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors?.email).toMatch(/valid email/i);
    expect(result.errors?.message).toMatch(/write a message/i);
    expect(await messageCount()).toBe(before);
  });

  it("silently accepts and discards a honeypot submission", async () => {
    const before = await messageCount();

    const result = await submitContact(
      {
        name: "Bot",
        email: "bot@example.test",
        subject: "Buy now",
        message: "Cheap watches.",
        website: "http://spam.example",
      },
      uniqueIp(),
    );

    // The bot learns nothing — but no row is written either.
    expect(result).toEqual({ ok: true });
    expect(await messageCount()).toBe(before);
  });

  it(`throttles an IP after ${PER_IP_LIMIT} submissions`, async () => {
    const ip = uniqueIp();
    const input = {
      name: "Rater",
      email: "rater@example.test",
      subject: "S",
      message: "M",
    };

    for (let i = 0; i < PER_IP_LIMIT; i += 1) {
      expect(await submitContact(input, ip), `attempt ${i + 1}`).toEqual({ ok: true });
    }

    const throttled = await submitContact(input, ip);
    expect(throttled).toEqual({ ok: false, throttled: true });

    // The limiter is keyed per IP — another caller is unaffected.
    const other = await submitContact(input, uniqueIp());
    expect(other).toEqual({ ok: true });
  });
});

describe("the admin inbox", () => {
  it("lists newest first and honours the limit", async () => {
    const tag = marker();
    await insertMessage(`${tag} older`, "2026-01-01T00:00:00Z");
    await insertMessage(`${tag} newer`, "2026-06-01T00:00:00Z");

    const listed = await listContactMessages(100);
    const mine = listed.filter((m) => m.name.startsWith(tag));
    expect(mine.map((m) => m.name)).toEqual([`${tag} newer`, `${tag} older`]);

    const limited = await listContactMessages(1);
    expect(limited).toHaveLength(1);
  });

  it("counts only unread messages and markMessageRead flips one", async () => {
    const tag = marker();
    const first = await insertMessage(`${tag} a`);
    await insertMessage(`${tag} b`);

    expect(await countUnreadMessages()).toBe(2);

    await markMessageRead(first);
    expect(await countUnreadMessages()).toBe(1);

    // Idempotent: marking an already-read message keeps the original stamp.
    const readAt = async () =>
      (
        await adminQuery<{ read_at: string }>(
          `SELECT read_at FROM contact_messages WHERE id = $1`,
          [first],
        )
      )[0]!.read_at;

    const stamp = await readAt();
    expect(stamp).toBeTruthy();
    await markMessageRead(first);
    expect(await readAt()).toBe(stamp);
  });

  it("deleteMessage removes exactly one row", async () => {
    const tag = marker();
    const first = await insertMessage(`${tag} a`);
    await insertMessage(`${tag} b`);

    await deleteMessage(first);

    const names = (
      await adminQuery<{ name: string }>(`SELECT name FROM contact_messages`)
    ).map((r) => r.name);
    expect(names.some((n) => n.startsWith(`${tag} a`))).toBe(false);
    expect(names.some((n) => n.startsWith(`${tag} b`))).toBe(true);
  });
});

describe("row level security", () => {
  it("keeps the inbox out of the public role entirely", async () => {
    await insertMessage(`${marker()} secret`);

    // No SELECT grant was ever issued to portfolio_public (and RLS carries no
    // policy), so the read is refused outright — the inbox is owner-only even
    // when a query names the table directly.
    await expect(publicQuery("SELECT id FROM contact_messages")).rejects.toThrow(
      /permission denied/,
    );

    // ...and the public role cannot write to it either.
    await expect(
      publicQuery(
        `INSERT INTO contact_messages (name, email, message) VALUES ('x', 'y@z.io', 'z')`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
