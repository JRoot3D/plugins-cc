# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code **plugin marketplace**, not a normal code project. There is no source code to build, no test suite, no linter. The "deliverables" are `SKILL.md` markdown files that Claude Code loads as skills at runtime. Treat changes here like editing prompts: correctness is checked by reading the skills end-to-end and by running them against a real project, not by `npm test`.

The marketplace is declared in `.claude-plugin/marketplace.json` and currently ships three plugins:

- **`flow`** — a six-step feature workflow (`new` → `plan` → `implement` → `review` → `check` → `compact`).
- **`serena`** — three helpers around the external Serena MCP server (`activate`, `onboarding`, `update`). The MCP server itself is **not** in this repo; these skills assume it is installed separately.
- **`teams`** — two skills: `teams:create` (one-shot project setup that writes the four flow-* agent files to `.claude/agents/` with project-specific rules injected inline) and `teams:flow` (orchestrates a 4-agent team — Planner/Implementer/Reviewer/Checker — running the `/flow:*` pipeline via `TeamCreate` + `Agent` spawning). Depends on `flow` and `serena` being installed, and requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in Claude Code settings. The plugin itself ships no agents — they live in the user's project after `/teams:create`.

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
  teams/
    .claude-plugin/plugin.json
    hooks/hooks.json                  # PreToolUse guardrail for Agent spawns
    hooks/validate-serena-activation.py
    skills/flow/SKILL.md              # /teams:flow — orchestrates the 4 agents (preflight-checks .claude/agents/)
    skills/create/SKILL.md            # /teams:create — installs the four agents into the user's project
    skills/create/assets/agent-templates/   # 4 agent templates with {{PLACEHOLDER}}s, written to .claude/agents/ by /teams:create
    skills/create/assets/escape-hatches-by-language.md   # reference data for the reviewer template
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
new        ──writes──▶ .flow-spec/feature-brief.md   (+ bootstraps project.md)
plan       ──reads──▶  feature-brief.md
           ──writes──▶ feature-plan.md, validation-report.md
implement  ──reads──▶  feature-plan.md, project.md, phase-[N-1]-result.md
           ──writes──▶ phase-N-result.md  (status: VERIFIED)
review     ──reads──▶  phase-N-result.md + changed source
           ──writes──▶ review-N-report.md
check──reads──▶  feature-brief.md + all phase-*-result.md
           ──writes──▶ check-result.md  (status: DONE)
compact    ──reads──▶  everything above (+ optional feature-docs.md)
           ──writes──▶ docs/flow/<feature-slug>/summary.md  (outside .flow-spec/, meant to be committed)
                       + optional mental-model.md, decision-log.md, dependency-map.md
                         (fanned out from feature-docs.md if present)
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
- It is **bootstrapped by** `new/SKILL.md` (during `/flow:new`) **and by** `plugins/teams/skills/create/SKILL.md` (during `/teams:create`). Both auto-detect language from manifest files (`package.json`, `pyproject.toml`, `Cargo.toml`, …) and draft the file with `# unverified` markers for the user to confirm. Each references the template in `review/SKILL.md` rather than inlining it.

**If you change the template in `review/SKILL.md`, also update the manifest-detection rules and the drafted field defaults in BOTH `new/SKILL.md` AND `plugins/teams/skills/create/SKILL.md`.** Two skills now duplicate the detection logic — there's no compile-time check, only grep.

## The `.claude/agents/` cross-skill contract

`.claude/agents/flow-{planner,implementer,reviewer,checker}.md` are per-project agent definition files (in the *user's* project, not this repo). They are:

- **Written** by `plugins/teams/skills/create/SKILL.md` (`/teams:create`) from templates at `plugins/teams/skills/create/assets/agent-templates/`. The skill substitutes `{{PLACEHOLDER}}` markers (severity bar, forbidden zones, dep policy, naming, error pattern, language, test roots, public API, escape-hatch list, src/test roots, CLAUDE sections) with project-specific values during the write.
- **Required** by `plugins/teams/skills/flow/SKILL.md` (`/teams:flow`) — Step 0 preflight-checks for `flow-planner.md` and hard-stops with a "run `/teams:create` first" message if absent.
- **The `## Project Rules` section** in each agent's system prompt holds the project-tuned rules. The block is bracketed by `<!-- project-rules: start -->` and `<!-- project-rules: end -->` sentinel markers. On re-runs, `/teams:create` regenerates **only** the content between those markers; everything outside (frontmatter, hard rules, output format, user customizations) is preserved verbatim.
- **Idempotency contract:** diff-merge of the project-rules block. Unlike a "skip-if-exists" contract, re-runs do refresh the rules to reflect the latest `CLAUDE.md` and scan output — but only inside the markers.

**Severity tags** (`[must-fix]` / `[should-fix]`) gate reviewer/checker behaviour. The bar is set at init time and stored in each agent's project-rules block under `**Severity bar:**`.

**If you change rule wording in any `assets/agent-templates/flow-*.md`** — that change only reaches **new installs**. Existing installs keep their previous body content; only the project-rules block is refreshed on re-runs. To pull updated agent logic, the user must delete the file in `.claude/agents/` and re-run `/teams:create`.

**If you change the project-rules placeholder set, also update the substitution table in `plugins/teams/skills/create/SKILL.md` Step 4** — there is no compile-time check tying the templates' `{{PLACEHOLDER}}`s to the SKILL's substitution map.

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
- **`/teams:create` re-runs are diff-merge.** Re-running the skill regenerates only the content between `<!-- project-rules: start -->` and `<!-- project-rules: end -->` markers in each `.claude/agents/flow-*.md` file. Everything outside (frontmatter, hard rules, output format, user customizations) is preserved verbatim. Don't change this contract without auditing the skill's idempotency promise — users will edit these files.
