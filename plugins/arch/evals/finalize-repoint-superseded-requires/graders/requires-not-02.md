---
type: regex
target: { source: file, path: .arch/feature-briefs/04-search.md }
pattern: '- Requires: [^\n]*\b02\b'
match: not_contains
---
