import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations, resetMigrationMemo } from "@/lib/db/migrate";
import {
  adminQuery,
  marker,
  publicQuery,
  resetContent,
  resetMigrationBookkeeping,
} from "./helpers/db";

/**
 * The media route serves bytes out of the upload directory, and
 * `src/lib/storage.ts` reads `UPLOAD_DIR` once — at import time. The route
 * imports storage, so the env var has to point at a temporary directory
 * *before* the route module is loaded. Same technique as tests/upload.test.ts.
 */
const PREVIOUS_UPLOAD_DIR = process.env.UPLOAD_DIR;
const UPLOAD_DIR = path.join(os.tmpdir(), `portfolio-media-${randomUUID()}`);
process.env.UPLOAD_DIR = UPLOAD_DIR;

const { GET } = await import("@/app/(site)/media/[resource]/[id]/route");

/** A real PNG signature plus a payload — written straight to disk with fs. */
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("media-route test payload"),
]);

/** Call the route the way App Router does: `params` is a Promise. */
function callRoute(resource: string, id: string) {
  return GET(new Request("http://localhost/media/x"), {
    params: Promise.resolve({ resource, id }),
  });
}

/** Write bytes into the configured upload directory under `name`. */
function writeUpload(name: string, bytes: Buffer = PNG_BYTES): string {
  fs.writeFileSync(path.join(UPLOAD_DIR, name), bytes);
  return name;
}

function uploadPath(name: string): string {
  return path.join(UPLOAD_DIR, name);
}

async function insertCertification(opts: {
  name: string;
  published: boolean;
  storedName?: string;
  mime?: string;
}): Promise<string> {
  const rows = await adminQuery<{ id: string }>(
    `INSERT INTO certifications (name, published, stored_name, original_name, mime, size)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      opts.name,
      opts.published,
      opts.storedName ?? "",
      opts.storedName ? "certificate.png" : "",
      opts.mime ?? "image/png",
      opts.storedName ? PNG_BYTES.byteLength : 0,
    ],
  );
  return rows[0].id;
}

async function insertDocument(opts: {
  title: string;
  published: boolean;
  storedName: string;
}): Promise<string> {
  const rows = await adminQuery<{ id: string }>(
    `INSERT INTO documents (title, stored_name, original_name, mime, size, published)
     VALUES ($1, $2, $3, 'image/png', $4, $5)
     RETURNING id`,
    [opts.title, opts.storedName, "scan.png", PNG_BYTES.byteLength, opts.published],
  );
  return rows[0].id;
}

beforeAll(async () => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  resetMigrationMemo();
  await applyMigrations();
});

afterEach(async () => {
  await resetContent();
  // Every file this suite writes belongs to a row that resetContent() just
  // deleted — leave no orphans behind.
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
});

afterAll(async () => {
  if (PREVIOUS_UPLOAD_DIR === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = PREVIOUS_UPLOAD_DIR;
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  // Leave schema_migrations empty so a later suite (e.g. database.test.ts)
  // can still assert that *its* beforeAll applies at least one migration.
  await resetMigrationBookkeeping();
});

describe("GET /media/[resource]/[id]", () => {
  it("serves the exact bytes of a published certification's file", async () => {
    const tag = marker();
    const storedName = writeUpload(`${randomUUID()}.png`);
    const id = await insertCertification({
      name: `${tag} certified`,
      published: true,
      storedName,
    });

    const res = await callRoute("certifications", id);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toMatch(/public/);
    expect(res.headers.get("cache-control")).toMatch(/max-age=\d+/);

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(PNG_BYTES)).toBe(true);
  });

  it("returns 404 for an unpublished certification — the file is never read", async () => {
    const tag = marker();
    const storedName = writeUpload(`${randomUUID()}.png`);
    const id = await insertCertification({
      name: `${tag} draft`,
      published: false,
      storedName,
    });

    // The row exists for the owner and the bytes exist on disk, so a 404 here
    // can only come from RLS hiding the row — not from a missing file.
    const asAdmin = await adminQuery<{ id: string }>(
      `SELECT id FROM certifications WHERE id = $1`,
      [id],
    );
    expect(asAdmin).toHaveLength(1);
    expect(fs.existsSync(uploadPath(storedName))).toBe(true);
    const asPublic = await publicQuery<{ id: string }>(
      `SELECT id FROM certifications WHERE id = $1`,
      [id],
    );
    expect(asPublic).toEqual([]);

    const res = await callRoute("certifications", id);
    expect(res.status).toBe(404);
    expect(res.body).toBeNull();
  });

  it("returns 404 for a published row with an empty stored_name", async () => {
    const tag = marker();
    const id = await insertCertification({
      name: `${tag} no file`,
      published: true,
      storedName: "",
    });

    const res = await callRoute("certifications", id);
    expect(res.status).toBe(404);
  });

  it("returns 404 for documents — the resource is not on the allow-list", async () => {
    // `documents` genuinely has a stored_name column and a published row with
    // a real file on disk, so only the allow-list can produce this 404.
    const tag = marker();
    const storedName = writeUpload(`${randomUUID()}.png`);
    const id = await insertDocument({
      title: `${tag} document`,
      published: true,
      storedName,
    });
    expect(fs.existsSync(uploadPath(storedName))).toBe(true);

    const res = await callRoute("documents", id);
    expect(res.status).toBe(404);
  });

  it("returns 404 when a certification id is requested as an achievement", async () => {
    const tag = marker();
    const storedName = writeUpload(`${randomUUID()}.png`);
    const id = await insertCertification({
      name: `${tag} certified`,
      published: true,
      storedName,
    });

    const res = await callRoute("achievements", id);
    expect(res.status).toBe(404);

    // The same id on its own table still resolves — the row and file are fine.
    const same = await callRoute("certifications", id);
    expect(same.status).toBe(200);
  });

  it("returns 404 for a malformed id", async () => {
    const res = await callRoute("certifications", "not-a-uuid");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown but well-formed UUID", async () => {
    const res = await callRoute("certifications", randomUUID());
    expect(res.status).toBe(404);
  });

  it("falls back to mimeFor(storedName) when the row's mime is empty", async () => {
    const tag = marker();
    const storedName = writeUpload(`${randomUUID()}.png`);
    const rows = await adminQuery<{ id: string }>(
      `INSERT INTO certifications (name, published, stored_name, original_name, mime, size)
       VALUES ($1, true, $2, $3, '', $4)
       RETURNING id`,
      [`${tag} legacy`, storedName, "legacy.png", PNG_BYTES.byteLength],
    );

    const res = await callRoute("certifications", rows[0].id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect((Buffer.from(await res.arrayBuffer())).equals(PNG_BYTES)).toBe(true);
  });

  it("returns 404 when stored_name tries to escape the upload root", async () => {
    const tag = marker();
    const outside = path.join(os.tmpdir(), `media-escape-${randomUUID()}.png`);
    fs.writeFileSync(outside, PNG_BYTES);
    try {
      const id = await insertCertification({
        name: `${tag} poisoned`,
        published: true,
        storedName: `../${path.basename(outside)}`,
      });

      const res = await callRoute("certifications", id);
      expect(res.status).toBe(404);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });
});

describe("migration 0004 — attachment columns", () => {
  it("adds stored_name, original_name, mime and size to both tables", async () => {
    for (const table of ["certifications", "achievements"]) {
      const rows = await adminQuery<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const columns = rows.map((r) => r.column_name);
      for (const expected of ["stored_name", "original_name", "mime", "size"]) {
        expect(columns, `${table}.${expected}`).toContain(expected);
      }
    }
  });

  it("defaults a newly inserted certification to an empty attachment", async () => {
    const tag = marker();
    const rows = await adminQuery<{
      stored_name: string;
      original_name: string;
      mime: string;
      size: string;
    }>(
      `INSERT INTO certifications (name)
       VALUES ($1)
       RETURNING stored_name, original_name, mime, size`,
      [`${tag} bare`],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].stored_name).toBe("");
    expect(rows[0].original_name).toBe("");
    expect(rows[0].mime).toBe("");
    expect(Number(rows[0].size)).toBe(0);
  });

  it("defaults a newly inserted achievement to an empty attachment", async () => {
    const tag = marker();
    const rows = await adminQuery<{ stored_name: string; size: string }>(
      `INSERT INTO achievements (title)
       VALUES ($1)
       RETURNING stored_name, size`,
      [`${tag} bare`],
    );

    expect(rows[0].stored_name).toBe("");
    expect(Number(rows[0].size)).toBe(0);
  });
});
