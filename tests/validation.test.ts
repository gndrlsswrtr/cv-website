import { describe, expect, it } from "vitest";

import {
  CONTENT_ORDER,
  getResource,
  isSafeExternalUrl,
  readValues,
  slugify,
  validateValues,
  type ResourceDef,
  type ResourceKey,
} from "@/lib/resources";

/**
 * The registry and its validation layer: required fields, url/date/number
 * rules, slug generation — plus a consistency sweep over every resource so a
 * half-registered content type fails the suite instead of the production site.
 */

function defOf(key: ResourceKey): ResourceDef {
  const def = getResource(key);
  if (!def) throw new Error(`resource "${key}" is not registered`);
  return def;
}

describe("validateValues", () => {
  it("flags required fields with a readable message keyed by field name", () => {
    const errors = validateValues(defOf("education"), {});
    expect(Object.keys(errors)).toEqual(["institution"]);
    expect(errors.institution).toBe("Institution is required.");

    // Whitespace-only counts as blank.
    const whitespace = validateValues(defOf("education"), { institution: "   " });
    expect(whitespace.institution).toBe("Institution is required.");

    // A filled-in form produces no errors.
    expect(validateValues(defOf("education"), { institution: "TU Munich" })).toEqual({});
  });

  it("rejects javascript:, data: and bare garbage in url fields", () => {
    const base = { title: "Mentor", organisation: "Code Club" };
    for (const url of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "ftp://example.org/file",
      "not a url",
      "example.org/path",
    ]) {
      const errors = validateValues(defOf("volunteer"), { ...base, url });
      expect(errors.url, url).toBeDefined();
    }
  });

  it("accepts http(s) URLs and same-site paths in url fields", () => {
    const base = { title: "Mentor", organisation: "Code Club" };
    for (const url of [
      "https://example.org",
      "http://example.org/x?y=1",
      "/volunteer/mentor",
      "#section",
      "", // optional field left blank
    ]) {
      expect(validateValues(defOf("volunteer"), { ...base, url }), url).toEqual({});
    }
  });

  it("rejects anything that is not YYYY-MM-DD in date fields", () => {
    const base = { title: "Award" };
    for (const date of [
      "2024/05/01",
      "01-05-2024",
      "May 1, 2024",
      "20240501",
      "2024-5-1",
      "2024-05",
      "yesterday",
    ]) {
      const errors = validateValues(defOf("achievements"), { ...base, date });
      expect(errors.date, date).toBe("Use the YYYY-MM-DD format.");
    }

    expect(validateValues(defOf("achievements"), { ...base, date: "2024-05-01" })).toEqual({});
  });

  it("enforces whole numbers and the declared min/max", () => {
    const errorsFor = (sort_order: string) =>
      validateValues(defOf("education"), { institution: "TU Munich", sort_order });

    expect(errorsFor("1.5").sort_order).toBe("Enter a whole number.");
    expect(errorsFor("abc").sort_order).toBe("Enter a whole number.");
    expect(errorsFor("-1").sort_order).toBe("Must be 0 or more.");
    expect(errorsFor("10000").sort_order).toBe("Must be 9999 or less.");

    expect(errorsFor("0")).toEqual({});
    expect(errorsFor("42")).toEqual({});
    expect(errorsFor("9999")).toEqual({});
    expect(errorsFor("")).toEqual({}); // optional field left blank
  });
});

describe("isSafeExternalUrl", () => {
  it("only allows http(s) URLs and same-site paths", () => {
    expect(isSafeExternalUrl("https://example.org/a")).toBe(true);
    expect(isSafeExternalUrl("http://example.org")).toBe(true);
    expect(isSafeExternalUrl("/a/path")).toBe(true);
    expect(isSafeExternalUrl("#anchor")).toBe(true);
    expect(isSafeExternalUrl("")).toBe(true); // optional field left blank

    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,<script>")).toBe(false);
    expect(isSafeExternalUrl("ftp://example.org")).toBe(false);
    expect(isSafeExternalUrl("example.org")).toBe(false);

    // Protocol-relative: `new URL()` parses it, but it resolves to another
    // origin when rendered — so it must not slip through as a "same-site path".
    expect(isSafeExternalUrl("//evil.example.com/steal")).toBe(false);
  });
});

describe("readValues", () => {
  it("reads a FormData into the flat string map validation expects", () => {
    const formData = new FormData();
    formData.set("title", "  Senior Engineer  ");
    formData.set("company", "ACME");
    formData.set("is_current", "on");
    // `published` deliberately left unchecked.

    const values = readValues(defOf("experience"), formData);
    expect(values.title).toBe("Senior Engineer"); // trimmed
    expect(values.company).toBe("ACME");
    expect(values.is_current).toBe("1");
    expect(values.published).toBe("0");
    expect(values.location).toBe(""); // absent fields become empty strings
  });

  it("also reads the derived slug for resources with hasSlug", () => {
    const formData = new FormData();
    formData.set("title", "Distributed Tracing UI");
    formData.set("summary", "A tracing UI.");
    formData.set("slug", "  tracing-ui ");

    const values = readValues(defOf("projects"), formData);
    expect(values.slug).toBe("tracing-ui");
    expect(validateValues(defOf("projects"), values)).toEqual({});
  });
});

describe("slugify", () => {
  it("produces URL-safe slugs without edge hyphens", () => {
    expect(slugify("Distributed Tracing UI")).toBe("distributed-tracing-ui");
    expect(slugify("  Héllo,  Wörld! ")).toBe("hello-world");
    expect(slugify("---leading and trailing---")).toBe("leading-and-trailing");
    expect(slugify("C++ & Node.js")).toBe("c-node-js");
    expect(slugify("!!!")).toBe("");
  });

  it("only emits [a-z0-9-] characters and caps the length", () => {
    for (const input of ["Ünïcödé Thingß", "a/b\\c:d", "100% legit", "___", "ÜBER_SIZED"]) {
      expect(slugify(input), input).toMatch(/^[a-z0-9-]*$/);
    }
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("the resource registry", () => {
  it("every resource in CONTENT_ORDER is internally consistent", () => {
    for (const key of CONTENT_ORDER) {
      const def = getResource(key);
      expect(def, key).toBeDefined();
      expect(def!.key, key).toBe(key);
      expect(def!.label.length, key).toBeGreaterThan(0);
      expect(typeof def!.description, key).toBe("string");

      // Table names must survive the strict identifier check in the CRUD layer.
      expect(def!.table, key).toMatch(/^[a-z_][a-z0-9_]*$/);

      // titleField is a real column-ish name; searchFields are non-empty and
      // identifier-safe (documents additionally searches upload metadata such
      // as original_name, which is a column but not a form field).
      expect(typeof def!.titleField, key).toBe("string");
      expect(def!.titleField, key).toMatch(/^[a-z_][a-z0-9_]*$/);
      expect(def!.searchFields.length, key).toBeGreaterThan(0);
      for (const field of def!.searchFields) {
        expect(field, `${key}.${field}`).toMatch(/^[a-z_][a-z0-9_]*$/);
      }

      // Exactly one `published` field, and every field name is unique + safe.
      const publishedFields = def!.fields.filter((f) => f.name === "published");
      expect(publishedFields, key).toHaveLength(1);
      expect(publishedFields[0]!.type, key).toBe("checkbox");

      const names = def!.fields.map((f) => f.name);
      expect(new Set(names).size, key).toBe(names.length);
      for (const name of names) {
        expect(name, `${key}.${name}`).toMatch(/^[a-z_][a-z0-9_]*$/);
      }
    }
  });

  it("only documents default to draft (the personal-data rule)", () => {
    for (const key of CONTENT_ORDER) {
      expect(getResource(key)!.defaultPublished, key).toBe(key !== "documents");
    }
  });
});
