---
name: plan
description: Multi-role planning pipeline (planner ↔ validator within one chat) that turns a feature brief into a validated, phased implementation plan. Use when the user says "plan", "create plan", "plan feature", or /flow:plan.
---

# Skill: /flow:plan

> **Recommended model: Opus** for planner · **Sonnet** for validator

## Role
You are a planner agent. Your goal is to turn the brief into a step-by-step implementation plan
that will withstand critical review by the validator.

## Input
File `.flow-spec/feature-brief.md`

**If the file does not exist:**
- If the user provided an inline description (e.g., `/flow:plan Fix the login redirect loop`), generate a minimal brief from it and save to `.flow-spec/feature-brief.md` using the feature brief template. Mark `Open Questions` with everything you had to assume. Then continue planning.
- If no description was provided either — stop and say:
  > "Brief not found. Run `/flow:new [feature description]` first, or provide a description: `/flow:plan <description>`"

**If `.flow-spec/project.md` does not exist** — stop:
> "Project metadata not found. Run `/flow:new` first (it bootstraps `project.md`), or create it manually using the template in the `/flow:review` skill."

**If `.flow-spec/project.md` exists but contains any `# unverified` marker** — stop:
> "`.flow-spec/project.md` still has `# unverified` fields from a previous `/flow:new` draft. Confirm or correct them (then remove the `# unverified` markers) before running `/flow:plan`, otherwise downstream verifiers will run the wrong build / type-check / lint / test commands."

## Output
- `.flow-spec/feature-plan.md` — final plan after validation
- `.flow-spec/validation-report.md` — validator report

---

## Process

### Step 1 — Study the Context
Before writing the plan:
1. Read `feature-brief.md` in full
2. Read `.flow-spec/project.md` (required, hard-stopped above) — note the project's language, typing posture, and build / lint / test commands (see the `/flow:review` skill for the template)
3. Find and read all source files mentioned or affected by the brief — follow imports and references to understand the blast radius
4. If a similar feature already exists in the codebase — study how it was implemented and match its structure, error handling, and naming

**Goal:** have full technical context before writing a single plan step.

### Step 2 — Draft the Plan
Write a draft plan using the template below.

**Signatures-first rule:** for every new or modified function, method, or module — define the types, signatures, and contracts in the plan before any implementation steps. The plan must make it clear what the contracts look like before describing how to implement them. This lets the project's type checker / compiler / static analyzer (whatever is configured in `.flow-spec/project.md`) catch logic errors early and gives the verifier a clear target to check against.

**Decision Log rule:** for any step that involves a non-obvious architectural choice where multiple valid approaches exist, record it in the plan's optional `## Decision Log` section with what was decided, what alternatives were considered, and why this approach was chosen. If no such decisions came up during planning, omit the section entirely — do not add empty scaffolding. This section is later fanned out to `docs/flow/<slug>/decision-log.md` by `/flow:compact`.

**Mental Model rule:** if the feature has a non-trivial conceptual model worth preserving (core invariants, primary abstractions, state transitions, what-maps-to-what), record it in the plan's optional `## Mental Model` section. Keep it short — it should let a future reader think about the feature without re-reading the plan. Omit the section entirely for mechanical changes where no conceptual model is needed. This section is later fanned out to `docs/flow/<slug>/mental-model.md` by `/flow:compact`.

**Dependency Map rule:** for features touching three or more modules or crossing subsystem boundaries, record the module-to-module dependencies in the plan's optional `## Dependency Map` section — who imports whom, which modules share state, which boundaries are crossed. You already did this analysis in Step 1.3 (blast radius); this section just persists it. Omit the section entirely for single-file or single-module changes. This section is later fanned out to `docs/flow/<slug>/dependency-map.md` by `/flow:compact`.

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

**If the 3rd iteration still fails:** do **not** write `APPROVED`. Write `validation-report.md` with `Status: NEEDS_USER`, list the remaining blockers, and stop the skill with:
> "Automatic validation could not converge in 3 rounds. Review the blockers in `.flow-spec/validation-report.md` and decide whether to override or rework before `/flow:implement`."

Do not proceed to Step 4 in that case.

### Step 4 — Write the Final Plan
Write `.flow-spec/feature-plan.md`.
Notify the user: "Plan ready → `.flow-spec/feature-plan.md`. Run `/flow:implement phase-1`"

---

## Template: feature-plan.md

```markdown
# Plan: [feature name]
_Brief: `.flow-spec/feature-brief.md`_
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

## Decision Log
[Optional. Include only if non-obvious architectural choices came up during planning. For each: what was decided, what alternatives were considered, why this approach won. Omit the whole section if no such decisions were made — do not leave empty scaffolding.]

## Mental Model
[Optional. Include only if the feature has a non-trivial conceptual model worth preserving: core invariants, primary abstractions, state transitions, what-maps-to-what. Keep it short. Omit the whole section for mechanical changes — do not leave empty scaffolding.]

## Dependency Map
[Optional. Include only if the feature touches three or more modules or crosses subsystem boundaries. Record module-to-module dependencies: who imports whom, which modules share state, which boundaries are crossed. Omit the whole section for single-file or single-module changes — do not leave empty scaffolding.]

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

## Status: [APPROVED / NEEDS_REVISION / NEEDS_USER]

## Issues Found
1. [Step X does not handle edge case Y from the brief]
2. [Phase 2 changes interface Z but consumer W is not updated]

## Fixes Applied
1. [what was changed in the plan]
```
