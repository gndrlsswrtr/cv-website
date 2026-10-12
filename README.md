# Portfolio & Digital CV

A personal portfolio site / digital CV with two halves:

- a **public, read-only website** — visitors browse published experience,
  volunteering, education, skills, projects, achievements, certifications and
  documents without an account;
- a **private, owner-only dashboard** (`/admin`) where the owner adds, edits,
  uploads, publishes and deletes all of it without touching code.

It is a **single-user** application: there is no public registration, no
multi-tenant support, and **no seeded password anywhere**. The one admin
account is created out-of-band — see [Quick start](#quick-start).

Design, data model and security model: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** — App Router, Turbopack, Cache Components / PPR (`cacheComponents` + `partialPrefetching`) |
| UI | **React 19**, **TypeScript**, **Tailwind CSS v4** |
| Database | **PostgreSQL 17** accessed through [`pg`](https://www.npmjs.com/package/pg) (a pooled `Pool`, `SET LOCAL ROLE` for public reads) |
| Validation | **Hand-written, registry-driven — not Zod.** Every field definition, rule and SQL column mapping lives in [`src/lib/resources.ts`](src/lib/resources.ts); `validateValues()` in that same file is the validator. There is no schema library in `package.json`. |
| Migrations | Plain idempotent SQL in [`db/migrations/`](db/migrations), applied by [`src/lib/db/migrate.ts`](src/lib/db/migrate.ts) |
| Local database | **Embedded PostgreSQL** (`embedded-postgres` devDependency) — no Docker, no local install |
| Tests | **Vitest** against a real embedded PostgreSQL (no mocks) |

## Quick start

```bash
npm install
```

### 1. Start the local database (its own terminal)

```bash
npm run db:dev
```

This boots a **local embedded PostgreSQL** — no Docker and no PostgreSQL
install on your machine; the server binaries ship with the
`embedded-postgres` devDependency. It applies every migration, then writes
`DATABASE_URL` into `.env.local`.

- **Leave this process running** — it *is* your development database.
  Ctrl+C stops it.
- `npm run db:dev -- --reset` throws the data away and starts clean.
- Data lives in `.data/postgres` (gitignored), so it survives reboots but not
  a deliberate `--reset`.
- The port defaults to **54329** and is overridable with `DEV_DB_PORT`.

### 2. Create the admin account (required before login works)

There is no public registration and no default password. Until an account
exists, `/login` has nothing to authenticate against.

Interactive form:

```bash
npm run db:create-admin
# Email:    you@example.com
# Name:     Your Name
# Password: <at least 10 characters>
```

Or supply the values as environment variables:

```bash
# bash / zsh
ADMIN_EMAIL="you@example.com" \
ADMIN_NAME="Your Name" \
ADMIN_PASSWORD="<choose-a-strong-password>" \
npm run db:create-admin
```

```powershell
# PowerShell
$env:ADMIN_EMAIL = "you@example.com"
$env:ADMIN_NAME = "Your Name"
$env:ADMIN_PASSWORD = "<choose-a-strong-password>"
npm run db:create-admin
```

`--email=`, `--name=` and `--password=` flags work too. The password must be
10–200 characters and not on the built-in common-password list.

`db:create-admin` refuses once an account exists. A deliberate second account
requires `ALLOW_EXTRA_ADMIN=true` in the environment for that run. (The
browser-based `/setup` page is the other first-admin path; it 404s forever as
soon as any account exists — see
[Authentication](./ARCHITECTURE.md#authentication-and-sessions).)

### 3. Start the app

```bash
npm run dev
```

Open **http://localhost:3000** (Next picks the next free port if 3000 is
taken), sign in at `/login`, and start adding content from the dashboard.

### Using the dashboard

- **Dashboard** (`/admin`) — counts, quick links, and an optional
  sample-content loader that only fills *empty* sections with example entries
  (`Sample Project`, `Example University`, …). Those rows land published, so
  replace, unpublish or delete them as soon as you start adding real content.
- Sidebar → section → **New** to add, or open an item to edit; reorder with
  the arrows, toggle **Published** to hide a draft from visitors.
- **Documents** default to *draft* (files often contain personal data);
  everything else defaults to published.
- **Profile & settings** — public profile, site title/description, featured
  home-page sections, social links, contact preferences, password change.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server (Turbopack) → http://localhost:3000, next free port if taken |
| `npm run build` | Production build — `prebuild` first deletes `.next`, which matters on Windows/OneDrive where stale file locks otherwise cause `EPERM` |
| `npm start` | Serve the production build on `PORT` (default `3000`) |
| `npm run lint` | ESLint |
| `npm run clean` | Delete `.next` only (same as what `prebuild` does) |
| `npm test` | Run the Vitest suite once against a real embedded PostgreSQL |
| `npm run test:watch` | Same suite in watch mode |
| `npm run db:dev` | Start the embedded development PostgreSQL, migrate it, write `DATABASE_URL` to `.env.local` — then keep running |
| `npm run db:migrate` | Apply pending migrations from `db/migrations/` (use as a release step) |
| `npm run db:create-admin` | Create the first admin account (interactive, env vars, or flags) |

## Environment variables

Copy `.env.example` to `.env.local` to get started; `npm run db:dev` writes
`DATABASE_URL` for you. CLI scripts read real environment variables first,
then `.env.local`, then `.env` — the same precedence as Next.js. **Values
below are placeholders; never commit real secrets.**

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string, e.g. `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`. Must start with `postgres://` or `postgresql://`. On Railway a PostgreSQL service injects it automatically. |
| `DATABASE_POOL_MAX` | No | `10` | Maximum size of the `pg` connection pool. |
| `DATABASE_SSL` | No | unset → driver decides | `true` = TLS (`rejectUnauthorized: false`), `false` = no TLS, unset = let the driver decide. |
| `AUTO_MIGRATE` | No | enabled | Set to `false` to stop migrating on first query and run `npm run db:migrate` as a separate release step instead. |
| `SITE_URL` | Production: **yes** | `http://localhost:3000` | Public origin used for canonical URLs, the sitemap and `robots.txt`. Getting it wrong is the most common deployment mistake. |
| `SITE_TITLE` | No | `Portfolio` | Fallback site title for `<title>` and meta tags. Admin → Settings wins whenever it has a value. |
| `SITE_DESCRIPTION` | No | built-in fallback (see [`src/lib/seo.ts`](src/lib/seo.ts)) | Fallback meta description for search results and link previews. Settings wins; keep it under ~160 characters. |
| `PORT` | No | `3000` | Port for `npm start`. |
| `ALLOW_INSECURE` | No | unset | `true` serves the session cookie without the `Secure` flag. Only for plain-HTTP testing on a LAN; never set it in production. |
| `UPLOAD_DIR` | No | `private/uploads` | Where uploads are written — must never be under `public/`. On Railway, point it at a mounted volume. |
| `DEV_DB_PORT` | No | `54329` | Port used by `npm run db:dev`. |
| `CONTACT_HASH_SALT` | No | per-process random | Salt for the contact form's IP digests. Unset means digests stop matching after a restart, which is acceptable for throttling that already resets. |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` | For non-interactive `db:create-admin` | — | Credentials passed to `npm run db:create-admin`. |
| `ALLOW_EXTRA_ADMIN` | No | unset | `true` lets `db:create-admin` create an additional account; without it the script refuses once one exists. |

`.env*` (except `.env.example`), `.data/` and `private/` are gitignored —
database files, uploads and secrets never enter version control.

## Migrations and Row Level Security

### How migrations apply

`db/migrations/*.sql` are applied in filename order inside a single
transaction, guarded by `pg_advisory_lock` so two booting instances (a
deploy plus a local `npm run dev`) cannot apply the same file twice.
Applied names are recorded in `schema_migrations`, and every migration file
is idempotent. Two ways in:

1. **Automatically** on the first query of a process (`ensureMigrated()`),
   unless `AUTO_MIGRATE=false`.
2. **As a release step**: `npm run db:migrate` — a failing migration then
   fails the deploy instead of the first visitor's request.

### The security model

The database — not the application — decides who can see which rows:

- Migration `0002_rls.sql` creates a cluster-wide role
  **`portfolio_public`** (`NOLOGIN`, so nothing can log in as it directly) and
  runs `GRANT portfolio_public TO CURRENT_USER`, so the `DATABASE_URL` user
  can assume it at query time.
- Every content table has **Row Level Security enabled** with a
  `published_read` policy: `FOR SELECT TO portfolio_public USING
  (published = true)`. Public reads run inside `SET LOCAL ROLE
  portfolio_public`, so drafts are invisible no matter what query the app
  writes.
- `profile` and `site_settings` are publicly readable by design (they decide
  what the site shows).
- `users`, `sessions` and `contact_messages` carry **no public policy at
  all**, and the public role is not even granted `SELECT` on
  `contact_messages` — RLS with zero policies means zero rows, so password
  hashes, session tokens and the inbox are unreachable from the public read
  path.
- The **admin path connects as the table owner** (the `DATABASE_URL` user),
  and PostgreSQL exempts table owners from RLS. That is why
  **`FORCE ROW LEVEL SECURITY` is deliberately not set** — the owner must see
  everything to administer content and accounts.

## Storage and uploads

Files are written under **`UPLOAD_DIR`** (default `private/uploads`),
**never under `public/`** — Next.js cannot serve them directly. The only way
to reach one is through a database-backed route handler, which looks the row
up by id; visitors never supply a path.

Validation is layered in [`src/lib/storage.ts`](src/lib/storage.ts), in this
order:

1. **Extension allow-list** — a fixed set (PDF, Office, images, text, CSV,
   zip). The browser-declared MIME type is never consulted.
2. **Size cap** — **12 MiB** (`MAX_UPLOAD_BYTES`), checked once the body has
   been received. The server-action body limit sits just above it at 15 MB
   (`experimental.serverActions.bodySizeLimit`).
3. **Content inspection** — `contentError()` reads the bytes:
   - executables and archives by magic header (PE/`MZ`, ELF, Mach-O, class
     files, spanned zips) are rejected;
   - shebang scripts (`#!`) are rejected;
   - **HTML/SVG/XML/script markers are rejected whatever the extension
     claims**, so a page renamed to `.png` never gets stored;
   - otherwise the bytes must match the declared extension (`%PDF-`, PNG
     signature, `PK\x03\x04` for Office/zip, RTF, OLE, image headers), and
     text formats must look like plain text.
   **SVG is rejected outright** — it is not an allowed extension, and its
   `<?xml`/`<svg` markers are caught by content inspection too.
4. **Randomised stored filename** — `<uuid>.<ext>`; the original name is kept
   only as sanitised display metadata, never as a path.

Two serving routes:

- **`/media/[resource]/[id]`** — public attachments (scanned certificates,
  award photos). The route allow-lists exactly `certifications` and
  `achievements`, reads the row **through the public role** (so RLS hides
  unpublished entries even for a guessed id), and resolves the stored name
  with a traversal check.
- **`/documents/[id]`** — the document library: serves published documents to
  anyone, and unpublished ones only to the **signed-in owner** (404
  otherwise). `?download=1` forces a download.

## Deploying to Railway

> **Nothing has been deployed.** No deployment to Railway — or anywhere else —
> has been performed from this machine, and no external service (Railway, a
> hosted database, a volume, a domain) is configured or connected. The steps
> below describe the procedure the code is written for; they have **not** been
> executed or verified against a real Railway project.

1. **Add a PostgreSQL service** to the Railway project. Railway injects
   `DATABASE_URL` into the app automatically — nothing to paste.
2. **Set `SITE_URL` to the real `https://` origin**, e.g.
   `https://your-app.up.railway.app` (or your custom domain). This value
   drives canonical URLs, `sitemap.xml` and `robots.txt`; leaving it at the
   localhost default is the most common mistake.
3. Optionally set `SITE_TITLE` and `SITE_DESCRIPTION` (Admin → Settings
   overrides both later, without a redeploy).
4. **Create the admin once** — there is no registration endpoint:
   `npm run db:create-admin` from a Railway shell or a one-off job, with
   `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` set for that run. Run it
   exactly once; afterwards change the password from the dashboard if needed.
5. **Attach a volume** and point `UPLOAD_DIR` at it (e.g.
   `/data/uploads`) so uploads survive redeploys — the container filesystem
   is ephemeral.
6. Migrations run automatically on first query. Prefer an explicit release
   step? Set `AUTO_MIGRATE=false` and run `npm run db:migrate` during deploy.

## Backups

A complete backup is **two things**: the database **and** the upload
directory. Files on disk are not in the database, and database rows point at
them.

```bash
# Database — logical backup (custom format)
pg_dump --format=custom --no-owner --file=portfolio-YYYYMMDD.dump "$DATABASE_URL"

# Restore into a database that has the target DATABASE_URL
pg_restore --no-owner --dbname="$DATABASE_URL" portfolio-YYYYMMDD.dump
```

Plain-SQL alternative:

```bash
pg_dump --file=portfolio-YYYYMMDD.sql "$DATABASE_URL"
psql --file=portfolio-YYYYMMDD.sql "$DATABASE_URL"
```

Use `pg_dump`/`pg_restore` matching your server's major version, and
treat dump files as sensitive — they contain password hashes and the contact
inbox.

Uploads (replace `./private/uploads` with your `UPLOAD_DIR`):

```bash
tar -czf uploads-YYYYMMDD.tar.gz ./private/uploads     # backup
tar -xzf uploads-YYYYMMDD.tar.gz -C .                  # restore
```

## Testing

```bash
npm test
```

The suite **boots a real embedded PostgreSQL** for every run (initialised in
the OS temp folder, wiped on teardown) instead of mocking the database — so
migrations, the advisory lock, role switching and **Row Level Security are
exercised for real**: a policy that would hide the wrong rows in production
fails here too. Each run gets its own database and its own port, so tests
never touch your `db:dev` data. Test files run sequentially against that one
instance.

What is covered:

| Suite | Covers |
|---|---|
| `tests/database.test.ts` | Migration ordering, idempotency, bookkeeping, RLS visibility (published only, `users`/`sessions` unreachable, writes denied, public role actually in effect) |
| `tests/crud.test.ts` | Create → read → update → delete round-trips, published filtering, search, reordering, `defaultPublished` rules |
| `tests/validation.test.ts` | Required fields, URL/date/number rules, slug derivation, registry consistency |
| `tests/auth.test.ts` | scrypt hashing, session create/resolve/expire/revoke, hashed tokens only, login rate limiting |
| `tests/upload.test.ts` | Extension allow-list, size cap, magic-byte content checks, randomised names, path-traversal refusal |
| `tests/media.test.ts` | The `/media/[resource]/[id]` route: published serves bytes, unpublished 404s, allow-list, attachment migration |
| `tests/contact.test.ts` | Contact validation, honeypot, per-IP throttling, inbox, inbox RLS |

## Security notes

- **Passwords**: `scrypt` (memory-hard, built into Node) with a per-password
  salt, stored as `scrypt$N$r$p$salt$hash` and compared with
  `timingSafeEqual`. Unknown accounts still do a hash run (timing
  equalizer), and login failures are delayed.
- **Sessions**: opaque 32-byte random token in the cookie; **only its
  SHA-256 hash is stored**, so a leaked table cannot be replayed as a cookie.
  Cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production
  (`ALLOW_INSECURE=true` opts out — never in production). Signing out is a
  real row deletion.
- **Rate limiting**: in-memory — login 5 attempts / 15 minutes per account,
  contact form 4 per IP / 10 minutes plus a 40 / hour global burst limit.
- **Contact form**: hidden honeypot field, hard length caps, and IPs stored
  as **salted SHA-256 digests**, never raw.
- **Authorization**: `proxy.ts` only redirects on cookie *presence* (UX);
  real checks are server-side — `requireUser()` in the admin layout, in every
  server action, and in the document route. The client is never trusted, and
  file routes answer with a flat `404` whether an id is wrong, missing or
  merely unpublished — no probing can tell private from non-existent (**no
  IDOR**).
- **SQL**: identifiers come only from the static registry and are
  pattern-checked and double-quoted; every value is a bound `$n` parameter.
- **Private storage**: uploads live outside `public/`, are served only by
  route handlers with traversal checks and `nosniff`, and the media route
  allow-lists its tables.
- **Headers** (nosniff, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy`) are set in [`next.config.ts`](next.config.ts).

## Content rules

The site never invents facts about its owner. It ships with **no** content
rows: no qualifications, employers, awards, credentials or verification links
are fabricated by the application, and every field is an editable placeholder
until the owner enters real data. The only prewritten copy is a factual
fallback meta description — plus, if the owner explicitly clicks it, the
dashboard's optional sample-content loader, whose example rows exist to be
replaced. Neither is ever generated by the site on its own.
