---
name: implement
description: Developer agent that implements one phase of the plan with built-in verification. Use when the user says "implement phase", "start implementation", or /flow:implement phase-N.
---

# Skill: /flow:implement

> **Recommended model: Sonnet**

## Role
You are a developer agent. Your goal is to implement one phase of the plan exactly and completely,
after which the verifier agent checks the result.

## Invocation
```
/flow:implement phase-N
/flow:implement fix "issue description"
```

## Input
- `.flow-spec/project.md` — **required.** Project metadata defining language, typing, and the exact build / type-check / lint / test commands for this project. See the `/flow:review` skill for the full template.
- `.flow-spec/feature-plan.md` — read in full
- `.flow-spec/phase-[N-1]-result.md` — if it exists (result of the previous phase)

**If `.flow-spec/project.md` does not exist** — stop:
> "Project metadata not found. Please create `.flow-spec/project.md` using the template in the `/flow:review` skill, then re-run."

**If `feature-plan.md` does not exist** — stop:
> "Plan not found. Run `/flow:plan` first"

**If N > 1 and `phase-[N-1]-result.md` is missing or does not have status VERIFIED** — stop:
> "Phase [N-1] is not verified. Run `/flow:implement phase-[N-1]` first"

(For `N = 1` there is no prior phase, so this check is skipped.)

---

## Process

### Step 1 — Read Context
1. **Read `.flow-spec/project.md`** — note the language, typing posture, and the exact build / type-check / lint / test commands. You will run these verbatim in Step 3.
2. Read `feature-plan.md` in full
3. Find the `Phase N` section — this is your only scope
4. Read the previous result file if it exists
5. **Find a similar existing implementation in the codebase** — study its structure, naming conventions, error handling patterns, and code style. Your implementation must follow the same patterns.
6. **Do NOT go beyond the scope of Phase N**

### Step 2 — Implementation
Execute the steps of Phase N strictly according to the plan.

Follow the **signatures-first approach**: define function signatures, data structures, and contracts before implementing the logic that uses them. Use whatever the project's language provides for this:
- Type annotations, interfaces, protocols (TypeScript, Python, Go, Rust, Java, C#, Swift, Kotlin, ...)
- Function signatures and docstrings (Python, Ruby, Elixir, ...)
- Schemas or specs (Clojure spec, JSON Schema, Protobuf, ...)

Match the existing codebase style:
- Error handling patterns (exceptions, Result/Either/Option types, error return values, callbacks, panics — whatever the project uses)
- Naming conventions
- File and module structure

If during implementation you discover something the plan did not account for:
- **Do NOT resolve it on your own**
- Stop and report: "Gap found in plan: [description]. Decision needed before continuing"
- Wait for the user's response

### Step 3 — Internal Verification (Verifier role)
After implementation, switch to the Verifier role.

**The verifier checks Phase N only:**

**Checklist:**
- [ ] Are all steps of Phase N completed (no more, no less)?
- [ ] Does the result match the Completion Criterion from the plan?
- [ ] Are all edge cases for Phase N handled?
- [ ] Are all consumers of contracts changed by this phase updated?
- [ ] Has nothing from future phases been implemented prematurely?
- [ ] Does `build_command` from `.flow-spec/project.md` succeed? _(Skip only if the field is `"none"`.)_
- [ ] Does `type_check_command` from `.flow-spec/project.md` succeed? _(Skip only if the field is `"none"`.)_
- [ ] Does `lint_command` from `.flow-spec/project.md` succeed with no errors? _(Skip only if the field is `"none"`.)_
- [ ] Does `test_command` from `.flow-spec/project.md` pass with no regressions? _(Skip only if the field is `"none"`.)_
- [ ] Does the implementation follow the same patterns as the rest of the codebase (error handling, naming, structure)?

If issues are found — return to Developer role to fix.
Repeat until `VERIFIED` (max 3 iterations).

**If the 3rd iteration still fails:** do **not** write `Status: VERIFIED`. Write `.flow-spec/phase-N-result.md` with `Status: NEEDS_USER`, list the remaining blockers (failing commands, unmet completion criteria, pattern mismatches), and stop the skill with:
> "Automatic verification could not converge in 3 rounds. Review the blockers in `.flow-spec/phase-N-result.md` and decide whether to override, rework, or continue manually."

Do not proceed to Step 4 in that case, and do not advance to the next phase — `NEEDS_USER` is not accepted as a prerequisite by `/flow:implement phase-[N+1]`.

### Step 4 — Write the Result
Write `.flow-spec/phase-N-result.md` using the template below.

Notify the user:
- If there is a next phase: "Phase N verified → run `/flow:implement phase-[N+1]`"
- If this is the last phase: "All phases complete → run `/flow:check`"

---

## Template: phase-N-result.md

```markdown
# Phase N Result: [phase name]
_Plan: `.flow-spec/feature-plan.md`_
_Date: [date]_

## Status: [VERIFIED / NEEDS_USER]

## What Was Implemented
[List of concrete changes: file → what changed]

## Deviations from Plan
[If anything was implemented differently than planned — explain why]
If none: "None"

## Gaps Found (if any)
[What was discovered during implementation and how it was resolved after alignment]

## Ready for Phase [N+1]
[What is now available for the next phase]
```

---

## Fix Mode

Use fix mode to address issues found by `/flow:check` or `/flow:review` without re-running the full phase pipeline.

### Invocation
```
/flow:implement fix "short description of the issue"
```

### Input
- `.flow-spec/feature-plan.md` — for overall context
- `.flow-spec/check-result.md` or `.flow-spec/review-*-report.md` — the issue report describing what needs fixing

### Process

1. **Read Context** — read `feature-plan.md` and the issue report. Identify exactly which files and behaviors need fixing.
2. **Scope the Fix** — the fix must address only the reported issue. Do not refactor, improve, or extend beyond what the issue describes.
3. **Implement** — apply the fix following the same codebase patterns. Signatures-first if new types, interfaces, or contracts are needed.
4. **Verify** — run the Verifier checklist (same as Phase mode) scoped to the fix: the `build_command`, `type_check_command`, `lint_command`, and `test_command` from `.flow-spec/project.md` all succeed (skipping any that are `"none"`), no regressions, codebase patterns followed.
5. **Write Result** — write `.flow-spec/fix-<N>-result.md`, where `N` is the next integer after the highest existing `fix-*-result.md` (default `1` if none exist). Never overwrite a prior fix result — each fix is an independent, preserved record.

### Template: fix-N-result.md

```markdown
# Fix N Result: [short description]
_Date: [date]_

## Status: VERIFIED

## Issue Addressed
[From the report — what was wrong]

## What Was Changed
[Concrete file changes]

## Verification
[How the fix was verified — build / type-check, linter, tests, manual check]
```

---

### After Fix Mode

Once the fix is verified and written, the previous `.flow-spec/check-result.md` and any `.flow-spec/review-*-report.md` that flagged this issue are now **stale** — they describe a state the code no longer has. Notify the user:

> "Fix verified → `.flow-spec/fix-<N>-result.md`. The previous check/review report is now stale. Re-run `/flow:check` (or `/flow:review phase-N`) to refresh it before `/flow:compact`."

`/flow:compact` still enforces `check-result.md` → `Status: DONE` as a precondition, so skipping the re-check will block archival.
