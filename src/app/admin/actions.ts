"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth/password";
import {
  countUsers,
  createSession,
  destroySession,
  requireUser,
} from "@/lib/auth/session";
import {
  createRow,
  deleteRow,
  findRow,
  moveRow,
  readProfile,
  saveProfile,
  setAvatar,
  setPublished,
  updateRow,
} from "@/lib/crud";
import { CONTENT_TAG } from "@/lib/content";
import { get, now, run } from "@/lib/db";
import { type FormState } from "@/lib/form-state";
import { getResource, isResourceKey, readValues, type ResourceDef, type ResourceKey } from "@/lib/resources";
import { clearAttempts, delay, registerAttempt } from "@/lib/security";
import { deleteStored, saveUpload } from "@/lib/storage";

/**
 * Every mutation in the app lives here.
 *
 * Each action re-establishes the caller with `requireUser()` before touching
 * data — the client is never trusted, and the proxy is never relied on for
 * authorisation (see README → Security model).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Only same-site absolute-path redirects are allowed. */
function safeNext(value: string): string {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return value;
  }
  return "/admin";
}

function resourceFromForm(formData: FormData): ResourceKey | null {
  const key = text(formData, "__resource");
  return isResourceKey(key) ? key : null;
}

/** Constant work on unknown accounts so login timing reveals nothing. */
let equalizerHash: string | null = null;
function timingEqualizer(): string {
  if (!equalizerHash) equalizerHash = hashPassword(randomUUID());
  return equalizerHash;
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(text(formData, "next"));
  const throttleKey = `login:${email || "anonymous"}`;

  if (!registerAttempt(throttleKey, 5, 15 * 60_000)) {
    await delay(600);
    return { error: "Too many attempts. Wait 15 minutes and try again." };
  }

  if (!EMAIL_RE.test(email) || password.length === 0) {
    await delay(300);
    return { error: "Enter your email and password." };
  }

  const user = get<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = ?",
    [email],
  );

  const valid = verifyPassword(password, user?.password_hash ?? timingEqualizer());
  if (!user || !valid) {
    await delay(300);
    return { error: "Incorrect email or password." };
  }

  clearAttempts(throttleKey);
  await createSession(user.id);
  redirect(next);
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/**
 * First-run account creation. Refuses once a single account exists, so this
 * endpoint cannot be used to mint an extra admin later.
 */
export async function setupAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  if ((await countUsers()) > 0) {
    return { error: "An account already exists — sign in instead." };
  }

  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Tell us your name.";
  if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  const strength = validatePasswordStrength(password);
  if (strength) errors.password = strength;
  if (password !== confirm) errors.confirm_password = "Passwords do not match.";
  if (Object.keys(errors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors: errors };
  }

  run(
    `INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', ?, ?)`,
    [randomUUID(), email, name, hashPassword(password), now(), now()],
  );

  const user = get<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  if (!user) return { error: "Could not create the account. Please retry." };

  await createSession(user.id);
  redirect("/admin");
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  const row = get<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = ?",
    [user.id],
  );
  if (!row || !verifyPassword(current, row.password_hash)) {
    return { error: "Current password is incorrect." };
  }

  const strength = validatePasswordStrength(next);
  if (strength) return { error: strength };
  if (next !== confirm) return { error: "New passwords do not match." };

  run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [
    hashPassword(next),
    now(),
    user.id,
  ]);

  // Changing the password invalidates every session, then re-establishes this one.
  run("DELETE FROM sessions WHERE user_id = ?", [user.id]);
  await createSession(user.id);

  return { ok: true, error: undefined };
}

/* ------------------------------------------------------------------ */
/* Content CRUD                                                        */
/* ------------------------------------------------------------------ */

function loadResource(formData: FormData): { key: ResourceKey; def: ResourceDef } | FormState {
  const key = resourceFromForm(formData);
  const def = key ? getResource(key) : undefined;
  if (!key || !def) return { error: "Unknown content type." };
  return { key, def };
}

export async function createResource(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();

  const loaded = loadResource(formData);
  if ("error" in loaded) return loaded;
  const { key, def } = loaded;

  const values = readValues(def, formData);
  const extra: Record<string, string | number> = {};

  if (def.upload) {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      if (def.upload.requiredOnCreate) {
        return { error: `Choose a ${def.upload.label.toLowerCase()} to upload.` };
      }
    } else {
      try {
        const stored = await saveUpload(file);
        extra.stored_name = stored.storedName;
        extra.original_name = stored.originalName;
        extra.mime = stored.mime;
        extra.size = stored.size;
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Upload failed." };
      }
    }
  }

  const result = createRow(key, values, extra);
  if (!result.ok) {
    return { error: "Please fix the highlighted fields.", fieldErrors: result.errors };
  }

  updateTag(CONTENT_TAG);
  redirect(`/admin/${key}?saved=1`);
}

export async function updateResource(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();

  const loaded = loadResource(formData);
  if ("error" in loaded) return loaded;
  const { key, def } = loaded;

  const id = text(formData, "__id");
  const existing = findRow(key, id);
  if (!existing) return { error: "That entry no longer exists." };

  const values = readValues(def, formData);
  const published = def.fields.some((f) => f.name === "published")
    ? values.published === "1"
    : undefined;

  const extra: Record<string, string | number> = {};
  let previousStored: string | null = null;

  if (def.upload) {
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      try {
        const stored = await saveUpload(file);
        extra.stored_name = stored.storedName;
        extra.original_name = stored.originalName;
        extra.mime = stored.mime;
        extra.size = stored.size;
        previousStored = String(existing.stored_name ?? "");
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Upload failed." };
      }
    }
  }

  const result = updateRow(key, id, values, extra, published);
  if (!result.ok) {
    return { error: "Please fix the highlighted fields.", fieldErrors: result.errors };
  }

  if (previousStored) deleteStored(previousStored);
  updateTag(CONTENT_TAG);
  redirect(`/admin/${key}?saved=1`);
}

export async function deleteResource(formData: FormData): Promise<void> {
  await requireUser();

  const loaded = loadResource(formData);
  if ("error" in loaded) return;
  const { key } = loaded;

  const id = text(formData, "__id");
  deleteRow(key, id);
  updateTag(CONTENT_TAG);
  redirect(`/admin/${key}?deleted=1`);
}

export async function togglePublish(formData: FormData): Promise<void> {
  await requireUser();

  const loaded = loadResource(formData);
  if ("error" in loaded) return;
  const { key } = loaded;

  const id = text(formData, "__id");
  const row = findRow(key, id);
  if (!row) return;

  setPublished(key, id, row.published !== 1);
  updateTag(CONTENT_TAG);
}

export async function moveItem(formData: FormData): Promise<void> {
  await requireUser();

  const loaded = loadResource(formData);
  if ("error" in loaded) return;
  const { key } = loaded;

  const id = text(formData, "__id");
  const direction = text(formData, "__dir") === "up" ? "up" : "down";
  moveRow(key, id, direction);
  updateTag(CONTENT_TAG);
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

const PROFILE_FIELDS = [
  "full_name",
  "headline",
  "location",
  "summary",
  "email",
  "phone",
  "website",
  "linkedin",
  "github",
  "x_url",
  "footer_note",
] as const;

const PROFILE_URL_FIELDS = ["website", "linkedin", "github", "x_url"] as const;

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();

  const values: Record<string, string> = {};
  for (const field of PROFILE_FIELDS) values[field] = text(formData, field);

  const errors: Record<string, string> = {};
  if (values.email && !EMAIL_RE.test(values.email)) {
    errors.email = "Enter a valid email address.";
  }
  for (const field of PROFILE_URL_FIELDS) {
    const value = values[field];
    if (!value) continue;
    let ok = value.startsWith("/") && !value.startsWith("//");
    if (!ok) {
      try {
        const url = new URL(value);
        ok = url.protocol === "http:" || url.protocol === "https:";
      } catch {
        ok = false;
      }
    }
    if (!ok) errors[field] = "Use a full http(s) URL, or a path starting with “/”.";
  }
  if (Object.keys(errors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors: errors };
  }

  const avatar = formData.get("avatar");
  if (avatar instanceof File && avatar.size > 0) {
    try {
      const stored = await saveUpload(avatar);
      const previousAvatar = readProfile().avatar_id;
      if (previousAvatar) deleteRow("documents", previousAvatar);

      const created = createRow(
        "documents",
        {
          title: values.full_name ? `${values.full_name} — profile photo` : "Profile photo",
          category: "Avatar",
          description: "",
          sort_order: "0",
          published: "1",
        },
        {
          stored_name: stored.storedName,
          original_name: stored.originalName,
          mime: stored.mime,
          size: stored.size,
        },
      );

      if (!created.ok) {
        deleteStored(stored.storedName);
        return { error: "Could not store the profile photo." };
      }
      setAvatar(created.id);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Upload failed." };
    }
  }

  if (formData.get("remove_avatar")) {
    const current = readProfile().avatar_id;
    if (current) deleteRow("documents", current);
    setAvatar(null);
  }

  saveProfile(values);
  updateTag(CONTENT_TAG);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Sample content                                                      */
/* ------------------------------------------------------------------ */

type SampleRow = Record<string, string | number>;

const SAMPLES: Partial<Record<ResourceKey, SampleRow[]>> = {
  experience: [
    {
      title: "Senior Software Engineer",
      company: "Example Corp.",
      location: "Remote",
      start_date: "2022-01",
      end_date: "",
      is_current: 1,
      description:
        "- Led the migration of a monolith to modular services\n- Mentored four engineers",
      sort_order: 1,
      published: 1,
    },
    {
      title: "Software Engineer",
      company: "Sample Industries",
      location: "Berlin, Germany",
      start_date: "2019-03",
      end_date: "2021-12",
      is_current: 0,
      description: "- Built the customer reporting pipeline",
      sort_order: 2,
      published: 1,
    },
  ],
  education: [
    {
      institution: "Example University",
      degree: "M.Sc.",
      field_of_study: "Computer Science",
      location: "",
      start_date: "2017",
      end_date: "2019",
      description: "Sample entry — replace with your own.",
      sort_order: 1,
      published: 1,
    },
  ],
  skills: [
    { name: "TypeScript", category: "Languages", level: 5, description: "", sort_order: 1, published: 1 },
    { name: "Next.js", category: "Frameworks", level: 4, description: "", sort_order: 2, published: 1 },
    { name: "PostgreSQL", category: "Data", level: 4, description: "", sort_order: 3, published: 1 },
    { name: "Docker", category: "Tooling", level: 3, description: "", sort_order: 4, published: 1 },
  ],
  projects: [
    {
      slug: "sample-project",
      title: "Sample Project",
      summary: "A short summary that appears on the project card.",
      description: "Replace this with the full description of your project.",
      tech: "Next.js, TypeScript",
      repo_url: "",
      demo_url: "",
      sort_order: 1,
      published: 1,
    },
  ],
  achievements: [
    {
      title: "Sample Achievement",
      category: "Achievement",
      issuer: "Example Organisation",
      date: "2024-05",
      description: "Replace this with a real achievement or publication.",
      url: "",
      sort_order: 1,
      published: 1,
    },
  ],
  certifications: [
    {
      name: "Sample Certification",
      issuer: "Example Institute",
      issue_date: "2024-01",
      expiry_date: "",
      credential_id: "",
      credential_url: "",
      verify_url: "",
      description: "",
      sort_order: 1,
      published: 1,
    },
  ],
};

/** Populates only the tables that are still empty. Safe to run repeatedly. */
export async function loadSampleContent(formData: FormData): Promise<void> {
  await requireUser();
  if (text(formData, "__confirm") !== "yes") return;

  const touched: ResourceKey[] = [];
  for (const [key, rows] of Object.entries(SAMPLES) as [ResourceKey, SampleRow[]][]) {
    const table = getResource(key)?.table;
    if (!table) continue;
    const existing = get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
    if (Number(existing?.n ?? 0) > 0) continue;

    for (const row of rows) {
      const values: Record<string, string> = {};
      for (const [column, value] of Object.entries(row)) values[column] = String(value);
      const result = createRow(key, values, {});
      if (!result.ok) break;
    }
    touched.push(key);
  }

  if (touched.length > 0) updateTag(CONTENT_TAG);
  redirect(`/admin?sample=${touched.length > 0 ? "added" : "skipped"}`);
}
