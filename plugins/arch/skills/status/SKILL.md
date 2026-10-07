---
name: status
description: Read-only progress report for an architector session in .arch/ — node maturity counts, blocking nodes, open questions, map freshness and what remains before /arch:finalize. Use when the user asks where the architecture work stands or what blocks finalization.
argument-hint: "[blocking|ready]"
disallowed-tools: [Write, Edit, NotebookEdit]
allowed-tools: Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/arch.py summary)
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

The live nodes are the entries in `index.json` → `nodes`; open node files through their `file` paths. `ideas/*.md` also matches `*.archived.md` (merged or split nodes) — never treat those as live nodes.

**If `.arch/index.json` does not exist** — stop:
> "No architecture session found. Run `/arch:new` first."

## Current State
Generated from `.arch/` by the plugin's state script when this skill started:

!`python3 ${CLAUDE_PLUGIN_ROOT}/scripts/arch.py summary 2>&1 || echo STATE_SCRIPT_FAILED`

- `NO_ARCH_SESSION` → stop: "No architecture session found. Run `/arch:new` first."
- `STATE_SCRIPT_FAILED` → stop and show the user the error above it. architector requires `python3` 3.8+ on PATH.
- `INDEX_INVALID` → stop and show the user the error: `.arch/index.json` must be repaired before architector can continue.
- Otherwise take counts, stage, finalize gate, map and brief freshness, last node worked on and PROBLEMS from this block instead of recomputing them. Still read node files for their content. Mention any PROBLEMS to the user.

---

## Process

### Step 1 — Load State
Take counts, the finalize gate and map freshness from Current State; read the node files listed in `index.json` for open questions and context.

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

READY FOR /arch:finalize?
  ❌ No — [FINALIZE_GATE reasons: blocking nodes not ready, PROBLEMS]

SUGGESTED NEXT ACTION
  → /arch:explore tech-stack   (highest priority — unblocks 3 nodes)
```

### Step 3 — Map Freshness
Use `LAST_MAP` from Current State — it names the nodes changed since the last map run. For [N], count the `sessions` entries after that run.

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

### Step 6 — Path to /arch:finalize
Calculate what is needed:

```
PATH TO FINALIZE
  Required: [N] blocking nodes must reach `ready`
  Remaining: [N] nodes still at raw-idea or explored
  Estimated sessions needed: [rough count based on current depth]
  Briefs: [BRIEFS_OUTDATED count, if briefs exist] outdated → /arch:finalize supersedes or follows them up
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
- Do not suggest decisions — that is /arch:decide's job
- Be direct about what is blocking — do not soften blockers
- If `FINALIZE_GATE` is open — say so clearly and suggest /arch:finalize
