# Architecture — Portfolio & Digital CV

A personal portfolio site with a **public read-only website** and a
**private owner-only dashboard**, single user, PostgreSQL-backed. Visitors
browse published content without an account; the owner manages everything
from `/admin` without touching code.

- **Next.js 16** (App Router, Turbopack, Cache Components / PPR),
  **React 19**, **TypeScript**, **Tailwind CSS v4**
- **PostgreSQL 17** through [`pg`](https://www.npmjs.com/package/pg) — one
  pooled connection set, role-switched public reads, Row Level Security
- Auth, validation, uploads and routing are hand-rolled (no Zod, no ORM, no
  auth library)
- **Vitest** against a real embedded PostgreSQL

Setup, scripts and environment variables: [`README.md`](./README.md).

## Directory layout

```
.
├── db/migrations/        4 idempotent SQL files: schema → RLS → expansion → attachments
├── private/              upload root at runtime (gitignored, created on first
│                         upload, never under public/)
├── public/               static assets, served as-is — no uploads ever land here
├── scripts/              CLI: dev-db.ts, migrate.ts, create-admin.ts
│   └── lib/load-env.ts   .env.local loader so tsx scripts see DATABASE_URL
├── src/
│   ├── proxy.ts          edge guard: cookie-presence redirects for /admin,
│   │                     /login, /setup — UX only, never an authorization check
│   ├── app/
│   │   ├── layout.tsx    root layout + static metadata
│   │   ├── (site)/       PUBLIC site: home, about, each content section,
│   │   │                 projects (+[slug]), contact, documents/[id],
│   │   │                 media/[resource]/[id]
│   │   ├── admin/        dashboard: auth-gated layout, generic [resource]
│   │   │                 CRUD, inbox, settings, actions.ts (all mutations)
│   │   ├── login/        sign-in
│   │   ├── setup/        first-run admin creation (404s once a user exists)
│   │   └── robots.ts, sitemap.ts   built from SITE_URL
│   ├── components/
│   │   ├── site/         header/footer/nav, list & grid renderers, UI primitives
│   │   └── admin/        ResourceForm (generic), ProfileForm, SiteSettingsForm,
│   │                     SocialLinksForm, SetupForm, PasswordForm, …
│   └── lib/              domain logic (below)
├── tests/                Vitest suites + embedded-PostgreSQL global setup
├── .env.example          documented environment contract
├── next.config.ts        cacheComponents, partialPrefetching, 15 MB action
│                         bodies, security headers
└── vitest.config.mts     node environment, sequential files, global setup
```

Inside `src/lib/`:

| Module | Purpose |
|---|---|
| `db/pool.ts` | The one `pg` pool; `DATABASE_URL` resolution; timestamp/bigint type normalisation |
| `db/index.ts` | `all/get/run/exec`, `withPublicRole()`, `withTransaction()`, `AsyncLocalStorage` client binding |
| `db/migrate.ts` | Migration runner — filename order, one transaction, `pg_advisory_lock` |
| `resources.ts` | **The registry** — content types, fields, validation (client-safe, no server imports) |
| `crud.ts` | Generic SQL built from the registry: list/find/create/update/delete/reorder |
| `content.ts` | Trust-level split: cached public reads vs live admin reads |
| `auth/password.ts` | scrypt hashing, verification, strength rules |
| `auth/session.ts` | Opaque tokens, cookie handling, `requireUser()` / `requireUserOrNull()` |
| `storage.ts` | Upload validation, private file writes, traversal-safe path resolution |
| `contact.ts` | Contact-form validation, honeypot, throttling, private inbox |
| `settings.ts` | Site settings and social links (public + admin variants) |
| `security.ts` | In-memory rate limiter (`registerAttempt`) |
| `seo.ts`, `format.ts`, `form-state.ts`, `social-platforms.ts` | Small helpers |

## The resource registry

[`src/lib/resources.ts`](src/lib/resources.ts) declares each content type
**once**:

```ts
interface ResourceDef {
  key: string;             // "certifications" — also the /admin/<key> URL segment
  label: string;           // "Certifications" — sidebar and list heading
  singular: string;
  table: string;           // SQL table name (identifier-checked before use)
  titleField: string;      // column shown as the row title in admin lists
  fields: FieldDef[];      // field.name doubles as the column name
  searchFields: string[];  // columns the admin search box matches over
  description: string;
  publicPath?: string;     // where the section lives on the public site
  defaultPublished: boolean;
  hasSlug?: boolean;       // derive + de-duplicate a slug from the title
  upload?: UploadDef;      // optional attachment: extensions, requiredOnCreate
}
```

**Field types:** `text`, `textarea`, `url`, `email`, `date`, `number`,
`select`, `checkbox`. Per-field modifiers: `required`, `placeholder`, `help`,
`options` (for `select`), `rows` (textarea), `min`/`max` (number), `span`
(`half` | `full` for the form grid). Uploads are *not* a field type — they are
the separate `upload` declaration, so only resources that opt in render a file
input.

One declaration drives everything:

1. **Admin list** — `/admin/[resource]` renders title, subtitle, reorder
   controls and the publish toggle from the same def.
2. **Create/edit forms** — [`ResourceForm.tsx`](src/components/admin/ResourceForm.tsx)
   renders one input per field; no per-resource form components exist.
3. **Search** — `searchFields` becomes a parameterised `LIKE … OR …`, with
   `%`/`_` escaped.
4. **Validation** — `validateValues()`: required checks, email shape,
   http(s) or same-site URL (rejecting `javascript:`, `data:` and
   protocol-relative `//host`), `YYYY-MM-DD` dates, integers with the
   declared min/max, a 20 000-character cap, plus `slugify()` and
   `uniqueSlug()` when `hasSlug` is set. Hand-written on purpose — there is no
   schema library in the project.
5. **SQL column mapping** — `writableColumns()` feeds `crud.ts`. Identifiers
   come only from the registry, must match `/^[a-z_][a-z0-9_]*$/`, and are
   double-quoted (so `achievements.date` is never read as a keyword); every
   *value* is a bound `$n` parameter. Nothing user-supplied is ever
   interpolated.

Adding a content type is therefore mostly declarative: a registry entry, a
`CONTENT_ORDER` entry, a table in a new migration, and one public page that
calls `getPublished(key)`. Registry consistency is asserted in
[`tests/validation.test.ts`](tests/validation.test.ts): every `CONTENT_ORDER`
key has a coherent def, table/title/search names are identifier-safe, field
names are unique, exactly one `published` checkbox exists per resource, and
only `documents` defaults to draft.

## Data model

Four migrations, applied in order: `0001_init` (schema), `0002_rls`
(roles + policies), `0003_expansion` (volunteering, settings, links, inbox),
`0004_attachments` (file columns on certifications/achievements).

**Accounts and sessions**

| Table | Columns |
|---|---|
| `users` | `id` uuid PK · `email` text UNIQUE · `name` · `password_hash` · `role` (default `'admin'`) · `created_at` · `updated_at` |
| `sessions` | `id` text PK · `token_hash` text UNIQUE · `user_id` → `users.id` (ON DELETE CASCADE) · `expires_at` · `created_at` · `last_seen_at` |

**Identity (singleton)**

| Table | Columns |
|---|---|
| `profile` | `id` = 1 (CHECK) · `full_name` · `headline` · `location` · `summary` · `email` · `phone` · `website` · `linkedin` · `github` · `x_url` · `footer_note` · `avatar_id` → `documents.id` (ON DELETE SET NULL) · `updated_at` |

**Content** — every content table also carries `id` uuid PK (default
`gen_random_uuid()`), `sort_order` integer, `published` boolean,
`created_at`, `updated_at`:

| Table | Resource columns |
|---|---|
| `experience` | `title` · `company` · `location` · `start_date` · `end_date` · `is_current` · `description` |
| `volunteer_experience` | `title` · `organisation` · `cause` · `location` · `start_date` · `end_date` · `is_current` · `description` · `url` |
| `education` | `institution` · `degree` · `field_of_study` · `location` · `start_date` · `end_date` · `description` |
| `skills` | `name` · `category` · `level` (1–5) · `description` |
| `projects` | `slug` UNIQUE · `title` · `summary` · `description` · `tech` · `repo_url` · `demo_url` |
| `achievements` | `title` · `category` · `issuer` · `date` · `description` · `url` · **+ attachment:** `stored_name` `original_name` `mime` `size` |
| `certifications` | `name` · `issuer` · `issue_date` · `expiry_date` · `credential_id` · `credential_url` · `verify_url` · `description` · **+ attachment:** `stored_name` `original_name` `mime` `size` |
| `documents` | `title` · `category` · `description` · `stored_name` · `original_name` · `mime` · `size` — `published` defaults to **`false`** |

**Settings and inbox**

| Table | Columns |
|---|---|
| `site_settings` | `id` = 1 (CHECK) · `site_title` · `site_description` · nine `featured_*` booleans (home-page sections) · `contact_enabled` · `contact_intro` · `contact_show_phone` · `contact_show_email` · `updated_at` |
| `social_links` | `id` uuid PK · `platform` UNIQUE · `url` · `label` · `sort_order` · `published` · `created_at` · `updated_at` |
| `contact_messages` | `id` uuid PK · `name` · `email` · `subject` · `message` · `ip_hash` · `user_agent` · `read_at` · `created_at` |
| `schema_migrations` | `name` text PK · `applied_at` (created by the runner) |

**Relationships**

- `sessions.user_id → users.id` — deleting a user deletes their sessions.
- `profile.avatar_id → documents.id` (`SET NULL`) — **`documents` backs two
  things**: the public document library *and* the profile photo. An avatar is
  an ordinary document row with `category = 'Avatar'`, filtered out of the
  public document list (`getPublishedDocuments()`); deleting it clears the
  pointer and unlinks the file.
- `profile` and `site_settings` are singletons enforced by `CHECK (id = 1)`
  and seeded by their migrations — no application-level upsert needed to read.
- Content tables have no foreign keys between them and are ordered by
  `sort_order`. `updated_at` is written explicitly by the CRUD and settings
  layers on every update; a `touch_updated_at()` trigger additionally
  backstops it on `users`, `volunteer_experience`, `social_links` and
  `site_settings`.
- Indexes follow the hot paths: `(published, sort_order)` on each content
  table (achievements/certifications on `published` + date), `sessions` by
  user and expiry, `contact_messages` by `created_at DESC`, plus partial
  indexes for "rows that have an attachment".

## Content access and trust levels

[`src/lib/content.ts`](src/lib/content.ts) splits reads by who they are for:

- **Public reads** — `getPublished()`, `getPublishedProject()`,
  `getPublishedDocuments()`, `getProfile()`, `getPublicCounts()`,
  `getSiteSettings()`, `getSocialLinks()`. Every one is `'use cache'`,
  tagged and lifetime-limited, and every database call inside runs through
  `withPublicRole()`, which opens a transaction and issues
  `SET LOCAL ROLE portfolio_public`.
- **Admin reads** — `adminList()`, `adminFind()`, `adminProfile()`,
  `adminStats()` and `readSettings()`. Deliberately **uncached** (the
  dashboard must show live state) and run as the table **owner**.

The consequence is the core of the design: **visibility is enforced by the
database, not by `WHERE published = true` sprinkled through the app.** The
`publishedOnly` flag in `crud.ts` is a convenience for the query; the actual
guarantee is that a public-role session physically cannot see a draft — an
RLS policy filters it out of any query, even one that forgets the filter
entirely. Conversely the owner connection is exempt from RLS (PostgreSQL
exempts table owners, and `FORCE ROW LEVEL SECURITY` is deliberately not set),
so admin reads see everything.

The same split appears outside `content.ts`: `settings.ts` exposes
`getPublicSettings()`/`getPublishedSocialLinks()` (public role) beside
`readSettings()`/`saveSettings()` (owner), and the media route reads its row
through `withPublicRole()` — there is no admin bypass on that route.

## Authentication and sessions

- **Password hashing** — `scrypt` (`N=16384, r=8, p=1`), 16-byte random salt,
  64-byte key, stored as `scrypt$16384$8$1$salt$hash` so parameters can be
  raised later without invalidating old hashes. Verification uses
  `timingSafeEqual`. Strength rules: 10–200 characters, not on the
  common-password list.
- **Sessions** — a 32-byte random token (`base64url`) lives in the
  `cv_session` cookie; **only its SHA-256 hex digest is stored** in
  `sessions.token_hash`. Cookie flags: `HttpOnly`, `SameSite=Lax`, `path=/`,
  `Secure` in production unless `ALLOW_INSECURE=true` (never in production).
  Lifetime is **14 days with sliding expiry**: once a session is past its
  half-life, the next request extends it; expired rows are deleted on use and
  purged at every login. Logout deletes the row — a real revocation, not a
  waiting game.
- **Guards** — `requireUser()` for pages and server actions (redirects to
  `/login`), `requireUserOrNull()` for route handlers (returns `null` so the
  handler can send a flat 404 instead of leaking existence).
- **Three layers of access control**, deliberately overlapping:
  1. `src/proxy.ts` redirects `/admin` → `/login` on cookie *presence* only —
     UX, never trusted for authorization;
  2. the admin layout calls `requireUser()` before rendering anything
     (`instant = false` makes the redirect a real HTTP response);
  3. every server action calls `requireUser()` again before touching data,
     and the document route resolves the session itself with
     `requireUserOrNull()` (the media route needs no session — it serves only
     what the public role can already see).
- **First-admin paths** (there is no registration and no seeded password):
  1. **`/setup`** — browser flow, reachable only while `users` is empty;
     it returns 404 forever afterwards, so it can never mint a second admin;
  2. **`npm run db:create-admin`** — shell access (interactive prompts,
     `ADMIN_*` env vars, or `--email=`/`--name=`/`--password=` flags),
     which refuses once an account exists unless `ALLOW_EXTRA_ADMIN=true`.
- **Login throttling** — in-memory: 5 attempts per account per 15 minutes,
  a timing-equalising dummy hash for unknown accounts, and fixed delays on
  failure.

## Request flow

**Public page**

```
GET /experience
  → (site) page, `'use cache'`
  → getPublished("experience")        cacheTag("content") · cacheLife("minutes")
  → withPublicRole():  BEGIN · SET LOCAL ROLE portfolio_public
      → listRows(...)                 registry-built SQL, bound params
      → RLS policy keeps published rows only
    → COMMIT
  → rendered into the cached page shell
```

A cache hit returns without touching PostgreSQL; the first render (or the
first request after `updateTag`) repopulates it.

**Server action (any admin mutation)**

```
POST form → src/app/admin/actions.ts
  → requireUser()                  cookie → SHA-256 → sessions row → user
  → loadResource(formData)         __resource validated against the registry
  → readValues() / validateValues()   registry rules, field-keyed errors
  → saveUpload(file)?              extension · 12 MiB · contentError · uuid name
  → createRow | updateRow | deleteRow | setPublished | moveRow
                                   registry identifiers + $n params, as table owner
  → updateTag("content")           invalidates every cached public page
  → redirect(...)
```

## Caching and PPR

- **Cache Components mode**: `next.config.ts` sets `cacheComponents: true`
  and `partialPrefetching: true`, so a cached page is a prerendered shell and
  only request-time work stays dynamic.
- **Public pages and getters** use `'use cache'` +
  `cacheTag(CONTENT_TAG)` (`CONTENT_TAG = "content"`) +
  `cacheLife("minutes")`.
- **Mutations call `updateTag(CONTENT_TAG)`** — one tag covers the whole
  public site (home, every section, metadata), so publishing or deleting
  anywhere re-renders everything cached. `cacheLife("minutes")` is a safety
  net: if a tag were ever missed, content still refreshes within a minute.
- **Not `'use cache'`**: admin pages, `/login`, `/setup`, `/documents/[id]`
  and `/media/[resource]/[id]` — live state and per-request authorization
  (the file routes still send their own `Cache-Control` response headers).
- **PPR in practice**: `/projects/[slug]` resolves `params` at request time,
  so the detail body streams behind a `<Suspense>` boundary with a
  placeholder while list pages remain fully cached — the data itself still
  comes from a tagged, cached getter. Routes where `redirect()`/`notFound()`
  must be real HTTP responses export `instant = false` (the whole admin area,
  `/login` and `/setup`).

## Upload pipeline

End to end, from form to visitor:

1. **Form** — the generic `ResourceForm` (or `ProfileForm` for the avatar)
   posts `FormData` including a `file` entry to `createResource` /
   `updateResource`. The resource must declare an `upload` def.
2. **Server action** — `requireUser()` first, then `saveUpload(file)`.
3. **`saveUpload()`** in [`src/lib/storage.ts`](src/lib/storage.ts):
   extension allow-list → 12 MiB cap → `contentError()` byte inspection
   (executables, shebang scripts, HTML/SVG/XML markers regardless of
   extension, magic-byte mismatch with the claimed extension) → write
   `<uuid>.<ext>` into `UPLOAD_ROOT` with flag `wx` (never overwrites).
   The client-declared MIME type is ignored; `mime` is derived from the
   extension.
4. **Database row** — `stored_name`, `original_name` (sanitised, path
   stripped), `mime`, `size` are passed as `extra` columns to the generic
   CRUD layer, alongside the ordinary form fields. Any resource with an
   `upload` def gets this for free — migration `0004` simply added the four
   columns to `certifications` and `achievements`.
5. **Replacement / deletion** — a successful re-upload unlinks the previous
   file; `deleteRow("documents")` also nulls `profile.avatar_id` and unlinks
   the stored file.
6. **Serving** —
   `/media/[resource]/[id]` for public attachments (fixed allow-list of
   `certifications` and `achievements`, row read through the public role so
   RLS applies, `resolveStoredPath()` refuses anything outside the upload
   root), and `/documents/[id]` for the document library (published, or any
   signed-in owner; everything else is a flat 404).

## Testing strategy

```bash
npm test
```

Every acceptance criterion that matters here — RLS, role switching,
migrations, publishing, upload validation, session behaviour — is
**server-side database behaviour**, so [`tests/global-setup.ts`](tests/global-setup.ts)
boots a **real embedded PostgreSQL 17** in the OS temp folder (initialised
from empty, wiped on teardown), creates `portfolio_test`, and points
`DATABASE_URL` at it with `AUTO_MIGRATE=true`.

Mocking `pg` would only prove the mock agrees with itself: the policies, the
`SET LOCAL ROLE` sessions and the advisory lock are the very things under
test, and they do not exist in a mock. A policy that would leak a draft in
production fails here identically.

Supporting choices:

- suites run **sequentially** (`fileParallelism: false`) against one shared
  instance, so a `resetContent()` in one file cannot race an assertion in
  another;
- `tests/helpers/db.ts` mirrors the two production paths exactly —
  `adminQuery()` (owner) and `publicQuery()` (`SET LOCAL ROLE
  portfolio_public`) — plus unique row markers so leftovers never make an
  assertion pass;
- migration bookkeeping is reset between suites, which only works because
  every migration file is idempotent.

Coverage spans migrations and RLS visibility, CRUD round-trips and validation,
password hashing and sessions, upload validation and path traversal, the media
route, and contact-form validation/rate limiting (see
[`tests/`](tests/) for the per-file breakdown).

## Known limitations

- **Single user.** One owner (optionally a second account behind
  `ALLOW_EXTRA_ADMIN=true`); no roles, no invitations, no multi-tenancy.
- **No email delivery.** Contact messages are written to a private
  `contact_messages` inbox read in the dashboard. There is **no third-party
  mail service wired up** — no SMTP, no provider SDK, nothing sends mail —
  and the owner's public email address is offered to visitors on the same
  page as the direct alternative.
- **In-memory rate limiting.** Login and contact throttling live in the
  process (`src/lib/security.ts`) and reset on restart; so does the
  per-process fallback salt when `CONTACT_HASH_SALT` is unset.
- **`.data/postgres` is a development convenience**, not a production
  database: a single-node data directory managed by `npm run db:dev`,
  unmonitored and unbacked up by the app. Production belongs to a managed
  PostgreSQL service.
- **Nothing has been deployed.** No deployment to Railway (or any other
  host) has been performed from this machine, and no external service —
  database, volume, domain — is configured. The
  [Railway procedure in the README](./README.md#deploying-to-railway) is the
  design, not a completed setup.
