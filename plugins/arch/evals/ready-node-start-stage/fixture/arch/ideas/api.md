# Idea: API
_Created: 2026-09-20_
_Slug: api_

## Description
The HTTP API.

## Decision
_Decided: 2026-10-01_

### What Was Decided
REST with an OpenAPI 3.1 contract.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| GraphQL | caching is harder |

### Rationale
HTTP caching.

### Implications
No connected nodes.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Clients are web only | high | team benchmark 2026-09 |

### Confirmation
The contract test passes in CI.

## Priority
core

## Maturity
ready

## Notes


## Connections


## History
- 2026-09-20 /arch:new — HTTP API.
- 2026-10-01 /arch:decide — chose REST with OpenAPI
