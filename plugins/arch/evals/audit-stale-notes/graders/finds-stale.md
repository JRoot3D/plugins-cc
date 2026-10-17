---
type: llm
---
PASS if the reply reports as stale both the store node's Notes line about collections per tenant in MongoDB and the search node's Connections line about Mongo change streams, and does not report the shard-key line under the Triage section that starts with a "These notes come from before the revisit" banner.
FAIL if it misses either stale line, or reports the bannered shard-key line as stale.
