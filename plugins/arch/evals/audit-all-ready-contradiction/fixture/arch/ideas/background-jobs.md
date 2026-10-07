# Idea: Background Jobs
_Created: 2026-09-20_
_Slug: background-jobs_

## Description
Processing that runs outside requests.

## Decision
_Decided: 2026-10-01_

### What Was Decided
Long-running worker processes that hold persistent WebSocket connections to exchanges for hours.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Cron-triggered batches | too slow for live data |

### Rationale
Live price feeds need persistent connections.

### Implications
deployment: none.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Feeds need sub-second freshness | high | team benchmark 2026-09 |

### Confirmation
Feed lag under 1 s in staging.

## Priority
core

## Maturity
ready

## Notes


## Connections
- deployment — shared-concern: both define the runtime

## History
- 2026-09-20 /arch:new — Processing that runs outside requests.
