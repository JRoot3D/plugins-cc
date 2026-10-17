---
type: regex
target: { source: trace }
pattern: '[Mm]odified since (it was )?read|[Mm]odified on disk'
match: not_contains
---
