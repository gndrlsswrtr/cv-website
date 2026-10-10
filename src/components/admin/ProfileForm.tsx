"use client";

import { useActionState } from "react";

import { saveProfileAction } from "@/app/admin/actions";
import type { FormState } from "@/lib/form-state";

const FIELDS: {
  name: string;
  label: string;
  type: "text" | "email" | "url" | "textarea";
  span?: "full";
  autoComplete?: string;
  placeholder?: string;
}[] = [
  { name: "full_name", label: "Full name", type: "text", autoComplete: "name", placeholder: "Jane Doe" },
  { name: "headline", label: "Headline", type: "text", placeholder: "Senior Software Engineer" },
  { name: "location", label: "Location", type: "text", placeholder: "Berlin, Germany" },
  { name: "email", label: "Contact email", type: "email", autoComplete: "email" },
  { name: "phone", label: "Phone", type: "text", autoComplete: "tel" },
  { name: "website", label: "Website", type: "url", placeholder: "https://example.com" },
  { name: "linkedin", label: "LinkedIn", type: "url", placeholder: "https://linkedin.com/in/you" },
  { name: "github", label: "GitHub", type: "url", placeholder: "https://github.com/you" },
  { name: "x_url", label: "X / Twitter", type: "url", placeholder: "https://x.com/you" },
  { name: "summary", label: "About you", type: "textarea", span: "full" },
  { name: "footer_note", label: "Footer note", type: "textarea", span: "full",
    placeholder: "Optional line shown in the site footer." },
];

export function ProfileForm({
  values,
  avatar,
  avatarUrl,
}: {
  values: Record<string, string>;
  avatar: { original_name: string } | null;
  avatarUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveProfileAction, {});

  return (
    <form action={formAction} className="grid gap-6">
      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-600">
          Profile saved. It appears on the public site within about a minute.
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        {FIELDS.map((field) => {
          const error = state.fieldErrors?.[field.name];
          const id = field.name;
          const base = {
            id,
            name: id,
            className: "control",
            defaultValue: values[id] ?? "",
            placeholder: field.placeholder,
            ...(error ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {}),
          };

          return (
            <div key={field.name} className={field.span === "full" ? "sm:col-span-2" : undefined}>
              <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
                {field.label}
              </label>
              {field.type === "textarea" ? (
                <textarea {...base} rows={4} />
              ) : (
                <input {...base} type={field.type ?? "text"} {...(field.autoComplete ? { autoComplete: field.autoComplete } : {})} />
              )}
              {error ? (
                <p id={`${id}-error`} className="mt-1.5 text-xs text-red-500">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Photo ------------------------------------------------------- */}
      <div className="border-t border-border pt-6">
        <p className="mb-3 text-sm font-medium">Profile photo</p>
        {avatar && avatarUrl ? (
          <div className="mb-4 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- served from the private documents route, not /public */}
            <img src={avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            <div className="text-sm">
              <p className="font-medium">{avatar.original_name}</p>
              <label className="mt-1 flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  name="remove_avatar"
                  value="1"
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Remove the current photo
              </label>
            </div>
          </div>
        ) : null}

        <label htmlFor="avatar" className="mb-1.5 block text-sm font-medium">
          {avatar ? "Replace photo" : "Upload photo"}
        </label>
        <input
          type="file"
          name="avatar"
          id="avatar"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="block w-full text-sm text-muted file:mr-4 file:rounded-md file:border file:border-border file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:border-accent"
        />
        <p className="mt-1.5 text-xs text-muted">PNG, JPG, WEBP or GIF, up to 12 MB.</p>
      </div>

      <div className="border-t border-border pt-5">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
