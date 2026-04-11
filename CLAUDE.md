# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code **plugin marketplace**, not a normal code project. There is no source code to build, no test suite, no linter. The "deliverables" are `SKILL.md` markdown files that Claude Code loads as skills at runtime. Treat changes here like editing prompts: correctness is checked by reading the skills end-to-end and by running them against a real project, not by `npm test`.

The marketplace is declared in `.claude-plugin/marketplace.json` and currently ships two plugins:

- **`flow`** — a six-step feature workflow (`interview` → `plan` → `implement` → `review` → `final-check` → `archive`).
- **`serena`** — three helpers around the external Serena MCP server (`activate`, `onboarding`, `update`). The MCP server itself is **not** in this repo; these skills assume it is installed separately.

## Repo layout

```
.claude-plugin/marketplace.json   # registers which plugins ship (source of truth)
plugins/
  flow/
    .claude-plugin/plugin.json    # plugin manifest
    skills/<name>/SKILL.md        # one file per skill
  serena/
    .claude-plugin/plugin.json
    skills/<name>/SKILL.md
README.md                         # user-facing docs mirror
```

A plugin is considered shipped only if it appears in `marketplace.json` **and** has a `.claude-plugin/plugin.json`. Adding a new plugin requires both.

## Editing a skill

Each `SKILL.md` has YAML frontmatter:

```yaml
---
name: <skill-name>
description: <one-line description; include trigger phrases like "Use when the user says …" so Claude auto-invokes it>
---
```

The `description` is load-bearing — it's how Claude decides when to call the skill. When adding a new trigger phrase to the user-facing README, add it to the skill's `description` too, otherwise the skill won't auto-fire.

Immediately under the frontmatter, `flow` skills carry a line like `> **Recommended model: Opus**` or `**Sonnet**`. This is a deliberate design choice (heavy reasoning steps → Opus; execution/verification → Sonnet). Preserve it when editing.

## How `flow` skills compose (the important part)

`flow` is a pipeline whose contract is enforced **by hard-stop checks inside each skill**, not by any runtime. Skills never remember each other — they communicate only through files written to `.flow-spec/` in the *user's* project (not this repo). The dataflow:

```
interview  ──writes──▶ .flow-spec/interview-brief.md   (+ bootstraps project.md)
plan       ──reads──▶  interview-brief.md
           ──writes──▶ feature-plan.md, validation-report.md
implement  ──reads──▶  feature-plan.md, project.md, phase-[N-1]-result.md
           ──writes──▶ phase-N-result.md  (status: VERIFIED)
review     ──reads──▶  phase-N-result.md + changed source
           ──writes──▶ review-N-report.md
final-check──reads──▶  interview-brief.md + all phase-*-result.md
           ──writes──▶ final-check-result.md  (status: DONE)
archive    ──reads──▶  everything above
           ──writes──▶ docs/flow/<feature-slug>/summary.md  (outside .flow-spec/, meant to be committed)
           ──deletes─▶ all feature-scoped files in .flow-spec/ (keeps project.md)
```

**Invariants to preserve when editing any flow skill:**

1. **Hard-stops on missing inputs.** Every skill begins by checking its required files exist and stops with a specific user-facing message if they don't. Don't remove these — they are the error handling for the pipeline.
2. **`implement` requires a fresh chat per phase.** The skill explicitly warns that it reads files, not memory. Don't add instructions that assume continuity.
3. **Signatures-first rule.** `plan` writes contracts/types before steps; `implement` implements signatures before bodies. This is quoted between skills — keep the wording aligned if you change one.
4. **Verifier vs reviewer separation.** `implement` has a built-in verifier ("was the plan executed?"); `review` is a separate skill ("is the code well written?"). Don't blur these.

## The `.flow-spec/project.md` cross-skill contract

`.flow-spec/project.md` is a per-project metadata file (language, typing posture, exact `build`/`type_check`/`lint`/`test` commands).

- The **template lives in `plugins/flow/skills/review/SKILL.md`**.
- It is **consumed by** `implement/SKILL.md` and `review/SKILL.md` (both hard-stop if it's missing).
- It is **bootstrapped by** `interview/SKILL.md`, which auto-detects language from manifest files (`package.json`, `pyproject.toml`, `Cargo.toml`, …) and drafts the file with `# unverified` markers for the user to confirm.

**If you change the template in `review/SKILL.md`, also update the detection logic and the drafted fields in `interview/SKILL.md`.** There's no compile-time check for this — only grep.

## Installing/testing changes locally

There is no build step. To test changes against a real project:

```
/plugin marketplace add /Users/lexroot/Downloads/deep-plan
/plugin install flow@plugins-cc
/plugin install serena@plugins-cc
```

Then run the skill in a project directory (e.g., `/flow:plan`, `/serena:activate`). Changes to `SKILL.md` files take effect the next time Claude Code loads the plugin — reinstalling the plugin is the cleanest way to force a reload.

## Gotchas

- **`serena` skills require the Serena MCP server** to actually run. The skills themselves are pure markdown; they invoke MCP tools like `activate_project`, `check_onboarding_performed`, `list_memories`, `read_memory`. When reading these, assume those tools exist at runtime; don't inline their implementations.
- **`serena:onboarding` refuses to run if `CLAUDE.md` is missing in the target project** (the user's project, not this repo). This is intentional — don't weaken the check.
- **README and skills duplicate content.** The skill routing table in `README.md` and the `description:` fields in each `SKILL.md` must stay in sync. When adding a trigger phrase, update both.
