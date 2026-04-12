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

**If any file is missing or a phase does not have status VERIFIED** — stop:
> "Not all phases are verified. Check the status in phase-*-result.md files"

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
