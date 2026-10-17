# Idea: Shared Core
_Created: 2026-09-20_
_Slug: core_

## Description
The booking slot rules, in one library the app and the server call.

## Decision
_Decided: 2026-10-01_

### What Was Decided
One Rust library with the slot rules, called from the app and the server.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Rules written twice | they drift |

### Rationale
One source of truth for slot rules.

### Implications
No connected nodes.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| a call costs under 5 ms on a phone | medium | unverified |

### Confirmation
A spike measures a call on a mid-range phone.

## Priority
blocking

## Maturity
ready

## Notes


## Connections


## History
- 2026-09-20 /arch:new — Slot rules.
- 2026-10-01 /arch:decide — chose one Rust library
