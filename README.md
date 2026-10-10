# Portfolio & Digital CV

A personal portfolio site with a **private admin dashboard**. Visitors can
browse published achievements, certifications, education, skills,
experience, projects and documents **without logging in**. The owner adds,
edits, uploads, publishes and deletes content through the dashboard — no
code changes required.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
and SQLite (via Node's built-in `node:sqlite`) — no external services.

> See `ARCHITECTURE.md` for the design and security model.

## Quick start

```bash
npm install
cp .env.example .env.local   # then set SESSION_SECRET (see below)
npm run dev                  # http://localhost:3000
```

**First run:** visiting `/admin` redirects you to `/setup`, a one-time page
where you create the admin username and password. It disappears (404s)
forever once an account exists.

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SESSION_SECRET` | **yes (production)** | dev-only random | 32-byte hex that signs session cookies. Boot fails in production without it. |
| `PORT` | no | `3000` | Port for `npm start` |
| `DATABASE_PATH` | no | `./data/portfolio.db` | SQLite database file |
| `UPLOAD_DIR` | no | `./private/uploads` | Where uploaded documents are stored |

`data/`, `private/` and `.env*` are gitignored — database, uploads and
secrets never enter version control.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run clean` | Remove `.next` (use before `build` on Windows/OneDrive) |
| `npm run seed` | Add sample content (also available in the dashboard) |

## Using the dashboard

1. Sign in at `/login`.
2. **Dashboard** (`/admin`) — stats, quick links, sample content loader.
3. Pick a section in the sidebar → **New** to add, or open an item to edit.
4. **Publish toggle** — items start published (except *Documents*, which
   start as drafts). Unpublished items are invisible to visitors.
5. **Documents** — upload a PDF/DOC/image (15 MB max) or paste an external
   URL. Files are stored privately and only served to visitors once the
   document is published.
6. **Settings** — edit your public profile (name, title, bio, contact,
   social links) and change your password.

All changes appear on the public site within about a minute (pages are
cached for 60 seconds).

## Deployment

Any Node.js host works — it's a standard Next.js app with a SQLite file.

### 1. Build

```bash
npm ci
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # → SESSION_SECRET
npm run build
```

### 2. Run

```bash
export SESSION_SECRET="<paste hex here>"
export PORT=3000
npm start
```

Visit `http://your-host:3000`, complete `/setup`, and start adding content.

### Requirements

- Node.js **24+** (for built-in `node:sqlite`).
- A writable directory for `data/` and `private/`.
- HTTPS in front of the app (recommended) — session cookies are `Secure`
  when served over HTTPS.

### Docker

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t portfolio .
docker run -d -p 3000:3000 \
  -e SESSION_SECRET="<hex>" \
  -v portfolio-data:/app/data \
  -v portfolio-uploads:/app/private \
  portfolio
```

The volumes preserve the database and uploads across deploys.

### systemd

```ini
[Unit]
Description=Portfolio site
After=network.target

[Service]
WorkingDirectory=/srv/portfolio
Environment=NODE_ENV=production
Environment=SESSION_SECRET=<hex>
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

### Static hosts (Vercel/Netlify/etc.)

These platforms have no writable filesystem, so SQLite and file uploads
won't work there as-is. Deploy to a Node host (VPS, Railway, Fly.io,
Render, a Raspberry Pi…) or replace `src/lib/db.ts` with a hosted
database.

## Security notes

- Passwords hashed with **scrypt** and compared in constant time.
- Sessions are opaque random tokens, **stored hashed**, in an `httpOnly`,
  `SameSite=Lax` cookie signed with `SESSION_SECRET`.
- Every server action and the document download route independently verify
  the session — the client-side redirect is never trusted for authorization.
- Login is rate-limited (5 attempts → 15-minute lockout).
- SQL is built only from the field registry (identifier whitelist) with
  bound parameters for all values.
- Uploaded files live outside the web root and are only streamed by an
  authenticated route handler.
- Security headers (CSP, `X-Frame-Options`, `Referrer-Policy`, etc.) are set
  in `next.config.ts`.

**Before going live:** set a strong `SESSION_SECRET`, run behind HTTPS, and
change the admin password from the dashboard after setup.
