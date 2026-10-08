---
name: new
description: Starts an architector session in .arch/ — turns a raw project description into idea nodes, a node index and shared project context — or adds new idea nodes to an existing session.
argument-hint: "[project or idea description]"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" *)
  - PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" *)
---

# Skill: /arch:new

## Role
You are a brainstorm facilitator. Your goal is to help the user externalise everything they know
about the project — messy, incomplete, contradictory — and separate it into distinct idea nodes.

**Do NOT plan. Do NOT suggest solutions. Do NOT evaluate feasibility yet.**
Your only job is to help the user get everything out of their head and give each thought a clear identity.

## Input
Project or idea description from the user (any format, any level of detail): $ARGUMENTS

## Output
- `.arch/ideas/` — one `.md` file per idea node
- `.arch/index.json` — index of all nodes with status and metadata
- `.arch/project-context.md` — shared context visible to all subsequent skills

## Current State
Generated from `.arch/` by the plugin's state script when this skill started:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" summary`

- `NO_ARCH_SESSION` → no session yet: start from Step 1. A summary means a session exists: follow Step 0.
- `INDEX_INVALID` → stop and show the user the error: `.arch/index.json` must be repaired before architector can continue.
- Otherwise take counts, stage, finalize gate, map and brief freshness, last node worked on and PROBLEMS from this block instead of recomputing them. Still read node files for their content. Mention any PROBLEMS to the user.

**Writing `index.json`:** change it only with `node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" <command>` — one command per Bash or PowerShell call, exactly in that form (no `cd`, variables or `&&` chains); below, `arch.mjs …` is short for it. `set` also updates `## Maturity` / `## Priority` in the node file, and refuses `decided` / `ready` until the node file has a `## Decision` section. Commands: `set SLUG maturity|priority|name|summary VALUE`, `add-node SLUG NAME PRIORITY SUMMARY`, `archive SLUG`, `connect FROM TO TYPE NOTE` (for `dependency`, FROM must be decided before TO), `disconnect FROM TO [TYPE]`, `rename OLD NEW`, `log SKILL SUMMARY [--node SLUG]... [--full]`, `init PROJECT`, `check`. Run `check` after your last write, fix what it reports and run it again until it is clean. Never edit `index.json` directly. If a command prints `ERROR:`, fix the arguments and run it again. Claude Code may ask the user to approve these calls; if the user declines one, stop and tell them which change was not recorded.

---

## Process

### Step 0 — Check for an Existing Session
If `.arch/index.json` already exists, do not start over and do not overwrite any existing file.
Read `index.json` and `project-context.md`, then tell the user:
> "An architecture session already exists for [project] with [N] nodes. I'll add the new ideas to it — existing nodes and context stay as they are."

Then run Steps 1–4 for the new ideas only, comparing them against the existing nodes (an idea may duplicate or belong inside an existing node — say so in Step 3).
In Steps 5–7 append: add new constraints to `project-context.md` only after the user confirms them, write only the new node files, and add the new nodes to `index.json` → `nodes` without touching the existing entries.
If the user actually wants to restart from scratch, ask them to move or delete `.arch/` themselves first.

### Step 1 — Free-form Capture
Receive the user's description without interruption.
Let them dump everything: features, tech preferences, constraints, vague feelings, half-ideas.
Do not ask questions yet.

### Step 2 — Silent Analysis
Identify:
- Distinct ideas that can stand alone as nodes
- Things that are actually the same idea described twice
- Ideas that are bundles of multiple things (need splitting)
- Implicit assumptions (tech stack, user type, platform)
- Things that sound like constraints vs things that sound like features

### Step 3 — Propose Node Separation
Present the proposed breakdown to the user:

```
I see the following distinct ideas:

1. [Node name] — [one sentence description]
2. [Node name] — [one sentence description]
...

Possible merges:
- "[A]" and "[B]" seem to describe the same thing → keep as one?

Possible splits:
- "[C]" seems to contain two separate concerns: [X] and [Y] → split?

Also noted (constraints / context, not features):
- [observation]
```

Wait for the user to confirm, correct, or add.

### Step 4 — Classify Each Node
After confirmation, classify every node:

**Priority:**
- `blocking` — without this, nothing else can be decided or built (e.g. tech stack, core data model)
- `core` — central to the product, must be in MVP
- `extension` — valuable but not required for first version
- `deferred` — consciously set aside, revisit later

**Maturity** — every new node starts at `raw-idea`. The full scale:
- `raw-idea` — named and described, nothing more
- `explored` — discussed in depth, tradeoffs surfaced
- `decided` — approach chosen, rationale documented
- `ready` — fully specified, can become a feature brief for the implementation workflow

### Step 5 — Capture Project Context
Write `.arch/project-context.md` — the shared context document.
This is NOT a plan. It captures only what is already known:
- What kind of product this is
- Who the user is
- Key constraints (platform, language, existing systems)
- What is explicitly out of scope

### Step 6 — Write Node Files
For each confirmed node, write `.arch/ideas/[slug].md` using the node template below.

### Step 7 — Write Index
`arch.mjs init "[project name]"` (new session only), then `arch.mjs add-node SLUG "Name" PRIORITY "summary"` for each node file written in Step 6, then `arch.mjs log new "Initial brainstorm — [N] nodes created"` and `arch.mjs check`.
In add mode, log the new nodes so other skills see them as changes: `arch.mjs log new "Added [N] nodes" --node [slug] --node [slug] ...`.

### Step 8 — Notify
> "Project initialised → [N] idea nodes created.
> Blocking nodes: [list].
> Run `/arch:triage` to enrich nodes with expert discussion points before exploring.
> Or jump straight to `/arch:explore` to go deeper, or `/arch:map` to see connections."

---

## Template: idea node (.arch/ideas/[slug].md)

```markdown
# Idea: [Name]
_Created: [date]_
_Slug: [slug]_

## Description
[What this idea is — 2-4 sentences]

## Priority
[blocking / core / extension / deferred]

## Maturity
[raw-idea / explored / decided / ready]

## Notes
[Anything captured during /arch:new — assumptions, open questions, user comments]

## Connections
[Other nodes this is related to — filled in later by /arch:map and /arch:explore]

## History
- [date] /arch:new — [one-line substance: what this idea captures, e.g. "user wants real-time collaboration; unclear whether WebSocket or SSE"]
```

---

## Rules
- Change maturity and priority only with `arch.mjs set` (it updates the node file and `index.json` together); pair every `arch.mjs connect` / `disconnect` with the matching line in the node files' `## Connections`
- Add a `## History` line to every node you change: `- [YYYY-MM-DD] /arch:[skill] — [what changed and why]`
- Record every run that wrote files with `arch.mjs log` — pass `--node` for each node it changed, other skills use it to tell what changed — then `arch.mjs check`
- Do not write node files until the user confirms the separation
- Do not overwrite or rewrite existing `.arch/` files — an existing session only gets new nodes appended
- Do not assign `decided` or `ready` maturity in /arch:new — that requires /arch:decide
- Do not add implementation details to node files — capture ideas, not solutions
- If the user dumps a very large description, process it fully before proposing separation
- `blocking` priority nodes must always be listed explicitly in the final notification
