import type { EngineInterface, Register } from 'claude-code'

const PANE = 'arch-graph'
const INDEX = '.arch/index.json'
const SYMBOL: Record<string, string> = { 'raw-idea': '◻', explored: '◽', decided: '◈', ready: '✦' }
const PRIORITY = ['blocking', 'core', 'extension', 'deferred']

type Node = { slug: string; priority?: string; maturity?: string }
type Link = { from: string; to: string; type: string }
type Index = { project?: string; nodes?: Node[]; connections?: Link[] }

// A file under .arch/, on any platform's separators
const ARCH_FILE = /(^|[\\/])\.arch[\\/]/
// summary's and sync's lock report: the header and its indented lines
const LOCKS = /^LOCKS shared via .*(?:\r?\n {2}.*)*/m
const SHARING = /arch\.mjs"?\s+(share|claim|release|unlock)\b/

const fit = (text: string, width: number) => (text.length > width ? `${text.slice(0, width - 1)}…` : text)
const rank = (n: Node) => {
  const i = PRIORITY.indexOf(n.priority ?? '')
  return i < 0 ? PRIORITY.length : i
}
const open = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Arch graph' })
// Not awaited by the Button: the skill is queued and runs once the session is idle.
const explore = ($: EngineInterface, slug: string) => {
  void $.command.run({ command: 'arch:explore', args: slug }).catch(err => $.ui.toast(`/arch:explore failed: ${err}`))
}

const arch = ($: EngineInterface, args: string[]) => $.process.run(['node', `${$.plugin.root}/scripts/arch.mjs`, ...args])

// Fetches refs/arch/locks (a shared board's locks) and shows the ones you hold; resolves the LOCKS block, if shared.
const sync = async ($: EngineInterface) => {
  const block = LOCKS.exec((await arch($, ['sync'])).stdout)?.[0]
  const mine = (block ?? '').split(/\r?\n/).flatMap(line => /^ {2}(\S+) — yours/.exec(line)?.[1] ?? [])
  $.ui.status(mine.length ? `arch: holding ${mine.join(', ')}` : undefined)
  return block
}

// The reason a lock keeps you from editing file, or undefined
const locked = async ($: EngineInterface, file: string) => {
  if (!ARCH_FILE.test(file)) return undefined
  const { exitCode, stdout, stderr } = await arch($, ['can-edit', file])
  return exitCode === 0 ? undefined : `${$.plugin.name}: ${(stderr || stdout).replace(/^ERROR: /, '').trim()}`
}

// Runs an arch.mjs command the person typed, then refreshes the locks it may have changed.
const typed = async ($: EngineInterface, args: string[]) => {
  const { exitCode, stdout, stderr } = await arch($, args)
  await sync($).catch(() => undefined)

  return { text: (exitCode === 0 ? stdout : stderr || stdout).trim() }
}

// Dependency depth: 0 without prerequisites, else one past the deepest. Nodes in or behind a cycle never settle.
const levels = (slugs: string[], prereqs: Map<string, string[]>) => {
  const level = new Map<string, number>()
  for (let moved = true; moved; ) {
    moved = false
    for (const slug of slugs) {
      const before = prereqs.get(slug) ?? []
      if (level.has(slug) || !before.every(p => level.has(p))) continue
      level.set(slug, Math.max(-1, ...before.map(p => level.get(p) ?? 0)) + 1)
      moved = true
    }
  }
  return level
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'arch-graph', description: 'Show the arch dependency graph (.arch/index.json) in a pane' })
    await $.command.register({ name: 'arch-board', description: 'Open .arch/board.html: the board state and dependency graph, live in the browser' })
    await $.command.register({ name: 'arch-share', description: 'Give the arch board its own git branch and per-node locks, or set this clone up for a shared board: /arch-share [branch]' })
    await $.command.register({ name: 'arch-release', description: 'Commit and push .arch/, then free the arch nodes you hold' })
    await $.command.register({ name: 'arch-unlock', description: "Free an abandoned arch lock, yours or another person's: /arch-unlock <node>" })
    if (await $.fs.exists(INDEX)) {
      void open($)
      void sync($).catch(() => undefined)
    }

    return next(e)
  })

  on('command.run', { command: 'arch-graph' }, async $ => {
    await open($)
    $.ui.invalidate('ui.render')

    return { text: 'Arch graph pane opened.' }
  })

  on('command.run', { command: 'arch-board' }, async $ => {
    const { exitCode, stdout, stderr } = await arch($, ['board', '--open'])

    return { text: (exitCode === 0 ? stdout : stderr || stdout).trim() }
  })

  // The person typed it, so it runs: /arch-unlock passes --force, their call that the lock is abandoned.
  on('command.run', { command: 'arch-share' }, ($, e) => typed($, e.args.trim() ? ['share', e.args.trim()] : ['share']))
  on('command.run', { command: 'arch-release' }, $ => typed($, ['release']))
  on('command.run', { command: 'arch-unlock' }, ($, e) =>
    e.args.trim() ? typed($, ['unlock', e.args.trim(), '--force']) : { text: 'usage: /arch-unlock <node, #briefs or #context>' },
  )

  // A skill's Current State shows the locks as last fetched: fetch them now and put the fresh block in its place.
  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    if (!e.skill.startsWith('arch:') || !(await $.fs.exists(INDEX))) return result
    const fresh = await sync($).catch(() => undefined)
    if (fresh === undefined) return result

    return { text: LOCKS.test(result.text) ? result.text.replace(LOCKS, fresh) : `${result.text}\n\nLocks fetched just now:\n${fresh}` }
  })

  // On a shared board a node's file is edited only under your lock; arch.mjs set/add-node/archive check it themselves.
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const deny = await locked($, e.file_path)
    return deny === undefined ? next(e) : { deny }
  }).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const deny = await locked($, e.file_path)
    return deny === undefined ? next(e) : { deny }
  }).catch(($, e, next) => next(e))

  // Every write to index.json goes through arch.mjs, from Bash or PowerShell.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if ('command' in e && String(e.command).includes('arch.mjs')) {
      $.ui.invalidate('ui.render')
      if (SHARING.test(String(e.command))) void sync($).catch(() => undefined)
    }

    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const width = Math.max(20, e.props.bodyColumns)

    const raw = await $.fs.read(INDEX).catch(() => undefined)
    if (raw === undefined) return <Text dimColor>No {INDEX} here — run /arch:new.</Text>
    let index: Index | null
    try {
      index = JSON.parse(String(raw))
    } catch {
      return <Text dimColor>{INDEX} is not valid JSON.</Text>
    }

    const nodes = Array.isArray(index?.nodes) ? [...index.nodes].sort((a, b) => rank(a) - rank(b) || a.slug.localeCompare(b.slug)) : []
    const live = new Set(nodes.map(n => n.slug))
    // connections to unknown slugs are left to `arch.mjs check`
    const links = (Array.isArray(index?.connections) ? index.connections : []).filter(c => live.has(c.from) && live.has(c.to))
    const prereqs = new Map<string, string[]>()
    for (const c of links) if (c.type === 'dependency') prereqs.set(c.to, [...(prereqs.get(c.to) ?? []), c.from])
    const level = levels([...live], prereqs)
    const groups: [string, Node[]][] = Array.from({ length: Math.max(-1, ...level.values()) + 1 }, (_, i) => [
      `layer ${i}`,
      nodes.filter(n => level.get(n.slug) === i),
    ])
    groups.push(['cycle', nodes.filter(n => !level.has(n.slug))])
    const pairs = (type: string, mark: string) => links.filter(c => c.type === type).map(c => `${mark} ${c.from} · ${c.to}`)
    const extras: [string, string[]][] = [['shared', pairs('shared-concern', '↔')], ['conflicts', pairs('conflict', '⚡')]]
    const rule = (title: string) => <Text dimColor>{`── ${title} `.padEnd(width, '─').slice(0, width)}</Text>

    return (
      <Box flexDirection="column">
        <Text bold>{fit(`${index?.project ?? 'arch'} · ${nodes.length} nodes · ${links.length} links`, width)}</Text>
        {nodes.length === 0 && <Text dimColor>No nodes yet.</Text>}
        {groups
          .filter(([, group]) => group.length)
          .map(([title, group]) => (
            <Box flexDirection="column">
              {rule(title)}
              {group.map(n => (
                <Box flexDirection="column">
                  <Button
                    plain
                    key={`node:${n.slug}`}
                    dimColor={n.priority === 'deferred'}
                    label={fit(`${SYMBOL[n.maturity ?? ''] ?? '?'} ${n.slug}  ${n.priority ?? ''}`, width)}
                    onPress={() => explore($, n.slug)}
                  />
                  {prereqs.has(n.slug) && <Text dimColor>{fit(`    ← ${prereqs.get(n.slug)?.join(', ')}`, width)}</Text>}
                </Box>
              ))}
            </Box>
          ))}
        {extras
          .filter(([, lines]) => lines.length)
          .map(([title, lines]) => (
            <Box flexDirection="column">
              {rule(title)}
              {lines.map(line => (
                <Text>{fit(line, width)}</Text>
              ))}
            </Box>
          ))}
      </Box>
    )
  })
}
