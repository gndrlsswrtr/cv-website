import { randomUUID } from "node:crypto";

import { all, get, now, run, withTransaction, type Row } from "@/lib/db";
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
 * Column and table names are validated against a strict identifier pattern,
 * come only from the static resource registry, and are double-quoted (so a
 * legitimate column named `date` cannot be read as a keyword). Every value is
 * bound as a `$n` parameter. There is no interpolation of user input anywhere
 * here.
 */

export type { Row };

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function tableFor(key: ResourceKey): string {
  const def = getResource(key);
  if (!def) throw new Error(`Unknown resource: ${key}`);
  return assertIdentifier(def.table);
}

function placeholders(count: number): string {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(", ");
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

export async function listRows(key: ResourceKey, options: ListOptions = {}): Promise<Row[]> {
  const def = getResource(key)!;
  const table = tableFor(key);

  const where: string[] = [];
  const params: (string | number)[] = [];

  if (options.publishedOnly) {
    where.push(`"published" = true`);
  }
  if (options.q && def.searchFields.length > 0) {
    const clause = def.searchFields
      .map((field) => `${assertIdentifier(field)} LIKE $${params.length + 1} ESCAPE '\\'`)
      .join(" OR ");
    where.push(`(${clause})`);
    for (let i = 0; i < def.searchFields.length; i += 1) {
      params.push(`%${escapeLike(options.q)}%`);
    }
  }

  const sql = [
    `SELECT * FROM ${table}`,
    where.length ? `WHERE ${where.join(" AND ")}` : "",
    `ORDER BY "sort_order" ASC, "created_at" DESC`,
    options.limit ? `LIMIT $${params.length + 1}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (options.limit) params.push(options.limit);
  return all<Row>(sql, params);
}

export async function findRow(key: ResourceKey, id: string): Promise<Row | undefined> {
  const table = tableFor(key);
  if (!/^[0-9a-fA-F-]{1,64}$/.test(id)) return undefined;
  return get<Row>(`SELECT * FROM ${table} WHERE "id" = $1`, [id]);
}

export async function countRows(key: ResourceKey, publishedOnly = false): Promise<number> {
  const table = tableFor(key);
  const sql = publishedOnly
    ? `SELECT COUNT(*) AS n FROM ${table} WHERE "published" = true`
    : `SELECT COUNT(*) AS n FROM ${table}`;
  const row = await get<{ n: string }>(sql);
  return Number(row?.n ?? 0);
}

export async function rowCount(table: string): Promise<number> {
  const row = await get<{ n: string }>(
    `SELECT COUNT(*) AS n FROM ${assertIdentifier(table)}`,
  );
  return Number(row?.n ?? 0);
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

function coerce(
  def: ResourceDef,
  values: Record<string, string>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const field of def.fields) {
    const raw = values[field.name] ?? "";
    if (field.type === "checkbox") {
      out[field.name] = raw === "1" || raw === "true";
    } else if (field.type === "number") {
      out[field.name] = raw === "" ? 0 : Number(raw);
    } else {
      out[field.name] = raw;
    }
  }
  return out;
}

async function uniqueSlug(table: string, base: string, excludeId?: string): Promise<string> {
  const root = base || "item";
  let candidate = root;
  let suffix = 2;
  for (;;) {
    const existing = excludeId
      ? await get<{ id: string }>(
          `SELECT "id" FROM ${table} WHERE "slug" = $1 AND "id" <> $2`,
          [candidate, excludeId],
        )
      : await get<{ id: string }>(`SELECT "id" FROM ${table} WHERE "slug" = $1`, [candidate]);
    if (!existing) return candidate;
    candidate = `${root}-${suffix}`;
    suffix += 1;
    if (suffix > 500) return `${root}-${randomUUID().slice(0, 8)}`;
  }
}

export type CreateResult =
  | { ok: true; id: string; errors?: undefined }
  | { ok: false; errors: Record<string, string>; id?: undefined };

export async function createRow(
  key: ResourceKey,
  rawValues: Record<string, string>,
  extra: Record<string, string | number> = {},
): Promise<CreateResult> {
  const def = getResource(key)!;
  const table = tableFor(key);

  const errors = validateValues(def, rawValues);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const values = coerce(def, rawValues);
  const id = randomUUID();
  const columns: string[] = ["id", "created_at", "updated_at"];
  const params: (string | number | boolean)[] = [id, now(), now()];

  for (const column of writableColumns(def)) {
    if (column === "published") continue; // handled below
    columns.push(assertIdentifier(column));
    if (column === "slug") {
      const base = slugify(rawValues.slug || rawValues.title || "");
      if (!base) {
        return {
          ok: false,
          errors: { slug: "Could not derive a slug — enter one manually." },
        };
      }
      params.push(await uniqueSlug(table, base));
    } else {
      params.push((values[column] ?? "") as string | number | boolean);
    }
  }

  // A checkbox in the form wins; resources without one fall back to their
  // declared default (documents default to draft because they often contain
  // personal data).
  const hasPublishedField = def.fields.some((field) => field.name === "published");
  columns.push(`"published"`);
  params.push(
    hasPublishedField && rawValues.published !== undefined
      ? rawValues.published === "1"
      : def.defaultPublished,
  );

  for (const [column, value] of Object.entries(extra)) {
    columns.push(assertIdentifier(column));
    params.push(value);
  }

  await run(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders(params.length)})`,
    params,
  );

  return { ok: true, id };
}

export type UpdateResult =
  | { ok: true; id: string; errors?: undefined }
  | { ok: false; errors: Record<string, string>; id?: string };

export async function updateRow(
  key: ResourceKey,
  id: string,
  rawValues: Record<string, string>,
  extra: Record<string, string | number> = {},
  /** Pass `undefined` to leave `published` untouched (e.g. no checkbox in form). */
  published?: boolean,
): Promise<UpdateResult> {
  const def = getResource(key)!;
  const table = tableFor(key);
  const existing = await findRow(key, id);
  if (!existing) return { ok: false, errors: { _: "Entry not found." }, id };

  const errors = validateValues(def, rawValues);
  if (Object.keys(errors).length > 0) return { ok: false, errors, id };

  const values = coerce(def, rawValues);
  const sets: string[] = [`"updated_at" = $1`];
  const params: (string | number | boolean)[] = [now()];

  for (const column of writableColumns(def)) {
    if (column === "published") continue; // handled below
    sets.push(`${assertIdentifier(column)} = $${params.length + 1}`);
    if (column === "slug") {
      const base = slugify(rawValues.slug || rawValues.title || "");
      if (!base) {
        return {
          ok: false,
          errors: { slug: "Could not derive a slug — enter one manually." },
          id,
        };
      }
      params.push(await uniqueSlug(table, base, id));
    } else {
      params.push((values[column] ?? "") as string | number | boolean);
    }
  }

  if (published !== undefined) {
    sets.push(`"published" = $${params.length + 1}`);
    params.push(published);
  }

  for (const [column, value] of Object.entries(extra)) {
    sets.push(`${assertIdentifier(column)} = $${params.length + 1}`);
    params.push(value);
  }

  params.push(id);
  await run(`UPDATE ${table} SET ${sets.join(", ")} WHERE "id" = $${params.length}`, params);
  return { ok: true, id };
}

export async function deleteRow(key: ResourceKey, id: string): Promise<void> {
  const table = tableFor(key);
  const existing = await findRow(key, id);
  if (!existing) return;

  await run(`DELETE FROM ${table} WHERE "id" = $1`, [id]);

  if (key === "documents") {
    await run(`UPDATE profile SET "avatar_id" = NULL WHERE "avatar_id" = $1`, [id]);
    deleteStored(String(existing.stored_name ?? ""));
  }
}

export async function setPublished(
  key: ResourceKey,
  id: string,
  published: boolean,
): Promise<void> {
  const table = tableFor(key);
  await run(`UPDATE ${table} SET "published" = $1, "updated_at" = $2 WHERE "id" = $3`, [
    published,
    now(),
    id,
  ]);
}

/** Swaps an entry with its neighbour, rewriting both sort orders. */
export async function moveRow(
  key: ResourceKey,
  id: string,
  direction: "up" | "down",
): Promise<void> {
  const table = tableFor(key);

  await withTransaction(async () => {
    const ids = (
      await all<{ id: string }>(
        `SELECT "id" FROM ${table} ORDER BY "sort_order" ASC, "created_at" DESC`,
      )
    ).map((r) => r.id);

    const index = ids.indexOf(id);
    if (index < 0) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= ids.length) return;

    [ids[index], ids[target]] = [ids[target], ids[index]];

    // Normalise so ordering stays dense and deterministic.
    let position = 1;
    for (const rowId of ids) {
      await run(`UPDATE ${table} SET "sort_order" = $1 WHERE "id" = $2`, [position, rowId]);
      position += 1;
    }
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

export async function readProfile(): Promise<ProfileRow> {
  const row = await get<Partial<ProfileRow>>(`SELECT * FROM profile WHERE "id" = 1`);
  return row ? { ...EMPTY_PROFILE, ...row } : { ...EMPTY_PROFILE };
}

export async function saveProfile(values: Record<string, string>): Promise<void> {
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

  const quoted = columns.map((c) => assertIdentifier(String(c)));
  // The same $1..$n parameters feed both the INSERT values and the UPDATE set,
  // which is exactly what `ON CONFLICT ... DO UPDATE` expects.
  const updateSet = quoted.map((c, index) => `${c} = $${index + 1}`).join(", ");

  const params: (string | number)[] = columns.map((c) => values[c] ?? "");
  params.push(now());

  await run(
    `INSERT INTO profile ("id", ${quoted.join(", ")}, "updated_at")
     VALUES (1, ${placeholders(columns.length)}, $${columns.length + 1})
     ON CONFLICT ("id") DO UPDATE SET ${updateSet}, "updated_at" = EXCLUDED."updated_at"`,
    params,
  );
}

export async function setAvatar(documentId: string | null): Promise<void> {
  await run(
    `INSERT INTO profile ("id", "avatar_id", "updated_at") VALUES (1, $1, now())
     ON CONFLICT ("id") DO UPDATE SET "avatar_id" = EXCLUDED."avatar_id", "updated_at" = now()`,
    [documentId],
  );
}

/* ------------------------------------------------------------------ */
/* Checkbox helpers shared with the actions layer                      */
/* ------------------------------------------------------------------ */

export function isChecked(fieldName: string, value: unknown): boolean {
  if (CHECKBOX_FIELDS.has(fieldName)) {
    return value === 1 || value === "1" || value === true;
  }
  return Boolean(value);
}

/** Turns a DB row into the flat string map the forms expect. */
export function rowToValues(def: ResourceDef, row: Row): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of def.fields) {
    const raw = row[field.name];
    if (raw === null || raw === undefined) {
      values[field.name] = "";
    } else if (field.type === "checkbox") {
      values[field.name] = raw === true || raw === 1 || raw === "1" ? "1" : "0";
    } else {
      values[field.name] = String(raw);
    }
  }
  if (def.hasSlug) {
    values.slug = row.slug === null || row.slug === undefined ? "" : String(row.slug);
  }
  return values;
}
