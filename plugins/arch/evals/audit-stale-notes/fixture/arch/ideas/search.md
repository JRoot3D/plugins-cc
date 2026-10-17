# Idea: Search
_Created: 2026-09-20_
_Slug: search_

## Description
Search over titles and authors, fed from the store.

## Decision
_Decided: 2026-10-06_

### What Was Decided
A PostgreSQL GIN index over titles and authors.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| A search service | one more system |

### Rationale
The data is in PostgreSQL.

### Implications
store: needs a GIN index per tenant schema.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Under 1M titles per tenant | high | team benchmark 2026-09 |

### Confirmation
p95 search under 200 ms.

## Priority
core

## Maturity
decided

## Notes


## Connections
- depends on store — Mongo change streams feed the index

## History
- 2026-09-20 /arch:new — Search over the catalogue.
- 2026-10-06 /arch:decide — chose a GIN index
