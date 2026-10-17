---
type: llm
---
PASS if the reply says no decision changes and routes to /arch:finalize for brief 02 or 03 (for example `/arch:finalize revise 02`), asking the user to type that command.
FAIL if it revisits or reopens the decision, or offers to run /arch:finalize itself.
