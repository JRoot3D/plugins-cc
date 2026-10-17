---
type: llm
---
PASS if the reply lists the stale lines it found with their file and line (at least the MongoDB line in store.md's Notes and the change-streams line in search.md's Connections) before or while it cleans them up.
FAIL if it changes the decision without mentioning any stale line.
