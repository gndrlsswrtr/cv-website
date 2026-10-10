import { randomUUID } from "node:crypto";

import { all, get, now, run } from "@/lib/db";
import {
  CHECKBOX_FIELDS,
  getResource,
  slugify,
  validateValues,
  writableColumns,
  type ResourceDef,
  type ResourceKey,
} from "@/lib/resources";
import { deleteStored } from "@/lib/storage";

/**
 * Generic, registry-driven data access.
 *
 * Column and table names are validated against a strict identifier pattern and
 * come only from the static resource registry; every value is bound as a
 * parameter. There is no string interpolation of user input anywhere here.
 */

export type Row = Record<string, string | number | null>;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return name;
}

function tableFor(key: ResourceKey): string {
  const def = getResource(key);
  if (!def) throw new Error(`Unknown resource: ${key}`);
  return assertIdentifier(def.table);
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export type ListOptions = {
  publishedOnly?: boolean;
  q?: string;
  limit?: number;
};

export function listRows(key: ResourceKey, options: ListOptions = {}): Row[] {
  const def = getResource(key)!;
  const table = tableFor(key);

  const where: string[] = [];
  const params: (string | number)[] = [];

  if (options.publishedOnly) {
    where.push("published = 1");
  }
  if (options.q && def.searchFields.length > 0) {
    const clause = def.searchFields
      .map((field) => `${assertIdentifier(field)} LIKE ? ESCAPE '\\'`)
      .join(" OR ");
    where.push(`(${clause})`);
    for (let i = 0; i < def.searchFields.length; i += 1) {
      params.push(`%${escapeLike(options.q)}%`);
    }
  }

  const sql = [
    `SELECT * FROM ${table}`,
    where.length ? `WHERE ${where.join(" AND ")}` : "",
    "ORDER BY sort_order ASC, created_at DESC",
    options.limit ? "LIMIT ?" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (options.limit) params.push(options.limit);
  return all<Row>(sql, params);
}

export function findRow(key: ResourceKey, id: string): Row | undefined {
  const table = tableFor(key);
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) return undefined;
  return get<Row>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
}

export function countRows(key: ResourceKey, publishedOnly = false): number {
  const table = tableFor(key);
  const sql = publishedOnly
    ? `SELECT COUNT(*) AS n FROM ${table} WHERE published = 1`
    : `SELECT COUNT(*) AS n FROM ${table}`;
  const row = get<{ n: number }>(sql);
  return Number(row?.n ?? 0);
}

export function rowCount(table: string): number {
  const row = get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${assertIdentifier(table)}`);
  return Number(row?.n ?? 0);
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

function coerce(def: ResourceDef, values: Record<string, string>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const field of def.fields) {
    const raw = values[field.name] ?? "";
    if (field.type === "checkbox") {
      out[field.name] = raw === "1" || raw === "true" ? 1 : 0;
    } else if (field.type === "number") {
      out[field.name] = raw === "" ? 0 : Number(raw);
    } else {
      out[field.name] = raw;
    }
  }
  return out;
}

function uniqueSlug(table: string, base: string, excludeId?: string): string {
  const root = base || "item";
  let candidate = root;
  let suffix = 2;
  for (;;) {
    const existing = get<{ id: string }>(
      `SELECT id FROM ${table} WHERE slug = ?${excludeId ? " AND id <> ?" : ""}`,
      excludeId ? [candidate, excludeId] : [candidate],
    );
    if (!existing) return candidate;
    candidate = `${root}-${suffix}`;
    suffix += 1;
    if (suffix > 500) return `${root}-${randomUUID().slice(0, 8)}`;
  }
}

export type CreateResult =
  | { ok: true; id: string; errors?: undefined }
  | { ok: false; errors: Record<string, string>; id?: undefined };

export function createRow(
  key: ResourceKey,
  rawValues: Record<string, string>,
  extra: Record<string, string | number> = {},
): CreateResult {
  const def = getResource(key)!;
  const table = tableFor(key);

  const errors = validateValues(def, rawValues);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const values = coerce(def, rawValues);
  const columns: string[] = ["id", "created_at", "updated_at"];
  const params: (string | number)[] = [randomUUID(), now(), now()];

  for (const column of writableColumns(def)) {
    if (column === "published") continue; // handled below
    columns.push(assertIdentifier(column));
    if (column === "slug") {
      const base = slugify(rawValues.slug || rawValues.title || "");
      if (!base) {
        return { ok: false, errors: { slug: "Could not derive a slug — enter one manually." } };
      }
      params.push(uniqueSlug(table, base));
    } else {
      params.push(values[column] ?? "");
    }
  }

  // A checkbox in the form wins; resources without one fall back to their
  // declared default (documents default to draft because they often contain
  // personal data).
  const hasPublishedField = def.fields.some((field) => field.name === "published");
  columns.push("published");
  params.push(
    hasPublishedField && rawValues.published !== undefined
      ? rawValues.published === "1"
        ? 1
        : 0
      : def.defaultPublished
        ? 1
        : 0,
  );

  for (const [column, value] of Object.entries(extra)) {
    columns.push(assertIdentifier(column));
    params.push(value);
  }

  const placeholders = columns.map(() => "?").join(", ");
  run(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`, params);

  const id = String(params[0]);
  return { ok: true, id };
}

export type UpdateResult =
  | { ok: true; id: string; errors?: undefined }
  | { ok: false; errors: Record<string, string>; id?: string };

export function updateRow(
  key: ResourceKey,
  id: string,
  rawValues: Record<string, string>,
  extra: Record<string, string | number> = {},
  /** Pass `undefined` to leave `published` untouched (e.g. no checkbox in form). */
  published?: boolean,
): UpdateResult {
  const def = getResource(key)!;
  const table = tableFor(key);
  const existing = findRow(key, id);
  if (!existing) return { ok: false, errors: { _: "Entry not found." }, id };

  const errors = validateValues(def, rawValues);
  if (Object.keys(errors).length > 0) return { ok: false, errors, id };

  const values = coerce(def, rawValues);
  const sets: string[] = ["updated_at = ?"];
  const params: (string | number)[] = [now()];

  for (const column of writableColumns(def)) {
    if (column === "published") continue; // handled below
    sets.push(`${assertIdentifier(column)} = ?`);
    if (column === "slug") {
      const base = slugify(rawValues.slug || rawValues.title || "");
      if (!base) {
        return { ok: false, errors: { slug: "Could not derive a slug — enter one manually." }, id };
      }
      params.push(uniqueSlug(table, base, id));
    } else {
      params.push(values[column] ?? "");
    }
  }

  if (published !== undefined) {
    sets.push("published = ?");
    params.push(published ? 1 : 0);
  }

  for (const [column, value] of Object.entries(extra)) {
    sets.push(`${assertIdentifier(column)} = ?`);
    params.push(value);
  }

  params.push(id);
  run(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`, params);
  return { ok: true, id };
}

export function deleteRow(key: ResourceKey, id: string): void {
  const table = tableFor(key);
  const existing = findRow(key, id);
  if (!existing) return;

  run(`DELETE FROM ${table} WHERE id = ?`, [id]);

  if (key === "documents") {
    run("UPDATE profile SET avatar_id = NULL WHERE avatar_id = ?", [id]);
    deleteStored(String(existing.stored_name ?? ""));
  }
}

export function setPublished(key: ResourceKey, id: string, published: boolean): void {
  const table = tableFor(key);
  run(`UPDATE ${table} SET published = ?, updated_at = ? WHERE id = ?`, [
    published ? 1 : 0,
    now(),
    id,
  ]);
}

/** Swaps an entry with its neighbour, rewriting both sort orders. */
export function moveRow(key: ResourceKey, id: string, direction: "up" | "down"): void {
  const table = tableFor(key);
  const ids = all<{ id: string }>(
    `SELECT id FROM ${table} ORDER BY sort_order ASC, created_at DESC`,
  ).map((r) => r.id);

  const index = ids.indexOf(id);
  if (index < 0) return;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return;

  [ids[index], ids[target]] = [ids[target], ids[index]];

  // Normalise so ordering stays dense and deterministic.
  ids.forEach((rowId, position) => {
    run(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [position + 1, rowId]);
  });
}

/* ------------------------------------------------------------------ */
/* Profile (singleton)                                                 */
/* ------------------------------------------------------------------ */

export type ProfileRow = {
  full_name: string;
  headline: string;
  location: string;
  summary: string;
  email: string;
  phone: string;
  website: string;
  linkedin: string;
  github: string;
  x_url: string;
  footer_note: string;
  avatar_id: string | null;
};

export const EMPTY_PROFILE: ProfileRow = {
  full_name: "",
  headline: "",
  location: "",
  summary: "",
  email: "",
  phone: "",
  website: "",
  linkedin: "",
  github: "",
  x_url: "",
  footer_note: "",
  avatar_id: null,
};

export function readProfile(): ProfileRow {
  const row = get<ProfileRow>("SELECT * FROM profile WHERE id = 1");
  return row ? { ...EMPTY_PROFILE, ...row } : { ...EMPTY_PROFILE };
}

export function saveProfile(values: Record<string, string>): void {
  const columns: (keyof ProfileRow)[] = [
    "full_name",
    "headline",
    "location",
    "summary",
    "email",
    "phone",
    "website",
    "linkedin",
    "github",
    "x_url",
    "footer_note",
  ];

  const sets = columns.map((c) => `${assertIdentifier(String(c))} = ?`);
  const params: (string | number)[] = columns.map((c) => values[c] ?? "");
  sets.push("updated_at = ?");
  params.push(now());

  const exists = get<{ id: number }>("SELECT id FROM profile WHERE id = 1");
  if (exists) {
    run(`UPDATE profile SET ${sets.join(", ")} WHERE id = 1`, params);
  } else {
    run(
      `INSERT INTO profile (id, ${columns.join(", ")}, updated_at)
       VALUES (1, ${columns.map(() => "?").join(", ")}, ?)`,
      [1, ...params.slice(0, columns.length), now()],
    );
  }
}

export function setAvatar(documentId: string | null): void {
  const exists = get<{ id: number }>("SELECT id FROM profile WHERE id = 1");
  if (!exists) {
    run("INSERT INTO profile (id, updated_at) VALUES (1, ?)", [now()]);
  }
  run("UPDATE profile SET avatar_id = ?, updated_at = ? WHERE id = 1", [documentId, now()]);
}

/* ------------------------------------------------------------------ */
/* Checkbox helpers shared with the actions layer                      */
/* ------------------------------------------------------------------ */

export function isChecked(fieldName: string, value: unknown): boolean {
  if (CHECKBOX_FIELDS.has(fieldName)) return value === 1 || value === "1";
  return Boolean(value);
}

/** Turns a DB row into the flat string map the forms expect. */
export function rowToValues(def: ResourceDef, row: Row): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of def.fields) {
    const raw = row[field.name];
    values[field.name] = raw === null || raw === undefined ? "" : String(raw);
  }
  if (def.hasSlug) values.slug = row.slug === null || row.slug === undefined ? "" : String(row.slug);
  return values;
}
