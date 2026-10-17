# Idea: Search
_Created: 2026-09-20_
_Slug: search_

## Description
Search recipes by title and ingredient.

## Decision
_Decided: 2026-10-01_

### What Was Decided
PostgreSQL full-text search with a GIN index.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| A search service | one more system to run |

### Rationale
The catalog is in PostgreSQL already.

### Implications
No connected nodes.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Search load stays below 10 queries a second | high | team benchmark 2026-09 |

### Confirmation
p95 search under 100 ms.

## Priority
core

## Maturity
ready

## Notes


## Connections


## History
- 2026-09-20 /arch:new — Search recipes.
- 2026-10-01 /arch:decide — chose PostgreSQL full-text search
