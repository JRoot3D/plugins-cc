---
type: regex
target: { source: file, path: .arch/index.json }
pattern: '"slug": "(realtime-sync|collaboration)"'
match: not_contains
---
