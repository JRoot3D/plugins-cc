// Fails on a semicolon in the file it is given: node tools/lint.mjs FILE
import fs from 'node:fs'
const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n')
const bad = lines.map((line, i) => [i + 1, line]).filter(([, line]) => line.includes(';'))
for (const [n, line] of bad) console.log(`${process.argv[2]}:${n}: no semicolons: ${line.trim()}`)
process.exit(bad.length ? 1 : 0)
