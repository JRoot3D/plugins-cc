# Changelog

Newest first. Each version says what it changes, then what that means for a board that already exists: plan an upgrade from "What changes for an existing board" alone.

## 4.2.0 — 2026-10-17

### Changes

- A brief can list the nodes its text relies on without covering them: `_Arch context: slug=N_`. A later change to one of them puts the brief in `BRIEFS_OUTDATED` (`context SLUG …`). `/arch:finalize` fills the line in new briefs.
- A brief whose `- Requires:` line names a superseded stage is outdated (`requires OLD (superseded by NEW)`). Every finalize option repoints that entry, and a supersede now repoints the `- Requires:` lines of the other briefs and the todo list's Depends On cells.
- `/arch:finalize` can **amend** a brief that has no tasks done: its text is brought in line with the current decisions and the plan, marked `_Amended: date — reason_`. `/arch:finalize revise NN` offers amend, supersede or follow up for a brief whose stage moved in the plan while every decision held.
- `CHANGES_NOT_IN_A_BRIEF` reads the proposals itself: `N — M name a brief`, one line per change whose proposal names a brief, then `others:`. A brief's `_Related changes: a, b_` takes changes that only refer to it off the list.
- `/arch:decide` asks what changed before it offers a revisit, and routes plan-only changes to `/arch:finalize revise NN` and implementation facts to `/arch:explore` (the same table is in `/arch:status`). A revisit looks for text the old choice left in Notes, Triage and Connections and marks or rewrites what the user approves; `/arch:audit` reports such stale lines.
- Skills tell the user to type `/arch:finalize` and `/arch:new` instead of offering to run them. A History line goes last in `## History`, and a node file is read again after `set` or `archive` rewrote it.

### What changes for an existing board

- Files rewritten: none by itself. Briefs, the todo list and node files change only in a finalize or decide run, after the user picks an option.
- New optional fields: `_Arch context:_`, `_Amended:_` and `_Related changes:_` in brief headers. 4.1.0 and 4.0.0 read them as unknown header lines and ignore them.
- Output: `BRIEFS_OUTDATED` lists a brief that requires a superseded stage until a finalize run repoints it — on a board where a brief still requires one, it shows outdated right after the upgrade. `CHANGES_NOT_IN_A_BRIEF` becomes a header with indented lines; the set of changes is the same. No other `summary` line changes.
- Manual steps: none. To clear a `requires` reason, run `/arch:finalize` and choose Keep (or Amend) for that brief.
- Mixed versions: an older clone does not show the `requires` and `context` reasons, and its Keep does not bump `_Arch context:_`, so a `context` reason can stay on new clones until a new-version finalize runs. index.json, sessions.jsonl and the lock ref do not change.

## 4.1.0 — 2026-10-17

### Changes

- A fresh clone of a project with a shared board gets `.arch/` at its first session start, as soon as it has fetched the board branch. A repository with no board makes no network call for it.
- Claim and release commit only board files: `index.json`, `sessions.jsonl`, `.gitattributes`, `.gitignore`, `todo-list.md`, `project-context.md`, `ideas/*.md`, `feature-briefs/*.md`. Any other file in `.arch/` stays out and is named in their output. `.gitattributes` and `.gitignore` are committed even where an ignore rule outside arch names them.
- Sync (session start, the start of each `/arch:` skill) commits nothing. When its pull would overwrite a change not yet released, it prints `BOARD_PULL_SKIPPED`, and the next claim or release commits and merges it.
- Release refuses to push a change to a node file, a brief, `todo-list.md` or `project-context.md` whose key you do not hold, whatever made the change (a shell edit included). Your locks are kept; claim the key and release again.
- The Edit and Write hooks refuse a file under `.arch/` when the lock check itself fails, instead of letting the edit run.
- A board worktree without a local `refs/arch/locks` fetches it before a write and refuses the write when it cannot.
- Release commit titles name the first three keys, then `+N more`; the body lists all of them. The work-in-progress commit of a claim names the keys it claims.
- Sync prints `BOARD_ATTRIBUTES_MISSING` while the board branch has no merge drivers in its `.gitattributes`; the next release commits them.
- Every command but `merge-index` works from inside `.arch/` and from a code folder, as from the project root.

### What changes for an existing board

- Files rewritten: none. No board file changes format, and nothing is migrated. `index.json`, `sessions.jsonl`, the briefs and `refs/arch/locks` read and write as in 4.0.0.
- New optional fields: none.
- Output: `summary` and `check` print the same lines. Sync prints `BOARD_PULL_SKIPPED` or `BOARD_ATTRIBUTES_MISSING` only when they apply. Claim and release add `— not committed (not board files): …` only when such files exist. `INDEX_INVALID — … not its worktree` names the folder.
- Manual steps: none. Before the first release, check that `git -C .arch status --short` and `git -C .arch log origin/arch..HEAD` (your board branch on your remote) show only work under keys you hold: a change to a key you do not hold now stops the release.
- Mixed versions: a 4.0.0 clone and a 4.1.0 clone share a board safely. The lock ref format is the same. A 4.0.0 clone still commits every file in `.arch/` and does not check the keys of its own releases; its pushes reach the board branch first, so they never count against a 4.1.0 release. Each clone's merge driver points to the script of the version that last ran sync, claim, release or share.

## 4.0.0 — 2026-10-10

### Changes

- A board can be shared across clones: `/arch-share` gives it a branch of its own (default `arch`, checked out at `.arch/` as a git worktree and hidden from the code checkout) and per-node locks in `refs/arch/locks` on the remote. Skills claim a node before they change it and release when done. `/arch-release` retries a failed release, `/arch-unlock` frees an abandoned lock.
- `/arch:status` reads `openspec/changes/` on every branch of the remote, so stage progress is the same whatever branch the code checkout is on.
- `/arch-board` opens `.arch/board.html`, a live page with the board state and the dependency graph.
- Writers in one clone take turns through `.arch/index.lock`, which holds its pid.

### What changes for an existing board

- Files rewritten: new sessions go to `.arch/sessions.jsonl`; sessions already in `index.json` stay there and count first. `last_updated` is dropped from `index.json` at its next save.
- New fields: briefs record per-node revisions, `_Arch revision: slug=N, slug=N_`. The single-number form of 3.x still reads (every node at what the sessions up to there made it), so old briefs stay fresh.
- Board git files: `.arch/.gitattributes` (`sessions.jsonl merge=union`, `index.json merge=arch-index`) and `.arch/.gitignore` (`index.lock`, `*.tmp`, `board.html`, `board.js`) arrive with the first log or share.
- Manual steps: none for a board kept in one clone. To share one, run `/arch-share` once; every other clone gets the board at session start.
- Mixed versions: the merge driver lives in each clone's git config (`merge.arch-index.driver`), with the path of the script that set it up.
