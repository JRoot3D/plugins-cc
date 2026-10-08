#!/usr/bin/env node
import fs from 'node:fs'

const DOC = `Deterministic helpers for the architector skills. Owns .arch/index.json. Run from the project root.

Read (always exit 0, safe to inject into a skill):
  summary                                    state report: counts, stage, finalize gate, map and brief freshness, problems,
                                             implementation state of the briefs (reads openspec/changes/, read-only)
  check                                      consistency problems only
Write (exit 1 with ERROR: on bad input, nothing written):
  init PROJECT                               create index.json (fails if it exists)
  add-node SLUG NAME PRIORITY SUMMARY        register an existing ideas/SLUG.md as a live raw-idea node
  archive SLUG                               ideas/SLUG.md -> ideas/SLUG.archived.md (SLUG-N.archived.md if taken), drop from nodes
  set SLUG FIELD VALUE                       maturity/priority: index + node file; name/summary: index only.
                                             decided/ready need a ## Decision section in the node file
  connect FROM TO TYPE NOTE                  add or update a connection (dependency|shared-concern|conflict);
                                             for dependency, FROM must be decided before TO
  disconnect FROM TO [TYPE]                  remove matching connections
  rename OLD NEW                             repoint connections from OLD to NEW (merge/split), drop self-links and duplicates
  log SKILL SUMMARY [--node SLUG]... [--full]   append a sessions entry, bump last_updated; --full marks a whole-graph map

index.json: {project, created, last_updated, nodes: [{slug, name, priority, maturity, file, summary}],
             connections: [{from, to, type, note}], sessions: [{date, skill, node (slug or list)?, scope?, summary}]}
Revision = number of sessions entries. A feature brief records the revision it was written at (_Arch revision: N_);
any later session that names one of its nodes makes it outdated. _Superseded by_ retires a brief; _Followed up by_
does not — finalize bumps the old brief's revision instead, so later changes to its nodes outdate it again, except
nodes a brief that follows it up covers: those changes outdate only the newest brief in the chain.
A brief names its OpenSpec changes on the first \`- Changes:\` line of its ## OpenSpec Handoff; summary derives each
stage's state (STAGES) and the changes no live brief names (CHANGES_NOT_IN_A_BRIEF) from openspec/changes/ without the CLI.

Node.js 18+, standard library only.`

// Positional arguments per command; [X] is optional.
const ARGS = {
  summary: '',
  check: '',
  init: 'PROJECT',
  'add-node': 'SLUG NAME PRIORITY SUMMARY',
  archive: 'SLUG',
  set: 'SLUG FIELD VALUE',
  connect: 'FROM TO TYPE NOTE',
  disconnect: 'FROM TO [TYPE]',
  rename: 'OLD NEW',
  log: 'SKILL SUMMARY [--node SLUG]... [--full]',
}

const ARCH = '.arch'
const INDEX = `${ARCH}/index.json`
const MATURITY = ['raw-idea', 'explored', 'decided', 'ready']
const PRIORITY = ['blocking', 'core', 'extension', 'deferred']
const CONNECTION_TYPES = ['dependency', 'shared-concern', 'conflict']
const SKILLS = ['new', 'triage', 'explore', 'map', 'decide', 'finalize']
const FIELDS = ['maturity', 'priority', 'name', 'summary']
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const BRIEF_META = /^_([A-Za-z ]+):\s*(.*?)_\s*$/
const HISTORY_LINE = /^-\s*\[?(\d{4}-\d{2}-\d{2})\]?\s+\/arch:([\w-]+)\s*[—–-]*\s*(.*)$/
const CHANGES = 'openspec/changes'
const CHANGE_NAME = /^`?([a-z0-9]+(?:-[a-z0-9]+)*)/
const ARCHIVED_CHANGE = /^(\d{4}-\d{2}-\d{2})-(.+)$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
// OpenSpec 1.14.1 TASK_LINE_PATTERN (src/utils/task-progress.ts): any list marker, one-character box, not a link
const TASK_LINE = /^\s*(?:[-*+]|\d{1,9}[.)])\s*\[(?:\s*([^\]\s]?)\s*\](?![(\[])|\s+\])/

const fail = msg => {
  process.stderr.write(`ERROR: ${msg}\n`)
  process.exit(1)
}

// quotes a value in messages: 'explored', none
const q = v => (typeof v === 'string' ? `'${v}'` : String(v ?? 'none'))
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const rank = (values, v) => (values.includes(v) ? values.indexOf(v) : values.length)
const heading = field => field[0].toUpperCase() + field.slice(1)
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const today = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

// Atomic: a crash leaves the old file, never a half-written one.
const write = (file, text) => {
  fs.writeFileSync(`${file}.tmp`, text)
  fs.renameSync(`${file}.tmp`, file)
}

const saveIndex = data => {
  data.last_updated = today()
  write(INDEX, `${JSON.stringify(data, null, 2)}\n`)
}

const read = file => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

const stat = file => {
  try {
    return fs.statSync(file)
  } catch {
    return null
  }
}

const listdir = dir => {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

// dir/*.md: sorted, hidden files skipped like glob does
const mdFiles = dir => listdir(dir).filter(name => !name.startsWith('.') && name.endsWith('.md')).sort()

const lines = text => (text ?? '').split(/\r\n|\r|\n/)

// '## Heading' -> body lines
const sections = text => {
  const out = new Map()
  let current = null
  for (const line of lines(text)) {
    if (line.startsWith('## ')) out.set((current = line.slice(3).trim()), [])
    else if (current) out.get(current).push(line)
  }
  return out
}

const firstValue = body => (body ?? []).map(line => line.trim()).find(Boolean) ?? null

// [date, skill, text] from a node file's ## History section
const history = file =>
  (sections(read(file)).get('History') ?? [])
    .map(line => HISTORY_LINE.exec(line.trim()))
    .filter(Boolean)
    .map(m => m.slice(1))

const slugsOf = session => (Array.isArray(session.node) ? session.node : session.node ? [session.node] : [])

// Nodes a session changed. finalize only names the nodes its briefs cover.
const changedBy = session => (session.skill === 'finalize' ? [] : slugsOf(session))

const nodePath = node => `${ARCH}/${node.file ?? ''}`

const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x)

// Structural check of index.json; null when usable.
const schemaError = data => {
  if (!isObject(data)) return 'top level must be a JSON object'
  for (const [key, fields] of [['nodes', ['slug', 'file']], ['connections', ['from', 'to', 'type']], ['sessions', ['date', 'skill']]]) {
    const items = data[key] === undefined ? [] : data[key]
    if (!Array.isArray(items) || !items.every(isObject)) return `${key} must be a list of objects`
    for (const [i, x] of items.entries()) {
      const missing = fields.filter(f => typeof x[f] !== 'string')
      if (missing.length) return `${key}[${i}] needs string ${missing.join(', ')}`
    }
  }
  for (const [i, s] of (data.sessions ?? []).entries()) {
    const node = s.node
    if (node != null && typeof node !== 'string' && !(Array.isArray(node) && node.every(x => typeof x === 'string')))
      return `sessions[${i}].node must be a slug or a list of slugs`
  }
  return null
}

// Each dependency cycle once, as a slug path that ends where it starts.
const cycles = edges => {
  const graph = new Map()
  const found = []
  const seen = new Set()
  const done = new Set()
  for (const [a, b] of edges) graph.set(a, [...(graph.get(a) ?? []), b])

  const visit = (n, path) => {
    if (path.includes(n)) {
      const loop = path.slice(path.indexOf(n))
      const key = [...loop].sort().join('\n')
      if (!seen.has(key)) {
        seen.add(key)
        found.push([...loop, n])
      }
    } else if (!done.has(n)) {
      for (const m of graph.get(n) ?? []) visit(m, [...path, n])
      done.add(n)
    }
  }

  for (const n of [...graph.keys()].sort()) visit(n, [])
  return found
}

// [file name, {header field: value}] for .arch/feature-briefs/*.md
const briefs = () =>
  mdFiles(`${ARCH}/feature-briefs`).map(name => {
    const found = lines(read(`${ARCH}/feature-briefs/${name}`))
      .slice(0, 15)
      .map(line => BRIEF_META.exec(line.trim()))
      .filter(Boolean)
    return [name, Object.fromEntries(found.map(m => [m[1], m[2]]))]
  })

const briefSlugs = meta =>
  (meta['Arch nodes covered'] ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

// Change names on the first '- Changes:' line of a brief's ## OpenSpec Handoff (backticks and notes dropped).
const briefChanges = name => {
  const handoff = sections(read(`${ARCH}/feature-briefs/${name}`)).get('OpenSpec Handoff') ?? []
  const line = handoff.find(l => l.startsWith('- Changes:')) ?? ''
  return line
    .slice(line.indexOf(':') + 1)
    .split(/[,;]|→|->/)
    .map(item => CHANGE_NAME.exec(item.trim()))
    .filter(Boolean)
    .map(m => m[1])
}

// Sorted directory names, hidden ones skipped like OpenSpec does.
const subdirs = dir =>
  listdir(dir)
    .filter(d => !d.startsWith('.') && stat(`${dir}/${d}`)?.isDirectory())
    .sort()

// [done, total] in the change's tasks.md, counted the way OpenSpec counts them.
const tasks = change => {
  // ponytail: reads tasks.md only; a custom schema whose apply.tracks names another file shows no tasks
  const found = (read(`${CHANGES}/${change}/tasks.md`) ?? '')
    .split('\n')
    .map(line => TASK_LINE.exec(line))
    .filter(Boolean)
  return [found.filter(m => (m[1] ?? '').toLowerCase() === 'x').length, found.length]
}

// STAGES and CHANGES_NOT_IN_A_BRIEF lines: what openspec/changes/ holds for each brief's changes.
const implementation = written => {
  const isDir = dir => stat(dir)?.isDirectory() ?? false
  const proposed = subdirs(CHANGES).filter(d => d !== 'archive')
  const archived = new Map()
  for (const d of subdirs(`${CHANGES}/archive`)) {
    // sorted, so the latest date wins
    const m = ARCHIVED_CHANGE.exec(d)
    if (m) archived.set(m[2], m[1])
  }
  const stages = written.filter(([, meta]) => !('Superseded by' in meta)).map(([name]) => name)
  const names = new Map(stages.map(name => [name, briefChanges(name)]))
  const out = [`STAGES ${stages.length}${isDir('openspec') ? '' : ' — no openspec/ directory here'}`]
  for (const name of stages) {
    if (!names.get(name).length) {
      out.push(`  ${name} — unknown: its OpenSpec Handoff names no changes`)
      continue
    }
    if (isDir('openspec') && !isDir(CHANGES)) {
      // ponytail: a store-backed OpenSpec root keeps its changes outside the repo; reading them needs the CLI
      out.push(`  ${name} — unknown: openspec/changes/ not found (store-backed root?)`)
      continue
    }
    const parts = []
    const kinds = new Set()
    let done = 0
    for (const c of names.get(name)) {
      // an active change wins over an archived one of the same name
      if (proposed.includes(c)) {
        const [n, total] = tasks(c)
        kinds.add('proposed')
        done += n
        parts.push(total ? `${c} ${n}/${total} tasks` : `${c} proposed (no tasks yet)`)
      } else if (archived.has(c)) {
        kinds.add('archived')
        parts.push(`${c} archived ${archived.get(c)}`)
      } else {
        kinds.add('not proposed')
        parts.push(`${c} not proposed`)
      }
    }
    const only = kind => kinds.size === 1 && kinds.has(kind)
    const state = only('archived')
      ? 'done'
      : only('not proposed')
        ? 'not started'
        : !kinds.has('archived') && !done
          ? 'planned'
          : 'in progress'
    out.push(`  ${name} — ${state}: ${parts.join('; ')}`)
  }
  if (isDir(CHANGES)) {
    const listed = new Set([...names.values()].flat())
    // archived changes older than the first brief predate arch's handoff
    const since = written
      .map(([, meta]) => (meta.Created ?? '').slice(0, 10))
      .filter(d => DATE.test(d))
      .sort()[0]
    const extra = [
      ...proposed.filter(c => !listed.has(c)),
      ...[...archived.keys()]
        .sort()
        .filter(c => since && archived.get(c) >= since && !listed.has(c) && !proposed.includes(c))
        .map(c => `${c} (archived ${archived.get(c)})`),
    ]
    out.push(`CHANGES_NOT_IN_A_BRIEF ${extra.join(', ') || 'none'}`)
  }
  return out
}

const findNode = (data, slug) => data.nodes.find(n => n.slug === slug) ?? fail(`no live node ${q(slug)} in index.json`)

const problems = data => {
  const out = []
  const files = new Map()
  const nodes = data.nodes
  const slugs = new Set(nodes.map(n => n.slug))
  const mentions = (slug, body) => new RegExp(`(?<![\\w-])${escapeRe(slug)}(?![\\w-])`).test((body ?? []).join('\n'))
  const maturity = new Map(nodes.map(n => [n.slug, n.maturity]))
  for (const slug of [...maturity.keys()].filter(s => nodes.filter(n => n.slug === s).length > 1).sort())
    out.push(`${slug}: slug is used by more than one node`)
  for (const node of nodes) {
    const { slug } = node
    const rel = node.file ?? ''
    if (!MATURITY.includes(node.maturity)) out.push(`${slug}: index maturity ${q(node.maturity)} is not one of ${MATURITY.join('/')}`)
    if (!PRIORITY.includes(node.priority)) out.push(`${slug}: index priority ${q(node.priority)} is not one of ${PRIORITY.join('/')}`)
    if (rel !== `ideas/${slug}.md`) {
      out.push(`${slug}: file must be ideas/${slug}.md, not ${q(rel)}`)
      continue
    }
    const text = read(nodePath(node))
    if (text === null) {
      out.push(`${slug}: node file missing: ${rel}`)
      continue
    }
    files.set(slug, sections(text))
    for (const field of ['maturity', 'priority']) {
      const inFile = firstValue(files.get(slug).get(heading(field)))
      if (inFile !== (node[field] ?? null)) out.push(`${slug}: ${field} differs — index ${q(node[field])}, node file ${q(inFile)}`)
    }
    if (['decided', 'ready'].includes(node.maturity) && !files.get(slug).has('Decision'))
      out.push(`${slug}: ${node.maturity} but the node file has no ## Decision section`)
  }
  const registered = new Set(nodes.map(n => n.file))
  for (const name of mdFiles(`${ARCH}/ideas`)) {
    const rel = `ideas/${name}`
    if (!rel.endsWith('.archived.md') && !registered.has(rel))
      out.push(`${rel}: node file is not in index.json — register it with add-node or remove it`)
  }
  const settled = s => ['decided', 'ready'].includes(maturity.get(s))
  for (const { from: a, to: b, type: kind } of data.connections) {
    const unknown = [a, b].filter(s => !slugs.has(s))
    if (unknown.length) {
      out.push(`connection ${a} -> ${b}: unknown slug ${unknown.map(s => q(s)).join(', ')}`)
      continue
    }
    if (!CONNECTION_TYPES.includes(kind)) out.push(`connection ${a} -> ${b}: type ${q(kind)} is not one of ${CONNECTION_TYPES.join('/')}`)
    if (files.has(a) && files.has(b) && !(mentions(b, files.get(a).get('Connections')) || mentions(a, files.get(b).get('Connections'))))
      out.push(`connection ${a} -> ${b} (${kind}): not described in either node's ## Connections`)
    if (kind === 'conflict' && (settled(a) || settled(b))) {
      const why = [a, b].filter(settled).map(s => `${s} is ${maturity.get(s)}`)
      out.push(`conflict ${a} <-> ${b} is unresolved but ${why.join(' and ')} — align the decisions, then disconnect`)
    }
    if (kind === 'dependency' && maturity.get(b) === 'ready' && maturity.get(a) !== 'ready')
      out.push(`${b} is ready but depends on ${a} (${maturity.get(a)})`)
  }
  const deps = data.connections.filter(c => c.type === 'dependency' && slugs.has(c.from) && slugs.has(c.to)).map(c => [c.from, c.to])
  for (const loop of cycles(deps)) out.push(`dependency cycle: ${loop.join(' -> ')}`)
  for (const [i, s] of data.sessions.entries()) if (!s.date || !s.skill) out.push(`sessions[${i}]: missing date or skill`)
  return out
}

const report = found => [`PROBLEMS ${found.length || 'none'}`, ...found.map(p => `  - ${p}`)]

const stage = nodes => {
  const share = levels => nodes.filter(n => levels.includes(n.maturity)).length / (nodes.length || 1)
  return share(MATURITY.slice(2)) > 0.5 ? 'Late' : share(MATURITY.slice(1)) > 0.5 ? 'Mid' : 'Early'
}

const summary = data => {
  const { nodes, sessions, connections } = data
  const live = nodes.map(n => [n, history(nodePath(n))])
  const archived = mdFiles(`${ARCH}/ideas`).filter(name => name.endsWith('.archived.md'))
  const found = problems(data)
  const out = [
    `ARCH_SESSION project=${data.project ?? 'none'} created=${data.created ?? 'none'} last_updated=${data.last_updated ?? 'none'} ` +
      `nodes=${nodes.length} archived=${archived.length} revision=${sessions.length}`,
  ]

  const total = nodes.length || 1
  const counts = MATURITY.map(m => [m, nodes.filter(n => n.maturity === m).length])
  out.push(`MATURITY ${counts.map(([m, c]) => `${m}=${c}(${Math.round((100 * c) / total)}%)`).join(' ')}`)
  out.push(`STAGE ${stage(nodes)}`)

  out.push('NODES priority maturity slug h=history-lines — summary')
  const hist = new Map(live.map(([n, h]) => [n.slug, h]))
  const order = (x, y) =>
    rank(PRIORITY, x.priority) - rank(PRIORITY, y.priority) || rank(MATURITY, x.maturity) - rank(MATURITY, y.maturity) || cmp(x.slug ?? '', y.slug ?? '')
  for (const n of [...nodes].sort(order))
    out.push(`  ${String(n.priority).padEnd(9)} ${String(n.maturity).padEnd(8)} ${n.slug} h=${(hist.get(n.slug) ?? []).length} — ${n.summary ?? ''}`)

  const blocking = nodes.filter(n => n.priority === 'blocking' && n.maturity !== 'ready')
  const reasons = [
    ...(blocking.length ? [`not ready: ${blocking.map(n => `${n.slug}(${n.maturity})`).join(', ')}`] : []),
    ...(found.length ? [`${found.length} problem(s), see PROBLEMS`] : []),
  ]
  out.push(`FINALIZE_GATE ${reasons.length ? `closed — ${reasons.join('; ')}` : 'open — every blocking node is ready and there are no problems'}`)
  const rest = nodes.filter(n => n.priority !== 'blocking' && n.maturity !== 'ready').map(n => n.slug)
  if (rest.length) out.push(`NOT_READY_NON_BLOCKING ${rest.join(', ')}`)

  out.push(`CONNECTIONS ${connections.length}`, ...connections.map(c => `  ${c.from} -> ${c.to} (${c.type})`))

  // only a full map makes the whole graph fresh; sessions are in run order, so everything after it is newer
  const last = sessions.findLastIndex(s => s.skill === 'map' && s.scope === 'full')
  if (last >= 0) {
    const changed = [...new Set(sessions.slice(last + 1).flatMap(changedBy))].filter(s => hist.has(s)).sort()
    out.push(
      `LAST_MAP ${sessions[last].date} (full map, revision ${last + 1}, ${sessions.length - last - 1} sessions since) — ` +
        `nodes changed since: ${changed.join(', ') || 'none (map is fresh)'}`,
    )
  } else out.push('LAST_MAP never — no full /arch:map yet')

  const written = briefs()
  const active = written.filter(([, meta]) => !('Superseded by' in meta))
  const covered = new Set(active.flatMap(([, meta]) => briefSlugs(meta)))
  if (written.length) {
    out.push(`BRIEFS ${written.length} written, ${written.length - active.length} superseded`)
    // a follow-up, even one later superseded, takes over the nodes it covers from the brief it follows up
    const handedOn = new Map()
    for (const [, meta] of written) {
      const followed = meta['Follows up'] ?? ''
      handedOn.set(followed, new Set([...(handedOn.get(followed) ?? []), ...briefSlugs(meta)]))
    }
    const outdated = []
    for (const [name, meta] of active) {
      const rev = meta['Arch revision'] ?? ''
      const later = /^\d+$/.test(rev) ? sessions.slice(Number(rev)) : sessions
      const why = briefSlugs(meta)
        .filter(slug => !handedOn.get(name)?.has(slug))
        .flatMap(slug => {
          if (!hist.has(slug)) return [`${slug} archived`]
          const skills = [...new Set(later.filter(s => changedBy(s).includes(slug)).map(s => s.skill))].sort()
          return skills.length ? [`${slug} ${skills.join('+')}`] : []
        })
      if (why.length) outdated.push(`  ${name} — ${why.join(', ')}`)
    }
    out.push(`BRIEFS_OUTDATED ${outdated.length || 'none'}`, ...outdated)
  }
  const uncovered = nodes.filter(n => n.maturity === 'ready' && !covered.has(n.slug)).map(n => n.slug)
  out.push(`READY_NOT_IN_A_BRIEF ${uncovered.join(', ') || 'none'}`)
  if (written.length) out.push(...implementation(written))

  if (sessions.length) {
    const lastSession = sessions.at(-1)
    const slugs = slugsOf(lastSession)
    out.push(`LAST_SESSION ${lastSession.date} ${lastSession.skill}${slugs.length ? ` node=${slugs.join(',')}` : ''}`)
  }
  // History lines from different nodes on the same day have no order; within one file, later lines are newer
  const events = live
    .flatMap(([n, h]) => h.map(([date, skill, text]) => [date, skill, n.slug, text]))
    .reverse()
    .sort((x, y) => cmp(y[0], x[0]))
  const worked = sessions.findLast(s => changedBy(s).length)
  if (worked) out.push(`LAST_NODE_WORKED_ON ${changedBy(worked).join(',')} (${worked.date} ${worked.skill})`)
  else if (events.length) out.push(`LAST_NODE_WORKED_ON ${events[0][2]} (${events[0][0]} ${events[0][1]})`)
  if (events.length)
    out.push('RECENT_HISTORY newest first', ...events.slice(0, 8).map(([date, skill, slug, text]) => `  ${date} ${skill} ${slug} — ${text}`))

  out.push(...report(found))
  return out.join('\n')
}

const setSection = (file, title, value) => {
  const text = read(file) ?? fail(`node file missing: ${file}`)
  const body = text.split(/\r?\n/)
  const i = body.findIndex(line => line.trim() === `## ${title}`)
  if (i < 0) fail(`${file} has no '## ${title}' section`)
  let j = i + 1
  while (j < body.length && !body[j].trim()) j++
  if (j < body.length && !body[j].startsWith('#')) body[j] = value
  else body.splice(i + 1, 0, value)
  write(file, body.join(text.includes('\r\n') ? '\r\n' : '\n'))
}

const COMMANDS = {
  init(data, [project]) {
    if (data !== null) fail(`${INDEX} already exists`)
    fs.mkdirSync(`${ARCH}/ideas`, { recursive: true })
    saveIndex({ project, created: today(), last_updated: today(), nodes: [], connections: [], sessions: [] })
    return `OK created ${INDEX}`
  },

  'add-node'(data, [slug, name, priority, summary]) {
    if (!SLUG.test(slug)) fail('slug must be lowercase words joined by hyphens, e.g. tech-stack')
    if (!PRIORITY.includes(priority)) fail(`priority must be one of ${PRIORITY.join(', ')}`)
    if (data.nodes.some(n => n.slug === slug)) fail(`node ${q(slug)} already exists`)
    const rel = `ideas/${slug}.md`
    if (read(`${ARCH}/${rel}`) === null) fail(`write ${ARCH}/${rel} first`)
    data.nodes.push({ slug, name, priority, maturity: 'raw-idea', file: rel, summary })
    saveIndex(data)
    return `OK added node ${slug}`
  },

  archive(data, [slug]) {
    const node = findNode(data, slug)
    const src = nodePath(node)
    if (!stat(src)?.isFile()) fail(`node file missing: ${src}`)
    let dst = `${ARCH}/ideas/${slug}.archived.md`
    // archived before: SLUG-2.archived.md, SLUG-3.archived.md, ...
    for (let k = 2; fs.existsSync(dst); k++) dst = `${ARCH}/ideas/${slug}-${k}.archived.md`
    fs.renameSync(src, dst)
    data.nodes.splice(data.nodes.indexOf(node), 1)
    saveIndex(data)
    const left = data.connections.filter(c => c.from === slug || c.to === slug).length
    return `OK archived ${slug} -> ${dst}${left ? ` — ${left} connection(s) still use it: run rename or disconnect` : ''}`
  },

  set(data, [slug, field, value]) {
    if (!FIELDS.includes(field)) fail(`FIELD must be one of ${FIELDS.join(', ')}`)
    const node = findNode(data, slug)
    if (field === 'maturity' || field === 'priority') {
      const allowed = field === 'maturity' ? MATURITY : PRIORITY
      if (!allowed.includes(value)) fail(`${field} must be one of ${allowed.join(', ')}`)
      if (['decided', 'ready'].includes(value) && !sections(read(nodePath(node))).has('Decision'))
        fail(`${nodePath(node)} has no ## Decision section — write the decision into the node file before setting ${value}`)
      setSection(nodePath(node), heading(field), value)
    }
    const old = node[field]
    node[field] = value
    saveIndex(data)
    return `OK ${slug} ${field}: ${old ?? 'none'} -> ${value}`
  },

  connect(data, [from, to, type, note]) {
    if (!CONNECTION_TYPES.includes(type)) fail(`type must be one of ${CONNECTION_TYPES.join(', ')}`)
    if (from === to) fail('a node cannot connect to itself')
    findNode(data, from)
    findNode(data, to)
    const same = data.connections.find(c => c.from === from && c.to === to && c.type === type)
    if (same) same.note = note
    else data.connections.push({ from, to, type, note })
    saveIndex(data)
    return `OK ${same ? 'updated' : 'added'} connection ${from} -> ${to} (${type})`
  },

  disconnect(data, [from, to, type]) {
    const conns = data.connections
    const keep = conns.filter(c => !(c.from === from && c.to === to && (type === undefined || c.type === type)))
    if (keep.length === conns.length) fail(`no connection ${from} -> ${to}${type ? ` (${type})` : ''}`)
    data.connections = keep
    saveIndex(data)
    return `OK removed ${conns.length - keep.length} connection(s)`
  },

  rename(data, [oldSlug, newSlug]) {
    findNode(data, newSlug)
    const out = []
    const seen = new Set()
    let moved = 0
    for (const conn of data.connections) {
      const c = { ...conn }
      for (const end of ['from', 'to']) {
        if (c[end] === oldSlug) {
          c[end] = newSlug
          moved++
        }
      }
      const key = JSON.stringify([c.from, c.to, c.type])
      if (c.from !== c.to && !seen.has(key)) {
        seen.add(key)
        out.push(c)
      }
    }
    data.connections = out
    saveIndex(data)
    return `OK repointed ${moved} connection end(s) from ${oldSlug} to ${newSlug}; ${out.length} connection(s) remain`
  },

  log(data, [skill, summary], { node = [], full = false }) {
    if (!SKILLS.includes(skill)) fail(`skill must be one of ${SKILLS.join(', ')}`)
    if (full && skill !== 'map') fail('--full is only for a whole-graph /arch:map')
    for (const slug of node) findNode(data, slug)
    const entry = { date: today(), skill }
    if (node.length) entry.node = node.length === 1 ? node[0] : node
    if (full) entry.scope = 'full'
    entry.summary = summary
    data.sessions.push(entry)
    saveIndex(data)
    return `OK logged ${JSON.stringify(entry)}`
  },
}

const main = argv => {
  const [cmd, ...rest] = argv
  if (cmd === '-h' || cmd === '--help') return console.log(DOC)
  if (!Object.hasOwn(ARGS, cmd ?? '')) fail(`command must be one of ${Object.keys(ARGS).join(', ')} (--help for details)`)
  // Only log's --node and --full are options; any other word, '-' first or not, is positional. `--` ends options.
  const args = []
  const values = { node: [], full: false }
  for (let i = 0, options = true; i < rest.length; i++) {
    const word = rest[i]
    if (options && word === '--') options = false
    else if (options && cmd === 'log' && word === '--full') values.full = true
    else if (options && cmd === 'log' && word === '--node') values.node.push(rest[++i] ?? fail("option '--node' needs a SLUG"))
    else args.push(word)
  }
  const words = ARGS[cmd].split(' ').filter(w => /^\[?[A-Z]+\]?$/.test(w))
  if (args.length < words.filter(w => !w.startsWith('[')).length || args.length > words.length) fail(`usage: ${cmd} ${ARGS[cmd]}`.trim())

  const reading = cmd === 'summary' || cmd === 'check'
  let data = null
  if (stat(INDEX)?.isFile()) {
    let invalid = null
    try {
      data = JSON.parse(read(INDEX))
    } catch (e) {
      invalid = `${INDEX} is not valid JSON: ${e.message}`
    }
    if (!invalid && schemaError(data)) invalid = `${INDEX}: ${schemaError(data)}`
    if (invalid) {
      console.log(`INDEX_INVALID — ${invalid}`)
      process.exitCode = reading ? 0 : 1
      return
    }
    for (const key of ['nodes', 'connections', 'sessions']) data[key] ??= []
  } else if (cmd !== 'init') {
    console.log(`NO_ARCH_SESSION — ${INDEX} not found in ${process.cwd()}`)
    process.exitCode = reading ? 0 : 1
    return
  }
  if (cmd === 'summary') console.log(summary(data))
  else if (cmd === 'check') console.log(report(problems(data)).join('\n'))
  else console.log(COMMANDS[cmd](data, args, values))
}

main(process.argv.slice(2))
