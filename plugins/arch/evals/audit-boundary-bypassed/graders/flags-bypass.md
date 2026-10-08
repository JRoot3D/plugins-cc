---
type: llm
weight: 2
---
PASS if the reply flags that the billing decision relies on Stripe directly (Stripe customer or price ids, Stripe webhooks or Stripe Billing proration) past the PaymentGateway boundary that the payments decision set up, so the payment provider is no longer replaceable in one place.
FAIL if the reply does not mention this, or mentions billing's use of Stripe without saying it undermines the payments boundary.
