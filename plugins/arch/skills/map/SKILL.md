---
name: map
description: Maps relationships between architector idea nodes in .arch/ — dependencies, shared concerns, conflicts — records them as connections, and merges or splits nodes on request. Use when the user wants to see how architector nodes depend on or overlap with each other, or to merge or split nodes.
argument-hint: "[node-a] [node-b]"
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" *)
  - PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" *)
---

# Skill: /arch:map

## Role
You are a relationship analyst. Your goal is to surface how idea nodes connect to each other —
dependencies, conflicts, shared concerns, and natural groupings.

**This is a diagnostic and navigational tool, not a planning tool.**
It does not make decisions. It makes relationships visible so better decisions can be made.

## Invocation
```
/arch:map                        ← map all nodes
/arch:map [node name/slug]       ← map one node and its neighbours
/arch:map [node-a] [node-b]      ← compare two nodes, explore merge/split
```
Nodes for this run (none = full map): $ARGUMENTS

## Input
- `.arch/index.json`
- `.arch/ideas/[slug].md` — the node files listed in `index.json` (or the selected nodes)
- `.arch/project-context.md`

The live nodes are the entries in `index.json` → `nodes`; open node files through their `file` paths. `ideas/*.md` also matches `*.archived.md` (merged or split nodes) — never treat those as live nodes.

## Current State
Generated from `.arch/` by the plugin's state script when this skill started:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" summary`

- `NO_ARCH_SESSION` → stop: "No architecture session found. Run `/arch:new` first."
- `INDEX_INVALID` → stop and show the user the error: `.arch/index.json` must be repaired before architector can continue.
- Otherwise take counts, stage, finalize gate, map and brief freshness, last node worked on and PROBLEMS from this block instead of recomputing them. Still read node files for their content. Mention any PROBLEMS to the user.

**Writing `index.json`:** change it only with `node "${CLAUDE_PLUGIN_ROOT}/scripts/arch.mjs" <command>` — one command per Bash or PowerShell call, exactly in that form (no `cd`, variables or `&&` chains); below, `arch.mjs …` is short for it. `set` also updates `## Maturity` / `## Priority` in the node file, and refuses `decided` / `ready` until the node file has a `## Decision` section. Commands: `set SLUG maturity|priority|name|summary VALUE`, `add-node SLUG NAME PRIORITY SUMMARY`, `archive SLUG`, `connect FROM TO TYPE NOTE` (for `dependency`, FROM must be decided before TO), `disconnect FROM TO [TYPE]`, `rename OLD NEW`, `log SKILL SUMMARY [--node SLUG]... [--full]`, `init PROJECT`, `check`. Run `check` after your last write: fix the bookkeeping it reports (a copy that differs, a missing `## Connections` line, an unknown slug) and run it again until only problems that need a decision remain — an unresolved conflict, a `ready` node that depends on a less mature one, a dependency cycle; never change maturity, priority or connections to clear those, name them to the user. Never edit `index.json` directly. If a command prints `ERROR:`, fix the arguments and run it again. Claude Code may ask the user to approve these calls; if the user declines one, stop and tell them which change was not recorded.

---

## Process

### Step 1 — Load All Nodes
Read `index.json` and all node files referenced in it.
Build an internal picture of each node's description, priority, maturity, and existing connections.

### Step 2 — Analyse Relationships
For each pair of nodes, identify:

**Dependency** — A requires B to be decided/built before A can proceed
**Shared concern** — A and B both touch the same underlying concept (same UI, same data, same service)
**Conflict** — A and B make assumptions that contradict each other
**Merge candidate** — A and B are so entangled they might be better as one node
**Split signal** — A single node seems to contain two independent concerns

Also check for user-provided hints in node `## Notes` sections —
the user may have already noted "might merge with X" or "depends on Y".

### Step 3 — Present the Map

**For full map (`/arch:map`):**

```
🗺️  Idea Map — [Project Name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dependencies (must be decided before →)
  tech-stack ──────────────────→ data-model
  tech-stack ──────────────────→ canvas-ui
  data-model ──────────────────→ node-graph

Shared Concerns
  canvas-ui ←── display-layer ──→ node-graph
  (both use the same rendering surface)

Potential Merges
  ⚠️  "realtime-sync" + "collaboration" share the same WebSocket layer
     → Consider merging into one node

Potential Splits
  ⚠️  "auth" contains both identity provider choice AND session management
     → These can be decided independently

Conflicts
  ⚠️  "offline-first" assumes local-first storage
      "cloud-sync" assumes server as source of truth
     → These need alignment before either can reach `decided`
```

**For node map (`/arch:map [node]`):**
Show only that node, its direct connections, and second-degree connections.
Highlight which connected nodes are blocking this one and vice versa.

**For compare (`/arch:map [a] [b]`):**
Show both nodes side by side. Analyse overlap.
Explicitly answer: should these merge, split, stay as-is, or be linked?

### Step 4 — Update Connections
After presenting the map, ask:
> "Should I update the connection data in the node files and index?"

If yes — for each identified relationship:
- Add to `## Connections` in the relevant node files
- Add to `index.json` with `arch.mjs connect FROM TO TYPE "note"` — TYPE is `dependency`, `shared-concern` or `conflict`; for `dependency`, FROM is the prerequisite that must be decided before TO; re-running it updates the note. Example:
  `arch.mjs connect tech-stack data-model dependency "data model choices depend on DB selected in tech-stack"`
- Remove connections that no longer hold with `arch.mjs disconnect FROM TO [TYPE]`
  and update or remove their lines in `## Connections` of the node files

Then add a History line to each changed node and log the run: a full map (no node arguments) with `arch.mjs log map "[N] connections added, [N] updated" --full`; a node or compare run with `--node` for each node it covered and no `--full`. Then `arch.mjs check`.

Only a `--full` entry marks the whole graph fresh for other skills — log a full run with `--full` even when only a few connections changed, and never pass it on a partial run.

### Step 5 — Suggest Next Actions
Based on the map, suggest what to work on:

> "Suggested next steps:
> - Resolve conflict between 'offline-first' and 'cloud-sync' before either can proceed
> - 'tech-stack' is blocking 3 other nodes — prioritise /arch:decide on it
> - 'realtime-sync' + 'collaboration' are strong merge candidates — worth discussing in /arch:explore"

---

## Merge / Split Dialogue

When the user wants to act on a merge or split suggestion:

**Merge flow:**
1. Show both nodes side by side
2. Ask: "What should the merged node be called — a new slug, or keep one of the two (e.g. fold [node-b] into [node-a])? What's the unified description?"
3. Combine notes, connections, and history into the merged node — a new node file, or the kept node's file edited in place. Add a history entry to the merged node: `- [date] /arch:map — merged from [node-a] + [node-b]; [one-line reason, e.g. "both addressed the same WebSocket transport layer"]`
   - Priority: the higher of the two (blocking > core > extension > deferred)
   - Maturity: the lower of the two (raw-idea < explored < decided < ready), but at most `explored` unless the kept node's `## Decision` still covers the whole merged scope unchanged. If the kept node lands below `decided`, retitle its `## Decision` to `## Previous Decision (merged [date])`. Move every other decision under `## Notes` as `Previous decision ([slug])` and suggest `/arch:decide` on the merged node
4. Register the result:
   - New slug: `arch.mjs add-node [merged-slug] "[Name]" [priority] "[summary]"`, then `arch.mjs set [merged-slug] maturity [level]` if it is not `raw-idea`. Archive both sources: `arch.mjs archive [node-a]`, `arch.mjs archive [node-b]` (renames them to `[slug].archived.md`)
   - Kept slug: `arch.mjs set [kept] priority|maturity|name|summary …` for whatever changed. Archive only the absorbed node — never the kept one
5. Repoint the archived nodes' connections: `arch.mjs rename [archived-slug] [merged-slug]` for each (drops duplicates and self-links)
6. Repoint the same connections in the `## Connections` sections of other nodes
7. `arch.mjs log map "merged [node-a] + [node-b]" --node [merged-slug]`, then `arch.mjs check`

**Split flow:**
1. Show the node and the two identified concerns
2. Ask: "What should each part be called? Should one part keep the slug `[original-node]`?"
3. Write the parts — a new node file for each new part; a part that keeps the original slug is the original file edited in place. Distribute existing notes appropriately. Add a history entry to each: `- [date] /arch:map — split from [original-node]; [one-line: what this half covers]`
   - Priority: inherited from the source node
   - Maturity: `raw-idea` if the source was `raw-idea`, otherwise `explored`. Copy the relevant part of any `## Decision` into `## Notes` and suggest `/arch:decide` for each part
4. Register each new part with `arch.mjs add-node` (and `arch.mjs set … maturity explored` where needed). If no part kept the original slug, `arch.mjs archive [original-node]`; if one did, `arch.mjs set [original-node] maturity explored` when it was further along (retitle its `## Decision` to `## Previous Decision (split [date])`), and never archive it
5. Reassign each connection of the source node to the part it belongs to (ask the user when unclear). Original archived: `arch.mjs rename [original-node] [part-a]` moves all of them to part A. Then move the other part's connections with `arch.mjs disconnect` + `arch.mjs connect`
6. Update the `## Connections` sections of other nodes the same way
7. `arch.mjs log map "split [original-node]" --node [part-a] --node [part-b]`, then `arch.mjs check`

---

## Rules
- Change maturity and priority only with `arch.mjs set` (it updates the node file and `index.json` together); pair every `arch.mjs connect` / `disconnect` with the matching line in the node files' `## Connections`
- Add a `## History` line to every node you change: `- [YYYY-MM-DD] /arch:[skill] — [what changed and why]`
- Record every run that wrote files with `arch.mjs log` — pass `--node` for each node it changed, other skills use it to tell what changed — then `arch.mjs check`
- Edit existing `.arch/` files in place — never recreate an existing file from scratch
- /arch:map never makes decisions — it surfaces information
- Do not update connections without user confirmation
- Recording a conflict does not stop exploration, but `check` reports it once either node is `decided` or `ready` — `/arch:decide` resolves it and removes the connection
- Merge and split are permanent structural changes — always confirm before executing
- When run during early stages (many `raw-idea` nodes), acknowledge that the map is incomplete and will become more accurate as nodes are explored
