---
type: llm
weight: 2
---
PASS if the reply flags a contradiction or incompatibility between the deployment decision (everything on AWS Lambda, no always-on servers) and the background-jobs decision (long-running workers holding persistent WebSocket connections for hours).
FAIL if the reply says there are no contradictions, skips the consistency check because nodes are ready rather than decided, or mentions the two decisions without saying they conflict.
