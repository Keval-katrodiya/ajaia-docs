# Submission — Ajaia Docs

**Candidate:** Keval Katrodiya · keval.katrodiyas@gmail.com
**Role:** AI-Native Full Stack Product Engineer
**Date:** 22 August 2026

---

## ⚠️ Two items you must fill in before sending this

These cannot be produced from the repo alone. **Do not submit without them.**

| Item | Status | What to do |
|---|---|---|
| **Live product URL** | ⬜ **TODO** | Push to GitHub → Render → **New → Blueprint**. The included [`render.yaml`](render.yaml) configures everything; free plan, no card. Full steps in [README → Deploying](README.md#deploying) |
| **Walkthrough video** | ⬜ **TODO** | Record 3–5 min, paste the unlisted link into `WALKTHROUGH_VIDEO.txt` (a script is already in that file) |

> **Live URL:** `_______________________________________`
> **Video URL:** `_______________________________________`

**Before you send the link:** open it yourself a minute beforehand. Render's free
plan sleeps after ~15 minutes idle, and a sleeping instance takes ~30–60 seconds
to answer the first request. Waking it first means the reviewer's first click is
instant.

Everything else in this checklist is done.

---

## What is included

| File / folder | What it is |
|---|---|
| `src/` | Application source — Next.js App Router, API routes, components, domain logic |
| `tests/` | 62 automated tests across 4 suites |
| `scripts/seed.ts` | Seeds 3 demo users and 4 documents covering every sharing state |
| `scripts/build-sample-docx.mjs` | Regenerates the `.docx` fixture from source |
| `samples/` | Three files to try the importer with: `.md`, `.txt`, `.docx` |
| `README.md` | Setup, run instructions, feature list, demo accounts, deployment |
| `ARCHITECTURE.md` | Architecture note — priorities, decisions, diagrams, tradeoffs |
| `AI_WORKFLOW.md` | AI workflow note — tools, wins, what I rejected, verification |
| `SUBMISSION.md` | This file |
| `WALKTHROUGH_VIDEO.txt` | Video link + a recording script |
| `SETUP-AND-RUN.bat` | Windows one-click setup + launch (`prod` / `reset` / `test` / `help` modes) |
| `render.yaml` | Render Blueprint — one-click free deploy, nothing to configure |
| `Dockerfile`, `.dockerignore` | Container build for any other host |
| `.env.example` | Configuration reference (every value has a working default) |

---

## Reviewing it in 5 minutes

**On Windows: double-click `SETUP-AND-RUN.bat`.** It checks Node, installs,
seeds, picks a free port, starts the server and opens the browser.

Otherwise:

```bash
npm install
npm run seed
npm run dev        # http://localhost:3000
```

Node 20.9+. No Docker, no database server, no signup.

**Credentials: there are none.** Sign-in is passwordless against seeded accounts —
click a name on the sign-in screen. This is a deliberate scope cut, explained in
ARCHITECTURE.md §4.3.

| Account | Email | Why you would sign in as them |
|---|---|---|
| Keval Katrodiya | `keval@ajaia.test` | Owns 2 docs; is an **editor** on one and a **viewer** on another |
| Priya Sharma | `priya@ajaia.test` | Owns 1 doc; is an **editor** on Keval's spec |
| Sam Okoro | `sam@ajaia.test` | Owns 1 doc; is a **viewer** on Keval's spec |

**The fastest path through everything:**

1. Sign in as **Keval** → the list separates *Your documents* from *Shared with you*
2. Open **Q3 roadmap (read-only)** → toolbar disabled, "View only" badge — this is
   the viewer role, and the API refuses his writes too
3. Back → **Import a file** → pick `samples/quarterly-report.docx` → a real Word
   doc arrives with headings, **underline**, and both list types intact
4. Type in it → watch the indicator go *Unsaved → Saving… → All changes saved*
5. **Share** → `priya@ajaia.test` → *Can view*
6. Open a private window, sign in as **Priya** → it is in her *Shared with you*,
   read-only. Switch her to *Can edit* as Keval and refresh — now she can type
7. **Export → Markdown** → the file downloads with formatting preserved

---

## What is working

Everything the brief asked for, end to end.

| Requirement | Status | Notes |
|---|---|---|
| Create a document | ✅ | Blank, or from an uploaded file |
| Rename a document | ✅ | Inline in the header, autosaved |
| Edit in the browser | ✅ | TipTap / ProseMirror |
| Save and reopen | ✅ | Autosave (800 ms debounce) + `Ctrl/Cmd+S`; formatting intact on reopen |
| Bold / Italic / Underline | ✅ | Plus strikethrough and inline code |
| Headings / text size | ✅ | H1, H2, H3 + Body |
| Bulleted / numbered lists | ✅ | Including nested lists |
| File upload | ✅ | `.txt`, `.md`, `.docx` → new doc, append, or replace. Limit stated in UI + README |
| Document owner | ✅ | `documents.owner_id` |
| Grant another user access | ✅ | By email, **Can edit** or **Can view**, changeable and revocable |
| Owned vs shared distinction | ✅ | Separate sections, owner avatar, role badge |
| Persistence | ✅ | SQLite; survives refresh and restart |
| Setup + run instructions | ✅ | README |
| Deployment | ⚠️ | Dockerfile + instructions ready; **URL still to be filled in above** |
| Validation + error handling | ✅ | Zod + a schema whitelist + one error envelope; messages written for humans |
| Automated test | ✅ | 62 tests, `npm test`, ~1s |
| Architecture note | ✅ | `ARCHITECTURE.md` |
| AI workflow note | ✅ | `AI_WORKFLOW.md` |
| Walkthrough video | ⬜ | **To record** — script in `WALKTHROUGH_VIDEO.txt` |

**Beyond the brief** (cheap, so included): export to Markdown / HTML / plain text,
role-based permissions rather than on/off access, concurrent-save conflict
detection, dark mode, and an import audit trail.

---

## What is incomplete, and what I deliberately did not build

Nothing in the required scope is partial. These are **conscious cuts**, each with
its reasoning in [README → What I did not build](README.md#what-i-did-not-build).

| Not built | One-line reason |
|---|---|
| Real-time collaborative cursors | Needs a CRDT + websockets. Instead the app **detects** a concurrent save and says so, rather than silently overwriting a colleague |
| Real authentication | Assignment permits seeded accounts; the cookie is still HMAC-signed and HttpOnly |
| Comments / suggestion mode | A second data model and a second UI surface |
| Images and tables in the editor | Images need storage + a resize UI; imported tables flatten to paragraphs so the words survive |
| Links | Needs a link popover to be usable; lower value than import and sharing |
| Version history | Cheap to store, expensive to design a good restore UI for — first thing next |
| Delete in the UI | The API and its owner-only check exist; only the confirm dialog is missing |
| Pagination | Correct at demo scale; the index is already in place for it |

Two known rough edges, stated rather than hidden:

- **Conflict recovery is reload-based.** On a 409 you are told and offered a
  reload; your unsaved paragraph is not auto-merged. Honest, not elegant.
- **Sharing requires a seeded account.** There is no invite flow, and the API
  says so explicitly instead of failing vaguely.

---

## With another 2–4 hours

In the order I would actually do it:

1. **Version history** (~60 min) — snapshot on save when >5 min since the last;
   restore panel. Makes the conflict case recoverable, not just visible.
2. **Delete in the UI** (~15 min) — API and permission check already exist.
3. **Presence indicator** (~45 min) — poll `updated_by`/`updated_at`, show "Priya
   is editing". Prevents most conflicts before they happen: ~80% of the value of
   real-time for ~5% of the work.
4. **Playwright end-to-end test** (~40 min) — sign in, type, share, switch user,
   verify. That path is currently checked by hand.
5. **Links** (~40 min) — the most-missed formatting option.

Explicitly *not* next: real-time CRDT collaboration. It is a project, not a task,
and item 3 captures most of the benefit at a fraction of the risk.

---

## Verification evidence

Every gate was run, not assumed:

```
   tsc --noEmit ......... 0 errors
   vitest run ........... 62 / 62 passing  (~1s)
   next build ........... clean production build
   curl smoke test ...... 18 checks against the running server:
                          auth, the full permission matrix, 409 conflict
                          handling, import of .md/.docx/.txt, rejection of
                          .pdf, the share lifecycle, and all three exports
```

Two real bugs were found this way and fixed — a silent underline loss on every
`.docx` import, and a duplicated title in exports. Both are written up in
[AI_WORKFLOW.md](AI_WORKFLOW.md#what-i-changed-or-rejected) and both now have
regression tests.
