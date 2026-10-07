# Architector

A multi-session architecture exploration workflow that turns raw ideas into
implementation-ready feature briefs, each the input for [OpenSpec](https://github.com/Fission-AI/OpenSpec) changes.

## Requirements

`python3` 3.8+ on PATH. `scripts/arch.py` (standard library only) owns `.arch/index.json`; without it the skills stop and say so.

For the handoff after `/arch:finalize`: the OpenSpec CLI (`npm install -g @fission-ai/openspec`) and `openspec init` in the project. The arch skills themselves don't need it.

## Installation

**From the plugins-cc marketplace (recommended):**
```
/plugin marketplace add JRoot3D/plugins-cc
/plugin install arch@plugins-cc
```

**For development** (from a clone of this repository):
```bash
claude --plugin-dir plugins/arch
```

Once installed, all skills are available as `/arch:new`, `/arch:explore`, etc.

## Flow

```
/arch:new [project description]
      ↓ creates: .arch/project-context.md
                 .arch/index.json
                 .arch/ideas/[slug].md  (one per idea node)

/arch:triage                  ← enrich raw ideas with expert discussion points
/arch:explore                 ← navigate and deepen any node
/arch:map                     ← visualise connections (use anytime)
/arch:decide [node]           ← lock in a decision: alternatives, rationale, assumptions, confirmation
/arch:status                  ← where are we, what's blocking
/arch:audit                  ← audit for gaps, inconsistencies, risks

      ↓ repeat until all blocking nodes reach `ready`

/arch:finalize
      ↓ creates: .arch/feature-briefs/NN-[slug].md
                 .arch/todo-list.md

      ↓ each stage becomes OpenSpec changes:
        /opsx:explore (open questions) → /opsx:propose → /opsx:apply → /opsx:verify → /opsx:archive
```

## When to Use Which Skill

| Situation | Skill |
|-----------|-------|
| Starting a new project from scratch | `/arch:new` |
| Adding new ideas to an existing session | `/arch:new` (appends nodes) |
| Just finished `/arch:new`, want expert prep before exploring | `/arch:triage` |
| Want to enrich a specific node with discussion points | `/arch:triage [node]` |
| Want to see all nodes and their status | `/arch:explore` (shows dashboard) |
| Want to go deeper on a specific idea | `/arch:explore [node]` |
| Want to understand how ideas relate | `/arch:map` |
| Two ideas might be the same thing | `/arch:map [a] [b]` |
| Ready to commit to a direction | `/arch:decide [node]` |
| Decided node with all questions resolved → `ready` | `/arch:decide [node]` |
| Revisit or reopen a decision | `/arch:decide [node]` |
| Change a node's priority | `/arch:decide [node] priority [level]` |
| Want a progress snapshot | `/arch:status` |
| Want to find gaps or inconsistencies | `/arch:audit` |
| Checking one node's decisions in context | `/arch:audit [node]` |
| All blocking nodes are ready | `/arch:finalize` |
| More nodes became ready after finalizing | `/arch:finalize` (appends new stages) |
| A decision changed after its brief was written | `/arch:finalize` (supersedes or follows up the brief) |

## Idea Node Maturity

```
raw-idea → explored → decided → ready
```

| Maturity | Symbol | Meaning |
|----------|--------|---------|
| raw-idea | ◻ | Named and described, nothing more |
| explored | ◽ | Discussed in depth, tradeoffs surfaced |
| decided  | ◈ | Approach chosen, rationale documented |
| ready    | ✦ | Fully specified, can go into a feature brief for OpenSpec |

Maturity is advanced by:
- `raw-idea → explored` : `/arch:explore`
- `explored → decided`  : `/arch:decide`
- `decided → ready`     : `/arch:decide` (when the readiness criteria hold: no open questions, implications for every connection, prerequisites ready, no open conflict, assumptions backed in proportion to reversal cost)
- `decided/ready → explored` : `/arch:decide` (reopening a decision)

## Node Priority

| Priority | Meaning |
|----------|---------|
| `blocking` | Must reach `ready` before `/arch:finalize` can run |
| `core` | Central to the product, should be decided before finalize |
| `extension` | Valuable but not required for first implementation pass |
| `deferred` | Consciously set aside — will not appear in todo list |

**Gate rule:** `/arch:finalize` requires all `blocking` nodes to be at `ready` and `arch.py check` to report no problems — a `decided`/`ready` node without a `## Decision`, an open conflict on a decided node, a dependency cycle, or a `ready` node whose prerequisite is not. It then re-checks each node's readiness criteria before writing its brief.
Non-blocking nodes that aren't ready are flagged but do not block finalization.

## Decision Records and Briefs

Decisions follow ADR practice ([MADR](https://adr.github.io/madr/)): each `## Decision` lists alternatives, rationale, implications, the **assumptions** it rests on (with confidence and basis — a dated source, a spike or a measurement) and a **confirmation** criterion that would show it is wrong. Evidence is scaled to reversal cost: a database choice needs more than a logging library. A revisited decision is kept as `## Previous Decision (superseded …)`, never erased.

Feature briefs are append-only. Each records the board revision it was written at (`_Arch revision: N_`); when a covered node changes later, `summary` lists the brief under `BRIEFS_OUTDATED`, and `/arch:finalize` asks whether to **supersede** it (stage not started: a replacement brief, the old row becomes `superseded`), **follow it up** (stage in progress or done: a delta brief that depends on it) or **keep** it.

## .arch/ Structure

```
.arch/
  project-context.md          ← shared context (product type, constraints, out of scope)
  index.json                  ← all nodes, connections, session history
  ideas/
    tech-stack.md             ← one file per idea node
    data-model.md
    canvas-ui.md
    ...
    [slug].archived.md        ← merged/split nodes (kept for history)
  feature-briefs/
    01-foundation.md          ← output of /arch:finalize
    02-auth.md
    03-canvas.md
    ...
  todo-list.md                ← master implementation list
```

**Add `.arch/` to `.gitignore`** if you don't want architecture exploration in version history.
Or commit it — the decision history is valuable.

## Implementation with OpenSpec

Architect flow decides what to build across the whole project; OpenSpec plans and ships it one change at a time.

```
Architect flow (.arch/)              OpenSpec (openspec/)
─────────────────────────            ─────────────────────────────────
/arch:new                            /opsx:explore   ← open technical questions
/arch:triage
/arch:explore     ──────→            /opsx:propose   ← proposal, delta specs, design, tasks
/arch:map      feature-brief         /opsx:apply
/arch:decide                         /opsx:verify
/arch:status                         /opsx:archive   ← merges delta specs into openspec/specs/
/arch:audit
/arch:finalize
```

Each brief's `## OpenSpec Handoff` names the changes for its stage (usually one) and whether to start with `/opsx:explore`. Then, per change: `/opsx:propose [change-name] @.arch/feature-briefs/NN-slug.md`.

| Brief section | Lands in |
|---------------|----------|
| Goal, What Needs to Be Built | `proposal.md` |
| Key Decisions Already Made | `design.md → Decisions` (settled — to change one, go back to `/arch:decide`) |
| Assumptions to Validate | first tasks in `tasks.md` |
| Open Technical Questions | `/opsx:explore`, or `design.md → Open Questions` when deferrable |
| Out of Scope | `design.md → Non-Goals` |

`/arch:finalize` also offers to fill the `context:` field of `openspec/config.yaml` from `.arch/project-context.md` and the blocking decisions, so every change sees them. `.arch/` keeps why each decision was made; `openspec/specs/` keeps what the system does.

## Tips

- **Run `/arch:map` early and often.** Even with raw-idea nodes, it surfaces hidden dependencies and merge candidates before you go deep on the wrong thing. Only a full `/arch:map` (no node arguments) marks the whole graph fresh; `/arch:map [node]` refreshes just that neighbourhood.
- **Don't rush to `/arch:decide`.** A premature decision on a poorly explored node creates false certainty. Explore first.
- **Blocking nodes first.** Tech stack, core data model, platform choice — these unblock everything else. Run `/arch:status` to see the dependency chain.
- **Use deferred honestly.** If an idea won't affect the first implementation pass, mark it deferred. It keeps the map clean and finalization reachable.
- **Feature briefs don't need to be complete.** If a brief has open technical questions, that's fine — `/opsx:explore` resolves them against the codebase. The brief just needs enough context to start the conversation.
- **The todo list is a living document.** Update the status column as stages complete. It becomes your project log.

## Permissions

Each skill reads the current state through `scripts/arch.py summary` when it starts; that call is pre-approved and needs nothing from you. Writes to `.arch/index.json` also go through `arch.py`, but they happen after you confirm, in a later turn, where Claude Code asks for approval. To approve them once for good, add the rule for your install to `permissions.allow` in your settings. The skills call the script through `${CLAUDE_PLUGIN_ROOT}`, which expands to an absolute path, so the rule names the absolute path too — that way it approves only this plugin's script, not an `arch.py` inside a repository you open.

Installed plugin (replace `/Users/you` with your home directory; `*` matches any plugin version):

```json
"Bash(python3 /Users/you/.claude/plugins/cache/plugins-cc/arch/*/scripts/arch.py *)"
```

`--plugin-dir` checkout (use the checkout's absolute path):

```json
"Bash(python3 /absolute/path/to/plugins-cc/plugins/arch/scripts/arch.py *)"
```

If you decline a write, the skill stops and tells you which change was not recorded — it never edits `index.json` itself. `arch.py check` (run by the skills after every write) reports anything left inconsistent.

## Development

To work on the skills themselves, from the repository root:

```bash
claude --plugin-dir plugins/arch
```

Each skill is self-contained in `skills/<name>/SKILL.md` — outside auto mode, reading other plugin files at runtime triggers a permission prompt, so shared rules (index schema, write rules) are repeated where they are needed; keep them in sync when changing one. `scripts/arch.py` (Python 3.8+, standard library) owns `.arch/index.json`: skills inject its `summary` at start and change the index only through its commands, so counts, dates and the node-file/index copies stay consistent. Tests: `python3 plugins/arch/scripts/test_arch.py` — they also fail when a line shared between skills drifts or goes missing.

Behaviour evals (`evals/`, [plugin evals](https://code.claude.com/docs/en/plugin-evals)) run the real skills on seeded boards: an all-`ready` board with contradictory decisions (`/arch:audit` must still catch it), a structurally clean board with an open question (`/arch:finalize` must stop), and a merge of two `ready` nodes (the result must not stay `ready`). From `plugins/arch`:

```bash
claude plugin eval . --scaffold --ablation none --allow-tools Write Edit "Bash(python3 *)"
```

Every run is a real model call (about $2 for the suite at 3 runs per case). `--ablation none` skips the no-plugin arm, which is meaningless for slash-command prompts. The fixtures under `evals/*/fixture/arch/` were generated with `arch.py` and pass `check`. The plugin manifest is at `.claude-plugin/plugin.json` — bump its `version` with every change to the skills, otherwise installed users keep the cached copy.

## Credits

Based on architector by Roma Danylchuk from [romadanylchuk/getleverage](https://github.com/romadanylchuk/getleverage) (MIT).
