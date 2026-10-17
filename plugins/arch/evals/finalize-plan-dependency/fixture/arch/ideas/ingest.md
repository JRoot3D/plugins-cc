# Idea: Ingest
_Created: 2026-09-20_
_Slug: ingest_

## Description
Fetching RSS and Atom feeds and parsing their items. Implemented by task T-2 (change import-feeds).

## Decision
_Decided: 2026-10-01_

### What Was Decided
A scheduled worker fetches each feed every 15 minutes and parses it with a streaming parser. Task T-2, change import-feeds.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Webhooks from feed hosts | few hosts offer them |

### Rationale
Polling works with every feed.

### Implications
No connected nodes.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Under 10k feeds | high | team benchmark 2026-09 |

### Confirmation
A full poll round ends within 15 minutes.

## Priority
blocking

## Maturity
ready

## Notes


## Connections


## History
- 2026-09-20 /arch:new — Fetch feeds.
- 2026-10-01 /arch:decide — chose a polling worker
