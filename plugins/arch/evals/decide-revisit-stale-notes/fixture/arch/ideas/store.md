# Idea: Store
_Created: 2026-09-20_
_Slug: store_

## Description
Where catalogue records live: MongoDB, one collection set per tenant.

## Decision
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
search: follows MongoDB change streams.

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
- Backups: nightly mongodump per tenant.

## Connections
- blocks search — change streams feed the search index

## History
- 2026-09-20 /arch:new — Catalogue storage.
- 2026-09-25 /arch:decide — chose MongoDB, one collection set per tenant
