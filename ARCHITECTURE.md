# Architecture — Portfolio & Digital CV

A personal portfolio site with a private admin dashboard. Visitors browse
published achievements, certifications, education, skills, experience,
projects and documents without an account; the owner manages everything
through the dashboard without touching code.

## Stack

- **Next.js 16.4** (App Router, React 19, TypeScript) — the scaffold in this
  repo, kept as-is.
- **SQLite** via Node's built-in `node:sqlite` — zero database dependencies.
- **Tailwind CSS v4** — styling.
- Auth, uploads, validation and routing are hand-rolled (see below).

## How it fits together

```
src/
  proxy.ts                    Edge guard: redirects on cookie *presence* only
  app/
    layout.tsx                Root layout (fonts, toast port)
    (site)/                   PUBLIC site — fully prerendered, cached
      page.tsx                Home
      achievements|certifications|education|skills|experience/
        page.tsx              List pages ('use cache', tag: content)
      projects/
        page.tsx              List + [slug] detail (PPR: static list, dynamic detail)
      documents/
        page.tsx              Public document index (published only)
        [id]/route.ts         Downloads: published OR admin session
    admin/
      layout.tsx              Blocking auth gate + sidebar (instant = false)
      page.tsx                Dashboard (stats, quick links)
      [resource]/             Generic CRUD: list, new, edit
      settings/               Profile editor + change password
      actions.ts              ALL mutations (every action starts with requireUser)
    login/page.tsx            Sign in
    setup/page.tsx            First-run admin creation (404 once an admin exists)
    api/                      (none — server actions + one route handler)
  lib/
    db.ts                     node:sqlite wrapper, SCHEMA, migrations
    resources.ts              THE registry — resources, fields, validation
    crud.ts                   Generic SQL builder (identifier whitelist)
    content.ts                Cached public reads vs uncached admin reads
    auth/password.ts          scrypt hash/verify (NIST SP 800-63R3)
    auth/session.ts           Opaque tokens, cookie, requireUser()
    security.ts               Login rate limiting
    storage.ts                File uploads -> private/uploads/
    seo.ts, format.ts         Helpers
  components/
    site/                     Header, footer, nav, ui primitives, lists
    admin/                    ResourceForm (generic), ConfirmSubmit, ...
```

## Data model

One SQLite file (default `data/portfolio.db`). Tables:

| Table | Purpose |
|---|---|
| `users` | Admin accounts (`username` UNIQUE, `password_hash`) |
| `sessions` | Opaque session tokens (`token_hash`, `expires_at`) |
| `profile` | Single-row site identity (name, title, bio, contact, links) |
| `achievements`, `certifications`, `education`, `skills`, `experience`, `projects`, `documents` | Content |

Every content table has: `title`, `slug` (UNIQUE where listed), `published`
(0/1), `sort_order`, `created_at`, `updated_at`, plus resource-specific
columns. `documents` adds `file_path`, `file_name`, `file_size`,
`mime_type`, `description`, `external_url`.

Schema changes run as idempotent `ALTER TABLE` migrations on startup.

## Resource registry (the key idea)

`src/lib/resources.ts` declares every admin-managed resource once:

```ts
{ key: "achievements", label: "Achievement", ...,
  fields: [{ name, label, type: "text" | "textarea" | "number" | "date"
             | "checkbox" | "select" | "url" | "file", required, ... }] }
```

That single declaration drives:

1. **Validation** — `validateResource()` (server) enforces types, required
   fields, option sets, unique slugs, and enforces `published: false` for
   documents with no file.
2. **The generic data layer** — `crud.ts` builds `INSERT`/`UPDATE` from the
   declared column names. Identifiers come only from the registry (never
   user input); values are always bound parameters.
3. **The generic form** — `ResourceForm.tsx` renders inputs from the field
   definitions and submits to `createResource`/`updateResource`.
4. **The admin routes** — `admin/[resource]/page.tsx`, `/new`, `/[id]` are
   one set of files serving every resource.

Adding a field = edit `resources.ts`. Adding a resource = add the registry
entry + a `SELECT` in `content.ts`.

## Caching (Next.js cacheComponents)

- Public pages: `export const content = "static"`, `'use cache'`,
  `cacheTag("content")`, `cacheLife("minutes")`.
- Mutations call `updateTag("content")`, so publishing/deleting re-renders
  every cached public page on the next request.
- Admin pages and `/documents/[id]` are dynamic (no cache).
- Projects list is a static shell with a dynamic `loading.tsx` (PPR).

## Authentication

- **Password**: `scrypt` (N=2¹⁵, r=8, p=1, 32-byte salt) with
  `timingSafeEqual` comparison.
- **Session**: 32 random bytes → stored **hashed** (SHA-256) in `sessions`;
  the raw token lives in an httpOnly, SameSite=Lax cookie. 30-day expiry,
  renewed on activity, deleted on logout.
- **Cookie signing**: `SESSION_SECRET` signs the cookie value with AES-GCM
  so a stolen DB row can't be replayed as a cookie. In dev a random secret
  is generated per boot (sessions don't survive restarts); in production the
  secret **must** be set or boot fails.
- **Access control, three layers**:
  1. `proxy.ts` (edge) — redirects unauthenticated `/admin` → `/login` based
     on cookie presence. UX only; it never trusts the result.
  2. `admin/layout.tsx` — `requireUser()` runs before any admin page body;
     `instant = false` forces a real HTTP redirect instead of a soft one.
  3. **Every server action and the document route** call `requireUser()`
     again. Nothing mutates or reads private files without a live session.
- **Login brute force**: in-memory per-username/IP limiter
  (5 attempts → 15-minute lockout).
- **Rate-limited setup**: `/setup` 404s permanently once any user exists.

## Documents & storage

- Public visitors see only **published** documents (metadata + download
  link) and can download published files.
- Unpublished documents and **all files** require an admin session —
  `GET /documents/[id]` is the only code path that reads `private/uploads/`.
- `private/` and `data/` are `.gitignore`d; secrets never enter the repo.
- Uploads are capped at 15 MB (`experimental.serverActions.bodySizeLimit`)
  and stored under generated IDs — original filenames never touch disk
  paths.

## Publishing model

- Everything except **documents** defaults to published (visible immediately).
- Documents default to **draft** — review before sharing.
- Draft content is invisible to the public site and excluded from the
  document download route.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | production | 32-byte hex; signs session cookies |
| `PORT` | no | Server port (default 3000) |
| `DATABASE_PATH` | no | SQLite file (default `./data/portfolio.db`) |
| `UPLOAD_DIR` | no | Upload root (default `./private/uploads`) |

## Deployment

Standard Next.js: `npm run build && npm start`. Full instructions,
Docker and systemd examples are in `README.md`.
