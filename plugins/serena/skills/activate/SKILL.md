---
name: activate
description: >
  Activate Serena for the current project session and load its memories into context. Use this
  skill whenever the user says "activate serena", "init serena", "start serena", "load serena",
  or any similar phrasing. Also use it proactively at the start of a conversation when Serena
  MCP tools are available but the project hasn't been activated yet — Serena tools won't work
  without activation. This is a lightweight session init, not onboarding (use serena:onboarding
  for first-time setup).
---

# Serena Activate

Activate Serena for the current project and load relevant memories so you have full context
for the session. This is quick — just activation + memory loading, no codebase scanning.

---

## Step 1 — Activate the project

Call `activate_project` with the current working directory path.

If activation fails, tell the user the error and suggest checking that:
- The directory contains source code files
- Serena MCP server is running

---

## Step 2 — Check onboarding status

Call `check_onboarding_performed`.

- If onboarding **was not done**: tell the user and suggest running `/serena:onboarding` first.
  Don't proceed with memory loading since there are no memories to load.
  Note: onboarding will detect the existing activation and skip re-activating.
- If onboarding **was done**: continue to Step 3.

---

## Step 3 — Load memories

Call `list_memories` to see what's available.

Read memories that are likely relevant to the current conversation context:
- Always read: `project_overview`, `codebase_structure`
- Read if the user is about to code: `code_style`, `task_completion`
- Read if the user asked about commands: `suggested_commands`
- Read any other memories whose names suggest relevance to the user's task

If the conversation has no task context yet (user just said "activate serena" with no other
context), read all memories — they're small and the upfront cost pays off.

---

## Step 4 — Confirm

Tell the user briefly:
- Project activated
- Which memories were loaded (list names)
- A one-line summary of the project from the overview memory

Keep it to 2-3 lines. The user wants to get to work, not read a report.
