/**
 * The content model, as a single client-safe source of truth.
 *
 * The admin forms, the generic CRUD layer and the public pages all read this
 * registry, so adding a content type means adding one entry here plus one
 * public page — no hand-written forms, no hand-written SQL.
 *
 * This module must stay free of server-only imports: it is imported by client
 * components that render the forms.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "url"
  | "email"
  | "date"
  | "number"
  | "select"
  | "checkbox";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  /** Column name in the backing table. */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: FieldOption[];
  rows?: number;
  min?: number;
  max?: number;
  /** `half` fields sit two-up in the form grid. */
  span?: "full" | "half";
}

export interface UploadDef {
  label: string;
  /** Allowed extensions, lowercase, no dot. */
  extensions: string[];
  requiredOnCreate: boolean;
  help?: string;
}

export interface ResourceDef {
  key: string;
  label: string;
  singular: string;
  table: string;
  /** Column shown as the row title in admin lists. */
  titleField: string;
  fields: FieldDef[];
  searchFields: string[];
  description: string;
  /** Route on the public site, if the type is publicly listed. */
  publicPath?: string;
  defaultPublished: boolean;
  /** Derive `slug` from `title` when the slug field is left blank. */
  hasSlug?: boolean;
  upload?: UploadDef;
}

export const CONTENT_ORDER = [
  "experience",
  "volunteer",
  "education",
  "skills",
  "projects",
  "achievements",
  "certifications",
  "documents",
] as const;

export type ResourceKey = (typeof CONTENT_ORDER)[number];

const dateField = (name: string, label: string, span: "half" = "half"): FieldDef => ({
  name,
  label,
  type: "date",
  span,
});

const sortField: FieldDef = {
  name: "sort_order",
  label: "Sort order",
  type: "number",
  min: 0,
  max: 9999,
  span: "half",
  help: "Lower numbers appear first.",
};

const publishField: FieldDef = {
  name: "published",
  label: "Published (visible to visitors)",
  type: "checkbox",
};

const LEVEL_OPTIONS: FieldOption[] = [
  { value: "1", label: "1 — Awareness" },
  { value: "2", label: "2 — Working knowledge" },
  { value: "3", label: "3 — Proficient" },
  { value: "4", label: "4 — Advanced" },
  { value: "5", label: "5 — Expert" },
];

export const RESOURCES: Record<ResourceKey, ResourceDef> = {
  experience: {
    key: "experience",
    label: "Experience",
    singular: "experience entry",
    table: "experience",
    titleField: "title",
    description: "Roles you have held — what you did and where.",
    publicPath: "/experience",
    defaultPublished: true,
    searchFields: ["title", "company", "location", "description"],
    fields: [
      { name: "title", label: "Job title", type: "text", required: true, span: "half",
        placeholder: "Senior Software Engineer" },
      { name: "company", label: "Company / organisation", type: "text", required: true, span: "half",
        placeholder: "Acme Corp." },
      { name: "location", label: "Location", type: "text", span: "half", placeholder: "Berlin, Germany" },
      dateField("start_date", "Start date"),
      dateField("end_date", "End date"),
      { name: "is_current", label: "I currently work here", type: "checkbox" },
      { name: "description", label: "What you did", type: "textarea", rows: 6, span: "full",
        placeholder: "One bullet point per line." },
      sortField,
      publishField,
    ],
  },

  volunteer: {
    key: "volunteer",
    label: "Volunteering",
    singular: "volunteer role",
    table: "volunteer_experience",
    titleField: "title",
    description: "Volunteering, community work and leadership roles.",
    publicPath: "/volunteer",
    defaultPublished: true,
    searchFields: ["title", "organisation", "cause", "location", "description"],
    fields: [
      { name: "title", label: "Role", type: "text", required: true, span: "half",
        placeholder: "Mentor" },
      { name: "organisation", label: "Organisation", type: "text", required: true, span: "half",
        placeholder: "Code Club" },
      { name: "cause", label: "Cause / focus", type: "text", span: "half",
        placeholder: "Digital literacy" },
      { name: "location", label: "Location", type: "text", span: "half", placeholder: "Berlin, Germany" },
      { name: "url", label: "Organisation URL", type: "url", span: "half",
        placeholder: "https://example.org" },
      dateField("start_date", "Start date"),
      dateField("end_date", "End date"),
      { name: "is_current", label: "I still do this", type: "checkbox" },
      { name: "description", label: "What you did", type: "textarea", rows: 5, span: "full",
        placeholder: "One bullet point per line." },
      sortField,
      publishField,
    ],
  },

  education: {
    key: "education",
    label: "Education",
    singular: "education entry",
    table: "education",
    titleField: "institution",
    description: "Degrees, courses and academic background.",
    publicPath: "/education",
    defaultPublished: true,
    searchFields: ["institution", "degree", "field_of_study", "description"],
    fields: [
      { name: "institution", label: "Institution", type: "text", required: true, span: "half",
        placeholder: "Technical University of Munich" },
      { name: "degree", label: "Degree / qualification", type: "text", span: "half",
        placeholder: "M.Sc." },
      { name: "field_of_study", label: "Field of study", type: "text", span: "half",
        placeholder: "Computer Science" },
      { name: "location", label: "Location", type: "text", span: "half" },
      dateField("start_date", "Start date"),
      dateField("end_date", "End date"),
      { name: "description", label: "Details", type: "textarea", rows: 4, span: "full",
        placeholder: "Thesis, honours, relevant coursework…" },
      sortField,
      publishField,
    ],
  },

  skills: {
    key: "skills",
    label: "Skills",
    singular: "skill",
    table: "skills",
    titleField: "name",
    description: "Capabilities, tools and technologies.",
    publicPath: "/skills",
    defaultPublished: true,
    searchFields: ["name", "category", "description"],
    fields: [
      { name: "name", label: "Skill", type: "text", required: true, span: "half",
        placeholder: "TypeScript" },
      { name: "category", label: "Category", type: "text", span: "half",
        placeholder: "Languages · Tooling · Cloud" },
      { name: "level", label: "Proficiency", type: "select", span: "half", options: LEVEL_OPTIONS },
      { name: "description", label: "Note", type: "text", span: "half",
        placeholder: "Optional context" },
      sortField,
      publishField,
    ],
  },

  projects: {
    key: "projects",
    label: "Projects",
    singular: "project",
    table: "projects",
    titleField: "title",
    description: "Selected work, with links to code and live demos.",
    publicPath: "/projects",
    defaultPublished: true,
    hasSlug: true,
    searchFields: ["title", "summary", "tech", "description"],
    fields: [
      { name: "title", label: "Project title", type: "text", required: true, span: "half",
        placeholder: "Distributed Tracing UI" },
      { name: "slug", label: "URL slug", type: "text", span: "half",
        placeholder: "distributed-tracing-ui",
        help: "Leave blank to generate one from the title." },
      { name: "summary", label: "Short summary", type: "textarea", rows: 2, span: "full",
        required: true, placeholder: "One or two sentences shown on the project card." },
      { name: "description", label: "Full description", type: "textarea", rows: 8, span: "full" },
      { name: "tech", label: "Technologies", type: "text", span: "full",
        placeholder: "Next.js, PostgreSQL, Docker" },
      { name: "repo_url", label: "Source code URL", type: "url", span: "half",
        placeholder: "https://github.com/you/repo" },
      { name: "demo_url", label: "Live demo URL", type: "url", span: "half",
        placeholder: "https://demo.example.com" },
      sortField,
      publishField,
    ],
    // Optional: a screenshot or cover image. Not required — plenty of work is
    // better described than pictured, and no project should be blocked on art.
    upload: {
      label: "Cover image",
      extensions: ["png", "jpg", "jpeg", "webp", "gif"],
      requiredOnCreate: false,
      help: "Screenshot or cover image (PNG, JPG, WebP or GIF). Shown on the project card and project page.",
    },
  },

  achievements: {
    key: "achievements",
    label: "Achievements",
    singular: "achievement",
    table: "achievements",
    titleField: "title",
    description: "Awards, publications, talks and other highlights.",
    publicPath: "/achievements",
    defaultPublished: true,
    searchFields: ["title", "issuer", "description", "category"],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, span: "full",
        placeholder: "Best Paper Award" },
      { name: "category", label: "Type", type: "select", span: "half", options: [
        { value: "Achievement", label: "Achievement" },
        { value: "Award", label: "Award" },
        { value: "Publication", label: "Publication" },
        { value: "Talk", label: "Talk" },
        { value: "Media", label: "Media" },
      ] },
      { name: "issuer", label: "Issuer / publisher", type: "text", span: "half",
        placeholder: "ACM SIGMOD" },
      dateField("date", "Date"),
      { name: "url", label: "Reference URL", type: "url", span: "half",
        placeholder: "https://doi.org/…" },
      { name: "description", label: "Description", type: "textarea", rows: 4, span: "full" },
      sortField,
      publishField,
    ],
    // Optional: a photo of an award, a poster for a talk, or the paper itself.
    upload: {
      label: "Image or document",
      extensions: ["pdf", "png", "jpg", "jpeg", "webp", "gif"],
      requiredOnCreate: false,
      help: "Shown on the public achievement. Keep it modest in size — it is served to every visitor.",
    },
  },

  certifications: {
    key: "certifications",
    label: "Certifications",
    singular: "certification",
    table: "certifications",
    titleField: "name",
    description: "Certificates you hold, with credential links.",
    publicPath: "/certifications",
    defaultPublished: true,
    searchFields: ["name", "issuer", "credential_id", "description"],
    fields: [
      { name: "name", label: "Certification", type: "text", required: true, span: "half",
        placeholder: "AWS Certified Solutions Architect" },
      { name: "issuer", label: "Issuing organisation", type: "text", span: "half",
        placeholder: "Amazon Web Services" },
      dateField("issue_date", "Issue date"),
      dateField("expiry_date", "Expiry date"),
      { name: "credential_id", label: "Credential ID", type: "text", span: "half" },
      { name: "credential_url", label: "Credential URL", type: "url", span: "half" },
      { name: "verify_url", label: "Verification URL", type: "url", span: "half" },
      { name: "description", label: "Notes", type: "textarea", rows: 3, span: "full" },
      sortField,
      publishField,
    ],
    // Optional: a scan or photo of the certificate itself. Never required —
    // plenty of credentials are legitimately verifiable without a file.
    upload: {
      label: "Certificate file",
      extensions: ["pdf", "png", "jpg", "jpeg", "webp", "gif"],
      requiredOnCreate: false,
      help: "A scan or photo of the certificate (PDF, PNG, JPG, WebP or GIF). Shown on the public certification page.",
    },
  },

  documents: {
    key: "documents",
    label: "Documents",
    singular: "document",
    table: "documents",
    titleField: "title",
    description: "Files visitors can read or download — CV, certificates, papers.",
    publicPath: "/documents",
    // Files often contain personal data: make publishing an explicit act.
    defaultPublished: false,
    searchFields: ["title", "category", "original_name", "description"],
    upload: {
      label: "File",
      extensions: ["pdf", "txt", "csv", "doc", "docx", "odt", "rtf", "xls", "xlsx",
        "ppt", "pptx", "png", "jpg", "jpeg", "webp", "gif", "zip"],
      requiredOnCreate: true,
      help: "PDF, Office, image, text or zip. SVG is rejected because it can carry scripts.",
    },
    fields: [
      { name: "title", label: "Title", type: "text", required: true, span: "half",
        placeholder: "Curriculum Vitae" },
      { name: "category", label: "Category", type: "select", span: "half", options: [
        { value: "CV", label: "CV / Resume" },
        { value: "Certificate", label: "Certificate" },
        { value: "Report", label: "Report" },
        { value: "Paper", label: "Paper" },
        { value: "Presentation", label: "Presentation" },
        { value: "Portfolio", label: "Portfolio" },
        { value: "Other", label: "Other" },
      ] },
      { name: "description", label: "Description", type: "textarea", rows: 3, span: "full" },
      sortField,
      publishField,
    ],
  },
};

export const RESOURCE_KEYS = CONTENT_ORDER;

export function isResourceKey(value: string): value is ResourceKey {
  return (CONTENT_ORDER as readonly string[]).includes(value);
}

export function getResource(key: string): ResourceDef | undefined {
  return isResourceKey(key) ? RESOURCES[key] : undefined;
}

/** Columns the generic layer is allowed to write, in a fixed order. */
export function writableColumns(def: ResourceDef): string[] {
  const columns = def.fields.map((f) => f.name);
  if (def.hasSlug && !columns.includes("slug")) columns.push("slug");
  return columns;
}

export const CHECKBOX_FIELDS = new Set(
  RESOURCE_KEYS.flatMap((key) =>
    RESOURCES[key].fields.filter((f) => f.type === "checkbox").map((f) => f.name),
  ),
);

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isSafeExternalUrl(value: string): boolean {
  if (!value) return true;
  if (value.startsWith("#")) return true;
  // Internal paths are fine, but `//host/path` is protocol-relative and
  // resolves to a different origin — reject it rather than validate it.
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates raw form values for a resource.
 * Returns `{ field: message }`; an empty object means valid.
 */
export function validateValues(
  def: ResourceDef,
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of def.fields) {
    const raw = (values[field.name] ?? "").trim();

    if (field.required && !raw) {
      errors[field.name] = `${field.label} is required.`;
      continue;
    }
    if (!raw) continue;

    switch (field.type) {
      case "email":
        if (!EMAIL.test(raw)) errors[field.name] = "Enter a valid email address.";
        break;
      case "url":
        if (!isSafeExternalUrl(raw)) {
          errors[field.name] = "Use a full http(s) URL, or a path starting with “/”.";
        }
        break;
      case "date":
        if (!ISO_DATE.test(raw)) errors[field.name] = "Use the YYYY-MM-DD format.";
        break;
      case "number": {
        const n = Number(raw);
        if (!Number.isInteger(n)) {
          errors[field.name] = "Enter a whole number.";
        } else if (field.min !== undefined && n < field.min) {
          errors[field.name] = `Must be ${field.min} or more.`;
        } else if (field.max !== undefined && n > field.max) {
          errors[field.name] = `Must be ${field.max} or less.`;
        }
        break;
      }
      case "text":
      case "textarea":
        if (raw.length > 20000) {
          errors[field.name] = "This field is too long (20 000 characters max).";
        }
        break;
      default:
        break;
    }
  }

  return errors;
}

/** Reads a `FormData` into a flat string map for validation. */
export function readValues(def: ResourceDef, formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of def.fields) {
    if (field.type === "checkbox") {
      values[field.name] = formData.get(field.name) ? "1" : "0";
    } else {
      const v = formData.get(field.name);
      values[field.name] = typeof v === "string" ? v.trim() : "";
    }
  }
  if (def.hasSlug) {
    const v = formData.get("slug");
    values.slug = typeof v === "string" ? v.trim() : "";
  }
  return values;
}
