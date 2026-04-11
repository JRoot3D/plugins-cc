---
name: update
description: >
  Refresh Serena's project memories by comparing them against the current codebase and updating
  anything that's stale. Use this skill whenever the user says "update serena", "refresh memories",
  "sync serena", "update serena memory", "check if serena is up to date", or any similar phrasing.
  Also use it proactively after making significant structural changes to the codebase (new modules,
  renamed directories, changed entry points, added/removed dependencies) — if the changes would
  make existing Serena memories inaccurate, offer to run this skill. This is the complement to
  serena:onboarding: onboarding creates memories from scratch, this skill keeps them current.
---

# Serena Memory Update

Your goal is to compare Serena's stored memories against the current state of the codebase
and update any memories that have drifted. This is a surgical update, not a full rewrite —
only change what's actually stale.

---

## Step 1 — Ensure project is activated

**Skip this step** if `activate_project` was already called in this conversation
(e.g., via `/serena:activate`).

Otherwise, call `activate_project` with the current working directory path.
If activation fails, stop and report the error to the user.

---

## Step 2 — Read all existing memories

Call `list_memories` to get the full list, then `read_memory` for each one.
Save the content mentally — you'll compare it against the live codebase next.

If there are no memories at all, stop and tell the user:

> No Serena memories found. Run `/serena:onboarding` first to create them.

---

## Step 3 — Scan the current codebase

Gather fresh information to compare against the memories. Do these in parallel where possible:

### 3a. Structure scan
- `list_dir` on root (non-recursive, skip ignored files)
- `list_dir` recursively on `src/` (or equivalent source directory)
- Note any new directories, removed directories, or renamed modules

### 3b. Dependencies and scripts
- Read the package manifest (`package.json`, `*.csproj`, `Cargo.toml`, etc.)
- Compare scripts/commands against `suggested_commands` memory
- Check for new dependencies that indicate architectural changes

### 3c. Quick code scan (only if structure changed)
- For new modules/directories found in 3a, use `get_symbols_overview` on key files
  to understand their purpose
- Don't deep-read files that haven't changed — the existing memories cover those

---

## Step 4 — Diff memories against reality

For each memory, check whether its content still accurately reflects the codebase.
Categorize each memory as:

- **Current** — content matches reality, no changes needed
- **Stale** — some facts are outdated (missing new modules, removed files still listed, etc.)
- **Wrong** — content contradicts reality (renamed things, changed patterns)

Common things that go stale:
- `codebase_structure` — new files/directories, removed components, restructured modules
- `project_overview` — new features, changed architecture, new entry points
- `suggested_commands` — new npm scripts, changed build tools, added test frameworks
- `code_style` — new lint rules, changed conventions, new patterns
- `task_completion` — new CI steps, added test requirements

---

## Step 5 — Apply updates

For each stale or wrong memory, use `edit_memory` to make targeted fixes:

- **Add** new entries for things that didn't exist during onboarding
- **Remove** entries for things that no longer exist
- **Correct** entries where facts changed

Use `edit_memory` with `mode: "literal"` for precise replacements.
Use `mode: "regex"` only when you need pattern-based replacement.

Principles:
- Make the smallest edit that fixes the staleness — don't rewrite entire sections
  when only a line or two changed
- Preserve the existing writing style and formatting of each memory
- If a memory needs heavy rewrites (>50% changed), consider using `write_memory`
  to replace it entirely — but this is rare

---

## Step 6 — Report results

Tell the user what you found and what you changed. Use this format:

### Updated
- `memory_name` — what changed and why

### Already current
- `memory_name` — still accurate

### Questions
- Anything you couldn't verify (e.g., "Is the test framework still not set up?")

Keep the report concise. The user doesn't need to see every line you checked —
just what changed and what you're unsure about.
