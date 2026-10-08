# Idea: Billing
_Created: 2026-09-20_
_Slug: billing_

## Description
Plans, upgrades, proration and invoices for firm accounts.

## Decision
_Decided: 2026-10-03_

### What Was Decided
Model plans as Stripe Price ids stored on the Account table next to the Stripe customer id. The billing service handles Stripe webhooks itself and uses Stripe Billing's proration for upgrades and downgrades.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Own plan table and proration logic | weeks of work Stripe already does |

### Rationale
Fastest path to plan changes and invoices.

### Implications
payments: none.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Four plans cover all firm sizes | high | sales calls 2026-09 |

### Confirmation
A plan change shows the right prorated invoice in staging.

## Priority
core

## Maturity
ready

## Notes


## Connections
- payments — dependency: billing builds on the payment provider

## History
- 2026-09-20 /arch:new — Plans, upgrades and invoices.
- 2026-10-03 /arch:decide — Stripe Price ids and Stripe Billing proration; fastest path
