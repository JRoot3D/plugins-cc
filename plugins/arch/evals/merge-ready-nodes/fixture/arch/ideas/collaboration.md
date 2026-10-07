# Idea: Collaboration
_Created: 2026-09-20_
_Slug: collaboration_

## Description
Multiple users editing one board.

## Decision
_Decided: 2026-10-01_

### What Was Decided
CRDT (Yjs) documents merged on the client.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Operational transform | server complexity |

### Rationale
Offline edits merge cleanly.

### Implications
realtime-sync: carries Yjs updates.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Boards stay under 5 MB | high | team benchmark 2026-09 |

### Confirmation
Two offline clients converge in tests.

## Priority
extension

## Maturity
ready

## Notes


## Connections
- realtime-sync — shared-concern: same WebSocket layer

## History
- 2026-09-20 /arch:new — Multiple users editing one board.
