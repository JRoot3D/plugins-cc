---
name: plan
description: Multi-agent planning pipeline that turns an interview brief into a validated, phased implementation plan. Use when the user says "plan", "deep plan", "create plan", "plan feature", or /flow:plan.
---

# Skill: /flow:plan

> **Recommended model: Opus** for planner · **Sonnet** for validator

## Role
You are a planner agent. Your goal is to turn the brief into a step-by-step implementation plan
that will withstand critical review by the validator.

## Input
File `.flow-spec/interview-brief.md`

**If the file does not exist:**
- If the user provided an inline description (e.g., `/flow:plan Fix the login redirect loop`), generate a minimal brief from it and save to `.flow-spec/interview-brief.md` using the interview brief template. Mark `Open Questions` with everything you had to assume. Then continue planning.
- If no description was provided either — stop and say:
  > "Brief not found. Run `/flow:interview [feature description]` first, or provide a description: `/flow:plan <description>`"

## Output
- `.flow-spec/feature-plan.md` — final plan after validation
- `.flow-spec/validation-report.md` — validator report

---

## Process

### Step 1 — Study the Context
Before writing the plan:
1. Read `interview-brief.md` in full
2. Read `.flow-spec/project.md` to note the project's language, typing posture, and build / lint / test commands (see the `/flow:review` skill for the template)
3. Find and read all source files mentioned or affected by the brief — follow imports and references to understand the blast radius
4. If a similar feature already exists in the codebase — study how it was implemented and match its structure, error handling, and naming

**Goal:** have full technical context before writing a single plan step.

### Step 2 — Draft the Plan
Write a draft plan using the template below.

**Signatures-first rule:** for every new or modified function, method, or module — define the types, signatures, and contracts in the plan before any implementation steps. The plan must make it clear what the contracts look like before describing how to implement them. This lets the project's type checker / compiler / static analyzer (whatever is configured in `.flow-spec/project.md`) catch logic errors early and gives the verifier a clear target to check against.

### Step 3 — Internal Validation (Validator role)
Switch to the Validator role and check the plan against the checklist:

**Validator checklist:**
- [ ] Is every plan step tied to a specific file?
- [ ] Are all edge cases from the brief reflected in the plan?
- [ ] Are there steps that change a public contract (type, interface, API) without updating all consumers?
- [ ] Are there steps that depend on a previous result but have no explicit verification?
- [ ] Does the plan contain anything outside the brief's scope?
- [ ] Does each phase have a clear, verifiable completion criterion?

If issues are found — log them in `validation-report.md` and return to Planner role to fix.
Repeat until the validator returns `APPROVED` (max 3 iterations).

### Step 4 — Write the Final Plan
Write `.flow-spec/feature-plan.md`.
Notify the user: "Plan ready → `.flow-spec/feature-plan.md`. Run `/flow:implement phase-1`"

---

## Template: feature-plan.md

```markdown
# Plan: [feature name]
_Brief: `.flow-spec/interview-brief.md`_
_Created: [date]_

## Overview
[One paragraph — what will be done]

## Affected Files
| File | Change Type | Reason |
|------|-------------|--------|
| path/to/file.ext | modify | ... |
| path/to/new.ext  | create  | ... |

## Changed Contracts
[Explicitly: which types/interfaces/functions will change their signature and who uses them]

## Phases

### Phase 1: [name]
**Goal:** [what must be ready after this phase]
**Files:** [specific list]

#### Steps:
1. [concrete action in a specific file]
2. ...

**Completion Criterion:** [how the verifier will know the phase is done correctly]

### Phase 2: [name]
**Dependency:** Phase 1 complete and verified
...

## Edge Cases in Implementation
[How each edge case from the brief is handled — specifically]

## What Is NOT Implemented
[From the brief — confirming scope]
```

---

## Template: validation-report.md

```markdown
# Validation Report: [feature name]
_Date: [date]_

## Status: [APPROVED / NEEDS_REVISION]

## Issues Found
1. [Step X does not handle edge case Y from the brief]
2. [Phase 2 changes interface Z but consumer W is not updated]

## Fixes Applied
1. [what was changed in the plan]
```
