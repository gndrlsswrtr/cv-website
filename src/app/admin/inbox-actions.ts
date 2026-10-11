"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { CONTENT_TAG } from "@/lib/content";
import { deleteMessage, markMessageRead } from "@/lib/contact";

/**
 * Inbox actions. They always redirect back to the list, so a stale or forged
 * `id` simply lands on an unchanged inbox rather than leaking anything.
 */

function messageId(formData: FormData): string | null {
  const value = formData.get("id");
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function markMessageReadAction(formData: FormData): Promise<void> {
  await requireUser();

  const id = messageId(formData);
  if (id) {
    await markMessageRead(id);
    updateTag(CONTENT_TAG);
  }
  redirect("/admin/inbox");
}

export async function deleteMessageAction(formData: FormData): Promise<void> {
  await requireUser();

  const id = messageId(formData);
  if (id) {
    await deleteMessage(id);
    updateTag(CONTENT_TAG);
  }
  redirect("/admin/inbox");
}
