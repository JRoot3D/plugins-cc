---
type: llm
weight: 2
---
PASS if the reply names that T-2 (import-feeds) depends on T-3 (feed-store) and the stages it proposes or writes put feed-store in an earlier stage than import-feeds, or both in one stage.
FAIL if a stage with import-feeds comes before the stage with feed-store without the reply flagging the T-2 → T-3 dependency.
