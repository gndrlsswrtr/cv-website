import type { Metadata } from "next";
import { Check, Mail, Trash2 } from "lucide-react";

import { deleteMessageAction, markMessageReadAction } from "./inbox-actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { EmptyState } from "@/components/site/ui";
import { requireUser } from "@/lib/auth/session";
import { countUnreadMessages, listContactMessages } from "@/lib/contact";

export const instant = false;

export const metadata: Metadata = {
  title: "Inbox",
  robots: { index: false, follow: false },
};

/** `listContactMessages()` caps the query here; the note below explains it. */
const MAX_SHOWN = 100;

/**
 * `created_at`/`read_at` come back from Postgres as timestamptz — a JS Date
 * at runtime, an ISO string by type. `new Date()` copes with both.
 */
function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function InboxPage() {
  await requireUser();

  const [messages, unread] = await Promise.all([
    listContactMessages(MAX_SHOWN),
    countUnreadMessages(),
  ]);

  return (
    <div className="grid gap-6">
      <header>
        <p className="eyebrow mb-2">Admin</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Inbox</h1>
        <p className="mt-2 text-sm text-muted">
          Messages sent through the contact form, newest first.
          {unread > 0 ? ` ${unread} unread.` : ""}
        </p>
      </header>

      {messages.length === 0 ? (
        <EmptyState
          title="No messages yet."
          hint="Messages sent through the contact form will land here."
        />
      ) : (
        <ul className="card divide-y divide-border">
          {messages.map((message) => {
            const isUnread = message.read_at === null;
            const name = message.name || "Anonymous";

            return (
              <li key={message.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-medium">
                        {message.subject || "(no subject)"}
                      </h2>
                      <span className={isUnread ? "badge badge-draft" : "badge"}>
                        {isUnread ? "Unread" : "Read"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      {name} ·{" "}
                      <a
                        href={`mailto:${message.email}`}
                        className="underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-accent"
                      >
                        {message.email}
                      </a>
                      {" · "}
                      {(() => {
                        const date = parseDate(message.created_at);
                        return date ? (
                          <time dateTime={date.toISOString()}>
                            {date.toLocaleString("en-GB", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </time>
                        ) : (
                          <span>{String(message.created_at)}</span>
                        );
                      })()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isUnread ? (
                      <form action={markMessageReadAction}>
                        <input type="hidden" name="id" value={message.id} />
                        <button type="submit" className="btn btn-secondary">
                          <Check className="h-4 w-4" aria-hidden="true" />
                          Mark read
                        </button>
                      </form>
                    ) : null}

                    <form action={deleteMessageAction}>
                      <input type="hidden" name="id" value={message.id} />
                      <ConfirmSubmit
                        message={`Delete the message from ${name}? This cannot be undone.`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>

                <p className="prose-plain mt-3 text-sm leading-relaxed text-muted">
                  {message.message}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {messages.length >= MAX_SHOWN ? (
        <p className="text-xs text-muted">
          Showing the {MAX_SHOWN} most recent messages. Older ones stay in the database until you
          delete them.
        </p>
      ) : null}
    </div>
  );
}
