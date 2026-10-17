---
name: status
description: Read-only progress report for an architector session in .arch/ — node maturity counts, blocking nodes, open questions, map freshness, what remains before /arch:finalize and the implementation progress of the feature briefs in OpenSpec. Use when the user asks where the architecture work stands, what blocks finalization, or how implementation of the feature briefs is going.
argument-hint: "[blocking|ready]"
disallowed-tools: [Write, Edit, NotebookEdit]
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" summary)
  - PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" summary)
---

# Skill: /arch:status

## Role
You are a status reporter. Your goal is to give a clear, honest picture of where the architecture
work stands — what's done, what's blocking, and what the path forward looks like.

**This is a read-only skill. It does not modify any files.**

## Invocation
```
/arch:status              ← full status report
/arch:status blocking     ← show only blocking nodes
/arch:status ready        ← show only nodes ready for /arch:finalize
```
Variant for this run (empty = full report): $ARGUMENTS

## Input
- `.arch/index.json`
- `.arch/ideas/[slug].md` — the node files listed in `index.json`
- `.arch/project-context.md`
- `.arch/feature-briefs/*.md` — if they exist: stage names, the `_Followed up by:_` / `_Supersedes:_` / `_Superseded by:_` headers, `## Dependencies` and the `## OpenSpec Handoff → Start with` line

The live nodes are the entries in `index.json` → `nodes`; open node files through their `file` paths. `ideas/*.md` also matches `*.archived.md` (merged or split nodes) — never treat those as live nodes.

## Current State
Generated from `.arch/` by the plugin's state script when this skill started:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" summary`

- `NO_ARCH_SESSION` → stop: "No architecture session found. Run `/arch:new` first."
- `INDEX_INVALID` → stop and show the user the error: `.arch/index.json` must be repaired before architector can continue.
- Otherwise take counts, stage, finalize gate, map and brief freshness, last node worked on, LOCKS and PROBLEMS from this block instead of recomputing them. Still read node files for their content. Mention any PROBLEMS to the user.

---

## Process

### Step 1 — Load State
Take counts, the finalize gate, map freshness and the stages' implementation state (`STAGES`) from Current State; read the node files listed in `index.json` for open questions and context.

### Step 2 — Render Status Report

```
📊 Architecture Status — [Project Name]
_Last updated: [date of most recent session]_
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROGRESS
  Total nodes:    [N]
  ✦ Ready:        [N]  ████░░░░░░  [%]
  ◈ Decided:      [N]  ██░░░░░░░░  [%]
  ◽ Explored:     [N]  █░░░░░░░░░  [%]
  ◻ Raw idea:     [N]  ░░░░░░░░░░  [%]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 BLOCKING  (must resolve before /arch:finalize)
  ◻ tech-stack       raw-idea    [no sessions yet]
  ◽ data-model       explored    [1 session — open questions remain]

🟡 CORE
  ◈ auth             decided     ✓
  ◽ canvas-ui        explored    [awaiting tech-stack decision]
  ◻ node-graph       raw-idea

🟢 EXTENSION
  ◻ dark-mode        raw-idea
  ◻ export           raw-idea

⚪ DEFERRED
  ◻ analytics        raw-idea    [consciously deferred — not blocking]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BLOCKERS ANALYSIS
  ❌ tech-stack is still raw-idea — blocking: data-model, canvas-ui, node-graph
  ⚠️  data-model has open questions — see ideas/data-model.md ## Notes
  ⏳ record not merged: auth → merge docs/adr/0004-auth.md, then /arch:decide auth

READY FOR /arch:finalize?
  ❌ No — [FINALIZE_GATE reasons: blocking nodes not ready, PROBLEMS]

SUGGESTED NEXT ACTION
  → /arch:explore tech-stack   (highest priority — unblocks 3 nodes)
```

Take the `⏳ record not merged` lines from `RECORDS_PENDING` in Current State, one per node it lists (blocking nodes first); skip them when it is absent or `none`.

When the gate is open and nothing is left to brief (`READY_NOT_IN_A_BRIEF` and `BRIEFS_OUTDATED` are none), the suggested next action is the `Next` command from Step 6.

### Step 3 — Map Freshness
Use `LAST_MAP` from Current State — it gives [N], the sessions since the last full map run, and names the nodes changed since.

```
MAP FRESHNESS
  Last full /arch:map: [date] ([N] sessions ago)
  Since then: [node-a] → explored, [node-b] has new notes, [node-c] created
  ⚠️  The board has shifted — /arch:map would surface new connections
```

If the map is fresh (no changes since last run), show:
```
MAP FRESHNESS
  Last full /arch:map: [date] — up to date ✓
```

If no full `/arch:map` has run:
```
MAP FRESHNESS
  No full /arch:map yet. [N] nodes exist — connections are unknown.
```

### Step 4 — Open Questions Summary
If any node has unresolved items in `## Notes`, list them:

```
OPEN QUESTIONS
  data-model: "Should we support versioned snapshots from day one?"
  canvas-ui:  "Depends on tech-stack — can't decide rendering approach yet"
```

### Step 5 — Deferred Review
If there are deferred nodes AND the project is maturing (at least half of blocking nodes are `decided` or `ready`), prompt the user to reconsider them:

```
DEFERRED REVIEW
  You have [N] deferred nodes. The project has matured since these were set aside — worth a second look?
  - analytics — deferred since [date] ([N] days ago). Still deferred?
  - dark-mode — deferred since [date] ([N] days ago). Still deferred?
  → To reconsider, run /arch:explore [node], then change priority with /arch:decide [node] priority [level]
```

If the project is still early (most blocking nodes are `raw-idea`), skip this section — it's too soon to revisit deferrals.

If there are no deferred nodes, skip this section.

### Step 6 — Implementation
Only when `STAGES` is in Current State. Take each stage's state from its `STAGES` line — never recompute it from `openspec/`. Name each stage as its brief does; superseded briefs are not listed.

```
IMPLEMENTATION (OpenSpec)
  ✓ stage 01 Foundation   done — setup-project archived 2026-10-01
  ✓ stage 02 Accounts     done, capability missing: user-auth → /arch:finalize
  ▶ stage 03 Core Auth    in progress — add-auth 5/12 tasks; auth-ui not proposed
  ◇ stage 04 Export       planned — export-csv proposed (no tasks yet)
  ○ stage 05 Canvas       not started
  ⚠️  stage 04 is planned but depends on stage 03, which is not done
  Not from a brief: 3, 1 of them names a brief
    add-login (active) names 02-auth.md — renamed during propose, or proposed from a superseded brief? /arch:finalize corrects the brief's Changes line
  → Next: /opsx:apply add-auth   (stage 03)
```

- Write each stage number as "stage NN", never as a bare number.
- `?` marks an `unknown` stage, followed by its reason from the `STAGES` line.
- A `done` line that ends `— capability missing: [id]` → "done, capability missing: [id] → /arch:finalize" (the user types it); the stage still counts as done for `Next`.
- Warn when a `planned`, `in progress` or `done` stage depends on a stage that is not `done` — the stages its brief's `## Dependencies → Requires` names. A Requires entry naming a superseded stage means its replacement (follow `_Superseded by:_`).
- Before you give `Next`, route with this table, the same one `/arch:decide` uses, when the user asks whether something needs an arch skill first:

| What changed | Run |
| --- | --- |
| The chosen approach of a node (its `## Decision`) | `/arch:decide [node]` → revisit |
| A fact from implementation or a spike, and the decision holds | `/arch:explore [node]` |
| Scope or order of a stage, and every decision holds | `/arch:finalize revise NN` (the user types it) |
| A brief in `BRIEFS_OUTDATED` | `/arch:finalize` (the user types it) |
| Nothing: you want to start or continue a stage | the `Next` command of `/arch:status`, no arch skill — a `ready` node needs no `/arch:decide` |

- Next: the lowest-numbered stage that is not `done` and whose Requires stages are all `done`. Within it, take the first change in `STAGES` order that is not archived: `not proposed` → `/opsx:explore` with the brief, then `/opsx:propose [change] @.arch/feature-briefs/[brief]` in the same session (so its answers are written down) if the brief's Handoff says to start with explore, otherwise just that `/opsx:propose`; `proposed (no tasks yet)` → the same `/opsx:propose` (it offers to continue the existing change); `N/M tasks` with N < M → `/opsx:apply [change]`; N = M → `/opsx:archive [change]`. If that stage is `unknown`, give its reason instead of a command; if every stage is `done`, say so. Then adjust it:
  - The stage's brief has `_Followed up by:_` and the change has no task done (`not proposed`, `proposed (no tasks yet)`, `0/M tasks`) → it takes the follow-up brief too: not proposed or `proposed (no tasks yet)` → add `@.arch/feature-briefs/[follow-up]` to its `/opsx:propose` (it continues an existing change); `0/M tasks` → `/opsx:update [change] @.arch/feature-briefs/[follow-up]`, then `/opsx:apply [change]`. `[follow-up]` is each brief down the `_Followed up by:_` chain to the newest (a superseded one → the brief its `_Superseded by:_` names). A change with tasks done finishes on its brief's decisions.
  - The stage's brief has `_Supersedes:_`, the stage is `planned` and the change shows `0/M tasks` → `/opsx:update [change] @.arch/feature-briefs/[brief]` (if not done yet), then `/opsx:apply [change]`; a `proposed (no tasks yet)` change keeps the base `/opsx:propose` command, which continues it.
  - The change is `not proposed` and a sibling in the stage is archived or has tasks done → add "(merged or dropped? /arch:finalize corrects the brief's Changes line)".
  - The `others:` line of `CHANGES_NOT_IN_A_BRIEF` lists an active change [x] and Next is a `/opsx:propose` → add "(if [x] is [change] under another name, run /arch:finalize first)".
- `CHANGES_NOT_IN_A_BRIEF` lists changes → one `Not from a brief: [N], [M] of them name a brief` line, then one line per `[change] names [brief]` entry (active ones marked `(active)`), asking "renamed during propose, or proposed from a superseded brief? /arch:finalize corrects the brief's Changes line". The changes on its `others:` line get no line and no question, and no proposal of theirs is read.
- The `STAGES` header ends `— no openspec/ directory here` → the block is one line: "OpenSpec is not set up — run `openspec init`, then `/arch:finalize` adds the arch config."

### Step 7 — Path to /arch:finalize
Calculate what is needed:

```
PATH TO FINALIZE
  Required: [N] blocking nodes must reach `ready`
  Remaining: [N] nodes still at raw-idea or explored
  Estimated sessions needed: [rough count based on current depth]
  Briefs: [BRIEFS_OUTDATED count, if briefs exist] outdated → /arch:finalize supersedes, follows up or amends them
```

---

## Status variants

**`/arch:status blocking`**
Show only blocking nodes with full detail — current maturity, open questions, what they're blocking.

**`/arch:status ready`**
Show only nodes at `ready` maturity. Confirm they meet the criteria for /arch:finalize input.

---

## Rules
- This skill is read-only — do not modify any files
- Do not suggest merges or splits — that is /arch:map's job
- A bare number from the user (08, 008) can mean a stage or a task ID. When both exist, ask which one
- Do not suggest decisions — that is /arch:decide's job
- Be direct about what is blocking — do not soften blockers
- If `FINALIZE_GATE` is open — say so clearly and suggest /arch:finalize, unless nothing is left to brief (then the Step 6 `Next` command)
- `/arch:finalize` and `/arch:new` start only when the user types them. Tell the user to type the command. Do not offer to run it and do not call it with the Skill tool. Never write feature briefs, todo-list rows or brief header lines outside a finalize run
