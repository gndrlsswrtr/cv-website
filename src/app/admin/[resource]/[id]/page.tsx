import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResourceForm } from "@/components/admin/ResourceForm";
import { adminFind } from "@/lib/content";
import { rowToValues } from "@/lib/crud";
import { formatBytes } from "@/lib/format";
import { getResource, isResourceKey } from "@/lib/resources";

export const instant = false;

type Props = { params: Promise<{ resource: string; id: string }> };

async function load(params: Props["params"]) {
  const { resource, id } = await params;
  if (!isResourceKey(resource)) return null;

  const def = getResource(resource)!;
  const row = adminFind(resource, id);
  if (!row) return null;

  return { def, row };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await load(params);
  if (!loaded) return { title: "Not found", robots: { index: false, follow: false } };
  return {
    title: `Edit ${String(loaded.row[loaded.def.titleField] ?? loaded.def.singular)}`,
    robots: { index: false, follow: false },
  };
}

export default async function EditResourcePage({ params }: Props) {
  const loaded = await load(params);
  if (!loaded) notFound();
  const { def, row } = loaded;
  const values = rowToValues(def, row);

  const upload = def.upload;
  const storedName = String(row.stored_name ?? "");
  const fileSize = Number(row.size ?? 0);
  const originalName = String(row.original_name ?? "");

  return (
    <div className="grid gap-6">
      <header>
        <p className="eyebrow mb-2">
          <Link href={`/admin/${def.key}`} className="hover:text-foreground">
            {def.label}
          </Link>{" "}
          / Edit
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {String(row[def.titleField] ?? def.singular)}
        </h1>
      </header>

      <div className="card px-5 py-6 sm:px-6">
        <ResourceForm
          def={def}
          values={values}
          id={String(row.id)}
          submitLabel="Save changes"
          cancelHref={`/admin/${def.key}`}
          {...(upload
            ? {
                currentFile: storedName
                  ? { name: originalName || storedName, size: fileSize }
                  : null,
                above: (
                  <div>
                    <label htmlFor="file" className="mb-1.5 block text-sm font-medium">
                      Replace {upload.label.toLowerCase()}
                    </label>
                    <input
                      type="file"
                      name="file"
                      id="file"
                      accept={upload.extensions.map((ext) => `.${ext}`).join(",")}
                      className="block w-full text-sm text-muted file:mr-4 file:rounded-md file:border file:border-border file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:border-accent"
                    />
                    {upload.help ? (
                      <p className="mt-1.5 text-xs text-muted">{upload.help}</p>
                    ) : null}
                    {storedName ? (
                      <p className="mt-2 text-xs text-muted">
                        Current file:{" "}
                        <span className="font-medium text-foreground">
                          {originalName || storedName}
                        </span>
                        {fileSize > 0 ? ` · ${formatBytes(fileSize)}` : ""} — upload a new file to
                        replace it.
                      </p>
                    ) : null}
                  </div>
                ),
              }
            : {})}
        />
      </div>
    </div>
  );
}
