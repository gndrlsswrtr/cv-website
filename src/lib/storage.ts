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

/* ------------------------------------------------------------------ */
/* Content inspection                                                   */
/* ------------------------------------------------------------------ */

function startsWithBytes(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

function startsWithString(buffer: Buffer, text: string): boolean {
  return buffer.length >= text.length && buffer.toString("latin1", 0, text.length) === text;
}

const OLE_HEADER = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
const ZIP_HEADER = [0x50, 0x4b, 0x03, 0x04] as const;

/** Bytes that mark a file as executable — never acceptable in an upload. */
const EXECUTABLE_HEADERS: readonly (readonly number[])[] = [
  [0x4d, 0x5a], // DOS / PE  (MZ)
  [0x7f, 0x45, 0x4c, 0x46], // ELF (Linux)
  [0xfe, 0xed, 0xfa, 0xce], // Mach-O 32-bit
  [0xfe, 0xed, 0xfa, 0xcf], // Mach-O 64-bit
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O fat binary / Java class
  [0x50, 0x4b, 0x05, 0x06], // empty ZIP archive
  [0x50, 0x4b, 0x07, 0x08], // ZIP spanned
];

/** Markers that identify markup/script payloads regardless of extension. */
const HTML_MARKERS = [
  "<!doctype html",
  "<html",
  "<?php",
  "<script",
  "<?xml", // SVG and HTML-with-XML-declaration payloads
  "<svg",
] as const;

/**
 * True when the buffer looks like plain text: no NUL bytes and no HTML/script
 * markers in the leading window. Used for genuinely text formats where there is
 * no magic number to check against.
 */
function looksLikeText(buffer: Buffer): boolean {
  const window = buffer.subarray(0, 4096);
  if (window.includes(0)) return false;
  const lower = window.toString("latin1").toLowerCase();
  return !HTML_MARKERS.some((marker) => lower.includes(marker));
}

function containsHtmlMarker(buffer: Buffer): boolean {
  const lower = buffer.subarray(0, 4096).toString("latin1").toLowerCase();
  return HTML_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Extension → required leading bytes. A file that claims an extension but does
 * not start with these bytes is rejected — this is what stops an HTML or
 * executable payload from being uploaded as `photo.png`.
 *
 * Extensions absent from this map are text formats and are checked with
 * `looksLikeText` instead.
 */
const MAGIC_BY_EXT: Record<string, (buffer: Buffer) => boolean> = {
  pdf: (b) => startsWithString(b, "%PDF-"),
  png: (b) => startsWithBytes(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: (b) => startsWithBytes(b, [0xff, 0xd8, 0xff]),
  jpeg: (b) => startsWithBytes(b, [0xff, 0xd8, 0xff]),
  gif: (b) => startsWithString(b, "GIF8"),
  webp: (b) => startsWithString(b, "RIFF") && startsWithString(b.subarray(8), "WEBP"),
  zip: (b) => startsWithBytes(b, ZIP_HEADER),
  docx: (b) => startsWithBytes(b, ZIP_HEADER),
  xlsx: (b) => startsWithBytes(b, ZIP_HEADER),
  pptx: (b) => startsWithBytes(b, ZIP_HEADER),
  odt: (b) => startsWithBytes(b, ZIP_HEADER),
  rtf: (b) => startsWithString(b, "{\\rtf"),
  doc: (b) => startsWithBytes(b, OLE_HEADER),
  xls: (b) => startsWithBytes(b, OLE_HEADER),
  ppt: (b) => startsWithBytes(b, OLE_HEADER),
  txt: looksLikeText,
  csv: looksLikeText,
};

/**
 * Inspects the bytes behind an allowed extension.
 * Returns an error message, or `null` when the content is acceptable.
 */
export function contentError(extension: string, buffer: Buffer): string | null {
  if (buffer.length === 0) return "The file is empty.";

  for (const header of EXECUTABLE_HEADERS) {
    if (startsWithBytes(buffer, header)) {
      return "This file is an executable or archive format that is not allowed.";
    }
  }
  if (startsWithString(buffer, "#!")) {
    return "This file is a script, which is not allowed.";
  }
  if (containsHtmlMarker(buffer)) {
    return "HTML, SVG and script content are not allowed in uploads.";
  }

  const check = MAGIC_BY_EXT[extension];
  if (check && !check(buffer)) {
    return `The file content does not match its ".${extension}" extension.`;
  }
  if (!check && !looksLikeText(buffer)) {
    return "This file does not look like plain text.";
  }
  return null;
}

/** True when the buffer's content is acceptable for the given extension. */
export function hasValidContent(extension: string, buffer: Buffer): boolean {
  return contentError(extension, buffer) === null;
}


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

  const buffer = Buffer.from(await file.arrayBuffer());

  // Extension allow-list first, then the bytes themselves: the browser-declared
  // MIME type is never consulted, so an .html payload renamed to .png is
  // refused here rather than being served later as image/png.
  const rejection = contentError(extensionOf(file.name), buffer);
  if (rejection) throw new Error(rejection);

  const storedName = `${crypto.randomUUID()}.${extensionOf(file.name)}`;
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
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
