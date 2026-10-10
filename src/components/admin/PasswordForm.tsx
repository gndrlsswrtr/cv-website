"use client";

import { useActionState } from "react";

import { changePassword } from "@/app/admin/actions";
import { PasswordToggle } from "@/components/admin/PasswordToggle";
import type { FormState } from "@/lib/form-state";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(changePassword, {});

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      <div>
        <label htmlFor="current_password" className="mb-1.5 block text-sm font-medium">
          Current password
        </label>
        <PasswordToggle name="current_password" autoComplete="current-password" required />
      </div>

      <div>
        <label htmlFor="new_password" className="mb-1.5 block text-sm font-medium">
          New password
        </label>
        <PasswordToggle name="new_password" autoComplete="new-password" required />
        <p className="mt-1.5 text-xs text-muted">At least 10 characters.</p>
      </div>

      <div>
        <label htmlFor="confirm_password" className="mb-1.5 block text-sm font-medium">
          Confirm new password
        </label>
        <PasswordToggle name="confirm_password" autoComplete="new-password" required />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-600">
          Password updated. Every other session has been signed out.
        </p>
      ) : null}

      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Updating…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
