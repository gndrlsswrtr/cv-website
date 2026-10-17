import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  dbDiagnostics,
  dbStatus,
  dbUnavailableMessage,
  probeDatabase,
  redactCredentials,
  resetPool,
} from "@/lib/db";

/**
 * Telling "the variable was never injected" apart from "the variable is there
 * but the database cannot be reached".
 *
 * Before this, `dbUnconfiguredMessage()` answered `null` for *any* set
 * `DATABASE_URL`, so a write path would sail past its guard and die with an
 * opaque 500 when the connection was refused. That is exactly the state a
 * half-finished Railway variable change leaves behind, and it is indistinguishable
 * from a code bug to the person reading it.
 *
 * The diagnostics must also never leak a credential: the probe reports
 * `host:port` and a redacted driver message, nothing else.
 */

const UNSET = Symbol("unset");
let saved: string | typeof UNSET;

/** Nothing listens on this port, so the connect is refused immediately. */
const REFUSED_URL = "postgresql://railway_diag:s3cr3t-value@127.0.0.1:1/portfolio";

beforeAll(() => {
  saved = process.env.DATABASE_URL ?? UNSET;
});

afterEach(async () => {
  if (saved === UNSET) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved;
  // The pool is keyed by URL; drop it so the real test cluster is re-acquired.
  await resetPool();
});

afterAll(async () => {
  if (saved === UNSET) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved;
  await resetPool();
});

describe("redactCredentials", () => {
  it("strips the userinfo from a connection string", () => {
    const out = redactCredentials(
      'connection to server "postgresql://user:p%40ss@db.internal:5432/app" failed',
    );
    expect(out).not.toContain("p%40ss");
    expect(out).not.toContain("user:");
    expect(out).toContain("db.internal:5432");
  });

  it("strips bare password= and password: forms", () => {
    expect(redactCredentials("auth failed password=hunter2 for role admin")).not.toContain(
      "hunter2",
    );
    expect(redactCredentials("bad password: 'hunter2'")).not.toContain("hunter2");
  });

  it("leaves ordinary driver messages readable", () => {
    const msg = 'connect ECONNREFUSED 127.0.0.1:5432';
    expect(redactCredentials(msg)).toBe(msg);
  });
});

describe("distinguishing unset from unreachable", () => {
  it("reports `unconfigured` when the variable is absent", async () => {
    delete process.env.DATABASE_URL;
    expect(dbDiagnostics().state).toBe("unconfigured");
    expect(dbStatus()).toBe("DATABASE_URL is not set.");
    await expect(dbUnavailableMessage()).resolves.toMatch(/no database/);
  });

  it("reports `misconfigured` for a URL that is not postgres", async () => {
    process.env.DATABASE_URL = "http://example.com/not-a-database";
    expect(dbDiagnostics().state).toBe("misconfigured");
    await expect(dbUnavailableMessage()).resolves.toContain("postgresql://");
  });

  it("reports the endpoint — and only the endpoint — when configured", () => {
    process.env.DATABASE_URL = "postgresql://user:secret@db.example.com:5432/portfolio";
    const diag = dbDiagnostics();
    expect(diag.state).toBe("configured");
    expect(diag.endpoint).toBe("db.example.com:5432");
    expect(JSON.stringify(diag)).not.toContain("secret");
  });

  it("names the real cause when the URL is set but the connection fails", async () => {
    process.env.DATABASE_URL = REFUSED_URL;
    const message = await dbUnavailableMessage();

    expect(message).not.toBeNull();
    expect(message).toContain("cannot reach its database");
    // It must identify the target…
    expect(message).toContain("127.0.0.1:1");
    // …and must not reproduce the old, misleading "not set" wording.
    expect(message).not.toContain("DATABASE_URL is not set");
    // …and must never leak the credential.
    expect(message).not.toContain("s3cr3t-value");
    expect(message).not.toContain("railway_diag");
  });

  it("probeDatabase reports failure without leaking the password", async () => {
    process.env.DATABASE_URL = REFUSED_URL;
    const probe = await probeDatabase();

    expect(probe.ok).toBe(false);
    expect(probe.detail).toContain("127.0.0.1:1");
    expect(probe.detail).not.toContain("s3cr3t-value");

    // The remembered error is redacted too, for anyone reading logs later.
    expect(JSON.stringify(dbDiagnostics())).not.toContain("s3cr3t-value");
  });

  it("probeDatabase succeeds against the real test cluster", async () => {
    if (saved === UNSET) return; // no cluster in this run
    const probe = await probeDatabase();
    expect(probe.ok).toBe(true);
    expect(dbUnavailableMessage()).resolves.toBeNull();
  });
});
