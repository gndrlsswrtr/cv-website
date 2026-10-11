import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  countRows,
  createRow,
  deleteRow,
  findRow,
  listRows,
  moveRow,
  rowToValues,
  setPublished,
  updateRow,
} from "@/lib/crud";
import { applyMigrations, resetMigrationMemo } from "@/lib/db/migrate";
import { CONTENT_ORDER, getResource, type ResourceKey } from "@/lib/resources";
import {
  adminQuery,
  marker,
  resetContent,
  resetMigrationBookkeeping,
} from "./helpers/db";

/**
 * The registry-driven CRUD layer: every content type is created, listed,
 * searched, reordered, published and deleted through the same generic code
 * path, so these round-trips double as a contract test for the registry.
 */

beforeAll(async () => {
  resetMigrationMemo();
  await applyMigrations();
});

afterEach(async () => {
  await resetContent();
  // `resetContent()` does not cover volunteer_experience, which the generic
  // default-published test below writes one row for.
  await adminQuery(`DELETE FROM volunteer_experience`);
});

afterAll(async () => {
  await resetMigrationBookkeeping();
});

/** Create with valid defaults, failing the test loudly on validation errors. */
async function mustCreate(key: ResourceKey, values: Record<string, string>): Promise<string> {
  const result = await createRow(key, values);
  if (!result.ok) {
    throw new Error(`createRow(${key}) failed: ${JSON.stringify(result.errors)}`);
  }
  return result.id;
}

describe("create → read → update → delete", () => {
  it("round-trips an education entry", async () => {
    const tag = marker();
    const id = await mustCreate("education", {
      institution: `${tag} University`,
      degree: "B.Sc.",
      field_of_study: "Computer Science",
    });

    const row = await findRow("education", id);
    expect(row).toBeDefined();
    expect(row?.institution).toBe(`${tag} University`);
    expect(row?.degree).toBe("B.Sc.");
    expect(row?.published).toBe(true);

    const updated = await updateRow("education", id, {
      institution: `${tag} Institute`,
      degree: "M.Sc.",
    });
    expect(updated.ok).toBe(true);

    const after = await findRow("education", id);
    expect(after?.institution).toBe(`${tag} Institute`);
    expect(after?.degree).toBe("M.Sc.");

    await deleteRow("education", id);
    expect(await findRow("education", id)).toBeUndefined();
    expect(await countRows("education")).toBe(0);
  });

  it("round-trips an achievement (the `date` column is a SQL keyword)", async () => {
    const tag = marker();
    const id = await mustCreate("achievements", {
      title: `${tag} Best Paper`,
      category: "Award",
      issuer: "ACM SIGMOD",
      date: "2024-05-01",
      url: "https://example.org/paper",
      description: "For the tracing paper.",
    });

    const row = await findRow("achievements", id);
    expect(row?.title).toBe(`${tag} Best Paper`);
    expect(row?.category).toBe("Award");
    expect(row?.date).toBe("2024-05-01");
    expect(row?.url).toBe("https://example.org/paper");

    const updated = await updateRow("achievements", id, {
      title: `${tag} Best Paper (erratum)`,
      category: "Publication",
    });
    expect(updated.ok).toBe(true);
    const after = await findRow("achievements", id);
    expect(after?.title).toBe(`${tag} Best Paper (erratum)`);
    expect(after?.category).toBe("Publication");

    await deleteRow("achievements", id);
    expect(await findRow("achievements", id)).toBeUndefined();
  });

  it("rejects a blank required field and writes no row", async () => {
    const before = await countRows("education");

    const result = await createRow("education", {
      institution: "   ",
      degree: "B.Sc.",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors.institution).toBe("Institution is required.");
    expect(await countRows("education")).toBe(before);
  });

  it("reports not-found for updates and deletes silently", async () => {
    const ghost = "00000000-0000-0000-0000-000000000000";
    const updated = await updateRow("education", ghost, { institution: "X" });
    expect(updated.ok).toBe(false);
    if (updated.ok) throw new Error("unreachable");
    expect(updated.errors._).toBe("Entry not found.");

    // Deleting a missing row is a no-op, not an error.
    await deleteRow("education", ghost);
  });
});

describe("published filtering", () => {
  it("lists drafts everywhere, but only published rows with publishedOnly", async () => {
    const tag = marker();
    await mustCreate("education", { institution: `${tag} Published` });
    await mustCreate("education", { institution: `${tag} Draft`, published: "0" });

    const all = await listRows("education");
    expect(all).toHaveLength(2);

    const onlyPublished = await listRows("education", { publishedOnly: true });
    expect(onlyPublished).toHaveLength(1);
    expect(onlyPublished[0]?.institution).toBe(`${tag} Published`);
  });

  it("setPublished(false) drops the published count by one", async () => {
    const tag = marker();
    const first = await mustCreate("education", { institution: `${tag} A` });
    await mustCreate("education", { institution: `${tag} B` });

    expect(await countRows("education")).toBe(2);
    expect(await countRows("education", true)).toBe(2);

    await setPublished("education", first, false);

    expect(await countRows("education", true)).toBe(1);
    expect(await countRows("education")).toBe(2);

    const row = await findRow("education", first);
    expect(row?.published).toBe(false);
  });
});

describe("search", () => {
  it("matches only the registered search fields", async () => {
    const tag = marker();
    await mustCreate("education", { institution: `${tag} Academy` });
    // `location` is deliberately NOT a search field for education.
    await mustCreate("education", {
      institution: "Somewhere College",
      location: `${tag} City`,
    });

    const hits = await listRows("education", { q: tag });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.institution).toBe(`${tag} Academy`);
  });

  it("escapes LIKE wildcards so % only matches a literal percent sign", async () => {
    const tag = marker();
    await mustCreate("education", { institution: `${tag}100%` });
    await mustCreate("education", { institution: `${tag}100x` });

    const hits = await listRows("education", { q: `${tag}%` });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.institution).toBe(`${tag}100%`);
  });

  it("returns nothing when nothing matches", async () => {
    expect(await listRows("education", { q: marker() })).toEqual([]);
  });
});

describe("moveRow", () => {
  it("swaps an entry with its neighbour and keeps sort_order dense", async () => {
    const tag = marker();
    await mustCreate("education", { institution: `${tag} A`, sort_order: "1" });
    const second = await mustCreate("education", { institution: `${tag} B`, sort_order: "2" });
    await mustCreate("education", { institution: `${tag} C`, sort_order: "3" });

    await moveRow("education", second, "up");

    const rows = await listRows("education");
    expect(rows.map((r) => r.institution)).toEqual([
      `${tag} B`,
      `${tag} A`,
      `${tag} C`,
    ]);
    // Dense: no gaps, no duplicates, renormalised from 1.
    expect(rows.map((r) => r.sort_order)).toEqual([1, 2, 3]);
  });

  it("is a no-op at the top of the list", async () => {
    const tag = marker();
    const first = await mustCreate("education", { institution: `${tag} A`, sort_order: "1" });
    await mustCreate("education", { institution: `${tag} B`, sort_order: "2" });

    await moveRow("education", first, "up");

    const rows = await listRows("education");
    expect(rows.map((r) => r.institution)).toEqual([`${tag} A`, `${tag} B`]);
    expect(rows.map((r) => r.sort_order)).toEqual([1, 2]);
  });
});

describe("rowToValues", () => {
  it('round-trips checkboxes to "1"/"0" so forms re-check correctly', async () => {
    const def = getResource("experience")!;
    const tag = marker();

    const checked = await mustCreate("experience", {
      title: `${tag} Current role`,
      company: "ACME",
      is_current: "1",
      published: "0",
    });
    const unchecked = await mustCreate("experience", {
      title: `${tag} Past role`,
      company: "ACME",
    });

    const checkedRow = await findRow("experience", checked);
    const checkedValues = rowToValues(def, checkedRow!);
    expect(checkedValues.is_current).toBe("1");
    expect(checkedValues.published).toBe("0");

    const uncheckedRow = await findRow("experience", unchecked);
    const uncheckedValues = rowToValues(def, uncheckedRow!);
    expect(uncheckedValues.is_current).toBe("0");
    expect(uncheckedValues.published).toBe("1");

    // Round-trip: flip both boxes through updateRow and read them back.
    const flipped = await updateRow(
      "experience",
      checked,
      { ...checkedValues, is_current: "0" },
      {},
      true,
    );
    expect(flipped.ok).toBe(true);
    const after = rowToValues(def, (await findRow("experience", checked))!);
    expect(after.is_current).toBe("0");
    expect(after.published).toBe("1");
  });
});

describe("findRow", () => {
  it("returns undefined for a malformed id instead of throwing", async () => {
    expect(await findRow("education", "not-a-uuid!!")).toBeUndefined();
    expect(await findRow("education", "")).toBeUndefined();
    expect(await findRow("education", "Robert'); DROP TABLE education;--")).toBeUndefined();
  });
});

describe("defaultPublished", () => {
  it("documents default to draft; every other resource defaults to published", async () => {
    const tag = marker();

    for (const key of CONTENT_ORDER) {
      const def = getResource(key)!;
      const values: Record<string, string> = {};
      for (const field of def.fields) {
        if (field.required) {
          values[field.name] = `${tag} ${field.label}`;
        } else if (field.type === "select" && field.options && field.options.length > 0) {
          values[field.name] = field.options[0]!.value;
        } else {
          values[field.name] = "";
        }
      }

      const id = await mustCreate(key, values);
      const row = await findRow(key, id);
      expect(row?.published, `${key} published default`).toBe(def.defaultPublished);
    }

    // The personal-data rule, stated generically from the registry.
    expect(getResource("documents")!.defaultPublished).toBe(false);
    for (const key of CONTENT_ORDER) {
      if (key === "documents") continue;
      expect(getResource(key)!.defaultPublished, key).toBe(true);
    }
  });
});
