import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * `src/lib/storage.ts` is the file-validation layer for document uploads.
 *
 * It reads `UPLOAD_DIR` once, at import time, so the env var must be set
 * *before* the module is loaded — hence the dynamic import below rather than a
 * static one.
 */
const PREVIOUS_UPLOAD_DIR = process.env.UPLOAD_DIR;
const UPLOAD_DIR = path.join(os.tmpdir(), `portfolio-uploads-${randomUUID()}`);
process.env.UPLOAD_DIR = UPLOAD_DIR;

const storage = await import("@/lib/storage");

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const PDF_BYTES = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\n", "utf8");
const HTML_BYTES = Buffer.from(
  "<!DOCTYPE html><html><script>alert(1)</script></html>",
  "utf8",
);

function upload(bytes: Buffer, name: string, type: string): File {
  // Copy into a plain ArrayBuffer-backed view: DOM lib's BlobPart does not
  // accept Buffer's SharedArrayBuffer-typed generic.
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeAll(() => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
});

afterAll(() => {
  // Restore the environment for any later suite sharing this worker, then
  // remove the temporary directory.
  if (PREVIOUS_UPLOAD_DIR === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = PREVIOUS_UPLOAD_DIR;
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe("extensionOf", () => {
  it("lowercases the extension and strips the dot", () => {
    expect(storage.extensionOf("photo.PNG")).toBe("png");
    expect(storage.extensionOf("cv.pdf")).toBe("pdf");
    expect(storage.extensionOf("a.b.c.JPEG")).toBe("jpeg");
  });

  it("handles missing and dot-only extensions", () => {
    expect(storage.extensionOf("noextension")).toBe("");
    expect(storage.extensionOf(".gitignore")).toBe("");
    expect(storage.extensionOf("trailing.")).toBe("");
  });
});

describe("mimeFor", () => {
  it("maps known extensions to the Content-Type actually served", () => {
    expect(storage.mimeFor("cv.pdf")).toBe("application/pdf");
    expect(storage.mimeFor("PHOTO.PNG")).toBe("image/png");
    expect(storage.mimeFor("x.jpeg")).toBe("image/jpeg");
    expect(storage.mimeFor("x.webp")).toBe("image/webp");
    expect(storage.mimeFor("x.gif")).toBe("image/gif");
    expect(storage.mimeFor("x.txt")).toBe("text/plain; charset=utf-8");
  });

  it("never maps an executable or script extension to anything servable", () => {
    for (const name of [
      "evil.exe",
      "run.bat",
      "shell.sh",
      "payload.js",
      "page.html",
      "img.svg",
      "macro.docm",
    ]) {
      expect(storage.mimeFor(name), name).toBe("application/octet-stream");
      expect(storage.isAllowedExtension(name), name).toBe(false);
    }
  });
});

describe("saveUpload", () => {
  it("honours the configured upload directory", () => {
    expect(storage.UPLOAD_ROOT).toBe(path.resolve(UPLOAD_DIR));
  });

  it("writes the file under a randomised name that is not the original", async () => {
    const first = await storage.saveUpload(upload(PNG_BYTES, "avatar.png", "image/png"));
    const second = await storage.saveUpload(upload(PNG_BYTES, "avatar.png", "image/png"));

    // Same original filename, different stored names.
    expect(first.storedName).not.toBe(second.storedName);
    expect(first.storedName).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(second.storedName).toMatch(/^[0-9a-f-]{36}\.png$/);

    // Metadata is kept, but the original name never becomes the path.
    expect(first.originalName).toBe("avatar.png");
    expect(first.mime).toBe("image/png");
    expect(first.size).toBe(PNG_BYTES.byteLength);

    // The bytes on disk are the bytes that were uploaded, inside the root.
    const onDisk = storage.resolveStoredPath(first.storedName);
    expect(onDisk).not.toBeNull();
    expect(onDisk!.startsWith(storage.UPLOAD_ROOT)).toBe(true);
    expect(fs.readFileSync(onDisk!).equals(PNG_BYTES)).toBe(true);
    expect(storage.fileExists(first.storedName)).toBe(true);

    await storage.deleteStored(first.storedName);
    await storage.deleteStored(second.storedName);
    expect(storage.fileExists(first.storedName)).toBe(false);
    expect(storage.fileExists(second.storedName)).toBe(false);
  });

  it("rejects a disallowed extension", async () => {
    const before = fs.readdirSync(UPLOAD_DIR).length;
    await expect(
      storage.saveUpload(upload(PDF_BYTES, "evil.exe", "application/octet-stream")),
    ).rejects.toThrow(/Unsupported file type/);
    await expect(
      storage.saveUpload(upload(HTML_BYTES, "page.html", "text/html")),
    ).rejects.toThrow(/Unsupported file type/);
    expect(fs.readdirSync(UPLOAD_DIR).length).toBe(before);
  });

  it("rejects a payload over MAX_UPLOAD_BYTES and writes nothing", async () => {
    expect(storage.MAX_UPLOAD_BYTES).toBe(12 * 1024 * 1024);

    const oversized = Buffer.alloc(storage.MAX_UPLOAD_BYTES + 1, 0x41);
    const before = fs.readdirSync(UPLOAD_DIR).length;
    await expect(
      storage.saveUpload(upload(oversized, "big.pdf", "application/pdf")),
    ).rejects.toThrow(/larger than/i);
    expect(fs.readdirSync(UPLOAD_DIR).length).toBe(before);
  });

  it("inspects content bytes — HTML named .png is rejected", async () => {
    // The extension allow-list is necessary but not sufficient: a browser will
    // happily POST HTML with a filename of `definitely-a-png.png`. The stored
    // bytes have to match the extension too, otherwise the file later gets
    // served as image/png.
    const before = fs.readdirSync(UPLOAD_DIR).length;
    await expect(
      storage.saveUpload(upload(HTML_BYTES, "definitely-a-png.png", "image/png")),
    ).rejects.toThrow(/does not match|HTML|script/i);
    expect(fs.readdirSync(UPLOAD_DIR).length).toBe(before);
  });

  it("accepts content whose bytes really do match its extension", async () => {
    // A real PNG signature, so the content check is not simply "reject all".
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("real-ish payload"),
    ]);
    const stored = await storage.saveUpload(upload(png, "avatar.png", "image/png"));
    expect(storage.fileExists(stored.storedName)).toBe(true);
    await storage.deleteStored(stored.storedName);
  });

  it("exposes the content check on its own", () => {
    // Text bytes claiming to be a PNG: right container, wrong content.
    expect(storage.contentError("png", Buffer.from("plain text pretending to be a png"))).toMatch(
      /extension/i,
    );
    // HTML is caught by the blanket markup rule, whichever extension it claims.
    expect(storage.contentError("png", HTML_BYTES)).toMatch(/HTML/i);
    expect(
      storage.contentError(
        "png",
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBeNull();
    // Executables are refused whatever the extension says.
    expect(storage.contentError("pdf", Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toMatch(
      /executable/i,
    );
    expect(storage.contentError("txt", Buffer.from("#!/bin/sh\nrm -rf /\n"))).toMatch(
      /script/i,
    );
  });
});

describe("resolveStoredPath", () => {
  it("accepts a plain stored name inside the upload root", () => {
    expect(storage.resolveStoredPath("abc-123_X.png")).toBe(
      path.join(path.resolve(UPLOAD_DIR), "abc-123_X.png"),
    );
  });

  it("rejects every attempt to escape the upload root", () => {
    for (const evil of [
      "",
      "..",
      "../secret.pdf",
      "..\\..\\windows\\system32\\config\\sam",
      "..%2f..%2fetc%2fpasswd",
      "a/b.png",
      "sub\\dir\\file.png",
      "/etc/passwd",
      "C:\\Windows\\x.png",
      "with space.png",
    ]) {
      expect(storage.resolveStoredPath(evil), evil).toBeNull();
    }
  });

  it("fileExists refuses traversal names too", () => {
    expect(storage.fileExists("../secret.pdf")).toBe(false);
    expect(storage.fileExists("..\\secret.pdf")).toBe(false);
  });

  it("deleteStored refuses to touch anything outside the upload root", () => {
    const canary = path.join(os.tmpdir(), `canary-${randomUUID()}.txt`);
    fs.writeFileSync(canary, "do not delete me");
    try {
      storage.deleteStored(`..${path.sep}${path.basename(canary)}`);
      storage.deleteStored(`../${path.basename(canary)}`);
      expect(fs.existsSync(canary)).toBe(true);
    } finally {
      fs.rmSync(canary, { force: true });
    }
  });
});

describe("sanitizeOriginalName", () => {
  it("strips path components but keeps a display-friendly name", () => {
    expect(storage.sanitizeOriginalName("../../etc/passwd")).toBe("passwd");
    expect(storage.sanitizeOriginalName("report:final?.pdf")).toBe("report_final_.pdf");
    expect(storage.sanitizeOriginalName("")).toBe("file");
  });
});
