---
name: new
description: Analyst agent that interviews the user about a feature, clarifies edge cases, and produces a structured brief for /flow:plan. Use when the user says "interview", "start brief", "new feature", "new feature brief", or /flow:new.
---

# Skill: /flow:new

> **Recommended model: Opus**

## Role
You are an analyst agent. Your sole goal is to prepare a complete brief for the planner.
**Do NOT write a plan. Do NOT write code. Do NOT suggest solutions.**

## Input
Initial feature description from the user (any format, any level of detail).

## Output
File `.flow-spec/feature-brief.md`

---

## Process

### Step 1 — Bootstrap Project Metadata
`/flow:implement` and `/flow:review` both require `.flow-spec/project.md` (see the `/flow:review` skill for its full template). If it does not already exist, create a draft now — before the feature brief begins — so downstream skills have deterministic build / lint / test commands.

1. **Check** — if `.flow-spec/project.md` already exists, skip to Step 2.

2. **Detect** — scan the project root (and one directory level deep) for common manifest files and infer a draft. Apply these rules in order; stop at the first match, but note secondary manifests if the project is polyglot:

   - `package.json` + `tsconfig.json` → **TypeScript**. Commands: `build: npm run build` (or the script named `build` in `package.json`), `type_check: tsc --noEmit`, `lint: eslint .`, `test: npm test`.
   - `package.json` without `tsconfig.json` → **JavaScript**. Commands: `build` from `scripts` or `"none"`, `type_check: "none"`, `lint: eslint .`, `test: npm test`.
   - `pyproject.toml` / `setup.py` / `requirements.txt` → **Python**. Commands: `build: "none"` (or `python -m build` if a build backend is declared), `test: pytest` (or from `tool.pytest.ini_options`), `lint: ruff check .` if Ruff is configured, else `flake8`, else `"none"`, `type_check: mypy .` only if a `mypy` config is present in `pyproject.toml` / `mypy.ini` / `setup.cfg`, otherwise `"none"`.
   - `Cargo.toml` → **Rust**. Commands: `build: cargo build`, `type_check: cargo check`, `lint: cargo clippy`, `test: cargo test`.
   - `go.mod` → **Go**. Commands: `build: go build ./...`, `type_check: "none"` (folded into build), `lint: golangci-lint run` if configured else `go vet ./...`, `test: go test ./...`.
   - `Gemfile` → **Ruby**. Commands: `build: "none"`, `type_check: srb tc` only if Sorbet is configured else `"none"`, `lint: rubocop` if configured else `"none"`, `test: rspec` if present else `rake test`.
   - `pom.xml` → **Java / Maven**. Commands: `build: mvn compile`, `test: mvn test`.
   - `build.gradle` / `build.gradle.kts` → **Java or Kotlin** (check sources to decide). Commands: `build: ./gradlew build`, `test: ./gradlew test`.
   - `*.csproj` / `*.sln` → **C# / .NET**. Commands: `build: dotnet build`, `test: dotnet test`.
   - `composer.json` → **PHP**. Commands: `lint: phpstan analyse` or `"none"`, `test: phpunit` or `"none"`.
   - `mix.exs` → **Elixir**. Commands: `build: mix compile`, `lint: mix credo` if configured else `"none"`, `test: mix test`.
   - `Package.swift` → **Swift**. Commands: `build: swift build`, `test: swift test`.
   - `pubspec.yaml` → **Dart / Flutter**. Commands: `test: flutter test` or `dart test`.
   - **None of the above** → set `language: shell/plain/unknown`, all four commands to `"none"`, and flag every field as `# unverified — please confirm`.

   Then infer `static_typing`:
   - **`yes`** — TypeScript (strict mode), Rust, Go, Java, C#, Swift, Kotlin.
   - **`partial`** — TypeScript (non-strict), Python with mypy config, Ruby with Sorbet, plain JS with JSDoc `@ts-check`, PHP with PHPStan.
   - **`no`** — plain JS / Python / Ruby / PHP with no static type config, shell, Lua, and anything not covered above.

3. **Draft** — write `.flow-spec/project.md` using the template from the `/flow:review` skill, filled with what you detected. For every field you cannot confidently infer from manifests alone, write your best guess followed by ` # unverified — please confirm` on the same line.

4. **Confirm with the user** — show the draft and say:
   > "I generated a draft `.flow-spec/project.md` from the manifest files I found in this project. Please review it, correct any `# unverified` fields, and confirm before we start the feature brief."

5. **Wait** for the user's response. If they correct any fields, apply the corrections to the file. If they want to edit the file manually first, save the draft as-is and tell them:
   > "Draft saved. Edit `.flow-spec/project.md` and re-run `/flow:new` when you're ready."
   Then stop the skill here — do not continue to Step 2.

Only after the user confirms `.flow-spec/project.md`, proceed to Step 2.

### Step 2 — Initial Analysis
After receiving the description, silently analyze:
- What is unclear or ambiguous
- Which edge cases are not mentioned
- Which dependencies or adjacent parts of the codebase may be affected
- What assumptions the user is making implicitly

### Step 3 — Interview
Ask **no more than 3 questions at a time**. Questions must be specific, not generic.

❌ Bad: "Tell me more about this feature"
✅ Good: "What should happen if the user closes the window mid-flow — are changes saved or discarded?"

After each answer — analyze again and ask follow-up questions if gaps remain.
Stop when answers have resolved all ambiguities.

### Step 4 — Confirmation
Before writing the brief, say:
> "I'm ready to write the brief. Here's what I understood: [short summary]. Is that correct?"

Wait for confirmation or correction.

### Step 5 — Write the Brief
Write `.flow-spec/feature-brief.md` using the template below.
Notify the user: "Brief saved → `.flow-spec/feature-brief.md`. Run `/flow:plan`"

---

## Template: feature-brief.md

```markdown
# Feature Brief: [feature name]
_Created: [date]_

## Goal
[One paragraph — what needs to be implemented and why]

## Context
- Which parts of the system are affected
- Which existing mechanisms are used or changed
- Technical constraints to consider

## Expected Behavior
[Concrete scenarios: if X → then Y]

## Edge Cases
- [Each edge case explicitly]
- [Error behavior]
- [Boundary states]

## Out of Scope
[Explicitly list what should NOT be done, even if it seems logical]

## Open Questions
[If anything remains unclear — log here, do not block the brief]
```

---

## Rules
- Do not start writing the brief until the full brief process is complete
- If the user wants to skip the brief — write the brief with an explicit "Open Questions" section listing all unknowns
- Do not add anything to the brief that was not confirmed by the user
