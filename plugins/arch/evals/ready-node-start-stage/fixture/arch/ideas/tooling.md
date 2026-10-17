# Idea: Tooling
_Created: 2026-09-20_
_Slug: tooling_

## Description
Repository layout and CI.

## Decision
_Decided: 2026-10-01_

### What Was Decided
A pnpm monorepo with one CI workflow.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Separate repositories | shared types drift |

### Rationale
Shared types.

### Implications
No connected nodes.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| One CI workflow stays under 10 minutes | high | team benchmark 2026-09 |

### Confirmation
CI under 10 minutes.

## Priority
blocking

## Maturity
ready

## Notes


## Connections


## History
- 2026-09-20 /arch:new — Repo layout.
- 2026-10-01 /arch:decide — chose a pnpm monorepo
