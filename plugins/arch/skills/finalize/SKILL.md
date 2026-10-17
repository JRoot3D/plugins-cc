---
name: finalize
description: Ends an architector session — turns ready idea nodes from .arch/ into numbered feature briefs, each the input for OpenSpec changes, and a todo list; on later runs appends new stages without touching existing ones.
disable-model-invocation: true
argument-hint: "[revise NN]"
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" *)
  - PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" *)
---

# Skill: /arch:finalize

## Role
You are a handoff agent. Your goal is to convert the architecture work into concrete inputs
for implementation with OpenSpec — one feature brief per implementation stage, plus a master todo list.

**This is the bridge between architect-flow and OpenSpec** — each brief is the input for `/opsx:propose` (after `/opsx:explore` while it has open technical questions), which turns it into OpenSpec changes: proposal, delta specs, design and tasks. `/opsx:apply` and `/opsx:archive` take it from there; the arch lines in `openspec/config.yaml` (Step 4) keep the brief in view while they do.

## Invocation
```
/arch:finalize              ← brief the ready nodes, and handle outdated briefs
/arch:finalize revise NN    ← the plan moved scope or order of stage NN, and every decision holds
```
Arguments for this run: $ARGUMENTS

With `revise NN`, treat brief NN as listed in `BRIEFS_OUTDATED`, with the reason the user gives (a plan or scope change), and offer the options of its `STAGES` state (Gate Check 5). The user can also name briefs in the prompt for the same reason, also when `BRIEFS_OUTDATED` does not list them.

## Input
- `.arch/index.json`
- `.arch/ideas/[slug].md` — the node files listed in `index.json`
- `.arch/project-context.md`
- `.arch/todo-list.md` and `.arch/feature-briefs/` — if a previous run created them
- `openspec/` — if present: `config.yaml` (or `config.yml`), the capability ids under `specs/`, the change names under `changes/` and `changes/archive/`, and the `proposal.md` of a change on a `names` line under `CHANGES_NOT_IN_A_BRIEF`

The live nodes are the entries in `index.json` → `nodes`; open node files through their `file` paths. `ideas/*.md` also matches `*.archived.md` (merged or split nodes) — never treat those as live nodes.

## Output
- `.arch/feature-briefs/NN-[slug].md` — one file per implementation stage
- `.arch/todo-list.md` — master list of stages with dependencies
- `openspec/config.yaml` (or legacy `openspec/config.yml` when `config.yaml` is absent) → `context:`, `rules:` and `operations.apply.guidance` — only after the user confirms (Step 4)

---

## Gate Check

Before proceeding, verify:

1. **The gate is open** (`FINALIZE_GATE` in Current State): every blocking node is `ready` and `PROBLEMS` is none.
   If it is closed — run **Changes line corrections** (check 5) and an **Amend** of a brief the user named (`revise NN`) first — the Amend only after the readiness re-check (check 2) passes for every node the brief covers — then stop and list every reason:
   > "Finalize is blocked:
   > - not ready: [blocking nodes] → /arch:explore, then /arch:decide
   > - [each PROBLEMS line] → [the skill that fixes it: /arch:decide for decisions, prerequisites and conflicts; /arch:map for connections]"

   If it is open but `READY_NOT_IN_A_BRIEF` and `BRIEFS_OUTDATED` are both none and the user named no brief, say there is nothing new to brief. Skip the other checks (except **Changes line corrections** in check 5) and Steps 1–3, run Step 4, give only the OpenSpec lines of Step 5, and stop. This is how a project that set up OpenSpec after finalizing gets the arch config.

2. **Readiness re-check.** The script checks structure only. Read the node file of every node this run will put into a brief — `READY_NOT_IN_A_BRIEF`, plus the nodes of briefs you supersede, follow up or amend in check 5 — and check it against "Readiness criteria" below. List each failure with its node and stop:
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
     - `CHANGES_NOT_IN_A_BRIEF` already read the proposals: act only on its `[change] names [brief]` lines, never on the `others:` line. For each, read that change's `proposal.md` (`openspec/changes/[change]/`, or `openspec/changes/archive/[date]-[change]/` when archived), show the brief's `- Changes:` line and ask: is the change one of the listed changes proposed under another name, or were listed changes merged, split or dropped? Then correct the `- Changes:` line. If it is none of these (the change only refers to the brief), add its name to the brief's `_Related changes:_` header line (create the line after the last header line when it is missing) after the user confirms, so it leaves the list. If the brief it names is marked `_Superseded by:_`, use the brief that mark points to instead, and tell the user to revise the change from it (`/opsx:update [change] @.arch/feature-briefs/[that brief]`) unless it already has tasks done.
     - **Capabilities line corrections** (also while the gate is closed): for each `STAGES` line that ends `— capability missing: [id]`, list the spec ids the stage's archived changes created (`openspec/changes/archive/[date]-[change]/specs/`) and ask which holds: the capability exists under another id → correct the brief's `- Capabilities:` line; its scope moved to other tasks → Follow up with the new changes (needs the open gate); it was dropped → remove the id from the line after the user confirms.
     - For each `STAGES` line where a `not proposed` change sits next to a sibling that is archived or has tasks done, ask whether that change is still planned, merged into another change, or dropped; remove it from `- Changes:` only after the user confirms it was merged or dropped.
   - For each brief in `BRIEFS_OUTDATED`, and each brief the user named (`revise NN`), show what changed since its `_Arch revision:_` and `_Arch context:_` (the listed nodes' History lines and current decisions, a superseded stage it requires, or the plan change the user named) and its `STAGES` state, and ask the user to choose between the options that state allows. Amend runs while the gate is closed too; Supersede and Follow up need the open gate — while it is closed, write nothing else for a named brief.

     | `STAGES` state | Options |
     |---|---|
     | `not started` | Amend, Supersede or Keep |
     | `planned` | Amend, Supersede or Keep — after an Amend, tell the user to revise each proposed change with `/opsx:update [change] @.arch/feature-briefs/[brief]` before `/opsx:apply`. The replacement keeps the old brief's change names; tell the user to revise each proposed change with `/opsx:update [change] @.arch/feature-briefs/[new brief]` (its proposal must name the new brief) before `/opsx:apply` — a `proposed (no tasks yet)` change is continued with `/opsx:propose [change] @.arch/feature-briefs/[new brief]` instead. `/opsx:update` revises only the artifacts that exist: a change without `design.md` first gets one with `/opsx:continue [change]` (expanded profile) or by having the agent follow `openspec instructions design --change [change]`, then `/opsx:update` |
     | `in progress`, `done` | Follow up or Keep |
     | `unknown`, or any stage under a `STAGES … — no openspec/ directory here` header | ask the user how far the stage got — nothing proposed, proposed but not applied, or applied (a pre-3.1 todo-list Status cell is the default answer) — then use the matching row above |

     - **Amend**: edit the brief's body in place so it matches the current node decisions and the plan's scope for the stage. It adds no decision. Set `_Arch revision:_` and `_Arch context:_` to the current revisions, and add one header line `_Amended: [date] — [one-line reason]_` (replace an existing one). Names on `- Changes:` change only under **Changes line corrections**.
     - **Supersede**: write a replacement brief for the current decisions with `_Supersedes: [old file]_` in its header, add `_Superseded by: [new file] ([date])_` to the old brief's header, and mark the old todo-list row superseded (Step 3). Then repoint: in the `- Requires:` line of every brief that is not superseded and in the Depends On cell of every todo-list row, replace the old stage number with the new one. Show each todo-list `## Notes` line that names the old stage with a proposed fix, and change it only after the user confirms.
     - **Follow up**: write a brief for the delta only (what changes relative to the implemented stage) that depends on the old stage, with `_Follows up: [old file]_` in its header; in the old brief's header, add `_Followed up by: [new file] ([date])_`, remove archived slugs from `_Arch nodes covered:_` (also in the briefs it follows up), and set `_Arch revision:_` to the current revisions of the nodes it still covers. A change of the old stage that already has tasks done finishes on the old brief's decisions. For each one with no task done in `STAGES` (`not proposed`, `proposed (no tasks yet)`, `0/M tasks`), the follow-up brief's `## OpenSpec Handoff` says it takes the follow-up brief too: not proposed or `proposed (no tasks yet)` → `/opsx:propose [change] @.arch/feature-briefs/[old brief] @.arch/feature-briefs/[follow-up brief]` (it continues an existing change); `0/M tasks` → `/opsx:update [change] @.arch/feature-briefs/[follow-up brief]` before `/opsx:apply`.
     - **Keep** — the change does not affect the brief (never when a covered node was archived): set the old brief's `_Arch revision:_` to the current revisions of its nodes.
     - Keep, Follow up and Amend also set `_Arch context:_` to the current revisions: an archived context slug becomes the node that replaced it, or is dropped. For a brief with a `requires [old] (superseded by [new])` reason, every option, Keep included, repoints that `- Requires:` entry and the todo-list row's Depends On cell to the new stage.
   - These are the only edits ever made to existing briefs and todo-list rows: the header marks above (`_Superseded by:_`, `_Followed up by:_`, `_Amended:_`, `_Arch revision:_` and `_Arch context:_` bumps, archived-slug removal from `_Arch nodes covered:_`, `_Related changes:_`), an Amend's body edits, a `- Changes:` or `- Capabilities:` line corrected under **Changes line corrections** or **Capabilities line corrections**, `- Requires:` and Depends On repoints to a superseding stage, the todo-list Notes fixes the user confirmed, the superseded mark on a todo-list row, and the one-time 3.1 legend update of a pre-3.1 todo list (Step 3). A new header line goes right after the last existing one, so it stays within the first 15 lines that `arch.mjs` reads.

## Current State
Generated from `.arch/` by the plugin's state script when this skill started:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" summary`

- `NO_ARCH_SESSION` → stop: "No architecture session found. Run `/arch:new` first."
- `INDEX_INVALID` → stop and show the user the error: `.arch/index.json` must be repaired before architector can continue.
- Otherwise take counts, stage, finalize gate, map and brief freshness, last node worked on, LOCKS and PROBLEMS from this block instead of recomputing them. Still read node files for their content. Mention any PROBLEMS to the user.

**Writing `index.json`:** change it only with `node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" <command>` — one command per Bash or PowerShell call, exactly in that form (no `cd`, variables or `&&` chains); below, `arch.mjs …` is short for it. `set` also updates `## Maturity` / `## Priority` in the node file, and refuses `decided` / `ready` until the node file has a `## Decision` section. Commands: `set SLUG maturity|priority|name|summary VALUE`, `add-node SLUG NAME PRIORITY SUMMARY`, `archive SLUG`, `connect FROM TO TYPE NOTE` (for `dependency`, FROM must be decided before TO), `disconnect FROM TO [TYPE]`, `rename OLD NEW`, `rename-node OLD NEW` (a live node's new slug: file, connections, revision and brief coverage move with it), `log SKILL SUMMARY [--node SLUG]... [--full]`, `init PROJECT`, `check`. Run `check` after your last write: fix the bookkeeping it reports in the nodes this run changed (a copy that differs, a missing `## Connections` line, an unknown slug) and run it again until only problems that need a decision remain — an unresolved conflict, a `ready` node that depends on a less mature one, a dependency cycle; never change maturity, priority or connections to clear those, name them to the user. Name bookkeeping problems in other nodes without fixing them: another session may be midway through a merge, a split or new nodes. Never edit `index.json` or `sessions.jsonl` directly. If a command prints `ERROR:`, fix the arguments and run it again. Claude Code may ask the user to approve these calls; if the user declines one, stop and tell them which change was not recorded.

**Shared board** (Current State has a `LOCKS shared via` block): other people change this board from their own clones, a node each. `.arch/` is a worktree of the board's own branch (named in that block): never commit it, put it on another branch or open a pull request for it yourself, whatever this project's rules say for code — claim and release pull and push it. As soon as you start working on a node, and before you write any of its files, `arch.mjs claim SLUG...` every node you will change — a new node's slug before you write its file, `#briefs` for feature briefs and the todo list, `#context` for `project-context.md`. Claim first pulls the board branch, so you work on what the others released. If claim says another person holds one, tell the user who and since when and leave that node alone; if a pull fails, show the user its error. `set`, `add-node` and `archive` refuse a node you do not hold. When the run is done — after your last `check`, or when it wrote nothing — `arch.mjs release`: it commits `.arch/` on the board branch, pulls, pushes and frees your locks; if it fails, show the user its error and that `/arch-release` retries it once the cause is fixed — your locks stay until it succeeds. Run `arch.mjs unlock KEY --force` only when the user says another person's lock is abandoned.

---

## Process

### Step 1 — Propose Stage Grouping
Propose how to group this run's nodes — `READY_NOT_IN_A_BRIEF`, plus the nodes of superseded briefs — into implementation stages. Replacement and follow-up briefs from Gate Check 5 are stages too.

Consider:
- Dependencies between nodes (from `index.json` connections and node `## Connections`)
- Nodes that share the same underlying concern (from /arch:map analysis)
- Logical build order (foundation before features)
- User hints in node files (e.g. "might merge with X")
- The task plans, when `project-context.md` has a `## Task plans` section: read the files it lists. For each task a proposed stage implements, every task it depends on is in the same stage, in a stage it requires (directly or through other stages), or done (an archived change). Each item of What Needs to Be Built is in the plan scope of a task the stage names. Name each violation in the proposal below, before the user confirms: a missing Requires, a cycle, or scope outside the task

Present the proposed grouping:

```
Proposed implementation stages:

stage 01 — Foundation
  Covers: tech-stack, data-model, project-setup
  Why first: everything else depends on these decisions

stage 02 — Core Auth
  Covers: auth
  Depends on: stage 01

stage 03 — Canvas & Node Graph
  Covers: canvas-ui, node-graph
  Why grouped: share the same rendering surface (noted in /arch:map)
  Depends on: stage 01

stage 04 — Export
  Covers: export
  Depends on: stage 03

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
- When `project-context.md` has a `## Writing rules` section, follow it in each brief and todo-list edit. Run the lint it names on each brief you wrote or amended, and fix its hard findings in the prose.
- Fill `_Arch context:_` with every node the brief's text relies on without covering it — a decision it cites, a node it names — at its `rev=` in Current State `NODES`. Leave the line out when there is none.
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
    - "From arch briefs (.arch/feature-briefs/): name every attached brief under Impact by its file name and where it lives — .arch/feature-briefs/NN-slug.md, or, when .arch/ is a worktree of the board's own branch (git -C .arch branch --show-current), feature-briefs/NN-slug.md on that branch, named, since no code branch holds it; the briefs' OpenSpec Handoff capabilities are a starting point — one that exists in openspec/specs/ by now is Modified"
  design:
    - "If proposal.md names arch briefs, design.md is required: name them in Context as proposal.md does, carry their Key Decisions with their alternatives into Decisions (a later brief's decision wins; a brief marked _Superseded by:_ is replaced by the brief it points to) and their Out of Scope into Non-Goals. Never contradict a Key Decision — if one cannot hold, stop and tell the user to run /arch:decide [node]"
  tasks:
    - "If design.md names an arch brief: its Assumptions to Validate become the first tasks"
operations:
  apply:
    guidance:
      - "If design.md names an arch brief (read it at .arch/feature-briefs/ in this checkout): when that brief is marked _Superseded by:_, stop and tell the user to run /opsx:update [change] @[the brief it points to] first; when a task cannot follow one of its Key Decisions, stop and tell the user to run /arch:decide [node] instead of implementing around it"
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
> - [Each `planned` stage superseded or amended this run: `/opsx:update [change] @.arch/feature-briefs/[new or amended brief]` before `/opsx:apply`]
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
_Arch revision: [each covered node as slug=N, N its rev= in Current State NODES, comma-separated]_
_Arch context: [each node the text relies on that it does not cover — a decision it cites, a node it names — as slug=N. Omit the line when there is none]_
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
- Open questions: answers that `/opsx:explore` finds go into the change's `design.md → Decisions` — run `/opsx:propose` in the same session, so they are written down. An answer that changes a node's facts also goes to `/arch:explore [node]`.
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
6. When the node has a `_Record:` line, `RECORDS_PENDING` does not list it

---

## Rules
- Change maturity and priority only with `arch.mjs set` (it updates the node file and `index.json` together); pair every `arch.mjs connect` / `disconnect` with the matching line in the node files' `## Connections`
- Add a `## History` line to every node you change, as the last line of `## History`: `- [YYYY-MM-DD] /arch:[skill] — [what changed and why]`. arch.mjs writes no History lines. `set`, `archive` and `rename-node` rewrite or move the node file: read it again after them, before you edit it. Never put an Edit of a node file in the same batch as an arch.mjs write to that node. Edit `.arch/` files only with Edit or Write: a shell edit bypasses the lock check
- Record every run that wrote files with `arch.mjs log` — pass `--node` for each node it changed, other skills use it to tell what changed — then `arch.mjs check`. A run that only marks or rewrites stale lines (the current Decision already says otherwise) adds its History lines and logs without `--node`, so no brief goes outdated
- Edit existing `.arch/` files in place — never recreate an existing file from scratch
- Outside `.arch/`, write only `context:`, `rules:` and `operations:` in `openspec/config.yaml` (or `config.yml`), after the user confirms
- Write nothing while the gate is closed (except Changes line corrections, `_Related changes:_` lines and the Amend of a brief the user named, recorded with `arch.mjs log finalize "[what was corrected or amended]: [brief]"`) or a readiness re-check fails
- Existing briefs and todo-list rows are never rewritten — later runs append; the only edits are those listed in Gate Check 5
- Write the briefs and the todo list yourself, in this conversation. Do not give them to subagents: they do not get this skill's template and rules
- Do not invent stage groupings without user confirmation
- A bare number from the user (08, 008) can mean a stage or a task ID. When both exist, ask which one
- Feature briefs must accurately reflect decisions from node files — do not add new decisions
- Open technical questions in briefs must be genuinely open — do not fill them with guesses
- Implementation progress is never recorded in `.arch/` — `arch.mjs summary` reads it from `openspec/changes/`
