// Run: node plugins/arch/scripts/test_arch.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('arch.mjs', import.meta.url))

const node = (slug, priority, maturity, history = '', extra = '') => `# Idea: ${slug}

## Description
x

## Priority
${priority}

## Maturity
${maturity}
${extra}
## Notes

## Connections

## History
${history}
`

const DECISION = '\n## Decision\nuse it\n'

const write = (root, rel, text) => {
  const file = path.join(root, '.arch', rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

// openspec/changes/REL as a directory, with a tasks.md (string or raw bytes) when tasks is given
const change = (root, rel, tasks) => {
  const dir = path.join(root, 'openspec', 'changes', rel)
  fs.mkdirSync(dir, { recursive: true })
  if (tasks !== undefined) fs.writeFileSync(path.join(dir, 'tasks.md'), tasks)
}

const brief = (changes = null, header = '', created = '2026-10-01') =>
  `# Feature Brief: X\n${created ? `_Created: ${created} via /arch:finalize_\n` : ''}${header}\n## Goal\nx\n\n## OpenSpec Handoff\n` +
  `${changes ? `- Changes: ${changes}\n` : ''}- Start with: x\n`

const has = (out, text) => assert.ok(out.includes(text), `missing ${JSON.stringify(text)} in:\n${out}`)
const lacks = (out, text) => assert.ok(!out.includes(text), `unexpected ${JSON.stringify(text)} in:\n${out}`)

describe('arch.mjs', () => {
  let root
  let index

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-'))
    write(root, 'ideas/stack.md', node('stack', 'blocking', 'decided', '- 2026-09-01 /arch:new — a\n- 2026-09-03 /arch:decide — b', DECISION))
    write(root, 'ideas/sync.md', node('sync', 'core', 'raw-idea', '- 2026-09-05 /arch:explore — c'))
    write(root, 'ideas/old.archived.md', node('old', 'core', 'explored', '- 2026-09-04 /arch:map — merged into sync'))
    index = {
      project: 'P',
      created: '2026-09-01',
      last_updated: '2026-09-01',
      nodes: [
        { slug: 'stack', priority: 'blocking', maturity: 'decided', file: 'ideas/stack.md' },
        { slug: 'sync', priority: 'core', maturity: 'explored', file: 'ideas/sync.md' },
      ],
      connections: [{ from: 'stack', to: 'ghost', type: 'dependency' }],
      sessions: [{ date: '2026-09-01', skill: 'new', summary: 's' }],
    }
    write(root, 'index.json', JSON.stringify(index))
  })

  const run = (...args) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' })
    return { code: r.status, out: r.stdout + r.stderr }
  }
  const indexNow = () => JSON.parse(fs.readFileSync(path.join(root, '.arch/index.json'), 'utf8'))
  const readIdea = slug => fs.readFileSync(path.join(root, '.arch/ideas', `${slug}.md`), 'utf8')

  test('summary derives state and problems', () => {
    const { code, out } = run('summary')
    assert.equal(code, 0)
    has(out, 'nodes=2 archived=1')
    has(out, 'FINALIZE_GATE closed — not ready: stack(decided); 2 problem(s)')
    has(out, 'LAST_MAP never')
    has(out, 'LAST_NODE_WORKED_ON sync')
    has(out, "sync: maturity differs — index 'explored', node file 'raw-idea'")
    has(out, "unknown slug 'ghost'")
    lacks(out.split('PROBLEMS')[0], ' old ') // archived node is not a live node
    lacks(out, 'STAGES') // no briefs
  })

  test('set updates both copies', () => {
    let r = run('set', 'sync', 'maturity', 'explored')
    assert.equal(r.code, 0, r.out)
    has(readIdea('sync'), '## Maturity\nexplored\n')
    r = run('set', 'stack', 'maturity', 'ready')
    assert.equal(r.code, 0, r.out)
    assert.equal(indexNow().nodes[0].maturity, 'ready')
    assert.equal(run('set', 'stack', 'maturity', 'done').code, 1)
    r = run('set', 'sync', 'maturity', 'decided') // no ## Decision in sync.md
    has(r.out, 'no ## Decision section')
    assert.deepEqual([r.code, indexNow().nodes[1].maturity], [1, 'explored'])
    assert.equal(run('set', 'nope', 'priority', 'core').code, 1)
  })

  test('set keeps a CRLF node file CRLF', () => {
    write(root, 'ideas/sync.md', node('sync', 'core', 'raw-idea').replaceAll('\n', '\r\n'))
    assert.equal(run('set', 'sync', 'maturity', 'explored').code, 0)
    const text = readIdea('sync')
    has(text, '## Maturity\r\nexplored\r\n')
    assert.ok(!/[^\r]\n/.test(text), 'a bare LF crept in')
    lacks(run('check').out, 'sync: maturity differs')
  })

  test('log appends a session', () => {
    const r = run('log', 'decide', 'picked pg', '--node', 'stack')
    assert.equal(r.code, 0, r.out)
    const data = indexNow()
    assert.equal(data.sessions.at(-1).node, 'stack')
    assert.equal(data.last_updated, data.sessions.at(-1).date)
    assert.equal(run('log', 'decide', 'x', '--node', 'ghost').code, 1)
    assert.equal(run('log', 'status', 'x').code, 1)
    // a SUMMARY or NOTE may start with '-'; `--` still ends options
    assert.equal(run('log', 'explore', '- added 3 nodes', '--node', 'stack').code, 0)
    assert.equal(indexNow().sessions.at(-1).summary, '- added 3 nodes')
    assert.equal(run('log', 'explore', '--', '-1 rows').code, 0)
    assert.equal(indexNow().sessions.at(-1).summary, '-1 rows')
    assert.equal(run('log', 'decide', 'x', '--node').code, 1)
  })

  test('connections and merge', () => {
    assert.equal(run('connect', 'stack', 'sync', 'dependency', 'db').code, 0)
    assert.equal(run('connect', 'stack', 'sync', 'dependency', 'db v2').code, 0) // updates, no duplicate
    assert.equal(run('connect', 'stack', 'stack', 'conflict', 'x').code, 1)
    assert.equal(run('connect', 'stack', 'sync', 'blocks', 'x').code, 1)
    assert.equal(run('disconnect', 'stack', 'ghost').code, 0)
    assert.deepEqual(indexNow().connections, [{ from: 'stack', to: 'sync', type: 'dependency', note: 'db v2' }])
    // merge sync into a new node "core-sync": write file, register, archive old, repoint
    write(root, 'ideas/core-sync.md', node('core-sync', 'core', 'raw-idea'))
    assert.equal(run('add-node', 'core-sync', 'Core Sync', 'core', 'merged').code, 0)
    has(run('archive', 'sync').out, 'still use it')
    assert.ok(fs.existsSync(path.join(root, '.arch/ideas/sync.archived.md')))
    assert.equal(run('rename', 'sync', 'core-sync').code, 0)
    const data = indexNow()
    assert.deepEqual(
      data.nodes.map(n => n.slug),
      ['stack', 'core-sync'],
    )
    assert.equal(data.connections[0].to, 'core-sync')
    has(run('check').out, "not described in either node's ## Connections")
  })

  test('init refuses an existing index', () => {
    assert.equal(run('init', 'P').code, 1)
    fs.rmSync(path.join(root, '.arch/index.json'))
    assert.equal(run('init', 'P').code, 0)
    assert.deepEqual(indexNow().nodes, [])
  })

  test('same-day order comes from sessions', () => {
    // one day: explore sync, full map, decide stack — only stack changed after the map
    for (const args of [['explore', '--node', 'sync'], ['map', '--full'], ['decide', '--node', 'stack']])
      assert.equal(run('log', args[0], 'x', ...args.slice(1)).code, 0)
    const { out } = run('summary')
    has(out, 'LAST_NODE_WORKED_ON stack (')
    has(out, '— nodes changed since: stack\n')
    has(out, '(full map, revision 3, 1 sessions since)')
  })

  test('only a full map refreshes the graph', () => {
    run('log', 'map', 'full', '--full')
    run('log', 'explore', 'sync changed', '--node', 'sync')
    run('log', 'map', 'mapped only stack', '--node', 'stack') // scoped run
    has(run('summary').out, 'nodes changed since: stack, sync\n')
    run('log', 'map', 'full again', '--full')
    has(run('summary').out, 'none (map is fresh)')
    assert.equal(run('log', 'decide', 'x', '--full').code, 1)
  })

  test('readiness structure blocks finalize', () => {
    // an all-ready-looking board with a cycle, an open conflict and a missing decision
    write(root, 'ideas/a.md', node('a', 'blocking', 'raw-idea'))
    write(root, 'ideas/b.md', node('b', 'core', 'raw-idea', '', DECISION))
    write(
      root,
      'index.json',
      JSON.stringify({
        project: 'P',
        nodes: [
          { slug: 'a', priority: 'blocking', maturity: 'raw-idea', file: 'ideas/a.md' },
          { slug: 'b', priority: 'core', maturity: 'raw-idea', file: 'ideas/b.md' },
        ],
        sessions: [],
      }),
    )
    for (const f of ['old.archived.md', 'stack.md', 'sync.md']) fs.rmSync(path.join(root, '.arch/ideas', f))
    assert.equal(run('set', 'b', 'maturity', 'ready').code, 0)
    assert.equal(run('set', 'a', 'maturity', 'ready').code, 1) // a has no ## Decision
    for (const [src, dst, kind] of [['a', 'b', 'dependency'], ['b', 'a', 'dependency'], ['a', 'b', 'conflict']])
      assert.equal(run('connect', src, dst, kind, 'n').code, 0)
    const { out } = run('summary')
    has(out, 'FINALIZE_GATE closed — not ready: a(raw-idea);')
    has(out, 'dependency cycle: a -> b -> a')
    has(out, 'conflict a <-> b is unresolved but b is ready')
    has(out, 'b is ready but depends on a (raw-idea)')
  })

  test('briefs outdated by revision', () => {
    run('set', 'stack', 'maturity', 'ready')
    const header = (rev, extra) => `# Feature Brief: X\n_Stage: 01_\n_Arch nodes covered: stack, sync_\n_Arch revision: ${rev}_\n${extra}\n## Goal\n`
    write(root, 'feature-briefs/01-x.md', header(1, ''))
    let { out } = run('summary')
    has(out, 'BRIEFS_OUTDATED none')
    has(out, 'READY_NOT_IN_A_BRIEF none')
    run('log', 'decide', 're-decided the same day', '--node', 'stack')
    run('log', 'finalize', 'wrote 02', '--node', 'stack') // finalize runs never outdate a brief
    has(run('summary').out, 'BRIEFS_OUTDATED 1\n  01-x.md — stack decide\n')
    // a follow-up bumps the old brief to the current revision; later changes to its nodes outdate it again
    write(root, 'feature-briefs/01-x.md', header(3, '_Followed up by: 02-y.md (2026-10-07)_'))
    has(run('summary').out, 'BRIEFS_OUTDATED none')
    run('log', 'decide', 'x', '--node', 'sync')
    has(run('summary').out, 'BRIEFS_OUTDATED 1\n  01-x.md — sync decide\n')
    assert.equal(run('archive', 'sync').code, 0)
    has(run('summary').out, '01-x.md — sync archived')
    // the next follow-up drops the archived node from the covered list, which clears it
    write(root, 'feature-briefs/01-x.md', header(4, '_Followed up by: 03-z.md (2026-10-07)_').replace('stack, sync', 'stack'))
    has(run('summary').out, 'BRIEFS_OUTDATED none')
    write(root, 'feature-briefs/01-x.md', header(3, '_Superseded by: 02-y.md (2026-10-07)_'))
    ;({ out } = run('summary'))
    has(out, 'BRIEFS 1 written, 1 superseded')
    has(out, 'READY_NOT_IN_A_BRIEF stack') // a superseded brief no longer covers its nodes
  })

  test('a follow-up chain reports the newest brief', () => {
    write(root, 'feature-briefs/01-x.md', '_Arch nodes covered: stack, sync_\n_Arch revision: 1_\n_Followed up by: 02-y.md_\n')
    write(root, 'feature-briefs/02-y.md', '_Arch nodes covered: stack_\n_Arch revision: 1_\n_Follows up: 01-x.md_\n')
    run('log', 'decide', 'x', '--node', 'stack')
    has(run('summary').out, 'BRIEFS_OUTDATED 1\n  02-y.md — stack decide\n')
    run('log', 'decide', 'y', '--node', 'sync') // 02 does not cover sync, so 01 still answers for it
    has(run('summary').out, 'BRIEFS_OUTDATED 2\n  01-x.md — sync decide\n  02-y.md — stack decide\n')
  })

  test('stages from openspec changes', () => {
    for (const [name, changes] of [
      ['01-a.md', 'init'],
      ['02-b.md', '`add-auth` (backend) → auth-ui; auth-api'],
      ['04-d.md', 'canvas -> canvas-ui'],
      ['05-e.md', 'setup'],
    ])
      write(root, `feature-briefs/${name}`, brief(changes))
    // only the first Changes line inside the handoff counts; an item without a leading change name is skipped
    write(root, 'feature-briefs/03-c.md', `${brief('(tbd), export').replace('## Goal\nx', '## Goal\n- Changes: goal')}- Changes: later\n`)
    write(root, 'feature-briefs/06-f.md', brief(null, '', null))
    write(root, 'feature-briefs/00-old.md', brief('old-thing', '_Superseded by: 02-b.md (2026-10-01)_', '2026-09-15'))
    for (const rel of [
      'archive/2026-09-20-init',
      'archive/2026-10-01-init',
      'archive/2026-10-02-add-auth',
      'old-thing',
      'archive/2026-10-01-add-setup',
      'archive/2026-10-03-export',
      'canvas-ui',
      'fix-typo',
      '.tmp',
      'archive/2026-10-02-hotfix',
      'archive/2026-09-25-spike',
      'archive/2026-09-01-legacy',
    ])
      change(root, rel)
    fs.writeFileSync(path.join(root, 'openspec', 'changes', 'README.md'), 'x')
    change(
      root,
      'export',
      '- [ x] a\n- [~] b\n1. [ ] c\n- [A](https://x)\n* [X] d\n  - [x] nested\n+ [ ] plus\n2) [ ] paren\n- [ ](x) box\n- [x][ref] link\n',
    ) // OpenSpec 1.14.1 counts 3/8
    change(root, 'canvas', '## 1\n- [ ] a\n- []b\n')
    change(root, 'auth-api', Buffer.from('\xef\xbb\xbf- [x] caf\xe9\n- [ ] b\n', 'latin1')) // BOM and a Latin-1 byte
    const { code, out } = run('summary')
    assert.equal(code, 0, out)
    has(
      out,
      'READY_NOT_IN_A_BRIEF none\nSTAGES 6\n' +
        '  01-a.md — done: init archived 2026-10-01\n' +
        '  02-b.md — in progress: add-auth archived 2026-10-02; auth-ui not proposed; auth-api 1/2 tasks\n' +
        '  03-c.md — in progress: export 3/8 tasks\n' + // an active change wins over an archived one
        '  04-d.md — planned: canvas 0/2 tasks; canvas-ui proposed (no tasks yet)\n' +
        '  05-e.md — not started: setup not proposed\n' + // 2026-10-01-add-setup is another change
        '  06-f.md — unknown: its OpenSpec Handoff names no changes\n' +
        // only the superseded brief names old-thing; the earliest brief (superseded, 2026-09-15) sets the
        // cutoff, so spike counts and legacy predates arch's handoff
        'CHANGES_NOT_IN_A_BRIEF fix-typo, old-thing, add-setup (archived 2026-10-01), hotfix (archived 2026-10-02), ' +
        'spike (archived 2026-09-25)\n',
    )
  })

  test('stages without local changes', () => {
    write(root, 'feature-briefs/01-a.md', brief('init'))
    let { out } = run('summary')
    has(out, 'STAGES 1 — no openspec/ directory here\n  01-a.md — not started: init not proposed\n')
    lacks(out, 'CHANGES_NOT_IN_A_BRIEF')
    fs.mkdirSync(path.join(root, 'openspec'))
    ;({ out } = run('summary'))
    has(out, 'STAGES 1\n  01-a.md — unknown: openspec/changes/ not found (store-backed root?)\n')
    lacks(out, 'CHANGES_NOT_IN_A_BRIEF')
  })

  test('archive twice picks a free name', () => {
    assert.equal(run('archive', 'sync').code, 0)
    write(root, 'ideas/sync.md', node('sync', 'core', 'raw-idea'))
    assert.equal(run('add-node', 'sync', 'Sync', 'core', 'again').code, 0)
    const r = run('archive', 'sync')
    assert.equal(r.code, 0, r.out)
    has(r.out, 'sync-2.archived.md')
    const { out } = run('summary')
    has(out, 'archived=3')
    lacks(out, 'not in index.json')
  })

  test('non-Latin text survives the round trip', () => {
    assert.equal(run('set', 'sync', 'summary', 'Вибір стеку').code, 0)
    const { code, out } = run('summary')
    assert.equal(code, 0, out)
    has(out, 'Вибір стеку')
  })

  test('schema, slug and argument validation', () => {
    write(root, 'index.json', JSON.stringify({ nodes: 'broken' }))
    const r = run('summary')
    assert.deepEqual([r.code, r.out.split(' ')[0]], [0, 'INDEX_INVALID'], r.out)
    assert.equal(run('set', 'stack', 'priority', 'core').code, 1)
    index.nodes.push({ ...index.nodes[0] })
    write(root, 'index.json', JSON.stringify(index))
    has(run('check').out, 'stack: slug is used by more than one node')
    write(root, 'ideas/Bad Slug.md', 'x')
    has(run('add-node', 'Bad Slug', 'B', 'core', 'x').out, 'slug must be')
    for (const args of [['set', 'sync', 'maturity'], ['set', 'sync', 'slug', 'x'], ['archive', 'sync', '--full'], ['rename', 'a', 'b', 'c'], ['nope']]) {
      const { code, out } = run(...args)
      assert.deepEqual([code, out.split(':')[0]], [1, 'ERROR'], `${args}: ${out}`)
    }
  })

  test('bracketed history date and unregistered file', () => {
    write(root, 'ideas/sync.md', node('sync', 'core', 'explored', '- [2026-09-06] /arch:explore — d'))
    write(root, 'ideas/stray.md', '# Idea: stray\n')
    const { out } = run('summary')
    has(out, 'sync h=1')
    has(out, 'ideas/stray.md: node file is not in index.json')
  })

  test('a missing node file is a clean error', () => {
    fs.rmSync(path.join(root, '.arch/ideas/sync.md'))
    for (const args of [['set', 'sync', 'maturity', 'decided'], ['archive', 'sync']]) {
      const { code, out } = run(...args)
      assert.deepEqual([code, out.split(':')[0]], [1, 'ERROR'], out)
    }
  })

  test('a missing or broken index never fails summary', () => {
    write(root, 'index.json', '{broken')
    let r = run('summary')
    assert.deepEqual([r.code, r.out.split(' ')[0]], [0, 'INDEX_INVALID'])
    fs.rmSync(path.join(root, '.arch/index.json'))
    r = run('check')
    assert.deepEqual([r.code, r.out.split(' ')[0]], [0, 'NO_ARCH_SESSION'])
  })
})

// skills repeat these lines on purpose (see README → Development): each must exist in exactly these skills, identically
test('shared skill lines are present and identical', () => {
  const ALL = ['new', 'triage', 'explore', 'map', 'decide', 'status', 'audit', 'finalize']
  const without = (...names) => ALL.filter(s => !names.includes(s))
  const WRITERS = without('status', 'audit')
  const SHARED = {
    '!`node': ALL,
    '- `NO_ARCH_SESSION` → stop': without('new'),
    '- `INDEX_INVALID`': ALL,
    '- Otherwise take counts': ALL,
    '**Writing `index.json`:**': WRITERS,
    '- Change maturity and priority only': WRITERS,
    '- Add a `## History` line': WRITERS,
    '- Record every run that wrote files': WRITERS,
    '1. Its `## Decision` section': ['decide', 'finalize'],
    '2. No open questions remain': ['decide', 'finalize'],
    '3. `## Decision → Implications`': ['decide', 'finalize'],
    '4. Every node it depends on': ['decide', 'finalize'],
    '5. A high reversal-cost decision': ['decide', 'finalize'],
  }
  const dir = path.join(path.dirname(SCRIPT), '..', 'skills')
  const skills = fs.readdirSync(dir).filter(name => fs.existsSync(path.join(dir, name, 'SKILL.md')))
  const lines = Object.fromEntries(skills.map(name => [name, fs.readFileSync(path.join(dir, name, 'SKILL.md'), 'utf8').split(/\r?\n/)]))
  assert.deepEqual(skills.sort(), [...ALL].sort())
  for (const [prefix, owners] of Object.entries(SHARED)) {
    const found = Object.entries(lines).map(([name, body]) => [name, body.filter(line => line.startsWith(prefix))])
    assert.deepEqual(
      found
        .filter(([, hits]) => hits.length)
        .map(([name]) => name)
        .sort(),
      [...owners].sort(),
      `${JSON.stringify(prefix)} is missing from or extra in a skill`,
    )
    const variants = new Set(found.flatMap(([, hits]) => hits))
    assert.equal(variants.size, 1, `${JSON.stringify(prefix)} differs between skills:\n${[...variants].join('\n')}`)
  }
})
