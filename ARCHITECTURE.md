# Architecture note

**Ajaia Docs** — what I prioritised, what I built, and what I traded away.

Keval Katrodiya · 22 Aug 2026

---

## 1. The one-paragraph version

A single Next.js app (App Router) serving both the UI and the API, backed by
SQLite. Documents are stored as **ProseMirror JSON**, not HTML. Access control is
a pure, unit-tested module that every route calls through one helper. Autosave is
debounced and revision-guarded, so two people editing the same document get an
honest conflict instead of a silent overwrite.

The scope bet: **go deep on the editing/import/sharing loop and be explicit about
everything else**, rather than putting a thin version of ten features on screen.

---

## 2. What I prioritised, in order

I ranked by *"if this is missing or wrong, does the product fail at the thing it
claims to be?"*

```
   MUST WORK, OR NOTHING ELSE MATTERS
   .....................................................................
    1  Editing that feels normal        typing, formatting, autosave,
                                        reopening with formatting intact
    2  Sharing that is actually enforced server-side, not just hidden in the UI
    3  Import that converts structure   an import that flattens to plain text
                                        is not an import
   .....................................................................
   WORTH REAL TIME
    4  Honest concurrency               detect the collision, say so
    5  Errors a human can act on        one envelope, messages written for people
    6  Tests on the parts that fail silently  (permissions, conversion)
   .....................................................................
   NICE, CHEAP, SO INCLUDED
    7  Export (md / html / txt)         ~30 minutes, closes the import loop
    8  Two-role sharing rather than on/off
   .....................................................................
   CUT - see README "What I did not build"
       real-time cursors, comments, images, tables, links, version history
```

**#2 is the one I would defend hardest.** A sharing model that only hides buttons
is not a sharing model. Every write path resolves identity from a signed cookie
server-side and checks it against the document's ACL, and there is a test that a
viewer's `PATCH` is refused even though the UI would never send it.

---

## 3. System shape

```
   .-------------------------------------------------------------------.
   |                            BROWSER                                |
   |                                                                   |
   |   /login          /docs                    /docs/[id]             |
   |   SignInForm      server-rendered list     EditorShell (client)   |
   |   (client)        + DocumentActions        + TipTap/ProseMirror   |
   |                     (client)               + Share / Import /     |
   |                                              Export dialogs       |
   '-------------------------+-----------------------------------------'
                             |  fetch (JSON)      cookie: ajaia_session
                             |                    HttpOnly, HMAC-signed
   .-------------------------v-----------------------------------------.
   |                      NEXT.JS SERVER                               |
   |                                                                   |
   |   app/api/**/route.ts    <- thin. parse, delegate, respond.        |
   |          |                                                        |
   |          |   every route begins with ONE of these:                 |
   |          +--> access.ts : requireViewAccess                        |
   |          |                requireEditAccess                        |
   |          |                requireOwnerAccess                       |
   |          |                     |                                   |
   |          |                     +--> session.ts    (who is asking)  |
   |          |                     +--> permissions.ts (may they?)     |
   |          |                                                        |
   |          +--> validation.ts  (zod: shape + size)                   |
   |          +--> richtext.ts    (sanitizeDoc: schema whitelist)       |
   |          +--> documents.ts / users.ts   <- the ONLY SQL in the app |
   |                     |                                             |
   '---------------------+---------------------------------------------'
                         |
   .---------------------v---------------------------------------------.
   |   SQLite  (better-sqlite3, WAL, foreign keys ON)                  |
   |   users · documents · document_shares · document_imports          |
   '-------------------------------------------------------------------'

   ~ note the funnel: to add an endpoint that forgets an access check you
     have to deliberately skip access.ts. That is the point of the shape.
```

---

## 4. Decisions, and what I gave up for each

### 4.1 Store ProseMirror JSON, not HTML

This is the decision the rest of the app hangs off.

```
        HTML in the database                ProseMirror JSON
        ....................                ................
   +  familiar, easy to render         +  ONE canonical shape
   -  XSS is now your problem on       +  validation = a node whitelist,
      every single render                 so stored content cannot contain
   -  "is <b> the same as <strong>?"      a <script> at all
   -  export means parsing it back     +  every format is a converter on
      out again                           one side or the other
                                       -  you must write the converters
```

The whitelist matters more than it looks. Because a document can only ever contain
`paragraph | heading | text | bulletList | orderedList | listItem | blockquote |
codeBlock | horizontalRule | hardBreak` with marks `bold | italic | underline |
strike | code`, **a shared document cannot carry a script into a collaborator's
browser.** That is enforced by `sanitizeDoc()` on every write, not by trusting the
client, and it is tested with a hostile payload.

Cost: I hand-wrote `htmlToDoc`, `docToMarkdown`, `docToHtml` and `docToText`
(~250 lines). Worth it — they are pure functions and 23 of the 62 tests cover them.

### 4.2 SQLite, behind a repository

Chosen so that `npm install && npm run seed && npm run dev` is the entire local
setup. No Docker daemon, no connection string, no free-tier signup. At this scope
SQLite is not a toy: foreign keys, transactions, `ON CONFLICT` upserts and a
`CHECK` constraint on share roles are all doing real work.

What I gave up: a serverless deployment target. Vercel has no persistent writable
filesystem, so this app needs a container host.

I paid down that risk by keeping **every SQL statement in two files**
(`documents.ts`, `users.ts`). Moving to Postgres means rewriting those two and
nothing else — no route, no component, and no test of the permission model would
change.

### 4.3 Passwordless demo auth

The assignment allows seeded accounts, so credential storage was the cheapest
thing to cut. What I kept is the part sharing actually depends on:

```
   cookie value:   usr_6b81a3a1...  .  <HMAC-SHA256 over the id>
                   \______________/    \________________________/
                     who you claim         proof we issued it

   verified with crypto.timingSafeEqual, HttpOnly, SameSite=Lax,
   Secure in production, 30-day expiry.
```

You cannot edit the cookie to become another user. Swapping in real auth means
replacing two functions in `session.ts`.

### 4.4 Concurrency: detect, don't pretend

Real-time co-editing needs a CRDT and a websocket layer — several times the
budget for this whole assignment. The alternative most demos pick is last-write-
wins, which quietly destroys a colleague's paragraph.

I did the third thing: **make the collision visible.**

```
   Priya (rev 3)                SERVER                 Keval (rev 3)
   ------------                 ------                 ------------
        |                         |                          |
        |-- PATCH baseRev=3 ----->|                          |
        |                    UPDATE ... WHERE rev = 3        |
        |                    1 row changed -> rev becomes 4  |
        |<---------- 200 rev=4 ---|                          |
        |                         |                          |
        |                         |<---- PATCH baseRev=3 ----|
        |                    UPDATE ... WHERE rev = 3        |
        |                    0 rows changed                  |
        |                         |----- 409 conflict ------>|
        |                         |      currentRev: 4       |
        |                         |                          |
        |                         |          [ banner: "Someone else saved
        |                         |            this document." + Reload ]
        |                         |                          |
        |                         |<--- GET (fresh content) -|
        |                         |---- 200 rev=4 ---------->|

   ~ Priya's work is never lost. Keval is told, not silently discarded.
     Autosave stops until he reloads, so he cannot keep clobbering.
```

The check is a `WHERE rev = ?` on the UPDATE, so it is atomic in the database
rather than a read-then-write race in application code.

One nuance: **renames are deliberately not rev-guarded.** Two people renaming at
the same second is last-write-wins with no data loss, whereas making a rename
bump `rev` would invalidate a co-editor's in-flight content save for no benefit.
There is a test for exactly that.

### 4.5 One import pipeline, not three

```
    .txt  --------------------------> plainTextToDoc ----.
                                                          \
    .md   --[ marked ]--> HTML --.                         +--> ProseMirror
                                  +--> htmlToDoc ---------'         JSON
    .docx --[ mammoth ]-> HTML --'                                    |
                                                                 sanitizeDoc
                                                                      |
                                                                  (stored)
```

Everything funnels through `htmlToDoc`, so a new format costs one case statement
and inherits all the existing conversion behaviour and tests. `htmlToDoc` also
handles pathological input: unknown containers are unwrapped, tables are flattened
to paragraphs so the words survive, `<script>`/`<style>` are dropped entirely, and
headings deeper than H3 clamp to H3 rather than collapsing into body text.

---

## 5. Data model

```
   +---------------+
   |    users      |
   |---------------|
   | id       PK   |<--------------------------------.
   | email    UQ   |<------------------------.        |
   | name          |                          |        |
   | accent        |          .---------------+--.     |
   +---------------+          |                   |     |
          ^                   |                   |     |
          | owner_id          | user_id           |     | user_id
          |                   |                   |     |
   +------+--------------+    |    +--------------+---+ |  +----------------+
   |     documents       |    |    | document_shares  | |  | document_imports|
   |---------------------|    |    |------------------| |  |-----------------|
   | id            PK    |<---+----| document_id  FK  | |  | document_id FK  |
   | owner_id      FK    |    |    | user_id      FK  |-'  | user_id     FK  |--'
   | title               |    |    | role  CHECK IN   |    | filename        |
   | content  (PM JSON)  |    |    |   ('viewer',     |    | extension       |
   | preview             |    |    |    'editor')     |    | bytes           |
   | rev      INTEGER    |    |    |                  |    | mode            |
   | created_at          |    |    | UNIQUE(          |    | created_at      |
   | updated_at          |    |    |   document_id,   |    +-----------------+
   | updated_by    FK    |----'    |   user_id)       |
   +---------------------+         +------------------+
                                            ^
                                            |
                                   ~ one row per person per document.
                                     re-sharing is an UPSERT, not an error.

   ON DELETE CASCADE from documents -> shares and imports, so deleting a
   document cannot leave an orphaned grant behind. There is a test for it.
```

**`rev`** is the concurrency guard from §4.4.
**`preview`** is denormalised at write time so the document list never parses
JSON for a card. One extra column beats N parses per page load.
**`document_imports`** is an audit trail — who uploaded what, into which document,
and whether it replaced or appended.

---

## 6. The access model

The whole thing is one pure module, `src/lib/permissions.ts`, with no database
and no request object. That is what makes it exhaustively testable.

```
                     view    edit    rename   import   share   delete
   .................................................................
   owner              y       y        y        y        y       y
   editor             y       y        y        y        -       -
   viewer             y       -        -        -        -       -
   no relationship    -       -        -        -        -       -
```

Three judgement calls worth naming:

**An editor can rename but cannot share.** Renaming is content-shaped work;
granting access is an ownership decision.

**A document you cannot see returns 404, never 403.** A 403 would confirm the
document exists to someone with no right to know that.

**A corrupt role degrades to `viewer`, not to `editor`.** If a bad row ever
appears in `document_shares`, it must fail closed. Tested.

---

## 7. Errors and validation

One envelope for every failure in the app:

```json
{ "error": { "code": "conflict", "message": "Someone else saved this document…" } }
```

`message` is written for a person and rendered straight into the UI — that is why
you get *"`.pdf` files are not supported. Upload `.txt`, `.md`, `.docx`."* rather
than "Unsupported media type".

Validation runs in three layers, each doing a different job:

```
   1. zod        outer shape, string lengths, size ceiling      -> 400
   2. sanitizeDoc  node/mark whitelist, heading clamp, depth cap
   3. SQLite     foreign keys, UNIQUE, CHECK on share role
```

Route handlers have no `try/catch` of their own — the `route()` wrapper turns a
thrown `ApiError` into its status, a `ZodError` into a 400 with field detail, and
anything unexpected into a logged 500 with no stack trace on the wire.

Client-side checks (file extension, size) exist for feedback speed only. Every one
of them is enforced again on the server, and the server is the one that counts.

---

## 8. Testing

62 tests, ~1 second, no mocks of my own code. I spent the budget where a bug is
**silent** rather than where it is loud.

| Suite | Tests | Why it earns its place |
|---|---|---|
| `permissions` | 11 | The full 4×6 matrix. Nobody notices a viewer who can edit until they have edited. |
| `richtext` | 24 | Conversion + the XSS whitelist, with a hostile payload. |
| `documents` | 14 | Real in-memory SQLite. Sharing visibility, cascade delete, and the 409 conflict path. |
| `file-import` | 13 | Type gating, and a **real `.docx`** — which is how I found a live bug (below). |

`documents.test.ts` runs against an actual SQLite database rather than a mocked
repository, because the interesting failures live in the SQL, and a mock only
proves the mock behaves like the mock.

**Two bugs the tests and smoke-testing actually caught:**

1. **Underline was silently dropped from every `.docx` import.** Mammoth discards
   underline by default. Underline is a formatting option this editor advertises,
   so importing a Word document lost it with no warning. Fixed with an explicit
   style map; there is now a regression test against a real Word package.
2. **Export printed the title twice.** Imported documents take their title *from*
   their first heading, and export then prepended it again. Fixed with
   `opensWithTitle()`, and tested.

Neither was visible from reading the code. Both came from running the thing.

---

## 9. If I had another 2–4 hours

In the order I would actually do it:

1. **Version history** (~60 min) — snapshot on save when >5 min since the last
   one, plus a restore panel. The schema barely changes and it makes the conflict
   case recoverable rather than merely visible.
2. **Delete in the UI** (~15 min) — the API and permission check already exist;
   it needs a confirm dialog.
3. **Presence indicator** (~45 min) — poll `updated_at` and `updated_by` and show
   "Priya is editing". Not real-time cursors, but it prevents most conflicts
   before they happen, which is 80% of the value for 5% of the work.
4. **Playwright end-to-end test** (~40 min) — one spec: sign in, type, share,
   sign in as the other user, verify. Today that path is verified by hand.
5. **Links** (~40 min) — the most-missed formatting option.

Deliberately *not* next: real-time CRDT collaboration. It is a project, not a
task, and item 3 gets most of the benefit for a fraction of the risk.
