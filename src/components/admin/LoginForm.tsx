"use client";

import { useActionState } from "react";

import { login } from "@/app/admin/actions";
import { PasswordToggle } from "@/components/admin/PasswordToggle";
import type { FormState } from "@/lib/form-state";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(login, {});

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="next" value={next} />

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
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <PasswordToggle name="password" autoComplete="current-password" required />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary mt-1" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
