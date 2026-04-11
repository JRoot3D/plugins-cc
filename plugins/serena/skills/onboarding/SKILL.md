---
name: onboarding
description: >
  Onboard Serena for a project by activating it, deeply exploring the codebase, and writing
  structured memory files so future conversations have full project context. Use this skill
  whenever the user says "onboard Serena", "set up Serena", "initialize Serena for this project",
  or any similar phrasing. Also trigger it when Serena's `check_onboarding_performed` tool
  returns that onboarding has not been performed yet — even mid-task, pause and complete
  onboarding before continuing. This skill is the correct way to initialize Serena on any new
  or previously unseen project.
---

# Serena Onboarding

Your goal is to build a complete, lasting picture of the project and save it to Serena's memory
so that all future conversations start with full context — no re-exploration needed.

---

## Step 1 — Check for CLAUDE.md

Before doing anything else, check whether a `CLAUDE.md` file exists in the project root.

If it **does not exist**, stop immediately and tell the user:

> `CLAUDE.md` is missing. Please run `/init` first to generate it, then re-run Serena onboarding.

Do not proceed with any further steps until `CLAUDE.md` exists.

---

## Step 2 — Ensure project is activated

All Serena tools require an active project. **Skip this step** if `activate_project` was already
called in this conversation (e.g., via `/serena:activate`).

Otherwise, call `activate_project` with the current working directory path.
If activation fails, stop and report the error to the user.

---

## Step 3 — Check onboarding status

Call `check_onboarding_performed`.

- If onboarding **was already done**: report this to the user and stop. Don't overwrite existing memories unless the user explicitly asks to redo onboarding.
- If onboarding **was not done**: call `onboarding` to get Serena's instructions, then continue below.

---

## Step 4 — Deep project exploration

Explore thoroughly. The goal is to understand the project well enough that a developer joining
the team could be fully briefed from the memory files you write.

Work through these in order, reading what you find:

### 4a. Entry points and purpose
- `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/` — start here for stated purpose
- Top-level `Program.cs`, `main.go`, `main.py`, `index.ts`, `App.java`, etc. — understand how the app starts
- `docker-compose.yml`, `Dockerfile` — runtime environment

### 4b. Project structure
- Call `list_dir` on the root (non-recursive first, then recursively on `src/`, `lib/`, or equivalent)
- Identify top-level modules/packages and their responsibilities

### 4c. Tech stack
- Package/dependency file: `*.csproj`, `go.mod`, `package.json`, `Cargo.toml`, `requirements.txt`, `build.gradle`, etc.
- Note framework, key libraries, runtime version

### 4d. Build, run, test, lint commands
- `Makefile`, `justfile`, `taskfile.yaml`, `.github/workflows/`, `.gitlab-ci.yml`, `scripts/`
- Project config: `launchSettings.json`, `appsettings.json`, `.env.example`
- If not found in files, **ask the user** — this is critical for the `suggested_commands.md` memory

### 4e. Code style and conventions
- Linter/formatter configs: `.editorconfig`, `.eslintrc`, `pyproject.toml`, `rustfmt.toml`, `.golangci.yml`, etc.
- Read 2–3 representative source files to observe: naming conventions, error handling patterns, comment style, type annotation habits, test structure

### 4f. Project-specific guidelines
- Any `CONTRIBUTING.md`, `ARCHITECTURE.md`, `ADR/` (architecture decision records)
- Note patterns that aren't obvious from code alone (e.g., "all DTOs use records", "always use X instead of Y")

### When to ask the user

Ask if you cannot find:
- How to run the project locally
- How to run tests
- Any mandatory pre-commit or CI steps
- Team conventions that aren't encoded in config files

Ask concisely: list all your questions at once rather than one at a time.

---

## Step 5 — Write memory files

Call `write_memory` multiple times to save what you found. Use descriptive file names that make
their contents obvious at a glance.

**Required coverage** (file names are flexible, but these topics must be covered):

| Topic | Suggested name | Contents |
|-------|---------------|----------|
| Project overview | `project_overview.md` | Purpose, tech stack, architecture summary, links |
| Codebase structure | `codebase_structure.md` | Directory layout, what each module does |
| Commands | `suggested_commands.md` | Build, run, test, lint, format — copy-pasteable |
| Code style | `code_style.md` | Naming, patterns, conventions, what to avoid |
| Task completion | `task_completion.md` | What to run before marking a task done (tests, lint, format) |

Add extra memory files for anything substantial that doesn't fit: e.g., `api_design.md`,
`deployment.md`, `architecture_decisions.md`.

**Good memory files are:**
- Concise but complete — a developer should be able to act on them without reading source code
- Written in the imperative for commands and conventions ("use X", "run Y before committing")
- Honest about uncertainty ("TODO: confirm with team" is fine)

---

## Step 6 — Update CLAUDE.md with Serena navigation instructions

If the project has a `CLAUDE.md` file, add a **Codebase Navigation** section to it so that all future Claude Code sessions know to use Serena MCP for code exploration.

Check whether a `## Codebase Navigation` section already exists. If it does, skip this step.

If it doesn't, append the following section before `## Key Conventions` (or at the end of the file if that heading doesn't exist):

```markdown
## Codebase Navigation

Use **Serena MCP** for all codebase navigation tasks. Serena provides semantic, symbol-aware tools that are more efficient than raw file reads:

- `get_symbols_overview` — list classes/methods in a file without reading the full body
- `find_symbol` — locate a specific class, method, or field by name path
- `find_referencing_symbols` — find all usages of a symbol across the codebase
- `search_for_pattern` — regex search when symbol names are unknown

Prefer Serena's symbol tools over `Read`/`Grep` for source code exploration. Only fall back to file-based tools when Serena is unavailable or for non-code files (JSON configs, Markdown, etc.).
```

Use the `Edit` tool (or Serena's `replace_content`) to insert the section. Do not overwrite the rest of the file.

---

## Step 7 — Confirm and summarize

After writing all memory files, tell the user:
1. What memories were created (list file names and one-line descriptions)
2. Anything you couldn't find and left as TODO
3. Any follow-up questions for the user to fill gaps later
