---
name: finalize
description: Ends an architector session — turns ready idea nodes from .arch/ into numbered feature briefs, each the input for OpenSpec changes, and a todo list; on later runs appends new stages without touching existing ones.
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" *)
  - PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" *)
---

# Skill: /arch:finalize

## Role
You are a handoff agent. Your goal is to convert the architecture work into concrete inputs
for implementation with OpenSpec — one feature brief per implementation stage, plus a master todo list.

**This is the bridge between architect-flow and OpenSpec** — each brief is the input for `/opsx:propose` (after `/opsx:explore` while it has open technical questions), which turns it into OpenSpec changes: proposal, delta specs, design and tasks. `/opsx:apply` and `/opsx:archive` take it from there; the arch lines in `openspec/config.yaml` (Step 4) keep the brief in view while they do.

## Input
- `.arch/index.json`
- `.arch/ideas/[slug].md` — the node files listed in `index.json`
- `.arch/project-context.md`
- `.arch/todo-list.md` and `.arch/feature-briefs/` — if a previous run created them
- `openspec/` — if present: `config.yaml` (or `config.yml`), the capability ids under `specs/`, the change names under `changes/` and `changes/archive/`, and the `proposal.md` of a change in `CHANGES_NOT_IN_A_BRIEF`

The live nodes are the entries in `index.json` → `nodes`; open node files through their `file` paths. `ideas/*.md` also matches `*.archived.md` (merged or split nodes) — never treat those as live nodes.

## Output
- `.arch/feature-briefs/NN-[slug].md` — one file per implementation stage
- `.arch/todo-list.md` — master list of stages with dependencies
- `openspec/config.yaml` (or legacy `openspec/config.yml` when `config.yaml` is absent) → `context:`, `rules:` and `operations.apply.guidance` — only after the user confirms (Step 4)

---

## Gate Check

Before proceeding, verify:

1. **The gate is open** (`FINALIZE_GATE` in Current State): every blocking node is `ready` and `PROBLEMS` is none.
   If it is closed — run **Changes line corrections** (check 5) first, then stop and list every reason:
   > "Finalize is blocked:
   > - not ready: [blocking nodes] → /arch:explore, then /arch:decide
   > - [each PROBLEMS line] → [the skill that fixes it: /arch:decide for decisions, prerequisites and conflicts; /arch:map for connections]"

   If it is open but `READY_NOT_IN_A_BRIEF` and `BRIEFS_OUTDATED` are both none, say there is nothing new to brief. Skip the other checks (except **Changes line corrections** in check 5) and Steps 1–3, run Step 4, give only the OpenSpec lines of Step 5, and stop. This is how a project that set up OpenSpec after finalizing gets the arch config.

2. **Readiness re-check.** The script checks structure only. Read the node file of every node this run will put into a brief — `READY_NOT_IN_A_BRIEF`, plus the nodes of briefs you supersede or follow up in check 5 — and check it against "Readiness criteria" below. List each failure with its node and stop:
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
   Wait for confirmation. If the user promotes a node, run `arch.mjs set [slug] priority [level]` and add a History line. It must still go through `/arch:explore` and `/arch:decide` before it can be included — remind them of this and pause finalization if needed.

5. **Earlier briefs** (`BRIEFS` in Current State, on any run after the first):
   - New stages group only `READY_NOT_IN_A_BRIEF` nodes (plus the nodes of briefs superseded below), are numbered after the highest existing `NN`, and use slugs that differ from existing ones.
   - **Changes line corrections** — handle these before the choices below; they touch no decisions, so they also run while the gate is closed. After the user confirms a correction, rewrite that brief's `- Changes:` line, then run `arch.mjs summary` again and use its `STAGES` below.
     - For each change in `CHANGES_NOT_IN_A_BRIEF`, read its `proposal.md` (`openspec/changes/[change]/`, or `openspec/changes/archive/[date]-[change]/` when archived). If it names a brief, show that brief's `- Changes:` line and offer to put the change's name on it: ask whether it is one of the listed changes proposed under another name, or whether listed changes were merged, split or dropped. If the brief it names is marked `_Superseded by:_`, use the brief that mark points to instead, and tell the user to revise the change from it (`/opsx:update [change] @.arch/feature-briefs/[that brief]`) unless it already has tasks done.
     - For each `STAGES` line where a `not proposed` change sits next to a sibling that is archived or has tasks done, ask whether that change is still planned, merged into another change, or dropped; remove it from `- Changes:` only after the user confirms it was merged or dropped.
   - For each brief in `BRIEFS_OUTDATED`, show what changed since its `_Arch revision:_` (the listed nodes' History lines and current decisions) and its `STAGES` state, and ask the user to choose between the options that state allows:

     | `STAGES` state | Options |
     |---|---|
     | `not started` | Supersede or Keep |
     | `planned` | Supersede or Keep — the replacement keeps the old brief's change names; tell the user to revise each proposed change with `/opsx:update [change] @.arch/feature-briefs/[new brief]` (its proposal must name the new brief) before `/opsx:apply` — a `proposed (no tasks yet)` change is continued with `/opsx:propose [change] @.arch/feature-briefs/[new brief]` instead. `/opsx:update` revises only the artifacts that exist: a change without `design.md` first gets one with `/opsx:continue [change]` (expanded profile) or by having the agent follow `openspec instructions design --change [change]`, then `/opsx:update` |
     | `in progress`, `done` | Follow up or Keep |
     | `unknown`, or any stage under a `STAGES … — no openspec/ directory here` header | ask the user how far the stage got — nothing proposed, proposed but not applied, or applied (a pre-3.1 todo-list Status cell is the default answer) — then use the matching row above |

     - **Supersede**: write a replacement brief for the current decisions with `_Supersedes: [old file]_` in its header, add `_Superseded by: [new file] ([date])_` to the old brief's header, and mark the old todo-list row superseded (Step 3).
     - **Follow up**: write a brief for the delta only (what changes relative to the implemented stage) that depends on the old stage, with `_Follows up: [old file]_` in its header; in the old brief's header, add `_Followed up by: [new file] ([date])_`, set `_Arch revision:_` to the current `revision`, and remove archived slugs from `_Arch nodes covered:_` (also in the briefs it follows up). A change of the old stage that already has tasks done finishes on the old brief's decisions. For each one with no task done in `STAGES` (`not proposed`, `proposed (no tasks yet)`, `0/M tasks`), the follow-up brief's `## OpenSpec Handoff` says it takes the follow-up brief too: not proposed or `proposed (no tasks yet)` → `/opsx:propose [change] @.arch/feature-briefs/[old brief] @.arch/feature-briefs/[follow-up brief]` (it continues an existing change); `0/M tasks` → `/opsx:update [change] @.arch/feature-briefs/[follow-up brief]` before `/opsx:apply`.
     - **Keep** — the change does not affect the brief (never when a covered node was archived): set the old brief's `_Arch revision:_` to the current `revision`.
   - These are the only edits ever made to existing briefs and todo-list rows: the header marks above (`_Superseded by:_`, `_Followed up by:_`, `_Arch revision:_` bumps, archived-slug removal from `_Arch nodes covered:_`), a `- Changes:` line corrected under **Changes line corrections**, the superseded mark on a todo-list row, and the one-time 3.1 legend update of a pre-3.1 todo list (Step 3).

## Current State
Generated from `.arch/` by the plugin's state script when this skill started:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" summary`

- `NO_ARCH_SESSION` → stop: "No architecture session found. Run `/arch:new` first."
- `INDEX_INVALID` → stop and show the user the error: `.arch/index.json` must be repaired before architector can continue.
- Otherwise take counts, stage, finalize gate, map and brief freshness, last node worked on and PROBLEMS from this block instead of recomputing them. Still read node files for their content. Mention any PROBLEMS to the user.

**Writing `index.json`:** change it only with `node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" <command>` — one command per Bash or PowerShell call, exactly in that form (no `cd`, variables or `&&` chains); below, `arch.mjs …` is short for it. `set` also updates `## Maturity` / `## Priority` in the node file, and refuses `decided` / `ready` until the node file has a `## Decision` section. Commands: `set SLUG maturity|priority|name|summary VALUE`, `add-node SLUG NAME PRIORITY SUMMARY`, `archive SLUG`, `connect FROM TO TYPE NOTE` (for `dependency`, FROM must be decided before TO), `disconnect FROM TO [TYPE]`, `rename OLD NEW`, `log SKILL SUMMARY [--node SLUG]... [--full]`, `init PROJECT`, `check`. Run `check` after your last write: fix the bookkeeping it reports (a copy that differs, a missing `## Connections` line, an unknown slug) and run it again until only problems that need a decision remain — an unresolved conflict, a `ready` node that depends on a less mature one, a dependency cycle; never change maturity, priority or connections to clear those, name them to the user. Never edit `index.json` directly. If a command prints `ERROR:`, fix the arguments and run it again. Claude Code may ask the user to approve these calls; if the user declines one, stop and tell them which change was not recorded.

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

Before writing:
- If `openspec/specs/` exists, list the existing capability ids: every directory under `openspec/specs/` that holds a `spec.md`; the id is its path relative to `specs/` (e.g. `identity/user-auth`). The Handoff's Capabilities line marks these as Modified.
- Change names in a new brief must not appear on another non-superseded brief's `- Changes:` line, as a directory under `openspec/changes/`, or as `[date]-[name]` under `openspec/changes/archive/` — except in the replacement for a `planned` stage (Gate Check 5), which keeps the old names.

Use the feature brief template below.

### Step 3 — Write Todo List
Write `.arch/todo-list.md` using the todo list template. On a later run, add the new rows to the existing table, append ` — superseded by [NN]` to the Stage cell of each row superseded in Gate Check 5, and update its Deferred section; leave everything else as it is.

A todo list written before 3.1 has a Status column: keep the column, put `—` in it for new rows and leave its existing cells as they are. If it still has the old `Status:` legend, replace that legend with the template's progress line and its "Update the stage's Status here" step with the template's `/arch:status` step — a one-time update.

Then `arch.mjs log finalize "Stages [NN–NN] written: [names]"`.

### Step 4 — OpenSpec Config
The config is `openspec/config.yaml`, or legacy `openspec/config.yml` when `config.yaml` is absent. Without `openspec/`, or when it has neither file, skip this step — Notify covers both.

If the config has a `store:` line (a store-backed root — `STAGES` shows `store-backed root?`), write nothing: tell the user OpenSpec reads the store's config (`openspec context` shows which) and show the `Settled architecture` line and the `rules:`/`operations:` block below to add there.

Show the user the exact edits and write them only after the user confirms; each part below can be declined on its own. Keep every other key and line of the config as it is.

**`context:`** — OpenSpec injects it into every artifact, apply and archive.
- Missing: propose the full block, built from `.arch/project-context.md` plus the decisions every stage builds on — all on the one `Settled architecture` line, `;`-separated, from the `blocking` nodes' `## Decision`:

  ```yaml
  context: |
    Product: [what it is and who it is for]
    Constraints: [platform, language, existing systems]
    Out of scope: [...]
    Settled architecture (rationale in .arch/): [node] — [decision]; [node] — [decision]
  ```
- Present: arch owns only the line that starts `Settled architecture (rationale in .arch/):`. Propose adding it when it is absent; propose replacing it only when `BRIEFS_OUTDATED` in Current State (as of the start of this run) names a blocking node, or when the current blocking nodes differ from the nodes the line names. Leave all other lines. When you update it and a stage covering a changed node is `planned` in `STAGES`, its change is revised with `/opsx:update` (Gate Check 5); when it is `in progress`, tell the user the active change now sees the new decision in `context:` while its `design.md` keeps the old one — it finishes on `design.md`'s decision, and the new one arrives with the follow-up brief's change.

**`rules:` and `operations:`** — only when the config's `schema:` is `spec-driven`, because the rule keys are its artifact ids; for another schema, skip them and tell the user why. Rules reach the writing of each artifact (`/opsx:propose`, `/opsx:update`, `/opsx:continue`) but never `/opsx:apply`; besides `context:`, `operations.apply.guidance` is the only field arch writes that reaches `/opsx:apply`. `design.md` is optional in `spec-driven` — the `design` rule makes it required for a change made from a brief. Arch owns every rule and guidance line that contains `arch brief`: add these verbatim, as quoted YAML strings under their keys; replace an arch-owned line whose text differs; never add one twice; keep all other entries.

```yaml
rules:
  proposal:
    - "From arch briefs (.arch/feature-briefs/): name every attached brief under Impact; the briefs' OpenSpec Handoff capabilities are a starting point — one that exists in openspec/specs/ by now is Modified"
  design:
    - "If proposal.md names arch briefs, design.md is required: name them in Context, carry their Key Decisions with their alternatives into Decisions (a later brief's decision wins; a brief marked _Superseded by:_ is replaced by the brief it points to) and their Out of Scope into Non-Goals. Never contradict a Key Decision — if one cannot hold, stop and tell the user to run /arch:decide [node]"
  tasks:
    - "If design.md names an arch brief: its Assumptions to Validate become the first tasks"
operations:
  apply:
    guidance:
      - "If design.md names an arch brief: when that brief is marked _Superseded by:_, stop and tell the user to run /opsx:update [change] @[the brief it points to] first; when a task cannot follow one of its Key Decisions, stop and tell the user to run /arch:decide [node] instead of implementing around it"
```

### Step 5 — Notify
> "Finalization complete.
> [N] feature briefs → .arch/feature-briefs/
> Todo list → .arch/todo-list.md
> OpenSpec config → [what Step 4 wrote, or what was declined or skipped and why]
>
> Each stage becomes the OpenSpec changes listed in its brief's `## OpenSpec Handoff`:
> - Open technical questions first: `/opsx:explore` with the brief
> - Then per change: `/opsx:propose [change-name] @.arch/feature-briefs/[NN-slug].md` — the change name exactly as on the brief's `- Changes:` line, which is how `/arch:status` tracks it → `/opsx:apply` → `/opsx:archive` (`/opsx:verify` too if your OpenSpec profile has it — `openspec config profile`)
> - [Each `planned` stage superseded this run: `/opsx:update [change] @.arch/feature-briefs/[new brief]` before `/opsx:apply`]
>
> `/arch:status` tracks each stage from `openspec/changes/` — nothing to update by hand; `/arch:audit openspec` checks the changes against the briefs.
>
> Suggested first stage: [stage NN name]"

If the project has no `openspec/` directory, add:
> "OpenSpec is not set up here: run `openspec init` (CLI: `npm install -g @fission-ai/openspec`), then `/arch:finalize` again — it adds the arch context, rules and apply guidance to `openspec/config.yaml`."

If `openspec/` exists without `config.yaml` or `config.yml`, add:
> "OpenSpec has no config here: create `openspec/config.yaml` with `schema: spec-driven` (or run `openspec init`), then `/arch:finalize` again."

The OpenSpec lines — all that a run with nothing new to brief gives — are the `OpenSpec config` line, the `/arch:status` line and these two messages.

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
[From the ## Decision sections of covered nodes — rationale included, and each `Boundary:` line from Implications as part of its decision: the code reaches that choice only through the interface it names]

## Assumptions to Validate
[The medium- and low-confidence rows from the covered nodes' `## Decision → Assumptions`, each with the Confirmation check that would expose it — implementation should run these checks first]

## Open Technical Questions
[Things deliberately left for `/opsx:explore` or the change's `design.md` because they need codebase context
 we don't have yet — mark each one that would change the specs, the approach or the task breakdown]

## Out of Scope for This Stage
[Explicitly: what is NOT part of this stage, even if related]

## OpenSpec Handoff
- Changes: [kebab-case change names in order, comma-separated names only, no notes; not starting with a date (OpenSpec archives such names without a date prefix) — one per coherent behaviour change, usually one; split when the stage holds independent capabilities. /arch:status tracks them by these exact names]
- Start with: [`/opsx:explore` while a marked open question remains · otherwise `/opsx:propose [change] @[this brief]`]
- Capabilities: [per change — New: `capability-id` · Modified: `existing-id` (in openspec/specs/, or New in an earlier stage) · or `none — skip_specs: true` when it only sets up tooling, infrastructure or docs]
- Key Decisions are settled: carry them into `design.md → Decisions` with their alternatives, Out of Scope into Non-Goals, Assumptions to Validate into the first tasks. To change a decision, go back to `/arch:decide`.
```

---

## Template: todo-list.md

```markdown
# Implementation Todo List — [Project Name]
_Generated: [date]_
_Source: .arch/feature-briefs/_

## Stages

| # | Stage | Brief | Depends On |
|---|-------|-------|------------|
| 01 | Foundation | [01-foundation.md](feature-briefs/01-foundation.md) | — |
| 02 | Core Auth | [02-auth.md](feature-briefs/02-auth.md) | 01 |
| 03 | Canvas & Node Graph | [03-canvas.md](feature-briefs/03-canvas.md) | 01 |
| 04 | Export | [04-export.md](feature-briefs/04-export.md) | 03 |

Progress is read from OpenSpec — `/arch:status` shows each stage's state.

## Deferred (not in this todo list)
- analytics — consciously deferred
- dark-mode — not yet decided

## How to Use This List
Each stage becomes the OpenSpec changes listed in its brief's `## OpenSpec Handoff`:
1. Open the feature brief for the stage
2. If it marks open questions that would change the specs, approach or tasks: `/opsx:explore` with the brief
3. For each change: `/opsx:propose [change-name] @.arch/feature-briefs/[brief]` with the exact name from the brief's `- Changes:` line → `/opsx:apply` → `/opsx:archive` (`/opsx:verify` before archiving if your OpenSpec profile has it)
4. `/arch:status` shows where each stage is and the next command
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
5. A high reversal-cost decision has no load-bearing `low`-confidence assumption unless its Confirmation tests that assumption early or its Implications name a `Boundary:` that keeps the choice replaceable

---

## Rules
- Change maturity and priority only with `arch.mjs set` (it updates the node file and `index.json` together); pair every `arch.mjs connect` / `disconnect` with the matching line in the node files' `## Connections`
- Add a `## History` line to every node you change: `- [YYYY-MM-DD] /arch:[skill] — [what changed and why]`
- Record every run that wrote files with `arch.mjs log` — pass `--node` for each node it changed, other skills use it to tell what changed — then `arch.mjs check`
- Edit existing `.arch/` files in place — never recreate an existing file from scratch
- Outside `.arch/`, write only `context:`, `rules:` and `operations:` in `openspec/config.yaml` (or `config.yml`), after the user confirms
- Write nothing while the gate is closed (except Changes line corrections, recorded with `arch.mjs log finalize "Changes line corrected: [brief]"`) or a readiness re-check fails
- Existing briefs and todo-list rows are never rewritten — later runs append; the only edits are those listed in Gate Check 5
- Do not invent stage groupings without user confirmation
- Feature briefs must accurately reflect decisions from node files — do not add new decisions
- Open technical questions in briefs must be genuinely open — do not fill them with guesses
- Implementation progress is never recorded in `.arch/` — `arch.mjs summary` reads it from `openspec/changes/`
