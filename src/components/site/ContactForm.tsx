"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";

import { sendContactMessage } from "@/app/(site)/contact/actions";
import type { FormState } from "@/lib/form-state";

const FIELDS: {
  name: string;
  label: string;
  type: "text" | "email";
  autoComplete?: string;
  placeholder?: string;
  half?: boolean;
}[] = [
  { name: "name", label: "Your name", type: "text", autoComplete: "name", placeholder: "Jane Doe", half: true },
  { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@example.com", half: true },
  { name: "subject", label: "Subject", type: "text", placeholder: "Project enquiry" },
];

/**
 * Public contact form.
 *
 * Drives the `sendContactMessage` server action through `useActionState`.
 * The `website` input is the honeypot: visually hidden, out of the tab order,
 * and deliberately not `type="hidden"` — bots skip hidden inputs, humans never
 * see this one.
 */
export function ContactForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    sendContactMessage,
    {},
  );

  return (
    <form action={formAction} className="grid gap-5">
      {state.ok ? (
        <p
          role="status"
          className="rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-600"
        >
          Thanks — your message has been sent. I&apos;ll get back to you by email as soon as I
          can.
        </p>
      ) : null}
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        {FIELDS.map((field) => {
          const error = state.fieldErrors?.[field.name];
          const id = `contact-${field.name}`;

          return (
            <div key={field.name} className={field.half ? undefined : "sm:col-span-2"}>
              <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
                {field.label}
              </label>
              <input
                type={field.type}
                name={field.name}
                id={id}
                className="control"
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                required
                {...(error ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {})}
              />
              {error ? (
                <p id={`${id}-error`} className="mt-1.5 text-xs text-red-500">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div>
        <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium">
          Message
        </label>
        <textarea
          name="message"
          id="contact-message"
          className="control"
          rows={6}
          placeholder="What would you like to talk about?"
          required
          {...(state.fieldErrors?.message
            ? { "aria-invalid": true, "aria-describedby": "contact-message-error" }
            : {})}
        />
        {state.fieldErrors?.message ? (
          <p id="contact-message-error" className="mt-1.5 text-xs text-red-500">
            {state.fieldErrors.message}
          </p>
        ) : null}
      </div>

      {/* Honeypot: hidden from humans, tempting for bots. ---------------- */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="contact-website">Website</label>
        <input
          type="text"
          name="website"
          id="contact-website"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          <Send aria-hidden className="h-4 w-4" />
          {pending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
