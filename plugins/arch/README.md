# Architector

A multi-session architecture exploration workflow that turns raw ideas into
implementation-ready feature briefs, each the input for [OpenSpec](https://github.com/Fission-AI/OpenSpec) changes.

## Requirements

Node.js 18+ (`node`) on PATH — the native Claude Code installer does not ship it. `scripts/arch.mjs` (standard library only) owns `.arch/index.json`; without `node` every skill stops at start with Claude Code's `Shell command failed` error.

macOS, Linux and Windows work the same way: the skills call the script with a command that both Bash and PowerShell run, so Git for Windows is optional, and a home directory with spaces in its path is fine.

For a board several people work on at once (see [Working in Parallel](#working-in-parallel)): git, and a remote the branch tracks.

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
| Want to see the board and its dependency graph in the browser | `/arch-board` |
| Several people will work on the board at once, or the project takes changes through pull requests | `/arch-share [branch]` (once, at the start), then the skills as usual |
| A run ended before it released its locks, or release failed and you fixed the cause | `/arch-release` |
| A teammate's lock is abandoned | `/arch-unlock [node]` |
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

## Viewing the Board

`/arch-board` opens the board in your browser, live. The page shows everything `/arch:status` knows, plus the dependency graph, and it updates while you and the skills work. It needs no server and nothing to install: it is `.arch/board.html`, a file you can also open directly or bookmark.

### What you see

- **Header**: project, stage, revision, the time the data was written, and the finalize gate. The gate is green when open, and red with the reasons when closed.
- **Maturity**: how many nodes are at each level.
- **Dependency graph**: layers run left to right. Layer 0 has no prerequisites, and each later layer depends on earlier ones. Nodes caught in a dependency cycle sit in a `cycle` column.
  - Box colour is maturity: grey raw-idea, blue explored, purple decided, green ready. A thick border marks a blocking node, a faded box a deferred one, and 🔒 a locked one.
  - An arrow is a dependency, from prerequisite to dependent. Grey dashes are a shared concern; red dashes a conflict.
  - Hover a box or a line for its summary or note.
- **Nodes**: the table, by priority then maturity. `Rev` counts the sessions that changed the node; `Lock` says who holds it (hover for host and time).
- **Node file**: the clicked node's file as it is on disk.
- **Problems**: what `arch.mjs check` reports.
- **Full state report**: the `arch.mjs summary` the skills read.

### Moving around

- Click a node, in the graph or the table: it, its connections and the nodes at their other end stay lit, the rest dims, and its file opens beside the table. Click it again, click an empty spot or press Esc to clear.
- `board.html#auth` opens on `auth`.
- Past 40 nodes the boxes shrink to one line (details on hover); a wide graph scrolls sideways.
- Untick **live** to freeze the page while you read.

### How it stays current

The page itself never changes. Its data is `.arch/board.js`, which `arch.mjs` rewrites after every write (`set`, `connect`, `log` and the rest) and whenever it fetches the locks. The page reads it every 2 seconds.

The data is a script rather than JSON for a reason: a page opened from disk may load a script beside it, but the browser will not let it read `index.json`.

- A node file edited by hand shows up at the next `arch.mjs` write.
- On a shared board the page follows the board branch in your clone: it is pulled, and the locks fetched, when a session or an `/arch:` skill starts, and at every claim and release.

`board.html` is created with the board, and copied again only when a plugin update changes it. For a board from an older version, run `/arch-board` once. If the page says `board.js not found`, run `/arch-board`. Both files are listed in `.arch/.gitignore`.

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
  .gitignore                  ← keeps the local write lock and the board page out of git
  board.html, board.js        ← the board page (/arch-board) and the state it shows
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
Or commit it — the decision history is valuable. Or give it a branch of its own with `/arch-share`: the history is kept, and it never mixes with the code's branches or pull requests (see [Working in Parallel](#working-in-parallel)).

## Working in Parallel

Several people can work on one board at the same time, each in their own clone on their own machine. A node is held by one person at a time, and everyone else keeps working on other nodes. Reading, `/arch:status`, `/arch:audit` and the board page are never blocked.

The board lives on a git branch of its own, apart from the code. Whatever branch your code is on, and however the project takes code changes (pull requests from feature branches included), board changes go straight to the board branch. They never land in a code branch or a pull request.

### Set it up

At the start of the architecture work, one person runs `/arch-share` (`/arch:new` suggests it). Use `/arch-share [branch]` to name the branch; the default is `arch`. You need a git repository with a remote and `git config user.email` set; that address is how arch tells people apart. `/arch-share` does four things:

1. It moves `.arch/` onto a new branch that holds only the board. `.arch/` stays where it is, now as a [git worktree](https://git-scm.com/docs/git-worktree) of that branch.
2. It pushes the board branch.
3. It creates `refs/arch/locks` on the remote: a ref of its own holding `locks.json`.
4. It hides `.arch/` from the code checkout through `.git/info/exclude`, so `git status` on the code stays clean. If a code branch already tracked `.arch/`, the removal is staged there. Commit it the way the project takes changes; a pull request is fine, since the board itself never needs one again.

Everyone else pulls the project, installs the plugin and starts Claude Code there. At session start the plugin checks out the board branch at `.arch/` by itself. If you already have a `.arch/` folder, run `/arch-share`: it sets the board branch up and keeps the old folder as `.arch.local-…`.

The board branch is pushed to directly, so it must not require pull requests. If the repository protects every branch, exempt the board branch. `main` cannot serve as the board branch: your code checkout usually has it checked out, git checks a branch out in one place only, and `main` often takes changes only through pull requests.

This is worth doing alone too: in a project that merges through pull requests, `/arch-share` keeps board commits out of your feature branches.

### Day to day

Run the skills as usual; they take the locks and give them back:

```
Alice: /arch:explore auth            Bob: /arch:decide data-model
  claim auth ✓ (pulls arch first)      claim data-model ✓
  … discussion, node file updated …    … decision recorded …
  release: commit, pull, push arch,    release: commit, pull (merges
           free auth                            Alice's push), push arch,
                                                free data-model
```

- **Claim.** A skill claims a node as soon as it starts working on it, before the discussion, so nobody changes the node under you. A new node is claimed by its slug before its file is written. The status line shows `arch: holding auth`.
- **Fresh content.** Claim pulls the board branch before it takes the node, so you start from what the others released. A session start and the start of each `/arch:` skill pull it too. Every pull first commits whatever `.arch/` holds uncommitted, as work in progress, so nothing of yours is lost; release pushes it. On a large repository the fetch of the code's branches behind `/arch:status` adds a moment to each skill start.
- **Busy node.** When someone else holds the node, the skill says who and since when, and leaves the node alone: `auth is locked by alice@team.dev on alice-mbp since 2026-10-10 09:12 UTC`. Pick another node, or ask them to finish.
- **Release.** At the end of the run the skill releases. It commits `.arch/` on the board branch, pulls (merge, never rebase), pushes the board branch and frees your locks. Your code branch is never touched.

### Implementing the features

Implementation goes the project's usual way: feature branches and pull requests. The board only supplies the briefs.

| What | Where | How it reaches the remote |
|------|-------|---------------------------|
| Nodes, decisions, feature briefs, todo list | `.arch/` (the board branch) | `release`, directly |
| `openspec/config.yaml` (arch's context, rules, apply guidance) | a code branch | the project's pull request flow |
| OpenSpec changes (`openspec/changes/`) and the code | feature branches | pull requests |

1. `/arch:finalize` takes the `#briefs` lock, so two runs never number stages alike. The briefs and the todo list go to the board branch. Its edit to `openspec/config.yaml` is a code change: merge it the usual way, since the `/opsx:` commands follow arch's rules only once it is in.
2. For each stage, a developer starts a feature branch and runs `/opsx:propose [change] @.arch/feature-briefs/NN-slug.md`. The brief is on disk in every clone, whatever the code branch, because `.arch/` is the board's worktree. Then `/opsx:apply`, the pull request, and `/opsx:archive`.
3. Implementation takes no locks: locks guard the board, so several people implement different stages at once.
4. When a task cannot follow a Key Decision, apply stops and points to `/arch:decide [node]`. Run it from any code branch; it claims the node on the board. The brief then reads as outdated, and `/arch:finalize` supersedes or follows it up. `/opsx:update [change] @[new brief]` carries the change in the feature branch.
5. The proposal and `design.md` name each brief as `feature-briefs/NN-slug.md` on the board branch. A reviewer finds it there, and `design.md` carries its Key Decisions anyway, so the pull request reads on its own.

`/arch:status` shows the same progress to everyone, whatever branch their code checkout is on. On a shared board it reads `openspec/changes/` on every branch of the remote, open pull requests included, as well as the working tree. A change archived on any branch counts as done; otherwise its furthest progress is shown with the branch it is on, e.g. `add-auth 3/8 tasks on origin/feat/auth`. The remote's branches are fetched at session start and when an `/arch:` skill starts.

### What a lock covers

| Lock | Covers | Taken by |
|------|--------|----------|
| a node slug, e.g. `auth` | its file `ideas/auth.md`; its maturity, priority, name and summary; archiving it | `/arch:explore`, `/arch:decide`, `/arch:triage`, `/arch:map` (each node it changes), `/arch:new` (each new node) |
| `#briefs` | `feature-briefs/` and `todo-list.md` | `/arch:finalize` |
| `#context` | `project-context.md` | `/arch:new`, when it adds constraints |

Connections and the session log take no lock: two people connecting nodes at the same time merge cleanly (see below).

### Commands

| Command | What it does |
|---------|--------------|
| `/arch-share [branch]` | Gives the board its own branch and the locks: once per project. In another clone of a shared project, sets `.arch/` up as the board branch's worktree |
| `/arch-release` | Releases now: commits and pushes the board branch, frees your locks. Use it after fixing a failed release, or when a run ended before it could release |
| `/arch-unlock <node>` | Frees a lock its holder abandoned, such as a lost laptop or a crashed session. Works on anyone's lock, so check with them first: changes they made under it and never released may conflict later |

Locks never expire on their own.

Never run `git clean -x` (`-fdx`, `-ffdx`) in the project: `.arch/` is hidden from the code through `.git/info/exclude`, and `-x` deletes excluded files, board worktree included. What was released is on the remote; what was not is gone. Plain `git clean -fd` leaves it alone.

### When something goes wrong

| You see | Do |
|---------|----|
| `auth is locked by …` | Work on another node, or ask them to release |
| `this project's board is shared on the branch arch, and .arch/ here is not its worktree: run /arch-share` | `/arch-share` |
| `a branch arch already exists` | Name another branch: `/arch-share <branch>` |
| `pulling the board branch arch failed and was undone` | `git -C .arch pull`, resolve it as any merge (usually `index.json`, below), then run the skill again or `/arch-release` |
| `git push to arch failed; your locks are kept` | Check your access and that the board branch takes direct pushes, then `/arch-release` |
| `index.json: both sides changed node auth.maturity — kept ours` | Two people changed the same field, which happens only when a lock was bypassed or force-freed. Fix `.arch/index.json` by hand and finish the merge in `.arch/` |

### How merges stay clean

- `sessions.jsonl` merges by union: both sides' lines are kept.
- `index.json` merges through arch's driver. Nodes are matched by slug and connections by their ends and type, field by field. It conflicts only when both sides changed the same field.
- A node file has one holder at a time, so only one side changes it.
- Brief and map freshness count the sessions that changed each node rather than positions in the log, so a merge that interleaves two people's sessions keeps them right.
- `.arch/.gitignore` keeps the local write lock and the board page out of commits.

### Enforcement and limits

- `arch.mjs set`, `add-node` and `archive` refuse a node you do not hold, on every surface.
- In the CLI the plugin's hooks also refuse an Edit or Write of a file you do not hold. They fetch the locks and pull the board branch at session start and when an `/arch:` skill starts, and show the nodes you hold in the status line. The desktop app gets the `arch.mjs` checks only, and claim and release still pull.
- An edit made through a shell command (`sed`, a heredoc) bypasses the hook.
- You are `user.email` on this machine: the same address on two machines counts as two holders.
- Without a remote, or before `/arch-share`, none of this runs: `.arch/` is an ordinary folder, as it always was.
- macOS, Linux and Windows work alike: the script calls `git` by argument list, and the merge driver is written with forward slashes for Git's own shell.

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
- `rules:` (`proposal`, `design`, `tasks`) — OpenSpec adds them to an artifact's instructions when propose, update or continue writes it; they never reach apply. They have the proposal and `design.md` name every attached brief (with the board's branch on a shared board, since no code branch holds the brief), make `design.md` required for a change that names arch briefs (it is optional in `spec-driven`), carry the Key Decisions with their alternatives into Decisions (a later brief's decision wins; a superseded brief is replaced by the brief it points to), Out of Scope into Non-Goals and Assumptions to Validate into the first tasks, and stop with `/arch:decide [node]` when a Key Decision cannot hold.
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
