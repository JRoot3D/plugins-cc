# Architector

A multi-session architecture exploration workflow that turns raw ideas into
implementation-ready feature briefs, each the input for [OpenSpec](https://github.com/Fission-AI/OpenSpec) changes.

## Requirements

Node.js 18+ (`node`) on PATH — the native Claude Code installer does not ship it. `scripts/arch.mjs` (standard library only) owns `.arch/index.json`; without `node` every skill stops at start with Claude Code's `Shell command failed` error.

macOS, Linux and Windows work the same way: the skills call the script with a command that both Bash and PowerShell run, so Git for Windows is optional, and a home directory with spaces in its path is fine.

For a board several people work on at once (see Working Together): git, and a remote the branch tracks.

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
/arch:status                  ← where are we, what's blocking, how implementation is going
/arch:audit                   ← audit for gaps, inconsistencies, risks, drift from the briefs

      ↓ repeat until all blocking nodes reach `ready`

/arch:finalize
      ↓ creates: .arch/feature-briefs/NN-[slug].md
                 .arch/todo-list.md
      ↓ updates: openspec/config.yaml  (context, rules, apply guidance — after you confirm)

      ↓ each stage becomes OpenSpec changes:
        /opsx:explore (open questions) → /opsx:propose [change] @brief → /opsx:apply → /opsx:archive
        /arch:status tracks them; /arch:audit openspec checks them against their briefs
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
| Several people will work on the board at once | `/arch-share` (once), then the skills as usual |
| Want to find gaps or inconsistencies | `/arch:audit` |
| Checking one node's decisions in context | `/arch:audit [node]` |
| All blocking nodes are ready | `/arch:finalize` |
| More nodes became ready after finalizing | `/arch:finalize` (appends new stages) |
| A decision changed after its brief was written | `/arch:finalize` (supersedes or follows up the brief) |
| Ran `openspec init` after finalizing | `/arch:finalize` (adds the arch config to `openspec/config.yaml`) |
| Want to know how implementation of the feature briefs is going | `/arch:status` |
| Checking for drift between OpenSpec changes and the feature briefs they came from | `/arch:audit openspec` |

## Graph Pane

`/arch-graph` opens a side pane with the dependency graph from `.arch/index.json`: nodes grouped into layers by dependency depth (layer 0 has no prerequisites), each with its maturity symbol, priority and `← prerequisites`; nodes caught in a dependency cycle under `cycle`; then shared concerns (`↔`) and conflicts (`⚡`). Press a node (click it, or ctrl+x tab into the pane and Enter) to run `/arch:explore` on it — queued until the current turn ends. It redraws after every `arch.mjs` call, so it follows `/arch:map`, `/arch:decide` and the rest live. In a fullscreen terminal 144+ columns wide it opens by itself when the project has an `.arch/index.json`; run `/arch-graph` again to refresh after editing the index by hand.

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

**Gate rule:** `/arch:finalize` requires all `blocking` nodes to be at `ready` and `arch.mjs check` to report no problems — a `decided`/`ready` node without a `## Decision`, an open conflict on a decided node, a dependency cycle, or a `ready` node whose prerequisite is not. It then re-checks each node's readiness criteria before writing its brief.
Non-blocking nodes that aren't ready are flagged but do not block finalization.

## Decision Records and Briefs

Decisions follow ADR practice ([MADR](https://adr.github.io/madr/)): each `## Decision` lists alternatives, rationale, implications, the **assumptions** it rests on (with confidence and basis — a dated source, a spike or a measurement) and a **confirmation** criterion that would show it is wrong. Evidence is scaled to reversal cost: a database choice needs more than a logging library. A costly choice resting on a shaky assumption, or on one vendor, can instead be made cheaper to reverse: its Implications name a **`Boundary:`** — the interface the other nodes use instead of it — and `/arch:audit` flags a node that reaches past it. A revisited decision is kept as `## Previous Decision (superseded …)`, never erased.

Feature briefs are append-only. Each records the revision of every node it covers (`_Arch revision: auth=3, data-model=5_` — a node's revision counts the sessions that changed it); when a covered node changes later, `summary` lists the brief under `BRIEFS_OUTDATED`, and `/arch:finalize` asks whether to **supersede** it (a replacement brief; the old todo-list row is marked superseded), **follow it up** (a delta brief that depends on it) or **keep** it. The stage's state in OpenSpec decides which: `not started` → supersede or keep; `planned` → supersede or keep, where the replacement keeps the change names and you revise the proposed change with `/opsx:update [change] @.arch/feature-briefs/[new brief]` before `/opsx:apply` (one with no tasks yet is continued with `/opsx:propose [change] @.arch/feature-briefs/[new brief]`); `in progress` or `done` → follow up or keep. When the state is `unknown`, or there is no `openspec/` directory here, finalize asks how far the stage got. After a follow up, a change of the old stage that already has tasks done finishes on the old brief's decisions; one with no task done takes the follow-up brief too: not proposed or no tasks yet → `/opsx:propose [change] @[old brief] @[follow-up brief]`; `0/M tasks` → `/opsx:update [change] @[follow-up brief]` before `/opsx:apply`.

## .arch/ Structure

```
.arch/
  project-context.md          ← shared context (product type, constraints, out of scope)
  index.json                  ← all nodes and connections
  sessions.jsonl              ← session history, one line per skill run
  .gitattributes              ← merges sessions.jsonl by union, index.json through arch's merge driver
  .gitignore                  ← keeps the local write lock out of git
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

## Working Together

Several people can work on one board at the same time, each from their own clone, a node each. The board travels with the branch through git; who holds which node lives on a ref of its own on the remote, `refs/arch/locks` (one `locks.json`), so locking never adds commits to your branch and works whichever branch you are on.

1. **Share once.** Commit and push `.arch/`, then run `/arch-share`. It creates `refs/arch/locks` on the branch's remote.
2. **Claim before you change.** On a shared board the skills run `arch.mjs claim [node]` as soon as they start working on a node, and before they write a new node's file. Claim fetches the locks first. It fails while someone else holds the node, saying who and since when, and asks you to `git pull` when your branch lacks the node's last release. Feature briefs and the todo list are one lock, `#briefs`; `project-context.md` is `#context`. Every other node stays open to everyone, and so do reading, `/arch:status` and `/arch:audit`.
3. **Release when done.** At the end of the run the skill calls `arch.mjs release`. It commits `.arch/` alone, pulls (merge, never rebase), pushes to the branch's upstream, then frees your locks and records the pushed commit as each node's last release. It refuses when you have unpushed commits outside `.arch/`, since those are yours to push. When the pull or push fails, it says why and keeps your locks.
4. **Abandoned locks are freed by hand.** A lock stays until its holder releases it. When a laptop is gone for good, `arch.mjs unlock [node] --force` frees it; the skills run it only when you say so. Changes made under that lock and never released may conflict later.

Merges stay clean while people hold different nodes. `sessions.jsonl` merges by union. `index.json` merges through arch's driver (`merge-index`): nodes are matched by slug and connections by their ends and type, field by field; it conflicts only when both sides changed the same field. Claim and sync register the driver in each clone's `.git/config`.

Who you are is `user.email` on this host. The same address on two machines is two holders.

Locks are enforced in two places. `arch.mjs set`, `add-node` and `archive` refuse a node you do not hold, on every surface. In the CLI the plugin's hooks also:

- refuse an Edit or Write of a node file, a brief or `project-context.md` that you do not hold;
- fetch the locks at session start and when an `/arch:` skill starts, putting the fresh `LOCKS` block into its Current State;
- show the nodes you hold in the status line.

An edit made through a shell command bypasses the hook. Without a remote, or before `/arch-share`, nothing changes: claim and release say the board is not shared and do nothing.

macOS, Linux and Windows work alike. The script calls `git` by argument list, and the merge driver is written with forward slashes for Git's own shell.

## Implementation with OpenSpec

Architect flow decides what to build across the whole project; OpenSpec plans and ships it one change at a time.

```
Architect flow (.arch/)              OpenSpec (openspec/)
─────────────────────────            ─────────────────────────────────
/arch:new                            /opsx:explore   ← open technical questions
/arch:triage
/arch:explore     ──────→            /opsx:propose   ← proposal, delta specs, design, tasks
/arch:map      feature-brief         /opsx:apply
/arch:decide                         /opsx:verify    ← optional (not in OpenSpec's core profile)
/arch:status      ←──────            /opsx:archive   ← merges delta specs into openspec/specs/
/arch:audit    openspec/changes/
/arch:finalize
```

Each brief's `## OpenSpec Handoff` names the changes for its stage (usually one), the capabilities each one adds or modifies, and whether to start with `/opsx:explore`. Then, per change: `/opsx:propose [change-name] @.arch/feature-briefs/NN-slug.md` → `/opsx:apply` → `/opsx:archive`. Propose each change under exactly the name on the brief's `- Changes:` line — that name is how arch tracks it. If a change ended up under another name, or was merged, split or dropped, `/arch:finalize` corrects the line after you confirm — even while the gate is closed.

`- Capabilities:` lists, per change, the capability ids it adds (New) or changes (Modified — ids from `openspec/specs/`, or New in an earlier stage); `/opsx:propose` treats them as a starting point. A change that only sets up tooling, infrastructure or docs says `none — skip_specs: true`, and OpenSpec's proposal step marks it `skip_specs: true` in the change's `.openspec.yaml`, so it validates and archives without delta specs.

| Brief section | Lands in |
|---------------|----------|
| Goal, What Needs to Be Built | `proposal.md` |
| Key Decisions Already Made | `design.md → Decisions` (settled — to change one, go back to `/arch:decide`) |
| Assumptions to Validate | first tasks in `tasks.md` |
| Open Technical Questions | `/opsx:explore`, or `design.md → Open Questions` when deferrable |
| Out of Scope | `design.md → Non-Goals` |

`/arch:finalize` also writes three fields of `openspec/config.yaml` (or a legacy `config.yml`) — it shows each edit and writes it only after you confirm:

- `context:` — from `.arch/project-context.md` plus a `Settled architecture (rationale in .arch/):` line with the blocking decisions. OpenSpec injects it into every artifact, apply and archive. Arch owns only that one line: a later run proposes refreshing it when a blocking decision or the set of blocking nodes changed; everything else in `context:` is yours. An in-progress change then sees the new decision in `context:` but finishes on its `design.md`; the new decision arrives with the follow-up brief's change.
- `rules:` (`proposal`, `design`, `tasks`) — OpenSpec adds them to an artifact's instructions when propose, update or continue writes it; they never reach apply. They have the proposal name every attached brief, make `design.md` required for a change that names arch briefs (it is optional in `spec-driven`), carry the Key Decisions with their alternatives into Decisions (a later brief's decision wins; a superseded brief is replaced by the brief it points to), Out of Scope into Non-Goals and Assumptions to Validate into the first tasks, and stop with `/arch:decide [node]` when a Key Decision cannot hold.
- `operations.apply.guidance` — besides `context:`, the only field arch writes that reaches `/opsx:apply` (rules never do): apply stops and asks for `/opsx:update [change] @[new brief]` when the change's brief was superseded, and points to `/arch:decide [node]` when a task cannot follow a Key Decision instead of implementing around it.

`rules:` and `operations:` are written only for the `spec-driven` schema. Arch owns every entry that mentions `arch brief` and keeps the others. With a store-backed OpenSpec root (a `store:` line in the config), arch writes nothing: it shows the `Settled architecture` line and the rules/operations snippet to add to the store's config (`openspec context` shows which). Ran `openspec init` after finalizing? Run `/arch:finalize` again: with nothing new to brief, it only adds the config.

Implementation progress is never recorded in `.arch/`. `arch.mjs summary` reads it from `openspec/changes/` (read-only, no CLI needed): a stage is `not started`, `planned` (proposed, no task done), `in progress` or `done` (every change archived) — `unknown` when its brief names no changes or the changes are not local (a store-backed OpenSpec root). `/arch:status` shows each stage's state and the next `/opsx:` command, and lists changes that came from no brief. `/arch:audit openspec` compares each change's `design.md` (its `proposal.md` when it has none) with the Key Decisions and Out of Scope of the brief it came from. `/opsx:verify` (code against the change's artifacts) is optional in OpenSpec's core profile — add it with `openspec config profile`; `/arch:audit openspec` is always available.

`.arch/` keeps why each decision was made; `openspec/specs/` keeps what the system does.

## Tips

- **Run `/arch:map` early and often.** Even with raw-idea nodes, it surfaces hidden dependencies and merge candidates before you go deep on the wrong thing. Only a full `/arch:map` (no node arguments) marks the whole graph fresh; `/arch:map [node]` refreshes just that neighbourhood.
- **Don't rush to `/arch:decide`.** A premature decision on a poorly explored node creates false certainty. Explore first.
- **Blocking nodes first.** Tech stack, core data model, platform choice — these unblock everything else. Run `/arch:status` to see the dependency chain.
- **Use deferred honestly.** If an idea won't affect the first implementation pass, mark it deferred. It keeps the map clean and finalization reachable.
- **Feature briefs don't need to be complete.** If a brief has open technical questions, that's fine — `/opsx:explore` resolves them against the codebase. The brief just needs enough context to start the conversation.
- **Progress lives in OpenSpec.** Nothing in `.arch/` needs updating as stages ship: propose each change under the name on its brief's `- Changes:` line, and `/arch:status` shows where each stage is and the next command.

## Permissions

Each skill reads the current state through `scripts/arch.mjs summary` when it starts; that call is pre-approved and needs nothing from you. Writes to `.arch/index.json` also go through `arch.mjs`, but they happen after you confirm, in a later turn, where Claude Code asks for approval. To approve them once for good, add the rule for your install to `permissions.allow` in your settings. The skills call the script through `${CLAUDE_PLUGIN_ROOT}`, which expands to an absolute path (with forward slashes on Windows), so the rule names the absolute path too — that way it approves only this plugin's script, not an `arch.mjs` inside a repository you open. Keep the quotes around the path: the skills write it quoted. On Windows add the `PowerShell(…)` rule as well — Claude Code runs commands through PowerShell when Git Bash is missing, and by default even when it is installed.

Installed plugin (replace `/Users/you` with your home directory, e.g. `C:/Users/you` on Windows; `*` matches any plugin version):

```json
"Bash(node \"/Users/you/.claude/plugins/cache/plugins-cc/arch/*/scripts/arch.mjs\" *)",
"PowerShell(node \"/Users/you/.claude/plugins/cache/plugins-cc/arch/*/scripts/arch.mjs\" *)"
```

`--plugin-dir` checkout (use the checkout's absolute path):

```json
"Bash(node \"/absolute/path/to/plugins-cc/plugins/arch/scripts/arch.mjs\" *)",
"PowerShell(node \"/absolute/path/to/plugins-cc/plugins/arch/scripts/arch.mjs\" *)"
```

If you decline a write, the skill stops and tells you which change was not recorded — it never edits `index.json` itself. `arch.mjs check` (run by the skills after every write) reports anything left inconsistent.

## Development

To work on the skills themselves, from the repository root:

```bash
claude --plugin-dir plugins/arch
```

Each skill is self-contained in `skills/<name>/SKILL.md` — outside auto mode, reading other plugin files at runtime triggers a permission prompt, so shared rules (index schema, write rules) are repeated where they are needed; keep them in sync when changing one. `hooks/register.tsx` is the graph pane (a hooks-module mod, read-only on `.arch/index.json`): check it with `claude plugin validate plugins/arch` and `claude plugin test plugins/arch` (tests in `tests/`); `.claude-plugin/types/` is written by the engine on load and gitignored. `scripts/arch.mjs` (Node.js 18+, standard library) owns `.arch/index.json`: skills inject its `summary` at start and change the index only through its commands, so counts, dates and the node-file/index copies stay consistent. Tests: `node plugins/arch/scripts/test_arch.mjs` — they also fail when a line shared between skills drifts or goes missing.

Behaviour evals (`evals/`, [plugin evals](https://code.claude.com/docs/en/plugin-evals)) run the real skills on seeded boards: an all-`ready` board with contradictory decisions (`/arch:audit` must still catch it), a node whose decision reaches past another node's `Boundary:` (`/arch:audit` must flag the bypass), a structurally clean board with an open question (`/arch:finalize` must stop), and a merge of two `ready` nodes (the result must not stay `ready`). From `plugins/arch`:

```bash
claude plugin eval . --scaffold --ablation none --allow-tools Write Edit "Bash(node *)"
```

Every run is a real model call (about $3 for the suite at 3 runs per case). `--ablation none` skips the no-plugin arm, which is meaningless for slash-command prompts. The fixtures under `evals/*/fixture/arch/` were generated with `arch.mjs` and pass `check`. The plugin manifest is at `.claude-plugin/plugin.json` — bump its `version` with every change to the skills, otherwise installed users keep the cached copy.

## Credits

Based on architector by Roma Danylchuk from [romadanylchuk/getleverage](https://github.com/romadanylchuk/getleverage) (MIT).
