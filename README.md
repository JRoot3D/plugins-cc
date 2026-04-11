# AI Development Workflow

A Claude Code marketplace containing two plugins:

- **`flow`** — multi-agent feature workflow. Skills: `flow:interview`, `flow:plan`, `flow:implement`, `flow:review`, `flow:final-check`, `flow:archive`.
- **`serena`** — Serena MCP helpers. Skills: `serena:activate`, `serena:onboarding`, `serena:update`. (Requires the [Serena MCP server](https://github.com/oraios/serena) to be installed separately.)

## Install

```
/plugin marketplace add JRoot3D/plugins-cc
/plugin install flow@plugins-cc
/plugin install serena@plugins-cc
```

## Flow

```
/flow:interview [feature description]
      ↓ creates: .flow-spec/interview-brief.md

/flow:plan
      ↓ reads:   interview-brief.md
      ↓ creates: feature-plan.md + validation-report.md

/flow:implement phase-N   ← new chat, /clear before running
      ↓ reads:   feature-plan.md
      ↓ creates: phase-N-result.md [VERIFIED]

/flow:review phase-N      ← optional, after each /flow:implement
      ↓ reads:   phase-N-result.md + changed source files
      ↓ creates: review-N-report.md

/flow:review all          ← optional, before /flow:final-check
      ↓ reads:   all phase-*-result.md + changed source files
      ↓ creates: review-all-report.md

/flow:final-check         ← new chat
      ↓ reads:   interview-brief.md + all phase-*-result.md
      ↓ creates: final-check-result.md

/flow:archive             ← new chat, after /flow:final-check passes
      ↓ reads:   interview-brief.md + feature-plan.md + all phase/review/final-check files
      ↓ creates: .flow-spec/<feature-slug>/summary.md
      ↓ deletes: all other feature-scoped files in .flow-spec/
```

## When to Clear Context

| Transition | Action |
|------------|--------|
| flow:interview → flow:plan | /clear or new chat |
| flow:plan → flow:implement phase-1 | **mandatory** new chat |
| phase-N → flow:review | same chat or new chat — both work |
| flow:review → phase-N+1 | **mandatory** new chat |
| last phase → flow:final-check | new chat |
| flow:final-check → flow:archive | new chat |

**Rule:** every `/flow:implement` starts with a clean context.
The agent reads only files — it does not remember the previous chat.

## When to Use Which Flow Skill

| Situation | Skill |
|-----------|-------|
| Simple bug or small change | go straight to `/flow:plan` |
| New feature with unknown edge cases | `/flow:interview` → `/flow:plan` |
| Feature touching multiple modules | `/flow:interview` → `/flow:plan` |
| Refactoring | `/flow:plan` (no interview) |
| Fix after `/flow:final-check` issues | `/flow:implement fix "description"` |
| Review code quality after a phase | `/flow:review phase-N` |
| Review entire feature before final-check | `/flow:review all` |
| Feature done and verified; ready for next one | `/flow:archive` |

## .flow-spec/ Structure

```
.flow-spec/
  project.md              ← project metadata (language, typing, build/lint/test commands)
                            written once per project, drafted by /flow:interview, required by /flow:implement and /flow:review
  interview-brief.md      ← input for /flow:plan
  feature-plan.md         ← input for /flow:implement
  validation-report.md    ← internal artifact of /flow:plan
  phase-1-result.md       ← output of /flow:implement phase-1
  phase-2-result.md       ← output of /flow:implement phase-2
  review-N-report.md      ← output of /flow:review phase-N
  review-all-report.md    ← output of /flow:review all
  final-check-result.md   ← output of /flow:final-check
  <feature-slug>/         ← output of /flow:archive: consolidated summary + all working files removed
    summary.md            ← self-contained record of the completed feature
```

**Add `.flow-spec/` to `.gitignore`** — these are working artifacts, not part of the code.
Or commit them if you want a decision history — your call.

## Fixing Issues After /flow:final-check

```
/flow:implement fix "issue name"
```

New chat. Provide:
- `feature-plan.md`
- `final-check-result.md` (with the issue description)

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

- **Be specific in the interview.** Concrete scenarios ("when the user submits the signup form with an email that already exists") produce better briefs than vague descriptions ("handle edge cases in registration").
- **Review the plan before implementing.** Two minutes reading `feature-plan.md` saves hours of rework. Check that phases are ordered correctly and nothing critical is missing.
- **Run `/flow:review` early.** Don't wait until all phases are done — reviewing after phase 1 catches style and pattern drift before it compounds across later phases.
- **Keep phases small.** If a phase has more than ~10 steps, it's probably two phases. Smaller phases are easier to verify and cheaper to redo if something goes wrong.
- **Use `/flow:plan` with a description for quick fixes.** For simple bugs, `/flow:plan Fix the login redirect loop` skips the interview and generates a minimal brief automatically.
