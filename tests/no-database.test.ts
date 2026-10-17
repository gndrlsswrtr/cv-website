import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { login, setupAdmin } from "@/app/admin/actions";
import { dbStatus } from "@/lib/db";
import { submitContact } from "@/lib/contact";

/**
 * A deployment with no `DATABASE_URL`.
 *
 * Public reads are meant to degrade to empty content so `next build` works
 * before any database exists. Writes were the trap: `run()` answers 0 affected
 * rows rather than throwing, so every write path failed invisibly.
 *
 * The consequences were severe and none of them looked like a database
 * problem to the person hitting them:
 *
 *   - first-run setup — the only way to create the single admin account —
 *     passed its "no users yet" check, inserted nothing, and answered
 *     "Could not create the account. Please retry." forever;
 *   - login had no rows to find, so it told the operator their password
 *     was wrong;
 *   - the contact form reported a *successful send* for a message that was
 *     never stored.
 *
 * Each of those now names the variable to set instead.
 */

const UNSET = Symbol("unset");

let saved: string | typeof UNSET;

/** Point the app at "no database" for the duration of one test. */
function withoutDatabase(): void {
  delete process.env.DATABASE_URL;
}

beforeAll(() => {
  saved = process.env.DATABASE_URL ?? UNSET;
});

afterAll(() => {
  if (saved === UNSET) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved;
});

/** A submission that would otherwise be entirely valid. */
function setupForm(): FormData {
  const fd = new FormData();
  fd.set("name", "Test Owner");
  fd.set("email", "owner@example.com");
  fd.set("password", "Zq7#kLm9!vRt2Wx");
  fd.set("confirm_password", "Zq7#kLm9!vRt2Wx");
  return fd;
}

describe("with no database configured", () => {
  it("reports the reason", () => {
    withoutDatabase();
    expect(dbStatus()).toBe("DATABASE_URL is not set.");
  });

  it("first-run setup refuses honestly instead of retrying forever", async () => {
    withoutDatabase();
    const state = await setupAdmin({}, setupForm());

    expect(state.ok).not.toBe(true);
    expect(state.error).toContain("no database");
    expect(state.error).toContain("DATABASE_URL");
    // The message that could never be satisfied by retrying.
    expect(state.error).not.toBe("Could not create the account. Please retry.");
  });

  it("login names the missing variable rather than blaming the password", async () => {
    withoutDatabase();
    const fd = new FormData();
    fd.set("email", "owner@example.com");
    fd.set("password", "Zq7#kLm9!vRt2Wx");

    const state = await login({}, fd);

    expect(state.ok).not.toBe(true);
    expect(state.error).toContain("DATABASE_URL");
    expect(state.error).not.toBe("Incorrect email or password.");
  });

  it("the contact form does not report a message it never stored", async () => {
    withoutDatabase();
    // submitContact directly, not the server action wrapper: the wrapper reads
    // `headers()`, which throws outside a request scope.
    const result = await submitContact(
      {
        name: "Visitor",
        email: "visitor@example.com",
        subject: "Hello",
        message: "Is this working?",
      },
      "203.0.113.7",
      "vitest",
    );

    // Previously `{ ok: true }` — a false success.
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected the submission to be refused");
    expect(result.message).toContain("DATABASE_URL");
  });
});
