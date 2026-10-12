import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

import { get, withPublicRole } from "@/lib/db";
import { fileExists, mimeFor, resolveStoredPath } from "@/lib/storage";

/**
 * Serves a file attached to a public entry — a scanned certificate, an award
 * photo, a talk poster.
 *
 * Three things keep this from becoming a file server:
 *
 *   1. `SERVEABLE` is a fixed allow-list. A table is reachable only because it
 *      is named here, not because a column happens to be called `stored_name`.
 *      The identifier is interpolated (PostgreSQL will not accept a parameter
 *      in that position), so it must never come from the request unchecked.
 *   2. The row is read through the `portfolio_public` role, so Row Level
 *      Security applies: an unpublished entry is invisible here even if someone
 *      guesses its id. There is no admin bypass on this route.
 *   3. The stored name goes through `resolveStoredPath`, which refuses
 *      separators, `..` and anything outside the upload root — so a poisoned
 *      database row cannot read an arbitrary file.
 *
 * Content bytes were validated on upload (`contentError`), and `nosniff` stops
 * a browser from re-interpreting the response as something else.
 */

const SERVEABLE = new Set(["certifications", "achievements"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, string | number | boolean | null>;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resource: string; id: string }> },
) {
  const { resource, id } = await params;

  if (!SERVEABLE.has(resource) || !UUID.test(id)) {
    return new NextResponse(null, { status: 404 });
  }

  const row = await withPublicRole(() =>
    get<Row>(
      `SELECT "stored_name", "original_name", "mime", "size"
         FROM "${resource}"
        WHERE "id" = $1 AND "published" = true`,
      [id],
    ),
  );

  const storedName = String(row?.stored_name ?? "");
  if (!row || !storedName) {
    return new NextResponse(null, { status: 404 });
  }

  const full = resolveStoredPath(storedName);
  if (!full || !fileExists(storedName)) {
    return new NextResponse(null, { status: 404 });
  }

  const body = await readFile(full);
  const mime = String(row.mime ?? "") || mimeFor(storedName);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(body.byteLength),
      "X-Content-Type-Options": "nosniff",
      // Published attachments are immutable in practice (replacing one writes a
      // new random filename), so a long cache is safe.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
