# Idea: Data Model
_Created: 2026-09-20_
_Slug: data-model_

## Description
Core entities and storage.

## Decision
_Decided: 2026-10-01_

### What Was Decided
PostgreSQL with one schema per tenant.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| MongoDB | weak relational integrity |

### Rationale
Ledger data is relational.

### Implications
No connected nodes.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Under 500 tenants | high | team benchmark 2026-09 |

### Confirmation
Migration across all schemas under 5 minutes.

## Priority
blocking

## Maturity
ready

## Notes
- Open question: do we need soft deletes to keep audit history? Not decided yet — depends on the compliance review next week.

## Connections


## History
- 2026-09-20 /arch:new — Core entities and storage.
