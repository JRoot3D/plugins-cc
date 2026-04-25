# AI Development Workflow

A Claude Code marketplace containing three plugins:

- **`flow`** — multi-agent feature workflow. Skills: `flow:new`, `flow:plan`, `flow:implement`, `flow:review`, `flow:check`, `flow:compact`.
- **`serena`** — Serena MCP helpers. Skills: `serena:activate`, `serena:onboarding`, `serena:update`. (Requires the [Serena MCP server](https://github.com/oraios/serena) to be installed separately.)
- **`teams`** — multi-agent team orchestration. Skills: `teams:init`, `teams:flow`. Requires the `flow` and `serena` plugins and an experimental Claude Code setting (see [Teams](#teams)).

## Install

```
/plugin marketplace add JRoot3D/plugins-cc
/plugin install flow@plugins-cc
/plugin install serena@plugins-cc
/plugin install teams@plugins-cc
```

## Flow

```
/flow:new [feature description]
      ↓ creates: .flow-spec/feature-brief.md

/flow:plan
      ↓ reads:   feature-brief.md
      ↓ creates: feature-plan.md + validation-report.md

/flow:implement phase-N   ← new chat, /clear before running
      ↓ reads:   feature-plan.md
      ↓ creates: phase-N-result.md [VERIFIED]

/flow:review phase-N      ← optional, after each /flow:implement
      ↓ reads:   phase-N-result.md + changed source files
      ↓ creates: review-N-report.md

/flow:review all          ← optional, before /flow:check
      ↓ reads:   all phase-*-result.md + changed source files
      ↓ creates: review-all-report.md

/flow:check         ← new chat
      ↓ reads:   feature-brief.md + all phase-*-result.md
      ↓ creates: check-result.md

/flow:compact             ← new chat, after /flow:check passes
      ↓ reads:   feature-brief.md + feature-plan.md + all phase/review/check files
      ↓ creates: docs/flow/<feature-slug>/summary.md   (committable, outside .flow-spec/)
      ↓ deletes: all feature-scoped files in .flow-spec/ (keeps project.md)
```

## When to Clear Context

| Transition | Action |
|------------|--------|
| flow:new → flow:plan | /clear or new chat |
| flow:plan → flow:implement phase-1 | **mandatory** new chat |
| phase-N → flow:review | same chat or new chat — both work |
| flow:review → phase-N+1 | **mandatory** new chat |
| last phase → flow:check | new chat |
| flow:check → flow:compact | new chat |

**Rule:** every `/flow:implement` starts with a clean context.
The agent reads only files — it does not remember the previous chat.

## When to Use Which Flow Skill

| Situation | Skill |
|-----------|-------|
| Simple bug or small change | go straight to `/flow:plan` |
| New feature with unknown edge cases | `/flow:new` → `/flow:plan` |
| Feature touching multiple modules | `/flow:new` → `/flow:plan` |
| Refactoring | `/flow:plan` (no brief needed) |
| Fix after `/flow:check` issues | `/flow:implement fix "description"` |
| Review code quality after a phase | `/flow:review phase-N` |
| Review entire feature before check | `/flow:review all` |
| Feature done and verified; ready for next one | `/flow:compact` |

## .flow-spec/ Structure

```
.flow-spec/
  project.md              ← project metadata (language, typing, build/lint/test commands)
                            written once per project, drafted by /flow:new, required by /flow:implement and /flow:review
  feature-brief.md      ← input for /flow:plan
  feature-plan.md         ← input for /flow:implement
  validation-report.md    ← internal artifact of /flow:plan
  phase-1-result.md       ← output of /flow:implement phase-1
  phase-2-result.md       ← output of /flow:implement phase-2
  review-N-report.md      ← output of /flow:review phase-N
  review-all-report.md    ← output of /flow:review all
  check-result.md   ← output of /flow:check
```

**Add `.flow-spec/` to `.gitignore`** — these are working artifacts, not part of the code.
Or commit them if you want a decision history — your call.

`/flow:compact` writes the consolidated summary **outside** `.flow-spec/`, into
the project's `docs/` tree:

```
docs/
  flow/
    <feature-slug>/
      summary.md          ← output of /flow:compact: self-contained record of the completed feature
      mental-model.md     ← optional companion (from ## Mental Model in feature-plan.md or feature-docs.md)
      decision-log.md     ← optional companion (from ## Decision Log in feature-plan.md or feature-docs.md)
      dependency-map.md   ← optional companion (from ## Dependency Map in feature-plan.md or feature-docs.md)
```

Unlike `.flow-spec/`, `docs/flow/` is meant to be **committed** — it becomes the
project's permanent history of what was built and why. After `/flow:compact`
runs, `.flow-spec/` is left with only `project.md`.

## Fixing Issues After /flow:check

```
/flow:implement fix "issue name"
```

New chat. Provide:
- `feature-plan.md`
- `check-result.md` (with the issue description)

The agent sees a specific scope and does not touch anything else.

## Serena

Serena MCP provides semantic, symbol-aware code navigation. These skills manage its lifecycle — one-time setup, per-session activation, and keeping memories fresh as the code evolves. All three require the [Serena MCP server](https://github.com/oraios/serena) to be installed and running.

```
/serena:onboarding         ← once per project
      ↓ explores:  entry points, structure, tech stack, conventions
      ↓ creates:   project_overview, codebase_structure, suggested_commands,
                   code_style, task_completion (in Serena's memory)
      ↓ updates:   CLAUDE.md with a "Codebase Navigation" section

/serena:activate           ← start of every new chat
      ↓ calls:     activate_project + loads relevant memories
      ↓ result:    Serena's symbol tools are usable for this session

/serena:update             ← after structural changes drift from memory
      ↓ diffs:     stored memories vs. current codebase
      ↓ edits:     only the stale memories (surgical, not a rewrite)
```

### When to Use Which Serena Skill

| Situation | Skill |
|-----------|-------|
| First time using Serena on this project | `/serena:onboarding` |
| New chat, Serena MCP tools available but inactive | `/serena:activate` |
| `check_onboarding_performed` reports not done | `/serena:onboarding` |
| Added/renamed modules, changed build scripts, new deps | `/serena:update` |
| Memories feel stale or contradict current reality | `/serena:update` |

**Prerequisite:** `/serena:onboarding` requires `CLAUDE.md` to already exist in the project root. Run `/init` first if it's missing — onboarding will stop and ask you to.

**Tip:** activate early. Serena's symbol tools (`find_symbol`, `get_symbols_overview`, `find_referencing_symbols`) are much cheaper than `Read` + `Grep` for navigating source — but they don't work until `/serena:activate` has run in the current chat.

## Tips

- **Be specific in the brief.** Concrete scenarios ("when the user submits the signup form with an email that already exists") produce better briefs than vague descriptions ("handle edge cases in registration").
- **Review the plan before implementing.** Two minutes reading `feature-plan.md` saves hours of rework. Check that phases are ordered correctly and nothing critical is missing.
- **Run `/flow:review` early.** Don't wait until all phases are done — reviewing after phase 1 catches style and pattern drift before it compounds across later phases.
- **Keep phases small.** If a phase has more than ~10 steps, it's probably two phases. Smaller phases are easier to verify and cheaper to redo if something goes wrong.
- **Use `/flow:plan` with a description for quick fixes.** For simple bugs, `/flow:plan Fix the login redirect loop` skips the brief and generates a minimal brief automatically.

## Teams

The `teams` plugin ships two skills:

- **`teams:init`** — one-shot project setup. Detects language, build/lint/test commands, and `CLAUDE.md` conventions, then writes per-role rule files under `.claude/rules/teams-flow/` that the four flow-* agents load at spawn time. Optional but recommended — without it the agents fall back to generic rules. Safe to re-run (idempotent: refreshes the auto-imported block, preserves your edits).
- **`teams:flow`** — spins up a 4-agent team (Planner on Opus, Implementer + Reviewer on Sonnet, Checker on Opus) that runs the full `/flow:*` pipeline with fresh-context spawning per step. The team lead (your main chat) relays questions and review findings between agents and the user; agents never talk directly.

### Setup

```
/teams:init   (or: "set up teams flow", "configure teams:flow for this project")
      ↓ detects manifests → bootstraps .flow-spec/project.md (if missing)
      ↓ scans CLAUDE.md, CI, lint configs, test layout
      ↓ batched interview for what couldn't be detected (severity bar, public API, …)
      ↓ writes .claude/rules/teams-flow/{_shared,planner,implementer,reviewer,checker,README}.md
```

Each rule line is tagged `[must-fix]` or `[should-fix]`. The severity bar (set at init time) controls which tag blocks the reviewer/checker. Files commit-friendly — share team rules with your collaborators.

### Workflow

```
/teams:flow   (or: "spin up a team", "use the flow team")
      ↓ TeamCreate → planner (opus) → /flow:new → brief
      ↓ fresh planner (opus) → /flow:plan → plan
      ↓ for each phase:
           implementer (sonnet) → /flow:implement phase-N
           reviewer (sonnet)    → /flow:review phase-N
           (loop until review passes)
      ↓ checker (opus) → /flow:check → done
```

### Prerequisites

1. **Enable the experimental agent-teams flag.** Add this to your Claude Code settings (`~/.claude/settings.json` or project `.claude/settings.json`) and restart Claude Code:

   ```json
   {
     "env": {
       "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
     }
   }
   ```

   This flag is experimental and may change. Without it, `TeamCreate` and multi-agent spawning will not work.

2. **Install the `flow` and `serena` plugins** from this marketplace. `teams:flow` dispatches `/flow:*` skills to spawned agents, and the team lead prepends a canonical `First action: invoke Skill(skill: "serena:activate").` line to every spawn prompt. A PreToolUse hook shipped with the `teams` plugin hard-enforces this: any `Agent` call targeting a `flow-*` subagent without that line is blocked before the subagent starts. (The `serena` plugin also requires the Serena MCP server — see [Serena](#serena).)
