import fs from "node:fs";
import path from "node:path";

/**
 * Private document storage.
 *
 * Files live *outside* `public/`, so Next.js never serves them directly — the
 * only way to reach one is the authenticated `/documents/[id]` route handler,
 * which looks the file up by database id (visitors never supply a path).
 */

/**
 * Where uploaded files are written.
 *
 * Defaults to `private/uploads` (inside the project, never under `public/`).
 * On Railway, point `UPLOAD_DIR` at a mounted volume — e.g. `/data/uploads` —
 * so files survive redeploys. Relative paths resolve from the project root.
 */
export const UPLOAD_ROOT = (() => {
  const configured = process.env.UPLOAD_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(process.cwd(), "private", "uploads");
})();

/** Extension → Content-Type. The client-declared MIME type is never trusted. */
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  rtf: "application/rtf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  zip: "application/zip",
};

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12 MiB

export function extensionOf(filename: string): string {
  const ext = path.extname(filename).replace(".", "").toLowerCase();
  return ext;
}

export function isAllowedExtension(filename: string): boolean {
  return Object.hasOwn(MIME_BY_EXT, extensionOf(filename));
}

export function mimeFor(filename: string): string {
  return MIME_BY_EXT[extensionOf(filename)] ?? "application/octet-stream";
}

export type StoredFile = {
  storedName: string;
  originalName: string;
  mime: string;
  size: number;
};

/**
 * Writes an uploaded file to a generated name.
 * The original filename is kept only as metadata — never as a path.
 */
export async function saveUpload(file: File): Promise<StoredFile> {
  if (!isAllowedExtension(file.name)) {
    throw new Error(
      `Unsupported file type ".${extensionOf(file.name)}". Allowed: ${Object.keys(
        MIME_BY_EXT,
      ).join(", ")}.`,
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
    );
  }

  const storedName = `${crypto.randomUUID()}.${extensionOf(file.name)}`;
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(UPLOAD_ROOT, storedName), buffer, { flag: "wx" });

  return {
    storedName,
    originalName: sanitizeOriginalName(file.name),
    mime: mimeFor(file.name),
    size: buffer.byteLength,
  };
}

/** Keeps a display-friendly name and strips anything path-like. */
export function sanitizeOriginalName(name: string): string {
  const base = path.basename(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  return base.slice(0, 180) || "file";
}

/** Resolves a stored name, refusing anything that escapes the upload root. */
export function resolveStoredPath(storedName: string): string | null {
  if (!storedName) return null;
  const safe = path.basename(storedName);
  if (safe !== storedName) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(safe)) return null;

  const full = path.resolve(UPLOAD_ROOT, safe);
  const root = path.resolve(UPLOAD_ROOT);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

export function deleteStored(storedName: string): void {
  const full = resolveStoredPath(storedName);
  if (!full) return;
  try {
    fs.unlinkSync(full);
  } catch {
    // Already gone, or never written — nothing to do.
  }
}

export function fileExists(storedName: string): boolean {
  const full = resolveStoredPath(storedName);
  return full ? fs.existsSync(full) : false;
}
