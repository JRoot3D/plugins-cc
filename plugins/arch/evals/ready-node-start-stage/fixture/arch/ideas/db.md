# Idea: Database
_Created: 2026-09-20_
_Slug: db_

## Description
The database and its migrations.

## Decision
_Decided: 2026-10-01_

### What Was Decided
PostgreSQL 17 with versioned SQL migrations.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| An ORM migration tool | hides the SQL |

### Rationale
Reviewable SQL.

### Implications
No connected nodes.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| One region | high | team benchmark 2026-09 |

### Confirmation
A migration rolls back cleanly in CI.

## Priority
blocking

## Maturity
ready

## Notes


## Connections


## History
- 2026-09-20 /arch:new — Storage.
- 2026-10-01 /arch:decide — chose PostgreSQL with SQL migrations
