# Idea: Reports
_Created: 2026-09-20_
_Slug: reports_

## Description
Reports on what a team reads, exported as CSV.

## Decision
_Decided: 2026-10-01_

### What Was Decided
Reports exported as CSV files. Task T-5, change report-export.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| A BI tool | one more system |

### Rationale
Teams open CSV in their spreadsheets.

### Implications
No connected nodes.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Reports stay under 1M rows | high | team benchmark 2026-09 |

### Confirmation
An export of 1M rows ends in under a minute.

## Priority
blocking

## Maturity
ready

## Notes


## Connections


## History
- 2026-09-20 /arch:new — Reports.
- 2026-10-01 /arch:decide — chose CSV exports
