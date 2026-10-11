import fs from "node:fs";
import { Readable } from "node:stream";

import { requireUserOrNull } from "@/lib/auth/session";
import { findRow } from "@/lib/crud";
import { mimeFor, resolveStoredPath, sanitizeOriginalName } from "@/lib/storage";

/**
 * The only route that ever reads an uploaded file.
 *
 * Access control: a document is served when it is published, or when the
 * caller holds a valid session. Everything else is a flat 404 so an attacker
 * cannot distinguish "wrong id" from "exists but private".
 */

type RouteContext = { params: Promise<{ id: string }> };

function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename);
  const type = inline ? "inline" : "attachment";
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const row = id ? await findRow("documents", id) : undefined;
  if (!row) return new Response("Not found", { status: 404 });

  const published = row.published === true;
  if (!published) {
    const user = await requireUserOrNull();
    if (!user) return new Response("Not found", { status: 404 });
  }

  const storedName = String(row.stored_name ?? "");
  const full = resolveStoredPath(storedName);
  if (!full || !fs.existsSync(full)) return new Response("Not found", { status: 404 });

  const originalName = sanitizeOriginalName(String(row.original_name ?? "document"));
  const mime = String(row.mime || mimeFor(originalName));

  // Never render unexpected content types inline (e.g. an old zip).
  const inlineSafe =
    mime.startsWith("image/") ||
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime === "application/rtf";
  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  const inline = inlineSafe && !wantsDownload;

  const stat = fs.statSync(full);
  const stream = Readable.toWeb(fs.createReadStream(full)) as ReadableStream;

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Content-Disposition": contentDisposition(originalName, inline),
      "Cache-Control": published
        ? "public, max-age=3600, must-revalidate"
        : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
