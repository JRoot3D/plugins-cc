# Idea: Payments
_Created: 2026-09-20_
_Slug: payments_

## Description
Card payments through Stripe, used by the rest of the system only through a PaymentGateway interface.

## Decision
_Decided: 2026-10-01_

### What Was Decided
Stripe as the payment provider, wrapped in a PaymentGateway interface (charge, refund, subscription status) owned by the project.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Paddle | merchant-of-record fees too high for our price point |
| Adyen | minimum volume we don't have |

### Rationale
Best SDK and docs for a three-person team; the interface keeps a later switch to a merchant of record possible.

### Implications
billing: charges, refunds and subscription status go through PaymentGateway.
Boundary: PaymentGateway — keeps Stripe SDK types, Stripe customer and price ids and Stripe webhooks inside the payments adapter.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Stripe fees stay acceptable once EU VAT handling is added | low | unverified |

### Confirmation
Effective fee under 3.5% of revenue in the first three months.

## Priority
blocking

## Maturity
ready

## Notes


## Connections
- billing — dependency: billing builds on the payment provider

## History
- 2026-09-20 /arch:new — Card payments for subscriptions.
- 2026-10-01 /arch:decide — chose Stripe behind a PaymentGateway interface; keeps a merchant-of-record switch open
