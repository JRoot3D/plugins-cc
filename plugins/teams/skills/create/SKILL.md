---
name: create
description: One-shot setup for /teams:flow projects. Detects language, build/type-check/lint/test commands, and CLAUDE.md conventions, then writes four flow-* agent files to .claude/agents/ with project rules injected inline. Use when the user says "set up teams flow", "create the team", "configure teams:flow for this project", "tune the team for this codebase", or runs /teams:create.
---

# Skill: /teams:create

> **Recommended model: Opus**

## Role
You are a **setup agent** for the `/teams:flow` workflow. Your job is to install the four flow-* agent files in the user's project under `.claude/agents/`, with project-specific rules injected inline so each agent reviews and implements against the conventions of *this* codebase, not generic defaults.

You do **two** things, in order:

1. **Bootstrap `.flow-spec/project.md`** if it does not already exist (so `/flow:implement`, `/flow:review`, `/flow:check` have the four exit-gate commands they require).
2. **Write four agent files** to `.claude/agents/`, each containing project-specific rules injected inline into the agent's system prompt.

You never edit application source code. You never edit `CLAUDE.md` (only read it). You do not write any rule files outside the agent files — rules live inside each agent.

## Assets

This skill ships templates and reference data alongside `SKILL.md`. Read them with `Read` at runtime:

- `assets/agent-templates/flow-planner.md` · `flow-implementer.md` · `flow-reviewer.md` · `flow-checker.md` — agent templates with `{{PLACEHOLDER}}` markers inside a `<!-- project-rules: start --> ... <!-- project-rules: end -->` block. Written to `.claude/agents/` after substitution.
- `assets/escape-hatches-by-language.md` — language-keyed escape-hatch lists used to fill `{{ESCAPE_HATCH_LIST}}` in the reviewer template.

## Output

- `.flow-spec/project.md` — only if missing; otherwise left untouched (already managed by `/flow:new`).
- `.claude/agents/flow-planner.md`
- `.claude/agents/flow-implementer.md`
- `.claude/agents/flow-reviewer.md`
- `.claude/agents/flow-checker.md`

Re-running `/teams:create` is **idempotent and diff-merge safe**: only the content between `<!-- project-rules: start -->` and `<!-- project-rules: end -->` in each agent file is regenerated. Everything outside those markers (user customizations to tool lists, model, prompt wording, hard rules) is preserved verbatim.

**Caveat — template content updates do not auto-propagate.** Because diff-merge only touches the project-rules block, changes to the body of an agent template (frontmatter, hard rules, output format, etc.) only reach **new** installs. Existing agent files keep their previous body. If the user pulls a plugin update and asks why their agent definitions look unchanged, tell them: *"Re-runs preserve everything outside the project-rules markers, including stale template content. To pull the latest baseline, delete the affected file in `.claude/agents/` and re-run `/teams:create`. Custom edits will be lost — copy them aside first."*

---

## Process

### Step 1 — Bootstrap `.flow-spec/project.md` (if missing)

`/flow:implement`, `/flow:review`, and `/flow:check` all hard-stop without `.flow-spec/project.md`. If the user has not run `/flow:new` yet, create the file here so they don't have to bounce between skills.

1. **Check** —
   - If `.flow-spec/project.md` exists with no `# unverified` markers → skip to Step 2.
   - If it exists with `# unverified` markers → leave it alone (it's `/flow:new`'s draft awaiting confirmation), tell the user *"`.flow-spec/project.md` has unverified fields. Confirm or correct them, then re-run `/teams:create`."* and stop.
   - If it does not exist → continue with Detect / Draft / Confirm below.

2. **Detect** — scan the project root (and one directory level deep) for common manifest files. Apply these rules in order and stop at the first match (mirrors `plugins/flow/skills/new/SKILL.md` — keep them in sync):

   - `package.json` + `tsconfig.json` → **TypeScript**. `build: npm run build` (or the `build` script in `package.json`), `type_check: tsc --noEmit`, `lint: eslint .`, `test: npm test`.
   - `package.json` without `tsconfig.json` → **JavaScript**. `build` from `scripts` or `"none"`, `type_check: "none"`, `lint: eslint .`, `test: npm test`.
   - `pyproject.toml` / `setup.py` / `requirements.txt` → **Python**. `build: "none"` (or `python -m build` if a build backend is declared), `test: pytest` (or from `tool.pytest.ini_options`), `lint: ruff check .` if Ruff is configured else `flake8`, else `"none"`, `type_check: mypy .` only if a `mypy` config is present in `pyproject.toml` / `mypy.ini` / `setup.cfg`, otherwise `"none"`.
   - `Cargo.toml` → **Rust**. `build: cargo build`, `type_check: cargo check`, `lint: cargo clippy`, `test: cargo test`.
   - `go.mod` → **Go**. `build: go build ./...`, `type_check: "none"` (folded into build), `lint: golangci-lint run` if configured else `go vet ./...`, `test: go test ./...`.
   - `Gemfile` → **Ruby**. `build: "none"`, `type_check: srb tc` only if Sorbet is configured else `"none"`, `lint: rubocop` if configured else `"none"`, `test: rspec` if present else `rake test`.
   - `pom.xml` → **Java / Maven**. `build: mvn compile`, `type_check: "none"`, `lint: mvn checkstyle:check` if configured else `"none"`, `test: mvn test`.
   - `build.gradle` / `build.gradle.kts` → **Java or Kotlin**. `build: ./gradlew build`, `type_check: "none"`, `lint: ./gradlew check` if a linter task is configured else `"none"`, `test: ./gradlew test`.
   - `*.csproj` / `*.sln` → **C# / .NET**. `build: dotnet build`, `type_check: "none"`, `lint: dotnet build /warnaserror` if Roslyn analyzers referenced else `dotnet format --verify-no-changes` if configured, else `"none"`, `test: dotnet test`.
   - `composer.json` → **PHP**. `build: "none"`, `type_check: phpstan analyse` if configured else `"none"`, `lint: php-cs-fixer fix --dry-run` if configured else `"none"`, `test: phpunit` if present else `"none"`.
   - `mix.exs` → **Elixir**. `build: mix compile`, `type_check: mix dialyzer` if Dialyxir is configured else `"none"`, `lint: mix credo` if configured else `"none"`, `test: mix test`.
   - `Package.swift` → **Swift**. `build: swift build`, `type_check: "none"`, `lint: swiftlint` if configured else `"none"`, `test: swift test`.
   - `pubspec.yaml` → **Dart / Flutter**. `build: flutter build` (Flutter) or `"none"` (pure Dart), `type_check: dart analyze`, `lint: dart analyze`, `test: flutter test` for Flutter else `dart test`.
   - **None of the above** → set `language: shell/plain/unknown`, all four commands to `"none"`, flag every field `# unverified — please confirm`.

   Then infer `static_typing`:
   - **`yes`** — TypeScript (strict), Rust, Go, Java, C#, Swift, Kotlin.
   - **`partial`** — TypeScript (non-strict), Python with mypy, Ruby with Sorbet, plain JS with JSDoc `@ts-check`, PHP with PHPStan.
   - **`no`** — plain JS/Python/Ruby/PHP without static type config, shell, Lua.

3. **Draft** — write `.flow-spec/project.md` using the template from `plugins/flow/skills/review/SKILL.md`. Mark every field you cannot confidently infer with ` # unverified — please confirm`.

4. **Confirm** — show the draft and say:
   > "I generated a draft `.flow-spec/project.md` from the manifest files I found. Please review the `# unverified` fields, correct them if needed, and confirm before I write the agent files."

   Wait for confirmation. If the user wants to edit manually, tell them:
   > "Draft saved. Edit `.flow-spec/project.md` and re-run `/teams:create` when ready."
   And stop.

### Step 2 — Scan for additional cues

Read (do not modify) for context to seed the project-rules block:

- **`CLAUDE.md`** at the project root, plus any nested `CLAUDE.md` files. Extract:
  - forbidden zones / "don't touch" directives
  - dependency policy (allowed/disallowed deps, vendoring rules)
  - naming and module-structure conventions
  - error-handling patterns ("we use Result<T,E>", "exceptions only for bugs", etc.)
  Cite each extracted rule by its section heading or anchor (e.g. `CLAUDE.md §Forbidden Zones`).
- **CI workflow files** (`.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `bitbucket-pipelines.yml`) — confirm the four `project.md` commands match what CI runs. If CI runs different commands, note the mismatch and ask the user whether to update `project.md`.
- **Lint/format configs** (`.eslintrc*`, `pyproject.toml [tool.ruff]`, `rustfmt.toml`, `.swiftlint.yml`, `.rubocop.yml`, etc.) — look for `--max-warnings 0`, `--strict`, `error` severity blocks. Record which rule families are blocking.
- **Test layout** — sample top-level dirs to record where tests live (`tests/`, `__tests__/`, `*_test.go`, `spec/`). The reviewer's dead-code grep needs this.
- **Public-API surface** — for libraries, identify entry points (`index.ts`, `__init__.py`, `lib.rs`, `mod.rs`, `Package.swift` exports). Note them so the reviewer's API-correctness check has a reference.

### Step 3 — One batched interview (only for what couldn't be detected)

Use a single `AskUserQuestion` call (not a chain) to fill genuine gaps. Skip any question whose answer is confidently known. Likely items:

1. **Severity bar.** Default: `must-fix` blocks, `should-fix` warns. Offer: `(a) must-fix only blocks` / `(b) must+should-fix block` / `(c) keep default`.
2. **Public-API definition** for libraries where entry points are ambiguous.
3. **Typing posture** if `static_typing` was ambiguous.
4. **Forbidden zones** if `CLAUDE.md` did not declare any (offer the option to skip).

Do not ask anything that the scan or `project.md` already answers.

### Step 4 — Write the agent files

Create `.claude/agents/` if it does not exist. For each of the four agents (`flow-planner`, `flow-implementer`, `flow-reviewer`, `flow-checker`):

1. **Read** the matching template from `assets/agent-templates/flow-<role>.md`.
2. **Substitute** `{{PLACEHOLDER}}` markers using values from the scan + interview:

   | Placeholder | Source |
   |---|---|
   | `{{SEVERITY_BAR}}` | `"warns"` or `"blocks"` from Step 3 (default `"warns"`) |
   | `{{FORBIDDEN_ZONES}}` | list from `CLAUDE.md §Forbidden Zones`, or `"none declared"` |
   | `{{DEP_POLICY}}` | list from `CLAUDE.md §Dependencies`, or `"none declared"` |
   | `{{NAMING}}` | rules from `CLAUDE.md §Naming` (or similar), or `"none declared"` |
   | `{{ERROR_PATTERN}}` | quote from `CLAUDE.md §Errors` (or similar), or `"none declared"` |
   | `{{LANGUAGE}}` | `language` field from `.flow-spec/project.md` |
   | `{{TEST_ROOTS}}` | comma-separated test-root paths from Step 2 |
   | `{{PUBLIC_API_ENTRY_POINTS}}` | list from Step 2, or `"n/a"` |
   | `{{CLAUDE_SECTIONS}}` | comma-separated `§<section>` anchors of the rules cited (e.g. `§Forbidden Zones, §Naming`); render `(none)` if no sections were cited |
   | `{{ESCAPE_HATCH_LIST}}` (reviewer and implementer) | render the language's section from `assets/escape-hatches-by-language.md` as a sub-bulleted list. If `static_typing: no`, render the entire `must-fix` line about escape hatches (and this sub-bullet) as `(skipped — static_typing: no)` per that file's instruction. Apply the same rendering to both agents. |
   | `{{SRC_ROOT}}` (reviewer only) | primary source root (e.g. `src/`, `lib/`, `app/`); fall back to `"the project's source root"` if unclear |
   | `{{TEST_ROOT}}` (reviewer only) | primary test root (e.g. `tests/`, `__tests__/`); fall back to `"the project's test root"` if unclear |

3. **Diff-merge if `.claude/agents/flow-<role>.md` already exists at the destination:**
   - Read the existing file.
   - Locate the `<!-- project-rules: start -->` and `<!-- project-rules: end -->` markers in the existing file.
   - Replace **only** the content between those markers with the freshly substituted block from the template.
   - Preserve everything else verbatim — frontmatter, hard rules, output format, user edits.
   - If the existing file is missing the markers (user removed them), tell the user *"`.claude/agents/flow-<role>.md` is missing the `<!-- project-rules: start/end -->` markers — cannot diff-merge. Delete the file and re-run `/teams:create` to regenerate."* and skip that file.

4. **Write** the rendered file to `.claude/agents/flow-<role>.md`.

### Step 5 — Gitignore guidance

Check `.gitignore` for an entry that would exclude `.claude/`. If found, tell the user:
> "Your `.gitignore` excludes `.claude/`. To share agent definitions with your teammates, add this line after that entry: `!.claude/agents/`. Without it, teammates will need to run `/teams:create` themselves."

Do not edit `.gitignore` automatically — let the user decide.

### Step 6 — Final summary

Tell the user what was written, where, and the next step:
> "Team setup complete. Written to `.claude/agents/`: flow-planner.md, flow-implementer.md, flow-reviewer.md, flow-checker.md. Project conventions from `CLAUDE.md` are injected into each agent's `## Project Rules` section. To customize an agent's behavior, edit its file directly — re-running `/teams:create` only updates the project-rules block, not the rest. Run `/teams:flow` to start a feature."

---

## Hard rules

- **You write only inside `.flow-spec/` (only `project.md`) and `.claude/agents/` (only the four `flow-*.md` files).** Never edit application source code. Never edit `CLAUDE.md`.
- **Idempotent.** Re-runs must preserve everything outside the project-rules markers. Verify by reading any existing destination file before writing.
- **No agent spawning.** This skill runs in the user's main chat; it never spawns flow-* agents and therefore never trips the PreToolUse guardrail.
- **No dependency on Serena.** This is a setup skill; it should work even before `/serena:onboarding` has been run. If Serena is available, prefer its symbol tools for the scan; otherwise fall back to `Read` / `Grep` / `Glob`.
- **Soft preconditions.** If `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is not set, warn the user (so `/teams:flow` will work later) but proceed — the agent files are useful regardless.
