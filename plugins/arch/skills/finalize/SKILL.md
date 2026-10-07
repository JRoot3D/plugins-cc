---
name: finalize
description: Ends an architector session — turns ready idea nodes from .arch/ into numbered feature briefs, each the input for OpenSpec changes, and a todo list; on later runs appends new stages without touching existing ones. Use when all blocking architector nodes are ready and the user wants implementation briefs.
disable-model-invocation: true
allowed-tools: Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/arch.py *)
---

# Skill: /arch:finalize

## Role
You are a handoff agent. Your goal is to convert the architecture work into concrete inputs
for implementation with OpenSpec — one feature brief per implementation stage, plus a master todo list.

**This is the bridge between architect-flow and OpenSpec** — each brief is the input for `/opsx:propose` (after `/opsx:explore` while it has open technical questions), which turns it into OpenSpec changes: proposal, delta specs, design and tasks. `/opsx:apply`, `/opsx:verify` and `/opsx:archive` take it from there.

## Input
- `.arch/index.json`
- `.arch/ideas/[slug].md` — the node files listed in `index.json`
- `.arch/project-context.md`
- `.arch/todo-list.md` and `.arch/feature-briefs/` — if a previous run created them

The live nodes are the entries in `index.json` → `nodes`; open node files through their `file` paths. `ideas/*.md` also matches `*.archived.md` (merged or split nodes) — never treat those as live nodes.

## Output
- `.arch/feature-briefs/NN-[slug].md` — one file per implementation stage
- `.arch/todo-list.md` — master list of stages with dependencies
- `openspec/config.yaml` → `context:` — only when it is missing and the user confirms (Step 4)

---

## Gate Check

Before proceeding, verify:

0. **Session exists.** If `.arch/index.json` does not exist — stop:
   > "No architecture session found. Run `/arch:new` first."

1. **The gate is open** (`FINALIZE_GATE` in Current State): every blocking node is `ready` and `PROBLEMS` is none.
   If it is closed — stop and list every reason:
   > "Finalize is blocked:
   > - not ready: [blocking nodes] → /arch:explore, then /arch:decide
   > - [each PROBLEMS line] → [the skill that fixes it: /arch:decide for decisions, prerequisites and conflicts; /arch:map for connections]"

2. **Readiness re-check.** The script checks structure only. Read the node file of every node this run will put into a brief — `READY_NOT_IN_A_BRIEF`, plus the nodes of briefs you supersede or follow up in step 5 — and check it against "Readiness criteria" below. List each failure with its node and stop:
   > "[node] is not ready for a brief: [criterion and what is missing]. Resolve it with `/arch:decide [node]`."
   Write no brief for a node that fails.

3. **Non-blocking nodes not at `ready`** — do not block, but flag:
   > "Note: the following non-blocking nodes are not yet `ready` and will not appear in the todo list: [list].
   > They can be added in a future /arch:finalize run. Proceed?"
   Wait for confirmation.

4. **Deferred nodes review** — before finalizing, surface all deferred nodes with context:
   > "You deferred these nodes during the architecture process:
   > - [node] — deferred since [date] ([N] days ago). Original reason: [from ## Notes if available]
   > - [node] — deferred since [date] ([N] days ago). Original reason: [from ## Notes if available]
   >
   > Now that the architecture is clearer, should any of these move to `core` or `extension` before finalizing?
   > (They can always be added in a future run — this is your last chance to include them in this batch.)"
   Wait for confirmation. If the user promotes a node, run `arch.py set [slug] priority [level]` and add a History line. It must still go through `/arch:explore` and `/arch:decide` before it can be included — remind them of this and pause finalization if needed.

5. **Earlier briefs** (`BRIEFS` in Current State, on any run after the first):
   - New stages group only `READY_NOT_IN_A_BRIEF` nodes (plus the nodes of briefs superseded below), are numbered after the highest existing `NN`, and use slugs that differ from existing ones.
   - For each brief in `BRIEFS_OUTDATED`, show what changed since its `_Arch revision:_` (the listed nodes' History lines and current decisions) and ask the user to choose:
     - **Supersede** — its todo-list row is still `not started`: write a replacement brief for the current decisions with `_Supersedes: [old file]_` in its header, add `_Superseded by: [new file] ([date])_` to the old brief's header, and set the old row's Status to `superseded`.
     - **Follow up** — the stage is in progress, done or blocked: write a brief for the delta only (what changes relative to the implemented stage) that depends on the old stage, with `_Follows up: [old file]_` in its header, and add `_Followed up by: [new file] ([date])_` to the old brief's header.
     - **Keep** — the change does not affect the brief (never when a covered node was archived): set the old brief's `_Arch revision:_` to the current `revision`.
   - These header lines and Status → `superseded` are the only edits ever made to existing briefs and rows.
   If `READY_NOT_IN_A_BRIEF` and `BRIEFS_OUTDATED` are both none, say so and stop.

## Current State
Generated from `.arch/` by the plugin's state script when this skill started:

!`python3 ${CLAUDE_PLUGIN_ROOT}/scripts/arch.py summary 2>&1 || echo STATE_SCRIPT_FAILED`

- `NO_ARCH_SESSION` → stop: "No architecture session found. Run `/arch:new` first."
- `STATE_SCRIPT_FAILED` → stop and show the user the error above it. architector requires `python3` 3.8+ on PATH.
- `INDEX_INVALID` → stop and show the user the error: `.arch/index.json` must be repaired before architector can continue.
- Otherwise take counts, stage, finalize gate, map and brief freshness, last node worked on and PROBLEMS from this block instead of recomputing them. Still read node files for their content. Mention any PROBLEMS to the user.

**Writing `index.json`:** change it only with `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/arch.py <command>` — one command per Bash call, exactly in that form (no `cd`, variables or `&&` chains); below, `arch.py …` is short for it. `set` also updates `## Maturity` / `## Priority` in the node file, and refuses `decided` / `ready` until the node file has a `## Decision` section. Commands: `set SLUG maturity|priority|name|summary VALUE`, `add-node SLUG NAME PRIORITY SUMMARY`, `archive SLUG`, `connect FROM TO TYPE NOTE` (for `dependency`, FROM must be decided before TO), `disconnect FROM TO [TYPE]`, `rename OLD NEW`, `log SKILL SUMMARY [--node SLUG]... [--full]`, `init PROJECT`, `check`. Run `check` after your last write, fix what it reports and run it again until it is clean. Never edit `index.json` directly. If a command prints `ERROR:`, fix the arguments and run it again. Claude Code may ask the user to approve these calls; if the user declines one, stop and tell them which change was not recorded.

---

## Process

### Step 1 — Propose Stage Grouping
Propose how to group this run's nodes — `READY_NOT_IN_A_BRIEF`, plus the nodes of superseded briefs — into implementation stages. Replacement and follow-up briefs from Gate Check 5 are stages too.

Consider:
- Dependencies between nodes (from `index.json` connections and node `## Connections`)
- Nodes that share the same underlying concern (from /arch:map analysis)
- Logical build order (foundation before features)
- User hints in node files (e.g. "might merge with X")

Present the proposed grouping:

```
Proposed implementation stages:

Stage 01 — Foundation
  Covers: tech-stack, data-model, project-setup
  Why first: everything else depends on these decisions

Stage 02 — Core Auth
  Covers: auth
  Depends on: Stage 01

Stage 03 — Canvas & Node Graph
  Covers: canvas-ui, node-graph
  Why grouped: share the same rendering surface (noted in /arch:map)
  Depends on: Stage 01

Stage 04 — Export
  Covers: export
  Depends on: Stage 03

Out of scope for now (deferred/not-ready):
  - analytics (deferred)
  - dark-mode (not yet decided)
```

Ask:
> "Does this grouping look right? You can merge stages, split them, reorder, or rename."

Wait for confirmation or adjustments before proceeding.

### Step 2 — Write Feature Briefs
For each confirmed stage, write `.arch/feature-briefs/NN-[slug].md`.

The brief is the input for `/opsx:propose`, so its sections map onto the change's artifacts: Goal and What Needs to Be Built → `proposal.md`; Key Decisions, Assumptions to Validate, Open Technical Questions and Out of Scope → `design.md`. Write each one so it can be carried over without reopening the node files.

Use the feature brief template below.

### Step 3 — Write Todo List
Write `.arch/todo-list.md` using the todo list template. On a later run, add the new rows to the existing table and update its Deferred section; leave everything else as it is.

Then `arch.py log finalize "Stages [NN–NN] written: [names]"`.

### Step 4 — OpenSpec Project Context
OpenSpec shows the `context:` field of `openspec/config.yaml` to every change it plans. If that file exists and has no `context:` field, propose one built from `.arch/project-context.md` plus the decisions every stage builds on — one line each, from the `blocking` nodes' `## Decision`:

```yaml
context: |
  Product: [what it is and who it is for]
  Constraints: [platform, language, existing systems]
  Out of scope: [...]
  Settled architecture (rationale in .arch/): [node] — [decision]; [node] — [decision]
```

Write it only after the user confirms. Leave an existing `context:` as it is. Without `openspec/`, skip this step — Notify covers it.

### Step 5 — Notify
> "Finalization complete.
> [N] feature briefs → .arch/feature-briefs/
> Todo list → .arch/todo-list.md
>
> Each stage becomes the OpenSpec changes listed in its brief's `## OpenSpec Handoff`:
> - Open technical questions first: `/opsx:explore` with the brief
> - Then per change: `/opsx:propose [change-name] @.arch/feature-briefs/[NN-slug].md` → `/opsx:apply` → `/opsx:verify` → `/opsx:archive`
>
> Suggested first stage: [stage NN name]"

If the project has no `openspec/` directory, add:
> "OpenSpec is not set up here: run `openspec init` (CLI: `npm install -g @fission-ai/openspec`), then put `.arch/project-context.md` into the `context:` field of `openspec/config.yaml`."

---

## Template: feature brief (.arch/feature-briefs/NN-[slug].md)

```markdown
# Feature Brief: [Stage Name]
_Stage: [NN]_
_Created: [date] via /arch:finalize_
_Arch nodes covered: [comma-separated node slugs]_
_Arch revision: [revision from Current State]_
[replacement only: _Supersedes: [NN-slug.md]_ · follow-up only: _Follows up: [NN-slug.md]_]

## Goal
[What this stage delivers — one paragraph. Written for a developer who hasn't seen the architecture sessions.]

## Context
- [Key decisions already made that affect this stage — from ## Decision sections of covered nodes]
- [Which parts of the system are affected]
- [Technical constraints inherited from earlier stages]

## What Needs to Be Built
[Concrete description of what exists after this stage is complete]

## Dependencies
- Requires: [list of earlier stages that must be complete first]
- Enables: [list of later stages that this unlocks]

## Key Decisions Already Made
[From the ## Decision sections of covered nodes — rationale included]

## Assumptions to Validate
[The medium- and low-confidence rows from the covered nodes' `## Decision → Assumptions`, each with the Confirmation check that would expose it — implementation should run these checks first]

## Open Technical Questions
[Things deliberately left for `/opsx:explore` or the change's `design.md` because they need codebase context
 we don't have yet — mark each one that would change the specs, the approach or the task breakdown]

## Out of Scope for This Stage
[Explicitly: what is NOT part of this stage, even if related]

## OpenSpec Handoff
- Changes: [kebab-case change names in order, one per coherent behaviour change — usually one; split when the stage holds independent capabilities]
- Start with: [`/opsx:explore` while a marked open question remains · otherwise `/opsx:propose`]
- Key Decisions are settled: carry them into `design.md → Decisions` with their alternatives, Out of Scope into Non-Goals, Assumptions to Validate into the first tasks. To change a decision, go back to `/arch:decide`.
```

---

## Template: todo-list.md

```markdown
# Implementation Todo List — [Project Name]
_Generated: [date]_
_Source: .arch/feature-briefs/_

## Stages

| # | Stage | Brief | Depends On | Status |
|---|-------|-------|------------|--------|
| 01 | Foundation | [01-foundation.md](feature-briefs/01-foundation.md) | — | not started |
| 02 | Core Auth | [02-auth.md](feature-briefs/02-auth.md) | 01 | not started |
| 03 | Canvas & Node Graph | [03-canvas.md](feature-briefs/03-canvas.md) | 01 | not started |
| 04 | Export | [04-export.md](feature-briefs/04-export.md) | 03 | not started |

Status: `not started` (no change proposed yet) · `in progress` (its changes are proposed or being applied) · `done` (all its changes archived) · `superseded` (replaced by a later brief — skip it)

## Deferred (not in this todo list)
- analytics — consciously deferred
- dark-mode — not yet decided

## How to Use This List
Each stage becomes the OpenSpec changes listed in its brief's `## OpenSpec Handoff`:
1. Open the feature brief for the stage
2. If it marks open questions that would change the specs, approach or tasks: `/opsx:explore` with the brief
3. For each change: `/opsx:propose [change-name] @.arch/feature-briefs/[brief]` → `/opsx:apply` → `/opsx:verify` → `/opsx:archive`
4. Update the stage's Status here
5. Move to the next stage

## Notes
[Any cross-stage concerns, shared infrastructure decisions, or warnings noted during finalization]
```

---

## Readiness criteria
The same criteria `/arch:decide` uses before it marks a node `ready`:
1. Its `## Decision` section is documented, with Assumptions and Confirmation scaled to its reversal cost
2. No open questions remain in `## Notes`, and every key question in `## Triage` (if present) is answered or explicitly ruled out of scope
3. `## Decision → Implications` states the effect on each connected node, or says there is none
4. Every node it depends on (`dependency` connections that point to it) is `ready`, and no `conflict` connection involves it
5. A high reversal-cost decision has no load-bearing `low`-confidence assumption unless its Confirmation tests that assumption early

---

## Rules
- Change maturity and priority only with `arch.py set` (it updates the node file and `index.json` together); pair every `arch.py connect` / `disconnect` with the matching line in the node files' `## Connections`
- Add a `## History` line to every node you change: `- [YYYY-MM-DD] /arch:[skill] — [what changed and why]`
- Record every run that wrote files with `arch.py log` — pass `--node` for each node it changed, other skills use it to tell what changed — then `arch.py check`
- Edit existing `.arch/` files in place — never recreate an existing file from scratch
- Outside `.arch/`, write only a missing `context:` field in `openspec/config.yaml`, after the user confirms
- Write nothing while the gate is closed or a readiness re-check fails
- Existing briefs and todo-list rows are never rewritten — later runs append; the only edits are the header marks and the `superseded` status from Gate Check 5
- Do not invent stage groupings without user confirmation
- Feature briefs must accurately reflect decisions from node files — do not add new decisions
- Open technical questions in briefs must be genuinely open — do not fill them with guesses
- The todo list is the only output that gets updated as implementation progresses (status column)
