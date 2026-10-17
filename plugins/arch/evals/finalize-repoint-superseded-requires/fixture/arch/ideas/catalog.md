# Idea: Recipe Catalog
_Created: 2026-09-20_
_Slug: catalog_

## Description
Recipes and their tags, stored in PostgreSQL.

## Decision
_Decided: 2026-10-01_

### What Was Decided
Recipes in PostgreSQL, tags as a join table.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| A document store | tags need joins |

### Rationale
Tag queries are relational.

### Implications
No connected nodes.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Under 100k recipes | high | team benchmark 2026-09 |

### Confirmation
A tag query answers in under 50 ms.

## Priority
core

## Maturity
ready

## Notes


## Connections


## History
- 2026-09-20 /arch:new — Recipes and tags.
- 2026-10-01 /arch:decide — chose PostgreSQL with a tag join table
- 2026-10-03 /arch:decide — revisited: tags became a join table instead of an array
