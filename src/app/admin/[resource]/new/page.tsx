import type { Metadata } from "next";
import Link from "next/link";

import { ResourceForm } from "@/components/admin/ResourceForm";
import { initialValues } from "@/lib/form-values";
import { getResource, isResourceKey } from "@/lib/resources";

export const instant = false;

type Props = { params: Promise<{ resource: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { resource } = await params;
  const def = isResourceKey(resource) ? getResource(resource) : undefined;
  return {
    title: def ? `Add ${def.singular}` : "Not found",
    robots: { index: false, follow: false },
  };
}

export default async function NewResourcePage({ params }: Props) {
  const { resource } = await params;

  if (!isResourceKey(resource)) {
    return (
      <div className="card px-6 py-10 text-center">
        <p className="text-sm font-medium">Unknown content type.</p>
        <Link href="/admin" className="btn btn-secondary mt-4">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const def = getResource(resource)!;
  const upload = def.upload;

  return (
    <div className="grid gap-6">
      <header>
        <p className="eyebrow mb-2">
          <Link href={`/admin/${def.key}`} className="hover:text-foreground">
            {def.label}
          </Link>{" "}
          / New
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Add {def.singular}
        </h1>
        <p className="mt-2 text-sm text-muted">{def.description}</p>
      </header>

      <div className="card px-5 py-6 sm:px-6">
        <ResourceForm
          def={def}
          values={initialValues(def)}
          submitLabel={`Add ${def.singular}`}
          cancelHref={`/admin/${def.key}`}
          {...(upload
            ? {
                above: (
                  <div>
                    <label htmlFor="file" className="mb-1.5 block text-sm font-medium">
                      {upload.label}
                      {upload.requiredOnCreate ? <span className="text-red-500"> *</span> : null}
                    </label>
                    <input
                      type="file"
                      name="file"
                      id="file"
                      accept={upload.extensions.map((ext) => `.${ext}`).join(",")}
                      required={upload.requiredOnCreate}
                      className="block w-full text-sm text-muted file:mr-4 file:rounded-md file:border file:border-border file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:border-accent"
                    />
                    {upload.help ? (
                      <p className="mt-1.5 text-xs text-muted">{upload.help}</p>
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
