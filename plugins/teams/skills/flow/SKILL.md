---
name: flow
description: "Orchestrate a 3-agent feature development team (Planner, Implementer, Reviewer) that develops features through a phased pipeline with fresh-context spawning. Use this skill whenever the user asks to 'spin up a team', 'use the flow team', 'create a feature team', 'orchestrate agents', 'run the dev pipeline', or wants multiple agents collaborating on feature development with briefs, plans, implementation, and code review. Also trigger when user says '/teams:flow' or 'team workflow'."
---

# Flow Team — Phased Feature Development Pipeline

You are the **team lead** orchestrating a 3-agent feature development pipeline. Your job is to coordinate agents, relay communication between them and the user, manage tasks, and enforce the lifecycle rules below.

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
3. **`serena` plugin** from `plugins-cc` installed — every spawned agent runs `/serena:activate` first for semantic code navigation. (Also requires the Serena MCP server to be installed.)

## The Three Agents

| Role | Model | Purpose | Skills Used |
|------|-------|---------|-------------|
| **Planner** | Opus | Creates feature briefs and implementation plans | `/flow:new`, `/flow:plan` |
| **Implementer** | Sonnet | Implements features phase-by-phase | `/flow:implement phase-N` |
| **Reviewer** | Sonnet | Reviews code quality and correctness | `/flow:review`, `/flow:check` |

## Agent Lifecycle — Fresh Context is the Rule

Every agent gets a **fresh spawn** for each discrete step. This prevents stale context from accumulating and keeps each agent focused on its current task. The one exception: the implementer stays alive through the review cycle so it can apply fixes without respawning.

### Planner Lifecycle
```
Feature request received
  → Spawn planner (Opus) → /serena:activate → /flow:new (brief)
  → Relay planner questions to user, relay answers back
  → Brief complete → shut down planner
  → Spawn FRESH planner (Opus) → /serena:activate → /flow:plan (plan)
  → Plan complete → shut down planner
```

### Implementer + Reviewer Lifecycle (per phase)
```
Phase N ready
  → Spawn implementer (Sonnet) → /serena:activate → /flow:implement phase-N
  → Implementation done → Spawn reviewer (Sonnet) → /serena:activate → /flow:review phase-N
  → If review passes → shut down BOTH → next phase
  → If review has issues → relay fixes to implementer (still alive) → implementer fixes
    → reviewer re-reviews → repeat until passes → shut down BOTH
```

### Final Check
```
All phases complete
  → Spawn reviewer (Sonnet) → /serena:activate → /flow:check
  → Check passes → shut down → report to user
```

## Serena Activation

Every agent runs `/serena:activate` as its **first step** before doing any work. This gives it codebase awareness through Serena's semantic tools. Include this instruction in every agent prompt.

If Serena MCP is not available in the project, skip this step — the agents will fall back to standard tools.

## Step-by-Step Orchestration

### 1. Receive Feature Request

When the user describes a feature, acknowledge it and create the team:

```
TeamCreate → team name based on feature (e.g., "midi-export", "history-limit")
```

### 2. Brief Phase

Spawn the planner **with `model: "opus"`** with a prompt that includes:
- The feature request (as described by the user)
- Instruction to run `/serena:activate` first
- Instruction to run `/flow:new`
- Instruction to send results back to "team-lead"

**Relay role**: The planner will often have clarifying questions. Your job is to:
1. Receive the planner's questions
2. Present them clearly to the user
3. Wait for the user's answers
4. Send answers back to the planner

Do not answer questions on behalf of the user — always relay.

Once the brief is complete, shut down the planner.

### 3. Plan Phase

Spawn a **fresh** planner (new context, **`model: "opus"`**) with:
- Reference to the brief at `.flow-spec/feature-brief.md`
- Any user-confirmed decisions from the brief phase
- Instruction to run `/serena:activate` then `/flow:plan`

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
Agent(name: "implementer", model: sonnet, team_name: <team>)
  Prompt includes:
  - /serena:activate as first step
  - /flow:implement phase-N
  - Reference to plan at .flow-spec/feature-plan.md
  - Phase-specific summary of what to build
  - Project conventions reminder (run flutter analyze, tests, etc.)
```

**When implementer reports done:**
- Do NOT shut down the implementer yet
- Mark the task completed
- Spawn a **fresh** reviewer

**Spawn reviewer:**
```
Agent(name: "reviewer", model: sonnet, team_name: <team>)
  Prompt includes:
  - /serena:activate as first step  
  - /flow:review phase-N
  - Summary of what was implemented
  - What to check
```

**Review outcome:**
- **Passes** → Shut down both implementer and reviewer → move to next phase
- **Has issues** → Relay specific fixes to implementer → implementer applies fixes → ask reviewer to re-review → repeat until passes

### 6. Final Check

After all phases pass review:

```
Agent(name: "checker", model: sonnet, team_name: <team>)
  Prompt: /serena:activate → /flow:check
  Verifies the complete feature against the original brief
```

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
| Checker | `"sonnet"` | Final verification pass — same reasoning |

**Concrete Agent call shapes:**
```
# Planner
Agent(name: "planner", model: "opus", team_name: <team>, prompt: ...)

# Implementer
Agent(name: "implementer", model: "sonnet", team_name: <team>, prompt: ...)

# Reviewer
Agent(name: "reviewer", model: "sonnet", team_name: <team>, prompt: ...)

# Checker
Agent(name: "checker", model: "sonnet", team_name: <team>, prompt: ...)
```

## Agent Prompt Template

Every agent prompt should follow this structure:

```
You are the **{Role}** on the "{team-name}" team for {project description} at {working directory}.

## First Step
Run the skill `/serena:activate` to activate Serena for codebase awareness.

## Then
Run the skill `{/flow:skill}` to {task description}.

{Context about what to do, referencing .flow-spec/ files}

## Important
- Read CLAUDE.md for project conventions
- {Project-specific checks like "run flutter analyze", "run tests", etc.}

When done, send results to "team-lead" (me).
```

## Error Recovery

- If an agent fails or gets stuck, shut it down and spawn a fresh one with more context about the issue.
- If a review keeps failing after 3 rounds of fixes, escalate to the user — something fundamental may need rethinking.
- If a skill (/flow:new, /flow:plan, etc.) is not available in the project, inform the user — the flow skills are prerequisites for this workflow.
