# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code **plugin marketplace**, not a normal code project. There is no build and no linter. The "deliverables" are mostly `SKILL.md` markdown files that Claude Code loads as skills at runtime. Treat changes to them like editing prompts: correctness is checked by reading the skills end-to-end and by running them against a real project.

The marketplace is declared in `.claude-plugin/marketplace.json`. It ships one plugin:

- **`arch`** — multi-session architecture exploration (`/arch:new` → `triage` → `explore` ↔ `map` → `decide` → `finalize`, with `status` and `audit` anytime). `/arch:finalize` hands feature briefs to OpenSpec (`/opsx:propose`). Unlike a pure-markdown plugin it has code: `scripts/arch.py` (python3 3.8+, stdlib) owns `.arch/index.json`. Before changing it, read [plugins/arch/README.md → Development](plugins/arch/README.md#development): run `python3 plugins/arch/scripts/test_arch.py` (it also fails when a line the skills share drifts), the behaviour evals live in `plugins/arch/evals/`, and bump `version` in its `plugin.json` with every skill change.

## Repo layout

```
.claude-plugin/marketplace.json   # registers which plugins ship (source of truth)
plugins/
  <plugin>/
    .claude-plugin/plugin.json    # plugin manifest
    skills/<name>/SKILL.md        # one file per skill
README.md                         # user-facing docs
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

## Installing/testing changes locally

There is no build step. To test changes against a real project:

```
/plugin marketplace add /Users/jroot3d/Projects/plugins-cc
/plugin install <plugin>@plugins-cc
```

Changes to `SKILL.md` files take effect the next time Claude Code loads the plugin — reinstalling the plugin is the cleanest way to force a reload.
