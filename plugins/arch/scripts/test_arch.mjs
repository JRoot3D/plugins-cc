// Run: node plugins/arch/scripts/test_arch.mjs
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
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
  const sessionsNow = () => [
    ...(indexNow().sessions ?? []),
    ...fs.readFileSync(path.join(root, '.arch/sessions.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)),
  ]
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
    const before = indexNow()
    const r = run('log', 'decide', 'picked pg', '--node', 'stack')
    assert.equal(r.code, 0, r.out)
    assert.equal(sessionsNow().at(-1).node, 'stack')
    // new sessions go to sessions.jsonl, merged by union; index.json keeps its old ones, and drops last_updated on its next write
    assert.deepEqual(indexNow(), before)
    run('set', 'sync', 'summary', 'y')
    assert.deepEqual([indexNow().sessions.length, indexNow().last_updated], [1, undefined])
    has(fs.readFileSync(path.join(root, '.arch/.gitattributes'), 'utf8'), 'sessions.jsonl merge=union')
    assert.equal(run('log', 'decide', 'x', '--node', 'ghost').code, 1)
    assert.equal(run('log', 'status', 'x').code, 1)
    // a SUMMARY or NOTE may start with '-'; `--` still ends options
    assert.equal(run('log', 'explore', '- added 3 nodes', '--node', 'stack').code, 0)
    assert.equal(sessionsNow().at(-1).summary, '- added 3 nodes')
    assert.equal(run('log', 'explore', '--', '-1 rows').code, 0)
    assert.equal(sessionsNow().at(-1).summary, '-1 rows')
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

  test('every write refreshes board.js; board.html is the plugin page, copied once', () => {
    const boardJs = path.join(root, '.arch/board.js')
    run('summary')
    run('check')
    assert.ok(!fs.existsSync(boardJs), 'a read command wrote board.js')
    write(root, 'ideas/sync.md', node('sync', 'core', 'raw-idea', '', '\n## Details\n</script> stays text\n'))
    assert.equal(run('set', 'sync', 'maturity', 'explored').code, 0)
    const page = path.join(path.dirname(SCRIPT), 'board.html')
    assert.equal(fs.readFileSync(path.join(root, '.arch/board.html'), 'utf8'), fs.readFileSync(page, 'utf8'))
    const state = () => {
      let found
      new Function('archBoard', fs.readFileSync(boardJs, 'utf8'))(s => (found = s)) // a script, as the page loads it
      return found
    }
    const sync = () => state().nodes.find(n => n.slug === 'sync')
    assert.deepEqual([sync().maturity, state().revision], ['explored', 1])
    has(sync().text, '</script> stays text')
    has(state().gate, 'closed')
    assert.equal(run('log', 'explore', 'x', '--node', 'sync').code, 0)
    assert.deepEqual([state().revision, sync().rev], [2, 1])
    has(fs.readFileSync(path.join(root, '.arch/.gitignore'), 'utf8'), 'board.js')
    // the page's own script compiles
    const code = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync(page, 'utf8'))[1]
    assert.doesNotThrow(() => new Function(code))
  })

  test('freshness survives a git merge that interleaves sessions', () => {
    // clone A: explore sync, full map, brief at stack=0, sync=1; clone B: decide stack — the union merge put B's line first
    const day = { date: '2026-10-10', summary: 'x' }
    const lines = [
      { ...day, skill: 'decide', node: 'stack' },
      { ...day, skill: 'explore', node: 'sync' },
      { ...day, skill: 'map', scope: 'full', revision: 3, seen: { sync: 1 } },
    ]
    write(root, 'sessions.jsonl', lines.map(s => `${JSON.stringify(s)}\n`).join(''))
    write(root, 'feature-briefs/01-x.md', '_Arch nodes covered: stack, sync_\n_Arch revision: stack=0, sync=1_\n')
    const { out } = run('summary')
    has(out, '(full map, revision 3, 1 sessions since) — nodes changed since: stack\n')
    has(out, 'BRIEFS_OUTDATED 1\n  01-x.md — stack decide\n')
    write(root, 'sessions.jsonl', '{"date":"2026-10-10","skill":"new"}\n{broken\n')
    has(run('summary').out, 'INDEX_INVALID — .arch/sessions.jsonl line 2 is not valid JSON')
  })

  test('parallel writers lose nothing', async () => {
    const slugs = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']
    for (const s of slugs) write(root, `ideas/${s}.md`, node(s, 'core', 'raw-idea'))
    const go = args => new Promise(done => spawn(process.execPath, [SCRIPT, ...args], { cwd: root }).on('close', done))
    const codes = await Promise.all(slugs.flatMap(s => [go(['add-node', s, s, 'core', 'x']), go(['log', 'explore', s])]))
    assert.deepEqual(codes, codes.map(() => 0))
    assert.equal(indexNow().nodes.length, 10)
    assert.equal(sessionsNow().length, 9)
    assert.ok(!fs.existsSync(path.join(root, '.arch/index.lock')))
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
    write(root, 'feature-briefs/01-x.md', header('stack=0, sync=0', ''))
    let { out } = run('summary')
    has(out, 'BRIEFS_OUTDATED none')
    has(out, 'READY_NOT_IN_A_BRIEF none')
    run('log', 'decide', 're-decided the same day', '--node', 'stack')
    run('log', 'finalize', 'wrote 02', '--node', 'stack') // finalize runs never outdate a brief
    has(run('summary').out, 'BRIEFS_OUTDATED 1\n  01-x.md — stack decide\n')
    has(run('summary').out, ' stack h=2 rev=1 — ')
    // a follow-up bumps the old brief to the current revisions; later changes to its nodes outdate it again
    write(root, 'feature-briefs/01-x.md', header('stack=1, sync=0', '_Followed up by: 02-y.md (2026-10-07)_'))
    has(run('summary').out, 'BRIEFS_OUTDATED none')
    run('log', 'decide', 'x', '--node', 'sync')
    has(run('summary').out, 'BRIEFS_OUTDATED 1\n  01-x.md — sync decide\n')
    assert.equal(run('archive', 'sync').code, 0)
    has(run('summary').out, '01-x.md — sync archived')
    // the next follow-up drops the archived node from the covered list, which clears it
    write(root, 'feature-briefs/01-x.md', header('stack=1', '_Followed up by: 03-z.md (2026-10-07)_').replace('stack, sync', 'stack'))
    has(run('summary').out, 'BRIEFS_OUTDATED none')
    write(root, 'feature-briefs/01-x.md', header('stack=1, sync=1', '_Superseded by: 02-y.md (2026-10-07)_'))
    ;({ out } = run('summary'))
    has(out, 'BRIEFS 1 written, 1 superseded')
    has(out, 'READY_NOT_IN_A_BRIEF stack') // a superseded brief no longer covers its nodes
  })

  test('a follow-up chain reports the newest brief', () => {
    write(root, 'feature-briefs/01-x.md', '_Arch nodes covered: stack, sync_\n_Arch revision: stack=0, sync=0_\n_Followed up by: 02-y.md_\n')
    write(root, 'feature-briefs/02-y.md', '_Arch nodes covered: stack_\n_Arch revision: stack=0_\n_Follows up: 01-x.md_\n')
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

// two clones of one bare remote: alice shared the board, bob cloned the project after
describe('shared board', () => {
  let base
  let alice
  let bob
  const sh = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
    return r.stdout.trim()
  }
  const arch = (cwd, ...args) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
    return { code: r.status, out: r.stdout + r.stderr }
  }
  const ok = (cwd, ...args) => {
    const r = arch(cwd, ...args)
    assert.equal(r.code, 0, `${args.join(' ')}: ${r.out}`)
    return r.out
  }
  const clone = name => {
    sh(base, 'clone', '-q', 'remote.git', name)
    const dir = path.join(base, name)
    for (const [key, value] of [['user.email', `${name}@x`], ['user.name', name], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']])
      sh(dir, 'config', key, value)
    return dir
  }
  const idea = (dir, slug) => path.join(dir, '.arch', 'ideas', `${slug}.md`)
  const spawnArch = (cwd, ...args) => new Promise(done => spawn(process.execPath, [SCRIPT, ...args], { cwd }).on('close', done))
  const board = (dir, ...args) => sh(path.join(dir, '.arch'), ...args)

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-git-'))
    sh(base, 'init', '-q', '--bare', 'remote.git')
    alice = clone('alice')
    fs.writeFileSync(path.join(alice, 'code.txt'), 'code')
    sh(alice, 'add', 'code.txt')
    sh(alice, 'commit', '-q', '-m', 'code')
    sh(alice, 'push', '-q', '-u', 'origin', 'HEAD')
    ok(alice, 'init', 'P')
    for (const slug of ['a', 'b']) {
      fs.writeFileSync(idea(alice, slug), node(slug, 'core', 'raw-idea'))
      ok(alice, 'add-node', slug, slug, 'core', 'x')
    }
    ok(alice, 'log', 'new', 'two nodes')
    has(ok(alice, 'share'), 'OK shared: .arch/ is now the branch arch on origin')
    bob = clone('bob')
    has(ok(bob, 'sync'), 'LOCKS shared via origin refs/arch/locks, board branch arch — you are bob@x')
  })

  test('the board lives on its own branch, out of the code branches', () => {
    assert.equal(board(alice, 'symbolic-ref', '--short', 'HEAD'), 'arch')
    assert.equal(board(bob, 'symbolic-ref', '--short', 'HEAD'), 'arch') // sync checked it out
    assert.deepEqual(sh(alice, 'ls-tree', '-r', '--name-only', 'origin/arch').split('\n').sort(), [
      '.gitattributes', '.gitignore', 'ideas/a.md', 'ideas/b.md', 'index.json', 'sessions.jsonl',
    ])
    lacks(sh(alice, 'ls-tree', '-r', '--name-only', 'HEAD'), '.arch')
    assert.equal(sh(alice, 'status', '--porcelain'), '') // .arch/ is hidden from the code checkout
    // a feature branch for the code leaves the board where it is
    sh(alice, 'switch', '-q', '-c', 'feature')
    fs.writeFileSync(path.join(alice, 'code.txt'), 'feature work')
    sh(alice, 'commit', '-q', '-am', 'feature')
    ok(alice, 'claim', 'a')
    ok(alice, 'set', 'a', 'summary', 'on feature')
    ok(alice, 'release')
    assert.equal(board(alice, 'symbolic-ref', '--short', 'HEAD'), 'arch')
    lacks(sh(alice, 'ls-remote', '--heads', 'origin'), 'feature') // the code commit is still the user's to push
    has(sh(alice, 'show', 'origin/arch:index.json'), 'on feature')
  })

  test('a node has one holder; the others work on other nodes', () => {
    has(ok(alice, 'claim', 'a'), 'OK a held by alice@x')
    has(arch(bob, 'claim', 'a').out, 'a is locked by alice@x on ')
    has(ok(bob, 'claim', 'b', '#briefs'), 'OK b, #briefs held by bob@x')
    has(arch(bob, 'set', 'a', 'summary', 'mine now').out, 'ERROR: a is locked by alice@x')
    has(arch(alice, 'set', 'b', 'summary', 'x').out, 'ERROR: b is not claimed') // alice has not fetched bob's claim: still refused
    assert.equal(arch(bob, 'can-edit', idea(bob, 'a')).code, 1)
    for (const file of [idea(bob, 'b'), path.join(bob, '.arch/feature-briefs/01-x.md'), path.join(bob, 'README.md')])
      assert.equal(arch(bob, 'can-edit', file).out, 'OK\n')
    has(arch(bob, 'can-edit', path.join(bob, '.arch/project-context.md')).out, '#context is not claimed')
    const out = ok(bob, 'summary')
    has(out, '  a — alice@x on ')
    has(out, '  b — yours since ')
  })

  test('release pushes the board branch; the next claim pulls it', () => {
    ok(alice, 'claim', 'a')
    fs.appendFileSync(idea(alice, 'a'), '- 2026-10-10 /arch:explore — alice was here\n')
    ok(alice, 'set', 'a', 'maturity', 'explored')
    ok(alice, 'log', 'explore', 'x', '--node', 'a')
    has(ok(alice, 'release'), 'to arch on origin; freed a')
    assert.equal(board(alice, 'status', '--porcelain'), '') // the lock file and the board page stay out of git
    ok(bob, 'claim', 'a')
    has(fs.readFileSync(idea(bob, 'a'), 'utf8'), 'alice was here')
  })

  test('two people change different nodes at once and both release', () => {
    ok(alice, 'claim', 'a')
    ok(bob, 'claim', 'b')
    ok(alice, 'set', 'a', 'maturity', 'explored')
    ok(bob, 'set', 'b', 'priority', 'blocking')
    ok(alice, 'connect', 'a', 'b', 'shared-concern', 'from alice')
    ok(bob, 'connect', 'b', 'a', 'dependency', 'from bob')
    ok(alice, 'log', 'explore', 'alice', '--node', 'a')
    ok(bob, 'log', 'decide', 'bob', '--node', 'b')
    ok(alice, 'release')
    ok(bob, 'release') // pulls alice's push: index.json through the merge driver, sessions.jsonl by union
    ok(alice, 'sync') // pulls bob's
    const index = JSON.parse(fs.readFileSync(path.join(alice, '.arch/index.json'), 'utf8'))
    assert.deepEqual(
      index.nodes.map(n => [n.slug, n.priority, n.maturity]),
      [['a', 'core', 'explored'], ['b', 'blocking', 'raw-idea']],
    )
    assert.deepEqual(index.connections.map(c => c.note).sort(), ['from alice', 'from bob'])
    has(fs.readFileSync(path.join(alice, '.arch/sessions.jsonl'), 'utf8'), '"summary":"bob"')
    has(ok(alice, 'summary'), 'revision=3')
    has(ok(alice, 'sync'), 'none held')
  })

  test('of two claims racing for one node, one wins', async () => {
    const codes = await Promise.all([spawnArch(alice, 'claim', 'a'), spawnArch(bob, 'claim', 'a')])
    assert.deepEqual(codes.sort(), [0, 1])
  })

  test('unlock frees an abandoned lock only with --force', () => {
    ok(alice, 'claim', 'a')
    has(arch(bob, 'unlock', 'a').out, '--force frees it')
    has(ok(bob, 'unlock', 'a', '--force'), 'changes alice@x made under it')
    ok(bob, 'claim', 'a')
  })

  test('joining keeps a plain .arch/ aside', () => {
    const carol = clone('carol')
    fs.mkdirSync(path.join(carol, '.arch'))
    fs.writeFileSync(path.join(carol, '.arch/board.js'), 'old')
    has(ok(carol, 'sync'), 'BOARD_NOT_SET_UP')
    has(arch(carol, 'claim', 'a').out, 'run /arch-share')
    has(ok(carol, 'share'), 'the .arch/ that was here is now .arch.local-')
    assert.equal(board(carol, 'symbolic-ref', '--short', 'HEAD'), 'arch')
    ok(carol, 'claim', 'a')
  })

  test('sharing a board a code branch tracks stages its removal there', () => {
    const dave = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-tracked-'))
    sh(dave, 'init', '-q', '--bare', 'remote.git')
    sh(dave, 'clone', '-q', 'remote.git', 'w')
    const w = path.join(dave, 'w')
    for (const [key, value] of [['user.email', 'd@x'], ['user.name', 'd'], ['commit.gpgsign', 'false']]) sh(w, 'config', key, value)
    ok(w, 'init', 'P')
    sh(w, 'add', '-A')
    sh(w, 'commit', '-q', '-m', 'board on the code branch')
    sh(w, 'push', '-q', '-u', 'origin', 'HEAD')
    has(ok(w, 'share', 'design'), 'its removal is staged')
    has(sh(w, 'diff', '--cached', '--name-status'), 'D\t.arch/index.json')
    assert.equal(board(w, 'symbolic-ref', '--short', 'HEAD'), 'design')
    has(arch(w, 'share', 'design').out, 'OK this clone works on the shared board')
  })
})

test('index.json merge driver: different fields merge, the same field changed twice conflicts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-merge-'))
  const file = (name, data) => {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data))
    return path.join(dir, name)
  }
  const n = (slug, extra) => ({ slug, priority: 'core', maturity: 'raw-idea', ...extra })
  const driver = (...args) => spawnSync(process.execPath, [SCRIPT, 'merge-index', ...args], { cwd: dir, encoding: 'utf8' })
  const base = file('base', { project: 'P', last_updated: '1', nodes: [n('a'), n('b')], connections: [] })
  let ours = file('ours', { project: 'P', nodes: [n('a', { maturity: 'explored' }), n('b')], connections: [{ from: 'a', to: 'b', type: 'dependency' }] })
  let theirs = file('theirs', { project: 'P', last_updated: '1', nodes: [n('a'), n('b', { priority: 'blocking' }), n('c')], connections: [] })
  assert.equal(driver(base, ours, theirs).status, 0)
  assert.deepEqual(JSON.parse(fs.readFileSync(ours, 'utf8')), {
    project: 'P',
    nodes: [n('a', { maturity: 'explored' }), n('b', { priority: 'blocking' }), n('c')],
    connections: [{ from: 'a', to: 'b', type: 'dependency' }],
  })
  ours = file('ours', { project: 'P', nodes: [n('a', { maturity: 'explored' })], connections: [] })
  theirs = file('theirs', { project: 'P', nodes: [n('a', { maturity: 'decided' })], connections: [] })
  const r = driver(base, ours, theirs)
  assert.equal(r.status, 1)
  has(r.stderr, 'both sides changed node a.maturity')
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
    '**Shared board**': WRITERS,
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
