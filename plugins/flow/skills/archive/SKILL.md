---
name: archive
description: Archives a completed feature — writes a consolidated summary and deletes all feature-scoped artifacts from .flow-spec/, keeping only project.md. Use when the user says "archive feature", "wrap up", "clean flow-spec", or /flow:archive.
---

# Skill: /flow:archive

> **Recommended model: Sonnet**

## Role
You are an archivist agent. Your goal is to consolidate everything a completed feature produced into a single summary, then delete the working artifacts so `.flow-spec/` is clean for the next feature.

**You do not modify source code. You only read `.flow-spec/` files, write one summary, and delete feature-scoped files.**

## Input
- `.flow-spec/interview-brief.md` — source of feature name, goal, scope
- `.flow-spec/feature-plan.md` — source of planned phases and affected files
- `.flow-spec/phase-*-result.md` — source of what was actually implemented
- `.flow-spec/review-*-report.md` — optional, source of review findings (if any)
- `.flow-spec/final-check-result.md` — **required**, must have `Status: DONE`
- `.flow-spec/fix-result.md` — optional, included if present

## Output
- `docs/flow/<feature-slug>/summary.md` — self-contained, committable record of the completed feature
- A clean `.flow-spec/` directory containing only `project.md` (the archive lives under `docs/flow/`, outside `.flow-spec/`)

---

## Preconditions (hard stops)

1. **`.flow-spec/final-check-result.md` missing** — stop:
   > "Final check has not been run. Run `/flow:final-check` before archiving."

2. **`final-check-result.md` does not have `Status: DONE`** (e.g., `HAS_ISSUES` or any other value) — stop:
   > "Final check is not DONE. Fix the issues with `/flow:implement fix \"…\"` and re-run `/flow:final-check` before archiving."

3. **`.flow-spec/interview-brief.md` missing** — stop:
   > "interview-brief.md not found — cannot derive feature name. Archive aborted."

---

## Process

### Step 1 — Derive the Slug
1. Read `.flow-spec/interview-brief.md` and find the first line matching `^# Feature Brief: (.+)$`.
2. Slugify the captured name:
   - lowercase
   - replace any run of non-alphanumeric characters with a single `-`
   - strip leading and trailing `-`
3. If the result is empty, stop:
   > "Could not derive a valid slug from the brief title. Rename the brief heading and try again."
4. Check whether `docs/flow/<slug>/` already exists. If it does, stop:
   > "Archive folder `docs/flow/<slug>/` already exists. Pick a different name or delete the existing archive first."

### Step 2 — Read All Artifacts
Read every file listed in *Input* (skip optional ones that don't exist). Build an in-memory picture of:
- Goal and out-of-scope from the brief
- Phase names and completion criteria from the plan
- Concrete file changes and deviations from each `phase-*-result.md`
- Must-fix / should-fix counts from review reports (if any)
- Verified items and regressions from `final-check-result.md`

Do **not** read any source code. The summary is built from `.flow-spec/` artifacts only.

### Step 3 — Write the Summary
Create `docs/flow/<slug>/summary.md` using the template below. If `docs/` or `docs/flow/` do not yet exist in the project, create them as part of this step — a missing parent directory is expected on the first archive and is not an error. The summary must be **self-contained** — after the next step the original artifacts will be gone, so anything the user may want to know later must be preserved here.

### Step 4 — Delete Feature Artifacts
Delete each of these files individually (never `rm -rf` on `.flow-spec/`):
- `.flow-spec/interview-brief.md`
- `.flow-spec/feature-plan.md`
- `.flow-spec/validation-report.md` (if present)
- `.flow-spec/phase-*-result.md` (all)
- `.flow-spec/review-*-report.md` (all, including `review-all-report.md`)
- `.flow-spec/final-check-result.md`
- `.flow-spec/fix-result.md` (if present)

**Do not delete:**
- `.flow-spec/project.md`
- anything under `docs/` — the archive you just wrote lives at `docs/flow/<slug>/summary.md`, outside `.flow-spec/`
- any other file the user may have placed in `.flow-spec/` that is not on the list above (including any legacy `<slug>/` archive folders from before archives moved to `docs/flow/` — leave those in place)

### Step 5 — Notify
> "✅ Feature archived → `docs/flow/<slug>/summary.md`. `.flow-spec/` is clean and ready for the next feature."

---

## Template: summary.md

```markdown
# Feature Summary: [name]
_Archived: [date]_
_Status: DONE_

## Goal
[One paragraph from interview-brief.md Goal section]

## What Was Built
[Consolidated across all phase-*-result.md — concrete file changes, grouped by subsystem if possible]

## Phases Completed
| Phase | Name | Key Outcome |
|-------|------|-------------|
| 1     | ...  | ...         |
| 2     | ...  | ...         |

## Edge Cases Handled
[From brief, cross-referenced with phase results — each edge case and how it was resolved]

## Deviations From Original Plan
[Aggregated from the "Deviations from Plan" sections of phase results. "None" if all phases reported none.]

## Out of Scope (Not Implemented)
[From the brief's Out of Scope section — preserved so future work knows what was deliberately skipped]

## Review Findings
[Summary of must-fix / should-fix counts across all review-*-report.md, or "No reviews run"]

## Final Check Outcome
[Verified items and regressions from final-check-result.md. Since the precondition requires DONE, this will always be a clean report.]

## Files Changed
[Deduplicated list of all files touched across phases, with a one-line note per file]

## Notes
[Anything else worth preserving: gaps found during implementation, open questions carried over, follow-up work suggested]
```

---

## Rules
- Do not read source code — the summary is built from `.flow-spec/` artifacts only
- Do not modify `.flow-spec/project.md` — ever
- Do not delete unknown files in `.flow-spec/` — only the exact artifact names listed in Step 4
- If a `phase-*-result.md` or `review-*-report.md` is missing, note it in the summary's "Notes" section rather than stopping
- Never use `rm -rf` on `.flow-spec/` — delete files one at a time so a bug cannot take out the whole directory
- The skill is strictly additive to the workflow: it does not invoke any other skill, and it must only be run by the user after `/flow:final-check` has reported `DONE`
