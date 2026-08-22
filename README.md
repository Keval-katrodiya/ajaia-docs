# Ajaia Docs

A lightweight collaborative document editor — create, format, import, share, and export documents in the browser.

Built for the Ajaia Full Stack Product Engineer assignment by **Keval Katrodiya** (keval.katrodiyas@gmail.com).

---

## Run it locally

### Windows — one click

**Double-click `SETUP-AND-RUN.bat`.**

It checks your Node version, installs dependencies, seeds the demo database,
finds a free port, starts the server and opens your browser. Nothing else to do.

```
SETUP-AND-RUN.bat           install if needed, seed if needed, run in dev mode
SETUP-AND-RUN.bat prod      production build, then serve it
SETUP-AND-RUN.bat reset     wipe and reseed the database, then run
SETUP-AND-RUN.bat test      run the test suite and stop
SETUP-AND-RUN.bat help      show the list
```

It re-runs safely: installing and seeding are skipped when they are already done,
and if port 3000 is busy it moves to the next free one rather than opening a URL
that is not the app.

### macOS / Linux — or if you prefer the commands

Two commands. No Docker, no database server, no account signup.

```bash
npm install
npm run seed      # creates ./data/app.db with 3 demo users and 4 documents
npm run dev       # http://localhost:3000
```

Node 20.9 or newer. Nothing else is required — SQLite is embedded, and every
environment variable has a working default.

### Demo accounts

There are **no passwords**. The sign-in screen lists the seeded users; click one.

| Name | Email | What they show you |
|---|---|---|
| Keval Katrodiya | `keval@ajaia.test` | Owns 2 documents, has 1 shared as **editor** and 1 as **viewer** |
| Priya Sharma | `priya@ajaia.test` | Owns 1 document, is an **editor** on Keval's spec |
| Sam Okoro | `sam@ajaia.test` | Owns 1 document, is a **viewer** on Keval's spec |

To see sharing work properly, sign in as two people at once — one normal window,
one private/incognito window. Edit as Priya, refresh as Keval.

### The other commands

```bash
npm test            # 62 tests, ~1s
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm start           # serve the production build
npm run seed:reset  # wipe the database and reseed from scratch
```

---

## What it does

### Documents
- Create a blank document, or make one from an uploaded file
- Rename inline in the header — it saves as you type
- **Autosave** 800 ms after you stop typing, with a live "Saving… / All changes saved" indicator
- `Ctrl`/`Cmd`+`S` saves immediately instead of waiting out the debounce
- Everything survives a refresh, including formatting

### Formatting
Bold · Italic · Underline · Strikethrough · H1 / H2 / H3 · Bulleted lists ·
Numbered lists · Block quote · Inline code

Standard keyboard shortcuts work (`Ctrl+B`, `Ctrl+I`, `Ctrl+U`, `Ctrl+Z`), as do
Markdown-style shortcuts while typing — `## ` for a heading, `- ` for a bullet.

### File import
**Supported: `.txt`, `.md` / `.markdown`, `.docx` — up to 5 MB.**
This limit is stated in the upload dialog as well as here, and enforced on the
server. Anything else is rejected with a message naming what *is* accepted.

Three ways in:
1. **Import a file** on the document list → becomes a brand-new document
2. **Import** inside an open document → **add to the end**
3. **Import** inside an open document → **replace everything**

Formatting is converted, not flattened: headings stay headings, lists stay lists,
bold/italic/underline survive. A `.docx` with Word list numbering imports as real
bulleted and numbered lists.

### Sharing
- Every document has one **owner**
- The owner can grant **Can edit** or **Can view** to any seeded account, by email
- Roles can be changed or revoked at any time
- The document list separates **Your documents** from **Shared with you**, and
  shared cards show the owner's avatar plus a role badge
- A viewer gets a disabled toolbar and a "View only" label — and the API refuses
  their writes independently, so the disabled UI is a convenience, not the control

### Export
Markdown, standalone HTML, or plain text. Available to anyone who can open the
document, viewers included.

---

## How it hangs together

```
      BROWSER                          SERVER (Next.js)                STORAGE
   .................              .......................          ..............

   /docs .................> app/docs/page.tsx ......> documents.ts ....> SQLite
     server-rendered list        (server component)      (repository)      |
                                                                          |
   /docs/[id] .............> EditorShell (client) <----+                   |
     TipTap / ProseMirror        |                     |                   |
             |                   | fetch               |                   |
             |  autosave 800ms   v                     |                   |
             +-----------------> PATCH /api/documents/[id]                 |
                                   |                                       |
                                   +--> access.ts  (who + may they?)       |
                                   +--> sanitizeDoc (schema whitelist)     |
                                   +--> rev check   (conflict? -> 409)     |
                                   +-------------------------------------->+
```

Full reasoning, including what I traded away, is in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Sample files to try

The repo ships three fixtures in [`samples/`](samples/):

| File | What it demonstrates |
|---|---|
| `meeting-notes.md` | Headings, bold/italic, bulleted + numbered lists, a quote |
| `plain-notes.txt` | Paragraph splitting on blank lines, soft breaks on single ones |
| `quarterly-report.docx` | A real Word package — headings, **underline**, and both list types |

`quarterly-report.docx` is generated from source by
`node scripts/build-sample-docx.mjs`, so it is not an unexplained binary in the repo.

---

## Deploying

The app is one Next.js server plus one SQLite file. It needs a host with a
**real filesystem** — which means a container/VM host, not a serverless one.

### The constraint, stated plainly

> **Vercel will not work as-is.** Its serverless functions have no persistent
> writable filesystem, so SQLite cannot survive there. This is the cost of the
> zero-setup local experience, and it was a deliberate trade — see
> [ARCHITECTURE.md §4.2](ARCHITECTURE.md#42-sqlite-behind-a-repository), which
> also names the two files you would swap to move to Postgres.

### Free option: Render (recommended)

A [`render.yaml`](render.yaml) blueprint is included, so there is nothing to
configure by hand.

1. Push this folder to a GitHub repo
2. Render → **New → Blueprint** → pick the repo
3. Render reads `render.yaml`, builds, seeds, and gives you a
   `https://<name>.onrender.com` URL

No credit card, no Docker, no database service to provision. The build command
seeds at build time, so the demo accounts exist the moment it boots.

**Two things to know about the free plan:**

- **It sleeps after ~15 minutes idle.** The next visitor waits ~30–60 seconds
  while it wakes. **Open your live URL yourself a minute before you submit** so
  the reviewer's first click is instant.
- **Data resets when it sleeps or redeploys.** The database lives on the
  instance's own disk. Reviewer edits persist for their session, which is all a
  demo needs. Attach a Render Disk and repoint `DATABASE_PATH` for durability.

### With Docker (Fly.io, Koyeb, Railway, a VPS)

```bash
docker build -t ajaia-docs .
docker run -p 3000:3000 -v ajaia-data:/data -e SESSION_SECRET=$(openssl rand -hex 32) ajaia-docs
```

The image seeds on start (seeding is idempotent) and stores the database at
`/data/app.db`. Mount a volume there and documents survive redeploys. Fly.io and
Koyeb both have small free allowances and, unlike Render's free plan, can stay
awake — worth it if the cold start bothers you.

Any host that injects a `PORT` environment variable works unmodified; the app
binds to it (verified).

> Free-tier terms change often. Confirm the current limits on the provider's
> pricing page rather than trusting this README.

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_PATH` | `./data/app.db` | Point at a mounted volume in production |
| `SESSION_SECRET` | insecure dev fallback | **Set this in production.** Signs the session cookie |

---

## What I did not build

Named plainly, because leaving them unmentioned would be the same as pretending
they are there.

| Not built | Why |
|---|---|
| Real-time collaborative cursors | Needs a CRDT plus a websocket layer. Instead of faking it, the app **detects** a concurrent save and tells you (409 + reload banner) rather than silently overwriting a colleague. |
| Real authentication | The assignment permits seeded accounts. The cookie is still HMAC-signed and HttpOnly; only the credential check is stubbed. |
| Comments / suggestion mode | A second data model and a second UI surface. Out of budget. |
| Images and tables in the editor | Images need file storage and a resize UI. Tables need their own toolbar. Imported tables are flattened to paragraphs so the words survive. |
| Links | Needs a link-editing popover to be usable, and it was lower value than getting import and sharing right. |
| Version history | Cheap to store, expensive to design a good restore UI for. First thing I would add next. |
| Document delete in the UI | The API supports it (`DELETE /api/documents/:id`, owner-only). Wiring up a confirm dialog lost to sharing polish. |
| Pagination | Correct at demo scale, wrong at 500 documents. The index is already in place for it. |

---

## Project layout

```
src/
  app/
    api/                    route handlers - thin, all logic lives in lib/
    docs/                   document list + editor pages (server components)
    login/
  components/               client components (editor, dialogs, toolbar)
  lib/
    permissions.ts          the whole access model, pure and unit-tested
    richtext.ts             HTML <-> ProseMirror <-> Markdown, pure
    file-import.ts          .txt / .md / .docx -> editor content
    documents.ts            every SQL statement for documents and sharing
    users.ts                every SQL statement for users
    access.ts               session + permissions, used by every route
    db.ts                   SQLite connection and schema
    errors.ts / api.ts      one error envelope for the whole API
scripts/
  seed.ts                   demo users and documents
  build-sample-docx.mjs     regenerates the .docx fixture
tests/                      62 tests, no mocks of our own code
samples/                    files to try the importer with
```
