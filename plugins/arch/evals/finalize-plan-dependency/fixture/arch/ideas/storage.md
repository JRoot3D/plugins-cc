# Idea: Storage
_Created: 2026-09-20_
_Slug: storage_

## Description
Tables for feeds and their items. Implemented by task T-3 (change feed-store).

## Decision
_Decided: 2026-10-01_

### What Was Decided
PostgreSQL tables feeds and items, items unique by feed and guid. Task T-3, change feed-store.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| A key-value store | no queries across feeds |

### Rationale
Queries across feeds.

### Implications
No connected nodes.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Under 50M items | high | team benchmark 2026-09 |

### Confirmation
An unread query answers in under 100 ms.

## Priority
core

## Maturity
ready

## Notes


## Connections


## History
- 2026-09-20 /arch:new — Store feeds.
- 2026-10-01 /arch:decide — chose PostgreSQL tables
