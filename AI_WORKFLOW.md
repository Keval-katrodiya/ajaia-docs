# AI workflow note

Keval Katrodiya · 22 Aug 2026

---

## Tools

| Tool | Used for |
|---|---|
| **Claude Code (Opus 5)** in VS Code | Primary build surface — scaffolding, converters, tests, docs |
| `curl` + Node one-liners | Smoke-testing the running API. Not AI, but it is where AI output got checked |
| `vitest`, `tsc`, `next build` | The three gates every AI-written line had to pass |

That is the whole list. I did not use a second assistant, and I did not use
autocomplete-style generation for anything structural.

---

## How I actually worked

Not "prompt → paste → ship". The loop was:

```
   .-> DECIDE ---------> the scope cut, the data format, the permission
   |   (me)              matrix, the concurrency strategy. AI got a
   |                     decision to implement, not a question to answer.
   |                          |
   |                          v
   |   GENERATE ---------> a whole module at a time, with the constraints
   |   (AI)                stated up front: "pure, no DB, no DOM, because
   |                       it has to be unit-testable"
   |                          |
   |                          v
   |   READ --------------> line by line. this is where most of the
   |   (me)                 rejections in the next section happened.
   |                          |
   |                          v
   |   RUN ---------------> tsc -> vitest -> next build -> curl the
   |   (me)                 live server. two real bugs only showed up
   |                        at this step.
   |                          |
   '--------------------------'
```

The step that mattered most was the last one. Code that reads correctly and
typechecks can still be wrong, and both of the real defects I found were
invisible to the first three steps.

---

## Where AI materially sped me up

**1. The HTML → ProseMirror converter.** ~250 lines of tree-walking with a lot of
tedious cases (nested lists, overlapping marks, entity decoding, unwrapping
unknown containers). The first draft was maybe 70% right; I rewrote the list-item
handling and the mark nesting. Writing it from scratch would have cost an hour I
did not have. Biggest single win of the session.

**2. Test scaffolding.** I decided *what* to test — the 4×6 permission matrix,
the conflict path, a hostile sanitiser payload. AI wrote the boilerplate around
those decisions fast, which is why 62 tests exist instead of 12.

**3. The `.docx` fixture generator.** I needed a genuine Word package —
`[Content_Types].xml`, relationships, `numbering.xml` — to test import properly.
Hand-writing OOXML is miserable. AI produced a working generator in one pass, and
committing a *script* rather than an unexplained binary is strictly better for
the reviewer.

**4. CSS design tokens and the light/dark palette.** Genuine grunt work, no
judgement in it.

---

## What I changed or rejected

This is the more useful half of the note.

| # | AI proposed | What I did instead | Why |
|---|---|---|---|
| 1 | Store document HTML in a `TEXT` column | **ProseMirror JSON** | HTML in a database makes XSS your problem on every render forever. A JSON node whitelist means a hostile payload cannot be *stored*, let alone rendered. This decision drove the whole sanitisation design. |
| 2 | Use `@tiptap/html`'s `generateJSON` on the server | **Hand-written converter** | It needs a DOM, so server-side it wants `jsdom` — a heavy dependency and a runtime risk in a container. A pure function is deterministic, dependency-light, and testable. |
| 3 | Prisma + Postgres, `docker-compose` for local | **SQLite + raw SQL behind a repository** | The assignment says do not make reviewers pay for a service, and a Docker daemon is friction too. Two commands to run beats a migration toolchain at this scope. I kept the escape hatch: all SQL is in two files. |
| 4 | Mock the repository in the persistence tests | **Real in-memory SQLite** | Mocking the repository only proves the mock behaves like the mock. The interesting failures — cascade deletes, the `WHERE rev = ?` conflict — live in the SQL. |
| 5 | `function isTextNode(n): n is HtmlNode & { rawText: string }` | Imported the real `TextNode` and `NodeType` from the library | Looked fine, compiled in my head, and made TypeScript narrow the sibling branch to `never` — 10 type errors. A good reminder that a plausible-looking type predicate is still a claim that needs checking. |
| 6 | `mammoth.convertToHtml({ buffer })` with defaults | Added an explicit `styleMap` | **This was a real bug.** Mammoth discards underline by default. Underline is formatting this editor advertises, so every `.docx` import was silently losing it. Caught by importing a real file and diffing the marks, not by reading code. |
| 7 | Pinned `next@15.1.7` | Upgraded to `15.5.23` | `npm install` flagged a published CVE. Shipping a known-vulnerable version because the generated `package.json` said so is not a defensible reason. |
| 8 | Prepend the title on every export | Prepend only when the body does not already open with it | **Second real bug.** Imported documents take their title *from* their first heading, so export printed it twice. Only visible by running an export. |

I also kept AI entirely out of four things: the scope cut (what to build and what
to name as not-built), the permission matrix judgement calls (editor renames but
cannot share; 404 not 403), the concurrency strategy, and the priority order in
the architecture note. Those are product decisions, and outsourcing them would
have produced a defensible-sounding build I could not actually defend.

---

## How I verified correctness

Four gates, in order, all of them run — not assumed:

```
   1. tsc --noEmit ............ 0 errors      (caught rejection #5)
   2. vitest run .............. 62 / 62 pass  (~1s)
   3. next build .............. clean production build
   4. curl smoke test ......... 18 checks against the RUNNING server
```

Gate 4 is the one that found the real bugs. Abbreviated results:

```
   anonymous GET /api/documents ............. 401  ok
   private doc leaked to another user? ...... no   ok
   viewer PATCHes a doc shared read-only .... 403  ok
   editor PATCHes the same doc .............. 200  ok
   stale save (old baseRev) ................. 409  ok  <- co-editor's work intact
   non-owner tries to manage sharing ........ 403  ok
   stranger opens an unshared doc ........... 404  ok  <- not 403; no existence leak
   share -> upgrade role -> re-share -> revoke      ok  <- 1 row, not duplicated
   share with a non-existent account ........ 400  ok  <- names the problem
   import .md ............................... headings + both list types + marks
   import real .docx ........................ underline preserved (after the fix)
   import .pdf .............................. 415  ok  <- names accepted formats
   append .txt into an open document ........ rev 1 -> 2
   export md / html / txt ................... correct, no duplicated title
   export with a bogus format ............... 400  ok
```

Then a manual browser pass for the things a `curl` cannot judge: does typing feel
normal, does the save indicator read clearly, is the read-only state obvious, does
the toolbar reflect the cursor position, does it work in dark mode.

## How I verified UX quality

Less mechanical, but I held it to three questions:

- **Can a new user tell what to do with an empty screen?** The empty states say
  what to do next, not just that there is nothing there.
- **Is state always legible?** A viewer sees a disabled toolbar *and* a "View
  only" badge *and* "Read only" where the save status would be. Three signals,
  because one is missable.
- **Do errors tell you what to do?** "`.pdf` files are not supported. Upload
  `.txt`, `.md`, `.docx`." names the fix. "Unsupported media type" does not.

---

## Honest assessment

AI roughly doubled my throughput on this build. It did not improve my judgement,
and on two occasions it produced code that was plausible, type-safe, and wrong in
a way that would have shipped — the mammoth underline default and the duplicated
export title.

The pattern I would take to a real codebase: **let it write the volume, keep the
decisions, and never let generated code reach "done" without running it.** Both
bugs here were found by running the thing, not by reading it. That is the habit
that matters, and it is the one that gets skipped when the code looks good.
