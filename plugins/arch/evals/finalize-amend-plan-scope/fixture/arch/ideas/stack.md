# Idea: Stack
_Created: 2026-09-20_
_Slug: stack_

## Description
One TypeScript service on Node with a server-rendered UI.

## Decision
_Decided: 2026-10-01_

### What Was Decided
A TypeScript monolith on Node 22 with server-rendered pages.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Go services | two languages for a two-person team |

### Rationale
One language for UI and API.

### Implications
No connected nodes.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Two developers keep one codebase | high | team benchmark 2026-09 |

### Confirmation
The first feature ships in two weeks.

## Priority
blocking

## Maturity
ready

## Notes


## Connections


## History
- 2026-09-20 /arch:new — One TypeScript service.
- 2026-10-01 /arch:decide — chose a TypeScript monolith; one language for a small team
