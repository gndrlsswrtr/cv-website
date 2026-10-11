"use server";

import { headers } from "next/headers";

import { clientIpOf, submitContact } from "@/lib/contact";
import type { FormState } from "@/lib/form-state";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Public contact form action.
 *
 * A Server Action never receives a `Request`, so the caller IP and user agent
 * are read from the `headers()` helper instead — `clientIpOf` then sees the
 * same `{ headers }` shape it would get from a route handler, so the throttling
 * keys stay identical no matter which entry point submits.
 *
 * Returns a `FormState` for `useActionState`. Note `submitContact` answers
 * `{ ok: true }` for honeypot hits too, so a bot cannot tell that it was
 * silently dropped.
 */
export async function sendContactMessage(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const headersList = await headers();
  const request = { headers: headersList } as unknown as Request;

  const result = await submitContact(
    {
      name: text(formData, "name"),
      email: text(formData, "email"),
      subject: text(formData, "subject"),
      message: text(formData, "message"),
      website: text(formData, "website"),
    },
    clientIpOf(request),
    headersList.get("user-agent") ?? "",
  );

  if (result.ok) return { ok: true };

  if (result.errors) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: result.errors };
  }

  if (result.throttled) {
    return {
      ok: false,
      error: "Too many messages in a short time. Please wait a few minutes and try again.",
    };
  }

  return { ok: false, error: result.message ?? "Something went wrong. Please try again." };
}
