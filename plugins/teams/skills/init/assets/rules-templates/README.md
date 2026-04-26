# .claude/rules/teams-flow/

These files are loaded by the four flow-* agents (planner / implementer / reviewer / checker) at spawn time during `/teams:flow`. Each agent reads `_shared.md` plus its own role file.

## Editing
- Rules tagged `[must-fix]` block the reviewer/checker; `[should-fix]` warns (per the severity bar in `_shared.md`).
- The `# imported from CLAUDE.md` … `# end imported` block at the top of each file is **auto-regenerated** by `/teams:init`. To change those rules, edit `CLAUDE.md` and re-run `/teams:init`.
- Anything **outside** the imported block is preserved across re-runs. Edit freely.

## Re-running `/teams:init`
Safe and idempotent. Re-detects manifests, refreshes the imported block, preserves your edits.

## Removing
Delete the directory to opt out — the agents fall back to their built-in defaults.
