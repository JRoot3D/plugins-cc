# Idea: Store
_Created: 2026-09-20_
_Slug: store_

## Description
Where catalogue records live: PostgreSQL, one schema per tenant.

## Decision
_Decided: 2026-10-05_

### What Was Decided
PostgreSQL with one schema per tenant.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| MongoDB | reports need joins across tenants |

### Rationale
Reports are relational.

### Implications
search: reads row changes through logical replication.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Under 500 tenants | high | team benchmark 2026-09 |

### Confirmation
A report over all tenants runs under 5 s.

## Previous Decision (superseded 2026-10-05)
_Decided: 2026-09-25_

### What Was Decided
MongoDB with one collection set per tenant.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| PostgreSQL | schema changes felt slow |

### Rationale
Flexible documents.

### Implications
No connected nodes.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Documents stay schemaless | high | team benchmark 2026-09 |

### Confirmation
No migration in the first quarter.

## Priority
blocking

## Maturity
ready

## Notes
- Collections per tenant in MongoDB, created on sign-up.
- Reports run nightly.

## Triage
> These notes come from before the revisit of 2026-10-05. Their MongoDB details do not apply. The current decision is in "Decision".
### Gotchas
- The Mongo shard key must be the tenant id.

## Connections
- blocks search — row changes feed the search index

## History
- 2026-09-20 /arch:new — Catalogue storage.
- 2026-09-25 /arch:decide — chose MongoDB
- 2026-10-05 /arch:decide — revisited: moved to PostgreSQL, reports need joins
