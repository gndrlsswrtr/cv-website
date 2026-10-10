"use client";

import { useActionState } from "react";

import { setupAdmin } from "@/app/admin/actions";
import { PasswordToggle } from "@/components/admin/PasswordToggle";
import type { FormState } from "@/lib/form-state";

/** First-run account creation. The server refuses once any account exists. */
export function SetupForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(setupAdmin, {});
  const field = (name: string) => state.fieldErrors?.[name];

  const error = (name: string) =>
    field(name) ? (
      <p id={`${name}-error`} className="mt-1.5 text-xs text-red-500">
        {field(name)}
      </p>
    ) : null;

  return (
    <form action={formAction} className="grid gap-4">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
          Your name
        </label>
        <input
          type="text"
          name="name"
          id="name"
          className="control"
          autoComplete="name"
          placeholder="Jane Doe"
          required
          {...(field("name") ? { "aria-invalid": true, "aria-describedby": "name-error" } : {})}
        />
        {error("name")}
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          Email
        </label>
        <input
          type="email"
          name="email"
          id="email"
          className="control"
          autoComplete="username"
          placeholder="you@example.com"
          required
          {...(field("email") ? { "aria-invalid": true, "aria-describedby": "email-error" } : {})}
        />
        {error("email")}
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <PasswordToggle name="password" autoComplete="new-password" required />
        <p className="mt-1.5 text-xs text-muted">At least 10 characters.</p>
        {error("password")}
      </div>

      <div>
        <label htmlFor="confirm_password" className="mb-1.5 block text-sm font-medium">
          Confirm password
        </label>
        <PasswordToggle name="confirm_password" autoComplete="new-password" required />
        {error("confirm_password")}
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary mt-1" disabled={pending}>
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
