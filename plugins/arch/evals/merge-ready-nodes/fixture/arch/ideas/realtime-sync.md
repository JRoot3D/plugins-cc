# Idea: Realtime Sync
_Created: 2026-09-20_
_Slug: realtime-sync_

## Description
Pushing edits to other clients.

## Decision
_Decided: 2026-10-01_

### What Was Decided
WebSocket server with server-authoritative ordering.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| SSE | one-way only |

### Rationale
Two-way low latency.

### Implications
collaboration: shares the socket layer.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Under 50 concurrent editors per board | high | team benchmark 2026-09 |

### Confirmation
p95 edit propagation under 200 ms.

## Priority
core

## Maturity
ready

## Notes


## Connections
- collaboration — shared-concern: same WebSocket layer

## History
- 2026-09-20 /arch:new — Pushing edits to other clients.
