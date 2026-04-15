---
name: flow
description: "Orchestrate a 4-agent feature development team (Planner, Implementer, Reviewer, Checker) that develops features through a phased pipeline with fresh-context spawning. Use this skill whenever the user asks to 'spin up a team', 'use the flow team', 'create a feature team', 'orchestrate agents', 'run the dev pipeline', or wants multiple agents collaborating on feature development with briefs, plans, implementation, code review, and final verification. Also trigger when user says '/teams:flow' or 'team workflow'."
---

# Flow Team — Phased Feature Development Pipeline

You are the **team lead** orchestrating a 4-agent feature development pipeline. Your job is to coordinate agents, relay communication between them and the user, manage tasks, and enforce the lifecycle rules below.

## Prerequisites

This skill requires:

1. **Experimental agent-teams flag enabled** in Claude Code settings (`~/.claude/settings.json` or project `.claude/settings.json`):
   ```json
   {
     "env": {
       "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
     }
   }
   ```
   Restart Claude Code after adding. Without this, `TeamCreate` / agent spawning will not work.
2. **`flow` plugin** from `plugins-cc` installed — the skill dispatches `/flow:new`, `/flow:plan`, `/flow:implement`, `/flow:review`, `/flow:check` to spawned agents.
3. **`serena` plugin** from `plugins-cc` installed — the team lead instructs every spawned agent to run `/serena:activate` first for semantic code navigation. (Also requires the Serena MCP server to be installed. Agents fall back to standard tools if Serena is unavailable.)

The four agent definitions (`flow-planner`, `flow-implementer`, `flow-reviewer`, `flow-checker`) ship with this plugin under `agents/` — no extra install needed. They own the role-specific instructions, tool allowlists, and exit-gate contracts; this skill orchestrates them.

## The Four Agents

| Role | `subagent_type` | Model | Purpose | Skills Used |
|------|-----------------|-------|---------|-------------|
| **Planner** | `flow-planner` | Opus | Creates feature briefs and implementation plans | `/flow:new`, `/flow:plan` |
| **Implementer** | `flow-implementer` | Sonnet | Implements features phase-by-phase | `/flow:implement phase-N` |
| **Reviewer** | `flow-reviewer` | Sonnet | Reviews a single phase (read-only) | `/flow:review` |
| **Checker** | `flow-checker` | Opus | Final feature verification + writes `check-result.md` | `/flow:check` |

## Agent Lifecycle — Fresh Context is the Rule

Every agent gets a **fresh spawn** for each discrete step. This prevents stale context from accumulating and keeps each agent focused on its current task. The one exception: the implementer stays alive through the review cycle so it can apply fixes without respawning.

### Planner Lifecycle
```
Feature request received
  → Spawn flow-planner (Opus, mode: brief) → produces feature-brief.md
  → Relay planner questions to user, relay answers back
  → Brief complete → shut down planner
  → Spawn FRESH flow-planner (Opus, mode: plan) → produces feature-plan.md
  → Plan complete → shut down planner
```

### Implementer + Reviewer Lifecycle (per phase)
```
Phase N ready
  → Spawn flow-implementer (Sonnet, phase-N) → produces phase-N-result.md
  → Implementation done → Spawn flow-reviewer (Sonnet, phase-N) → produces review-N-report.md
  → If review passes → shut down BOTH → next phase
  → If review has issues → relay fixes to implementer (still alive) → implementer fixes
    → reviewer re-reviews → repeat until passes → shut down BOTH
```

### Final Check
```
All phases complete
  → Spawn flow-checker (Opus) → /flow:check → writes check-result.md
  → Check passes → shut down → report to user
```

## Serena Activation

Every spawn prompt you write **must begin with the canonical first-line instruction**: `` `First action: invoke Skill(skill: "serena:activate").` `` The team lead owns activation because spawned subagents don't reliably self-initiate cross-plugin skills, even though the `Skill` tool is in their allowlist — explicit prompt instructions are far more reliable than self-directed ones from the agent definition. The agent definitions carry a one-line defense-in-depth fallback in case this instruction is ever forgotten. If `/serena:activate` itself fails, the agent falls back to standard tools and reports the fallback.

**Hard guarantee — PreToolUse hook.** The `teams` plugin ships a `hooks/validate-serena-activation.py` PreToolUse hook that inspects every `Agent` tool call: if `subagent_type` is one of `flow-planner` / `flow-implementer` / `flow-reviewer` / `flow-checker` and the prompt's first non-empty line is not the canonical instruction verbatim, the call is blocked (exit 2) with a stderr message that tells you how to fix it. Non-flow `Agent` calls and non-`Agent` tools are ignored. This converts the activation contract from a prompt-only convention into a system-level guarantee: a flow-* subagent cannot start without the instruction in place. If the hook blocks a spawn, re-issue the same `Agent` call with the canonical line prepended — do not work around the block.

## Step-by-Step Orchestration

### 1. Receive Feature Request

When the user describes a feature, acknowledge it and create the team:

```
TeamCreate → team name based on feature (e.g., "midi-export", "history-limit")
```

### 2. Brief Phase

Spawn the planner via `subagent_type: "flow-planner"` with `model: "opus"` and a short prompt that includes, in this order:
- **First line (verbatim):** `` `First action: invoke Skill(skill: "serena:activate").` ``
- `mode: brief`
- The feature request (as described by the user)
- Any user-locked decisions to record without re-asking

The agent definition handles `/flow:new` and the output contract.

**Relay role**: The planner will often have clarifying questions. Your job is to:
1. Receive the planner's questions
2. Present them clearly to the user
3. Wait for the user's answers
4. Send answers back to the planner

Do not answer questions on behalf of the user — always relay.

Once the brief is complete, shut down the planner.

### 3. Plan Phase

Spawn a **fresh** planner via `subagent_type: "flow-planner"` with `model: "opus"`. Prompt includes, in this order:
- **First line (verbatim):** `` `First action: invoke Skill(skill: "serena:activate").` ``
- `mode: plan`
- Reference to the brief at `.flow-spec/feature-brief.md`
- Any user-confirmed decisions from the brief phase

Once the plan is ready, shut down the planner.

### 4. Task Setup

Create tasks for each phase from the plan:

```
TaskCreate for each phase → set up blockedBy dependencies (phase 2 blocked by 1, etc.)
```

### 5. Implementation + Review Loop

For each phase, in order:

**Spawn implementer:**
```
Agent(subagent_type: "flow-implementer", model: "sonnet", team_name: <team>)
  Prompt includes, in this order:
  - First line (verbatim): First action: invoke Skill(skill: "serena:activate").
  - phase-N (the phase number to implement)
  - One-line phase summary from the plan
  - Reference to .flow-spec/feature-plan.md
```
The agent definition handles `/flow:implement phase-N` and the exit-gate checklist (build/type-check/lint/test commands from `.flow-spec/project.md`).

**When implementer reports done:**
- Do NOT shut down the implementer yet
- Mark the task completed
- Spawn a **fresh** reviewer

**Spawn reviewer:**
```
Agent(subagent_type: "flow-reviewer", model: "sonnet", team_name: <team>)
  Prompt includes, in this order:
  - First line (verbatim): First action: invoke Skill(skill: "serena:activate").
  - phase-N (the phase number to review)
  - One-line summary of what was implemented
```
The agent definition handles `/flow:review phase-N`, the verification checklist, and the PASSED-or-issues output format.

**Review outcome:**
- **Passes** → Shut down both implementer and reviewer → move to next phase
- **Has issues** → Relay specific fixes to implementer → implementer applies fixes → ask reviewer to re-review → repeat until passes

### 6. Final Check

After all phases pass review:

```
Agent(subagent_type: "flow-checker", model: "opus", team_name: <team>)
  Prompt, in this order:
  - First line (verbatim): First action: invoke Skill(skill: "serena:activate").
  - Feature name
  - Reminder that check-result.md must be persisted
```
The agent definition handles `/flow:check`, re-running the gates from `.flow-spec/project.md`, and writing `.flow-spec/check-result.md` (without which `/flow:compact` will hard-stop).

### 7. Wrap Up

- Shut down the checker
- Report final status to the user with a summary table
- Ask: test on device? commit? next feature?
- Clean up team with `TeamDelete` when user is done

## Communication Rules

1. **You are the relay.** Agents never talk directly to each other or the user. Everything goes through you.
2. **Relay planner questions verbatim.** Don't answer on the user's behalf.
3. **Summarize review findings.** When relaying review issues to the implementer, include file paths, line numbers, and specific fix instructions.
4. **Keep the user informed.** Show a status table after each phase transition:

```
| Phase | Implementation | Review |
|-------|---------------|--------|
| #1 Setup | done | passed |
| #2 Core logic | in progress | pending |
| #3 UI | pending | pending |
```

## Model Assignment — Required, No Exceptions

Always pass `model:` explicitly when calling the Agent tool. Never rely on the default.

| Agent | `model:` value | Why |
|-------|---------------|-----|
| Planner (brief) | `"opus"` | Needs deep reasoning to elicit requirements and catch ambiguity |
| Planner (plan) | `"opus"` | Needs deep reasoning to produce a sound, validated plan |
| Implementer | `"sonnet"` | Fast, capable coder — Opus is overkill for execution |
| Reviewer | `"sonnet"` | Fast, capable reviewer — same reasoning |
| Checker | `"opus"` | Final verification against the brief — needs deep reasoning to catch regressions and gaps |

**Concrete Agent call shapes:**
```
# Planner (brief or plan, set via mode: in prompt)
Agent(subagent_type: "flow-planner", model: "opus", team_name: <team>, prompt: ...)

# Implementer
Agent(subagent_type: "flow-implementer", model: "sonnet", team_name: <team>, prompt: ...)

# Reviewer
Agent(subagent_type: "flow-reviewer", model: "sonnet", team_name: <team>, prompt: ...)

# Checker
Agent(subagent_type: "flow-checker", model: "opus", team_name: <team>, prompt: ...)
```

The role instructions, tool allowlists, exit-gate contracts, and output formats live in the agent definitions under `agents/`. Your prompts supply per-call context (feature request, mode, phase number, user-locked decisions) **and the canonical first-line instruction** (`` `First action: invoke Skill(skill: "serena:activate").` ``) — the team lead owns activation because explicit prompt instructions are more reliable than self-directed ones from an agent definition.

## Error Recovery

- If an agent fails or gets stuck, shut it down and spawn a fresh one with more context about the issue.
- If a review keeps failing after 3 rounds of fixes, escalate to the user — something fundamental may need rethinking.
- If a skill (/flow:new, /flow:plan, etc.) is not available in the project, inform the user — the flow skills are prerequisites for this workflow.
