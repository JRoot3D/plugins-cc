# plugins-cc

A Claude Code plugin marketplace.

- **`arch`** — multi-session architecture exploration: raw project ideas → idea nodes → decisions → feature briefs for [OpenSpec](https://github.com/Fission-AI/OpenSpec) changes; `/arch-graph` shows the dependency graph in a side pane and `/arch-board` the whole board, live, in the browser; several people can work on one board at once, a node each, through git locks. See [plugins/arch/README.md](plugins/arch/README.md).
- **`openspec-dashboard`** — a mod: `/openspec` opens a pane with every active OpenSpec change's task progress; tick tasks, run `/opsx:apply` / `verify` / `archive`, or a single task.

```
/plugin marketplace add JRoot3D/plugins-cc
/plugin install arch@plugins-cc
/plugin install openspec-dashboard@plugins-cc
```
