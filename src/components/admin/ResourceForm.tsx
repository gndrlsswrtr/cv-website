"use client";

import { useActionState, type ReactNode } from "react";

import { createResource, updateResource } from "@/app/admin/actions";
import type { FieldDef, ResourceDef } from "@/lib/resources";

type FieldProps = {
  field: FieldDef;
  value: string;
  error?: string;
};

function Field({ field, value, error }: FieldProps) {
  const errorId = `${field.name}-error`;
  const base = {
    id: field.name,
    name: field.name,
    className: "control",
    defaultValue: value,
    placeholder: field.placeholder,
    ...(error ? { "aria-invalid": true, "aria-describedby": errorId } : {}),
  };

  let input: ReactNode;

  switch (field.type) {
    case "textarea":
      input = <textarea {...base} rows={field.rows ?? 4} />;
      break;
    case "select": {
      const options = field.options ?? [];
      const selected = options.some((option) => option.value === value)
        ? value
        : (options[0]?.value ?? "");
      input = (
        <select {...base} defaultValue={selected}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
      break;
    }
    case "checkbox":
      input = (
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name={field.name}
            id={field.name}
            defaultChecked={value === "1" || value === "true"}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          <span>{field.label}</span>
        </label>
      );
      break;
    case "number":
      input = <input {...base} type="number" min={field.min} max={field.max} />;
      break;
    case "date":
      input = <input {...base} type="date" />;
      break;
    case "url":
      input = <input {...base} type="url" />;
      break;
    case "email":
      input = <input {...base} type="email" />;
      break;
    default:
      input = <input {...base} type="text" />;
  }

  if (field.type === "checkbox") {
    return (
      <div className="sm:col-span-2">
        <div className="card px-4 py-3">{input}</div>
        {error ? (
          <p id={errorId} className="mt-1.5 text-xs text-red-500">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={field.span === "full" ? "sm:col-span-2" : undefined}>
      <label htmlFor={field.name} className="mb-1.5 block text-sm font-medium">
        {field.label}
        {field.required ? <span className="text-red-500"> *</span> : null}
      </label>
      {input}
      {field.help ? <p className="mt-1.5 text-xs text-muted">{field.help}</p> : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs text-red-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Props = {
  def: ResourceDef;
  /** Initial values; leave empty to create a new entry. */
  values: Record<string, string>;
  submitLabel: string;
  /** When present the form updates, otherwise it creates. */
  id?: string;
  cancelHref: string;
  /** Rendered above the field grid — used for the file upload control. */
  above?: ReactNode;
  currentFile?: { name: string; size: number } | null;
};

export function ResourceForm({
  def,
  values,
  submitLabel,
  id,
  cancelHref,
  above,
  currentFile,
}: Props) {
  const action = id ? updateResource : createResource;
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="grid gap-6">
      <input type="hidden" name="__resource" value={def.key} />
      {id ? <input type="hidden" name="__id" value={id} /> : null}

      {state.error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {state.error}
        </div>
      ) : null}

      {above}

      <div className="grid gap-5 sm:grid-cols-2">
        {def.fields.map((field) => (
          <Field
            key={field.name}
            field={field}
            value={values[field.name] ?? ""}
            error={state.fieldErrors?.[field.name]}
          />
        ))}
      </div>

      {currentFile ? (
        <p className="text-xs text-muted">
          Current file: <span className="font-medium">{currentFile.name}</span>
          {currentFile.size > 0 ? ` · ${currentFile.size} bytes` : ""} — upload a new file to
          replace it.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 border-t border-border pt-5">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <a href={cancelHref} className="btn btn-secondary">
          Cancel
        </a>
      </div>
    </form>
  );
}
