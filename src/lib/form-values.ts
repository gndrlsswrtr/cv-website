import type { ResourceDef } from "@/lib/resources";

/**
 * Starting values for the "new entry" form, derived from the field
 * definitions: text fields start empty, checkboxes start at the resource's
 * default publish state, selects start on their first option.
 *
 * Deliberately lives outside `ResourceForm` — that file carries `"use client"`,
 * so exporting this from there made it unreachable from the Server Component
 * that calls it, and every `/admin/<resource>/new` page failed at render time.
 * Pure data in, plain object out: no React, no browser APIs, safe either side
 * of the boundary.
 */
export function initialValues(def: ResourceDef): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of def.fields) {
    if (field.type === "checkbox") {
      values[field.name] = def.defaultPublished && field.name === "published" ? "1" : "0";
    } else if (field.type === "select") {
      values[field.name] = field.options?.[0]?.value ?? "";
    } else if (field.type === "number") {
      values[field.name] = String(field.min ?? 0);
    } else {
      values[field.name] = "";
    }
  }
  return values;
}
