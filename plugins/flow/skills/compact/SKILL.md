---
name: compact
description: Archives a completed feature — writes a consolidated summary to docs/flow/<slug>/ and deletes all feature-scoped artifacts from .flow-spec/, keeping only project.md. Use when the user says "archive feature", "compact feature", "wrap up", "clean flow-spec", or /flow:compact.
---

# Skill: /flow:compact

> **Recommended model: Sonnet**

## Role
You are an archivist agent. Your goal is to consolidate everything a completed feature produced into a summary (plus optional companion docs), then delete the working artifacts so `.flow-spec/` is clean for the next feature.

**You do not modify source code. You only read `.flow-spec/` files, write files under `docs/flow/<slug>/`, and delete feature-scoped files in `.flow-spec/`.**

## Input
- `.flow-spec/feature-brief.md` — required, source of feature name, goal, scope
- `.flow-spec/feature-plan.md` — required, source of planned phases and affected files
- `.flow-spec/phase-*-result.md` — required, source of what was actually implemented
- `.flow-spec/check-result.md` — **required**, must have `Status: DONE`
- `.flow-spec/review-*-report.md` — optional, source of review findings (if any)
- `.flow-spec/fix-*-result.md` — optional, all fix-result files are included if present
- `.flow-spec/feature-docs.md` — optional, fanned out into companion files when present (no skill in this plugin writes it today, but external/manual producers are supported)

## Output
- `docs/flow/<slug>/summary.md` — always written; self-contained, committable record of the completed feature
- `docs/flow/<slug>/mental-model.md` — written iff a `## Mental Model` section is present in `feature-plan.md` or `feature-docs.md`
- `docs/flow/<slug>/decision-log.md` — written iff a `## Decision Log` section is present in `feature-plan.md` or `feature-docs.md`
- `docs/flow/<slug>/dependency-map.md` — written iff a `## Dependency Map` section is present in `feature-plan.md` or `feature-docs.md`
- A clean `.flow-spec/` directory containing only `project.md`

---

## Preconditions (hard stops)

1. **`.flow-spec/check-result.md` missing** — stop:
   > "Final check has not been run. Run `/flow:check` before compacting."

2. **`check-result.md` does not have `Status: DONE`** (e.g., `HAS_ISSUES` or any other value) — stop:
   > "Final check is not DONE. Fix the issues with `/flow:implement fix \"…\"` and re-run `/flow:check` before compacting."

3. **`.flow-spec/feature-brief.md` missing** — stop:
   > "feature-brief.md not found — cannot derive feature name. Compact aborted."

---

## Process

### Step 1 — Derive the Slug
1. Read `.flow-spec/feature-brief.md` and find the first line matching `^# Feature Brief: (.+)$`.
2. Slugify the captured name:
   - lowercase
   - replace any run of non-alphanumeric characters with a single `-`
   - strip leading and trailing `-`
3. If the result is empty, stop:
   > "Could not derive a valid slug from the brief title. Rename the brief heading and try again."
4. Check whether `docs/flow/<slug>/` already exists. If it does, stop with the derived slug and source title inlined so the user can disambiguate:
   > "Archive folder `docs/flow/{slug}/` already exists (derived from brief title '{title}'). Rename the brief heading in `.flow-spec/feature-brief.md`, or delete the existing archive at `docs/flow/{slug}/` first."

### Step 2 — Read All Artifacts
Read every file listed in *Input* (skip optional ones that don't exist). Build an in-memory picture of:
- Goal and out-of-scope from the brief
- Phase names and completion criteria from the plan
- Concrete file changes and deviations from each `phase-*-result.md`
- Issue, file changes, and verification from each `fix-*-result.md` (if any) — these feed the `## Fixes Applied` section of the summary and must also be folded into `## What Was Built` and `## Files Changed` so nothing is lost when the artifacts are deleted
- Must-fix / should-fix counts from review reports (if any)
- Verified items and regressions from `check-result.md`
- If `feature-docs.md` exists, the text inside the `## Mental Model`, `## Decision Log`, `## Dependency Map` sections (any subset may be present)

Do **not** read any source code. The outputs are built from `.flow-spec/` artifacts only.

### Step 3 — Write the Summary
Create `docs/flow/<slug>/summary.md` using the template below. If `docs/` or `docs/flow/` do not yet exist in the project, create them as part of this step — a missing parent directory is expected on the first archive and is not an error. The summary must be **self-contained** — after Step 4 the original artifacts will be gone, so anything the user may want to know later must be preserved here.

### Step 3b — Fan Out Companion Sections (optional)
Produce standalone companion files under `docs/flow/<slug>/` by extracting named sections from two sources, in this priority order:

1. `.flow-spec/feature-docs.md` (if present) — may contain any of `## Mental Model`, `## Decision Log`, `## Dependency Map`.
2. `.flow-spec/feature-plan.md` — always present; may contain any of `## Mental Model`, `## Decision Log`, `## Dependency Map` written by `/flow:plan`.

For each of the three section names, take the body of the **first** occurrence found across these sources (content from the heading up to the next `## ` or EOF) and, if non-empty, write it to the matching file:

- `## Mental Model` → `docs/flow/<slug>/mental-model.md` (H1 `# Mental Model`)
- `## Decision Log` → `docs/flow/<slug>/decision-log.md` (H1 `# Decision Log`)
- `## Dependency Map` → `docs/flow/<slug>/dependency-map.md` (H1 `# Dependency Map`)

If a section is missing or empty in both sources, skip that companion file silently. The absence of `feature-docs.md` is not an error — companion files are produced directly from `feature-plan.md` whenever `/flow:plan` included the corresponding optional section.

### Step 4 — Delete Feature Artifacts
Delete each of these files individually (never `rm -rf` on `.flow-spec/`):
- `.flow-spec/feature-brief.md`
- `.flow-spec/feature-plan.md`
- `.flow-spec/validation-report.md` (if present)
- `.flow-spec/phase-*-result.md` (all)
- `.flow-spec/review-*-report.md` (all, including `review-all-report.md`)
- `.flow-spec/check-result.md`
- `.flow-spec/fix-*-result.md` (all, if present)
- `.flow-spec/feature-docs.md` (if present — its contents are now preserved under `docs/flow/<slug>/`)

**Do not delete:**
- `.flow-spec/project.md`
- anything under `docs/` — the archive you just wrote lives at `docs/flow/<slug>/`, outside `.flow-spec/`
- any other file the user may have placed in `.flow-spec/` that is not on the list above (including any legacy `<slug>/` archive folders from before archives moved to `docs/flow/` — leave those in place)

### Step 5 — Notify
> "✅ Feature archived → `docs/flow/<slug>/summary.md`. `.flow-spec/` is clean and ready for the next feature."

If any companion files were written in Step 3b, append a second line listing them, e.g.:
> "Companion docs: `mental-model.md`, `decision-log.md`."

---

## Template: summary.md

```markdown
# Feature Summary: [name]
_Archived: [date]_
_Status: DONE_

## Goal
[One paragraph from feature-brief.md Goal section]

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

## Fixes Applied
[One row per `fix-*-result.md`: issue addressed, files changed, how it was verified. "None" if no fix-mode runs occurred.]

## Out of Scope (Not Implemented)
[From the brief's Out of Scope section — preserved so future work knows what was deliberately skipped]

## Review Findings
[Summary of must-fix / should-fix counts across all review-*-report.md, or "No reviews run"]

## Final Check Outcome
[Verified items and regressions from check-result.md. Since the precondition requires DONE, this will always be a clean report.]

## Files Changed
[Deduplicated list of all files touched across phases, with a one-line note per file]

## Notes
[Anything else worth preserving: gaps found during implementation, open questions carried over, follow-up work suggested]
```

---

## Rules
- Do not read source code — the outputs are built from `.flow-spec/` artifacts only
- Do not modify `.flow-spec/project.md` — ever
- Do not delete unknown files in `.flow-spec/` — only the exact artifact names listed in Step 4
- If a `phase-*-result.md` or `review-*-report.md` is missing, note it in the summary's "Notes" section rather than stopping
- Never use `rm -rf` on `.flow-spec/` — delete files one at a time so a bug cannot take out the whole directory
- The skill is strictly additive to the workflow: it does not invoke any other skill, and it must only be run by the user after `/flow:check` has reported `DONE`
