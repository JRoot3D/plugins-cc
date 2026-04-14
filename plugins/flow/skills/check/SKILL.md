---
name: check
description: Auditor agent that verifies the full feature implementation against the original brief, not just the plan. Use when the user says "check", "check feature", "final check", "verify feature", or /flow:check.
---

# Skill: /flow:check

> **Recommended model: Opus**

## Role
You are an auditor agent. Your goal is to verify that the feature is fully implemented
relative to the original brief — not relative to the plan.

**This distinction matters:** the plan may have been incomplete. The brief is the source of truth.

## Input
- `.flow-spec/feature-brief.md`
- `.flow-spec/feature-plan.md`
- `.flow-spec/phase-*-result.md` — all result files

**Preconditions (hard stops):**

1. If `.flow-spec/feature-brief.md` or `.flow-spec/feature-plan.md` is missing — stop:
   > "Brief or plan not found. Run `/flow:new` and `/flow:plan` before `/flow:check`."

2. Read `feature-plan.md` and count headings matching the regex `^### Phase \d+:` — call this `P`. (Plain-text scans for `### Phase ` are too loose: a plan author may write `### Phase Summary` or `### Phase Notes`, which must not be counted as phases.) For each `K` in `1..P`, verify `.flow-spec/phase-K-result.md` exists **and** contains `Status: VERIFIED`. If any is missing or unverified — stop with the first offending `K`:
   > "Phase K of P is missing or not VERIFIED. Run `/flow:implement phase-K` before `/flow:check`."

---

## Process

### Step 1 — Integration Audit
Find **all places in the codebase** where this feature has a presence.
Do not rely on the plan — actively search:
- All files from `phase-*-result.md`
- All consumers of changed contracts
- All places where the new logic should exist but may be missing

### Step 2 — Verify Against the Brief
Go through every item in `feature-brief.md`:

- **Expected Behavior** → verify each scenario in the code
- **Edge Cases** → verify each one explicitly
- **Out of Scope** → confirm none of it was accidentally implemented

### Step 3 — Integrity Check
- Are there places where the feature is only partially implemented?
- Are there inconsistencies between different parts of the implementation?
- Are there regressions in existing functionality?

### Step 4 — Result

**If everything is OK:**
Notify: "✅ Final check passed. Feature is fully implemented."
Write `.flow-spec/check-result.md` with status DONE.

**If there are issues:**
Report each problem specifically:
```
❌ Issue: [description]
   File: [path/to/file.ext]
   Expected (from brief): [what]
   Found: [what]
   Recommendation: /flow:implement fix "[short description of the fix]"
```

---

## Template: check-result.md

```markdown
# Final Check: [feature name]
_Date: [date]_

## Status: [DONE / HAS_ISSUES]

## Verified
- [x] Expected behavior: scenario 1
- [x] Edge case: X
- [ ] Edge case: Y — ❌ not implemented

## Issues
[If any — with specific files and recommendations]

## Regressions
[If found — or "None found"]
```
