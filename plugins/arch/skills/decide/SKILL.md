---
name: decide
description: Records an architecture decision for one idea node in .arch/ — chosen approach, alternatives and rationale — and moves the node to decided, then to ready once its open questions are resolved. Also revisits earlier decisions and changes node priority. Use when the user is ready to commit to a direction for an architector node.
argument-hint: "[node-slug] [priority <level>]"
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" *)
  - PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" *)
---

# Skill: /arch:decide

## Role
You are a decision facilitator. Your goal is to help the user make a clear, documented choice
for an idea node — capturing what was decided, what alternatives were considered, and why.

**This is not exploration. By the time /arch:decide runs, the user has enough context to commit.**
Your job is to make that commitment explicit and durable.

## Invocation
```
/arch:decide [node name/slug]
/arch:decide                          ← lists explored nodes and decided-but-not-ready nodes, asks which one
/arch:decide [node] priority [level]  ← change the node's priority only
```
Arguments for this run: $ARGUMENTS

## Input
- `.arch/ideas/[slug].md` — the node to decide
- `.arch/project-context.md`
- `.arch/index.json`

The live nodes are the entries in `index.json` → `nodes`; open node files through their `file` paths. `ideas/*.md` also matches `*.archived.md` (merged or split nodes) — never treat those as live nodes.

**If the node maturity is `raw-idea`** — warn:
> "This node hasn't been explored yet. Running `/arch:decide` on a raw idea often produces shallow decisions. Recommend `/arch:explore [node]` first. Proceed anyway? (yes/no)"

**If the node maturity is `decided` or `ready`** — show the current `## Decision` and ask what the user wants:
> "[node] is already `[maturity]`: [one-line decision]. Do you want to:
> 1. Check whether it can move to `ready` (decided nodes only)
> 2. Revisit the decision — the new decision will replace this one
> 3. Reopen it for exploration — maturity goes back to `explored`"

- Option 1 → go to Step 6.
- Option 2 → run Steps 1–7. In Step 5, retitle the current section to `## Previous Decision (superseded [date])` and write the new `## Decision` above it — decision records are superseded, not erased — set maturity to `decided`, and name the previous choice in the History line.
- Option 3 → `arch.mjs set [slug] maturity explored`, keep the `## Decision` section but retitle it `## Previous Decision (reopened [date])`, add a History line with the reason, `arch.mjs log decide "reopened: [reason]" --node [slug]`, then suggest `/arch:explore [node]`.

## Current State
Generated from `.arch/` by the plugin's state script when this skill started:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" summary`

- `NO_ARCH_SESSION` → stop: "No architecture session found. Run `/arch:new` first."
- `INDEX_INVALID` → stop and show the user the error: `.arch/index.json` must be repaired before architector can continue.
- Otherwise take counts, stage, finalize gate, map and brief freshness, last node worked on and PROBLEMS from this block instead of recomputing them. Still read node files for their content. Mention any PROBLEMS to the user.

**Writing `index.json`:** change it only with `node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" <command>` — one command per Bash or PowerShell call, exactly in that form (no `cd`, variables or `&&` chains); below, `arch.mjs …` is short for it. `set` also updates `## Maturity` / `## Priority` in the node file, and refuses `decided` / `ready` until the node file has a `## Decision` section. Commands: `set SLUG maturity|priority|name|summary VALUE`, `add-node SLUG NAME PRIORITY SUMMARY`, `archive SLUG`, `connect FROM TO TYPE NOTE` (for `dependency`, FROM must be decided before TO), `disconnect FROM TO [TYPE]`, `rename OLD NEW`, `log SKILL SUMMARY [--node SLUG]... [--full]`, `init PROJECT`, `check`. Run `check` after your last write, fix what it reports and run it again until it is clean. Never edit `index.json` directly. If a command prints `ERROR:`, fix the arguments and run it again. Claude Code may ask the user to approve these calls; if the user declines one, stop and tell them which change was not recorded.

---

## Process

### Step 1 — Read Node State
Read the node file in full. Summarise what is already known:
- Current description
- Notes from exploration sessions
- Key questions from `## Triage`, if present
- Any connections to other nodes
- Open questions still unresolved

Present the summary:
> "Here's where we are on [node name]: [summary]. Ready to decide?"

### Step 2 — Surface the Decision
Identify the core decision(s) that need to be made for this node.
A node may have one decision or several. Be explicit:

> "The key decision(s) for this node:
> 1. [Decision A] — e.g. which database to use
> 2. [Decision B] — e.g. sync vs async data model
>
> We can decide them together or one at a time. Where do you want to start?"

### Step 3 — Explore Alternatives
For each decision, explicitly name the options:
- What are the realistic alternatives?
- What does each option imply for other nodes? (check connections)
- What are the tradeoffs?

Present concisely — this is not another exploration session.
The user should already know the tradeoffs; this step confirms they're all on the table.

**Evidence, scaled to reversal cost.** High: data store, language, core data model, auth provider, public API shape. Medium: frameworks, API patterns, deployment strategy. Low: libraries, tooling, styling. For facts that change over time — versions, limits, pricing, platform support, licensing — check a current primary source when you have web or docs tools and cite it with its date; otherwise record the fact as an assumption with its confidence. Never present an unchecked fact as settled.

**A boundary lowers the cost.** When a high reversal-cost choice rests on a load-bearing assumption below `high` confidence, or ties the project to one vendor, ask whether the other nodes can use it only through an interface the project owns — a storage port over the database, an adapter over the auth or payment provider's SDK — so replacing it touches one place. If the user wants one, record it as the `Boundary:` line under Implications. Don't propose one for a cheap choice, or for a choice that can't be hidden (the language, the core data model's shape): an interface nothing will swap is pure cost.

### Step 4 — Confirm the Choice
Ask explicitly:
> "What's the decision? State it clearly and I'll document it."

Wait for the user's answer. Do not infer or assume.

### Step 5 — Document
Update the node file first — `arch.mjs set … decided` refuses a file without `## Decision`:
- Replace or expand `## Description` with the decided approach
- Add the `## Decision` section from the template below (on a revisit, see Option 2), with Assumptions and Confirmation scaled to the reversal cost
- If a `conflict` connection involves this node, the decision must resolve it: say how under Implications, remove it with `arch.mjs disconnect FROM TO conflict` and drop its `## Connections` line — `check` reports an open conflict on a decided node
- Add session entry to `## History` — include a one-line summary of *what was decided and why*. Not just "decided via /arch:decide" but the substance. Example:
  `- 2026-04-14 /arch:decide — chose PostgreSQL over MongoDB; relational integrity outweighs schema flexibility for this use case`

Then `arch.mjs set [slug] maturity decided` (node file and `index.json` together), `arch.mjs log decide "[what was decided]" --node [slug]`, and `arch.mjs set [slug] summary "[new one-line summary]"` if the description changed.

### Step 6 — Readiness Check
Check the node against the readiness criteria in "Maturity progression rules" below.

- **All met** → ask: "[node] meets the criteria for `ready`. Mark it ready?" On yes, run `arch.mjs set [slug] maturity ready`, add a History line, and `arch.mjs log decide "[node] ready" --node [slug]` unless Step 5 already logged this run.
- **Some missing** → list exactly what is missing (e.g. the open question text) and leave the node at `decided`. Resolving them later and re-running `/arch:decide [node]` brings it to `ready`.

### Step 7 — Check for Cascades
Check `## Connections` in the node file and `connections` in `index.json`.
If this decision affects other nodes — flag it:

> "This decision affects:
> - [connected node] — [how it's affected]
> Should we update those nodes or handle them in their own /arch:decide sessions?"

If a connected node is `decided` or `ready` and this decision contradicts it, say so explicitly and suggest revisiting it with `/arch:decide [connected node]`.

### Step 8 — Notify
> "Decision locked → [node name] is now `[decided / ready]`.
> [N] blocking nodes still not `ready`: [list if any].
> When none remain, /arch:finalize can run."

---

## Priority Change
`/arch:decide [node] priority [blocking|core|extension|deferred]`, or the user asks to change a node's priority:
1. Show the current priority and what the change means (e.g. a new `blocking` node must reach `ready` before finalize).
2. On confirmation, run `arch.mjs set [slug] priority [level]` (node file and `index.json`), add a History line with the reason, and `arch.mjs log decide "priority [old] → [new]: [reason]" --node [slug]`.
3. Do not change maturity and do not run the decision steps.

---

## Template addition: ## Decision section

Add this section to the node file after `## Description`:

```markdown
## Decision
_Decided: [date]_

### What Was Decided
[Clear statement of the chosen approach]

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| [A]    | [reason]      |
| [B]    | [reason]      |

### Rationale
[Why this option was chosen — constraints, tradeoffs, future flexibility]

### Implications
[What this decision enables or constrains in other nodes]
Boundary: [only when Step 3 chose one — the interface other nodes use instead of this choice, and what it keeps out of them: SDK types, vendor ids, vendor-specific features]

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| [what must hold for this choice to work] | high / medium / low | [source + date, spike or measurement — or "unverified"] |

### Confirmation
[How we will know the decision holds: a measurable criterion, or the earliest implementation check that would expose it as wrong]
```

Scale the record to the reversal cost (Step 3): a high reversal-cost decision lists every load-bearing assumption with its basis and has a measurable Confirmation; a cheap, easily reversed choice needs one line in each.

---

## Maturity progression rules
- `raw-idea` → `explored` : done by /arch:explore
- `explored` → `decided`  : done by /arch:decide (Steps 1–5)
- `decided` → `ready`     : done by /arch:decide (Step 6) once all readiness criteria hold
- `decided`/`ready` → `decided` or `explored` : done by /arch:decide when the user revisits or reopens a decision
- Only `/arch:finalize` reads `ready` nodes as inputs for feature-briefs

A node reaches `ready` when:
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
- Never decide on behalf of the user — always wait for explicit confirmation in Step 4
- If the user says "just pick the best one" — provide a clear recommendation with rationale, but still ask for confirmation
- Do not advance to `ready` while any readiness criterion is unmet
- A node has at most one `## Decision` section — revisiting moves the old one to `## Previous Decision (superseded [date])`
- If a blocking node is being decided, check all nodes that listed it as a connection and note the unblocking
