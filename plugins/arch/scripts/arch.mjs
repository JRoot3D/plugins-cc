#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DOC = `Deterministic helpers for the architector skills. Owns .arch/index.json. Run from the project root.

Read (always exit 0, safe to inject into a skill):
  summary                                    state report: counts, stage, finalize gate, map and brief freshness, problems,
                                             implementation state of the briefs (reads openspec/changes/, read-only)
  check                                      consistency problems only
  board [--open]                             write .arch/board.js and, when missing or outdated, .arch/board.html;
                                             --open shows the page. Every write command rewrites board.js itself
Write (exit 1 with ERROR: on bad input, nothing written; one writer at a time through .arch/index.lock):
  init PROJECT                               create index.json (fails if it exists)
  add-node SLUG NAME PRIORITY SUMMARY        register an existing ideas/SLUG.md as a live raw-idea node
  archive SLUG                               ideas/SLUG.md -> ideas/SLUG.archived.md (SLUG-N.archived.md if taken), drop from nodes
  set SLUG FIELD VALUE                       maturity/priority: index + node file; name/summary: index only.
                                             decided/ready need a ## Decision section in the node file
  connect FROM TO TYPE NOTE                  add or update a connection (dependency|shared-concern|conflict);
                                             for dependency, FROM must be decided before TO
  disconnect FROM TO [TYPE]                  remove matching connections
  rename OLD NEW                             repoint connections from OLD to NEW (merge/split), drop self-links and duplicates
  log SKILL SUMMARY [--node SLUG]... [--full]   append a line to sessions.jsonl; --full marks a whole-graph map
Shared board (git; every command a no-op that says so while the board is not shared):
  share [BRANCH]                             give the board its own branch (default arch) with .arch/ as its worktree,
                                             push it and create refs/arch/locks; in a clone of a shared board, set .arch/
                                             up as that branch's worktree (a plain .arch/ is kept aside)
  claim KEY...                               pull the board branch, then take KEY (a node slug, #briefs or #context) for
                                             you; fails while someone else holds it
  release                                    commit .arch/, pull and push the board branch, then free your locks
  unlock KEY [--force]                       free KEY without releasing; another person's lock only with --force
Git and hooks (no index needed):
  sync                                       fetch refs/arch/locks, set up the merge driver, check out a missing board
                                             branch, pull it, refresh board.js, print LOCKS
  can-edit FILE                              exit 1 when a lock keeps you from editing FILE (a hook's guard)
  merge-index BASE OURS THEIRS               git merge driver for index.json: nodes by slug, connections by ends and type

index.json: {project, created, nodes: [{slug, name, priority, maturity, file, summary}], connections: [{from, to, type, note}]}
sessions.jsonl: one {date, skill, node (slug or list)?, scope?, revision?, seen?, summary} per line, append-only;
  .arch/.gitattributes merges it with merge=union, so two clones that both logged merge without a conflict.
  Sessions an index.json from before 4.0 holds stay there and come first.
Revision = number of sessions. A node's revision (rev= in NODES) = number of sessions that changed it: a count, so it
survives a git merge that interleaves two clones' sessions, where a position would not. A feature brief records its
nodes' revisions (_Arch revision: slug=N, slug=N_); a node whose revision grew since makes it outdated. A full map
records them too (seen). _Superseded by_ retires a brief; _Followed up by_ does not — finalize bumps the old brief's
revisions instead, so later changes to its nodes outdate it again, except nodes a brief that follows it up covers:
those changes outdate only the newest brief in the chain.
A shared board lives on a branch of its own (.arch/ is its worktree, hidden from the code branches through
.git/info/exclude), so its commits never reach a code branch or a pull request. Its locks are refs/arch/locks on the
remote: one commit holding locks.json {branch, nodes: {KEY: {owner, host, since}}, released: {KEY: commit}}. You are user.email on this host. A lock changes by a push on top of the tip just fetched,
which the remote refuses once anyone else moved it, so of two people claiming one node only one gets it. set, add-node
and archive need your lock on the node; released[KEY] is the commit a release pushed, which claim requires in HEAD.
A brief names its OpenSpec changes on the first \`- Changes:\` line of its ## OpenSpec Handoff; summary derives each
stage's state (STAGES) and the changes no live brief names (CHANGES_NOT_IN_A_BRIEF) from openspec/changes/ without the CLI:
in the working tree, and on a shared board on every branch of the remote too (archived anywhere = done; otherwise the
furthest progress, with the branch it is on).

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
  share: '[BRANCH]',
  claim: 'KEY...',
  release: '',
  unlock: 'KEY [--force]',
  sync: '',
  'can-edit': 'FILE',
  'merge-index': 'BASE OURS THEIRS',
  board: '[--open]',
}

const ARCH = '.arch'
const INDEX = `${ARCH}/index.json`
const SESSIONS = `${ARCH}/sessions.jsonl`
const ATTRIBUTES = `${ARCH}/.gitattributes`
const GITIGNORE = `${ARCH}/.gitignore`
const LOCK = `${ARCH}/index.lock`
const BOARD_PAGE = `${ARCH}/board.html`
const BOARD_DATA = `${ARCH}/board.js`
const TEMPLATE = fileURLToPath(new URL('board.html', import.meta.url))
const LOCKS_REF = 'refs/arch/locks'
// lock keys besides node slugs: the feature briefs with the todo list, and project-context.md
const BOARD_KEYS = ['#briefs', '#context']
const SCRIPT = path.resolve(process.argv[1]).replaceAll('\\', '/')
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

// Sessions an index.json from before 4.0 holds: they stay there, new ones go to sessions.jsonl.
let legacySessions = []

// last_updated (before 4.0) changed with every write, so two clones always conflicted on it: dropped
const saveIndex = ({ sessions, last_updated, ...data }) =>
  write(INDEX, `${JSON.stringify(legacySessions.length ? { ...data, sessions: legacySessions } : data, null, 2)}\n`)

// One writer at a time: two runs that read index.json together would each save their copy and lose the other's change.
const lock = () => {
  for (let tries = 0; ; tries++) {
    try {
      fs.closeSync(fs.openSync(LOCK, 'wx'))
      process.on('exit', () => fs.rmSync(LOCK, { force: true }))
      return
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
    }
    // a write takes milliseconds, so an older lock was left by a killed run
    if (Date.now() - (stat(LOCK)?.mtimeMs ?? Date.now()) > 10_000) fs.rmSync(LOCK, { force: true })
    else if (tries > 600) fail(`${LOCK} is held by another arch.mjs run`)
    else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
  }
}

// git in the project root; never throws, a missing git is a failed call
const git = (args, input) => {
  const r = spawnSync('git', args, { encoding: 'utf8', input })
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() || String(r.error ?? '') }
}
const gitOrFail = (args, input) => {
  const r = git(args, input)
  return r.ok ? r.out : fail(`git ${args[0]}: ${r.err}`)
}

const branch = () => git(['branch', '--show-current']).out
const remote = () => git(['config', `branch.${branch()}.remote`]).out || 'origin'
const shared = () => git(['rev-parse', '-q', '--verify', LOCKS_REF]).ok
const me = () => ({ owner: git(['config', 'user.email']).out || os.userInfo().username, host: os.hostname() })
const isMine = (holder, who) => holder?.owner === who.owner && holder?.host === who.host
const holderText = h => `${h.owner} on ${h.host} since ${h.since}`
const now = () => `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`
const fetchLocks = () => git(['fetch', '-q', remote(), `+${LOCKS_REF}:${LOCKS_REF}`])

// locks.json on refs/arch/locks; null when it does not parse
const readLocks = () => {
  try {
    const data = JSON.parse(git(['cat-file', '-p', `${LOCKS_REF}:locks.json`]).out)
    return { branch: data.branch, nodes: data.nodes ?? {}, released: data.released ?? {} }
  } catch {
    return null
  }
}

// A commit of locks.json on top of the local tip, pushed: the remote takes it only while its tip is still that one.
const pushLocks = (locks, message) => {
  const blob = gitOrFail(['hash-object', '-w', '--stdin'], `${JSON.stringify(locks, null, 2)}\n`)
  const tree = gitOrFail(['mktree'], `100644 blob ${blob}\tlocks.json\n`)
  const parent = git(['rev-parse', '-q', '--verify', LOCKS_REF]).out
  const commit = gitOrFail(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message])
  if (!git(['push', '-q', remote(), `${commit}:${LOCKS_REF}`]).ok) return false
  git(['update-ref', LOCKS_REF, commit])
  return true
}

// fetch, edit, push; a push that lost the race fetches the new tip and edits again
const changeLocks = (message, edit) => {
  for (let tries = 0; tries < 5; tries++) {
    const fetched = fetchLocks()
    if (!fetched.ok) fail(`cannot fetch ${LOCKS_REF} from ${remote()}: ${fetched.err}`)
    const locks = readLocks() ?? fail(`${LOCKS_REF}:locks.json is not valid JSON`)
    const before = JSON.stringify(locks)
    const text = edit(locks)
    if (JSON.stringify(locks) === before || pushLocks(locks, message)) return text
  }
  return fail(`${LOCKS_REF} kept changing on ${remote()} — run it again`)
}

// lines a file must hold, appended when missing
const addLines = (file, wanted) => {
  const text = read(file) ?? ''
  const missing = wanted.filter(line => !lines(text).includes(line))
  if (missing.length) write(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`)
}

// What a shared board needs in this clone: the merge driver (git config is per clone, the path per plugin version)
// and the .arch/ files that route merges to it and keep the local write lock out of commits.
const setUpGit = () => {
  git(['config', 'merge.arch-index.name', 'arch index.json merge'])
  git(['config', 'merge.arch-index.driver', `node "${SCRIPT}" merge-index %O %A %B`])
}
const gitFiles = () => {
  addLines(ATTRIBUTES, ['sessions.jsonl merge=union', 'index.json merge=arch-index'])
  addLines(GITIGNORE, ['index.lock', '*.tmp', 'board.html', 'board.js'])
}

const boardGit = args => git(['-C', ARCH, ...args])
const boardBranch = () => readLocks()?.branch ?? null

// .arch/ checked out as a worktree of the board branch
const isBoard = name => {
  const top = boardGit(['rev-parse', '--show-toplevel'])
  return top.ok && realPath(top.out) === realPath(ARCH) && boardGit(['symbolic-ref', '-q', '--short', 'HEAD']).out === name
}
const requireBoard = () => {
  const name = boardBranch() ?? fail(`${LOCKS_REF} names no board branch — run /arch-share`)
  return isBoard(name) ? name : fail(`${ARCH}/ is not a worktree of the board branch ${name} — run /arch-share to set this clone up`)
}

// Keeps .arch/ out of the code branches: hidden in this clone, and its removal staged where a code branch tracked it.
const hideFromCode = () => {
  const exclude = gitOrFail(['rev-parse', '--git-path', 'info/exclude'])
  fs.mkdirSync(path.dirname(exclude), { recursive: true })
  addLines(exclude, [`/${ARCH}/`])
  if (!git(['ls-files', '--', ARCH]).out) return ''
  git(['rm', '-r', '-q', '--cached', '--', ARCH])
  return ` — ${branch() || 'this branch'} tracked ${ARCH}/: its removal is staged, commit it the way this project takes changes`
}

// Turns .arch/ into a worktree of a new branch that holds only the board, and pushes it. Undone on failure.
const makeBoard = name => {
  const aside = `${ARCH}.share-${Date.now()}`
  fs.renameSync(ARCH, aside)
  const step = args => {
    const r = git(args)
    if (r.ok) return
    git(['worktree', 'remove', '--force', ARCH])
    fs.rmSync(ARCH, { recursive: true, force: true })
    git(['branch', '-D', name])
    fs.renameSync(aside, ARCH)
    fail(`git ${args.join(' ')}: ${r.err} — ${ARCH}/ is back as it was`)
  }
  step(['worktree', 'add', '-q', '--no-checkout', '--detach', ARCH])
  // HEAD on the unborn branch: nothing of the code is checked out or indexed
  step(['-C', ARCH, 'symbolic-ref', 'HEAD', `refs/heads/${name}`])
  step(['-C', ARCH, 'read-tree', '--empty'])
  fs.cpSync(aside, ARCH, { recursive: true })
  gitFiles()
  step(['-C', ARCH, 'add', '-A'])
  step(['-C', ARCH, 'commit', '-q', '-m', 'arch: the board'])
  step(['-C', ARCH, 'push', '-q', '-u', remote(), name])
  fs.rmSync(aside, { recursive: true, force: true })
}

// Puts the board branch at .arch/; a plain .arch/ already there is kept aside. Says where it went, if anywhere.
const joinBoard = name => {
  if (isBoard(name)) return ''
  const fetched = git(['fetch', '-q', remote(), name])
  if (!fetched.ok) fail(`cannot fetch the board branch ${name} from ${remote()}: ${fetched.err}`)
  git(['worktree', 'prune'])
  const aside = stat(ARCH) ? `${ARCH}.local-${Date.now()}` : ''
  if (aside) fs.renameSync(ARCH, aside)
  const added = git(['worktree', 'add', '-q', ARCH, name])
  if (!added.ok) {
    if (aside) fs.renameSync(aside, ARCH)
    fail(`git worktree add ${ARCH} ${name}: ${added.err}`)
  }
  return aside ? ` — the ${ARCH}/ that was here is now ${aside}` : ''
}

// Commits what this clone changed on the board, then merges what the others released: null, or why it failed
// (the merge is undone then).
const pullBoard = (name, message) => {
  boardGit(['add', '-A'])
  if (!boardGit(['diff', '--cached', '--quiet']).ok) {
    const committed = boardGit(['commit', '-q', '-m', message])
    if (!committed.ok) return committed.err
  }
  const pulled = boardGit(['pull', '-q', '--no-rebase', '--ff', '--no-edit', remote(), name])
  if (pulled.ok) return null
  boardGit(['merge', '--abort'])
  return pulled.err
}

const checkKey = key => SLUG.test(key) || BOARD_KEYS.includes(key) || fail(`KEY must be a node slug or one of ${BOARD_KEYS.join(', ')}`)

// On a shared board a node file changes only under its holder's lock.
const requireLock = key => {
  if (!shared()) return
  const holder = readLocks()?.nodes[key]
  if (!isMine(holder, me())) fail(holder ? `${key} is locked by ${holderText(holder)}` : `${key} is not claimed — run claim ${key} first`)
}

// The real path of a file that may not exist yet: symlinks resolved (/var is /private/var on macOS), case as on disk
const realPath = file => {
  const full = path.resolve(file)
  try {
    return fs.realpathSync.native(full)
  } catch {
    const dir = path.dirname(full)
    return dir === full ? full : path.join(realPath(dir), path.basename(full))
  }
}

// The lock key that guards a file under .arch/, or null
const keyOf = file => {
  const rel = path.relative(realPath(ARCH), realPath(file)).split(path.sep).join('/')
  const idea = /^ideas\/([^/]+?)(?:\.archived)?\.md$/.exec(rel)
  if (idea) return idea[1]
  if (rel.startsWith('feature-briefs/') || rel === 'todo-list.md') return '#briefs'
  return rel === 'project-context.md' ? '#context' : null
}

const locksReport = () => {
  if (!shared()) return []
  const locks = readLocks()
  if (!locks) return [`LOCKS invalid — ${LOCKS_REF}:locks.json is not valid JSON`]
  const who = me()
  const held = Object.entries(locks.nodes).sort(([a], [b]) => cmp(a, b))
  return [
    `LOCKS shared via ${remote()} ${LOCKS_REF}, board branch ${locks.branch ?? 'none'} — you are ${who.owner} on ${who.host}; ` +
      `${held.length || 'none'} held`,
    ...held.map(([key, h]) => `  ${key} — ${isMine(h, who) ? `yours since ${h.since}` : holderText(h)}`),
  ]
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Three-way merge: a side that kept the base value takes the other side's; objects merge field by field.
const merge3 = (base, ours, theirs, at, conflicts) => {
  if (same(ours, theirs) || same(ours, base)) return theirs
  if (same(theirs, base)) return ours
  if ([base ?? {}, ours, theirs].every(isObject)) {
    const out = {}
    for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
      const v = merge3(base?.[k], ours[k], theirs[k], `${at}.${k}`, conflicts)
      if (v !== undefined) out[k] = v
    }
    return out
  }
  conflicts.push(at)
  return ours ?? theirs
}

// Keyed lists merge item by item: ours keep their order, items only theirs have follow.
const mergeList = (key, sides, at, conflicts) => {
  const [base, ours, theirs] = sides.map(list => new Map((Array.isArray(list) ? list : []).map(x => [key(x), x])))
  return [...new Set([...ours.keys(), ...theirs.keys()])]
    .map(k => merge3(base.get(k), ours.get(k), theirs.get(k), `${at} ${k}`, conflicts))
    .filter(x => x !== undefined)
}

// Commands that run without index.json and without the write lock: git runs merge-index inside release's pull.
const STANDALONE = {
  sync() {
    if (!git(['rev-parse', '--git-dir']).ok) return 'LOCKS not shared — not a git repository'
    const fetched = fetchLocks()
    if (!shared()) return 'LOCKS not shared'
    setUpGit()
    // the code's branches too, for the stages' progress; --prune drops the branches merged pull requests deleted
    git(['fetch', '-q', '--prune', remote()])
    const out = fetched.ok ? [] : [`SYNC_FAILED — showing the locks last fetched: ${fetched.err}`]
    const name = boardBranch()
    // a clone without .arch/ gets the board; one with a plain .arch/ is left to /arch-share, which moves it aside
    if (name && !stat(ARCH)) {
      joinBoard(name)
      hideFromCode()
    }
    if (name && isBoard(name)) {
      lock()
      const failed = pullBoard(name, `arch: work in progress — ${me().owner}`)
      if (failed) out.push(`BOARD_PULL_FAILED — the board branch ${name} did not merge, so it was left as it was: ${failed}`)
      // the board page shows the locks and what the others released
      try {
        const data = load().data
        if (data) writeBoard(data)
      } catch {}
    } else if (name) out.push(`BOARD_NOT_SET_UP — ${ARCH}/ is not a worktree of the board branch ${name}: run /arch-share`)
    return [...out, ...locksReport()].join('\n')
  },

  share([name = 'arch']) {
    if (!git(['rev-parse', '--git-dir']).ok) fail('not a git repository')
    if (stat(ARCH)?.isDirectory()) lock()
    if (shared() || fetchLocks().ok) {
      const existing = boardBranch() ?? fail(`${LOCKS_REF} names no board branch`)
      const moved = joinBoard(existing)
      setUpGit()
      return `OK this clone works on the shared board: ${ARCH}/ is the branch ${existing}${moved}${hideFromCode()}`
    }
    if (!stat(INDEX)) fail(`no board here yet — run /arch:new first`)
    if (!git(['check-ref-format', '--branch', name]).ok) fail(`${name} is not a valid branch name`)
    setUpGit()
    if (!isBoard(name)) {
      if (git(['ls-remote', '--exit-code', '--heads', remote(), name]).ok || git(['rev-parse', '-q', '--verify', `refs/heads/${name}`]).ok)
        fail(`a branch ${name} already exists — name the board's own branch: /arch-share <branch>`)
      makeBoard(name)
    }
    const note = hideFromCode()
    if (!pushLocks({ branch: name, nodes: {}, released: {} }, 'share the arch board'))
      fail(`cannot push ${LOCKS_REF} to ${remote()}; the branch ${name} is pushed — run /arch-share again`)
    return `OK shared: ${ARCH}/ is now the branch ${name} on ${remote()}, the locks are ${LOCKS_REF}${note}`
  },

  'can-edit'([file]) {
    const key = keyOf(file)
    if (key === null || !shared()) return 'OK'
    const holder = readLocks()?.nodes[key]
    if (isMine(holder, me())) return 'OK'
    return fail(
      holder
        ? `${key} is locked by ${holderText(holder)} — leave it to them`
        : `${key} is not claimed — claim it first: node "${SCRIPT}" claim ${key}`,
    )
  },

  'merge-index'([base, ours, theirs]) {
    const sides = [base, ours, theirs].map(file => {
      try {
        const data = JSON.parse(read(file) || '{}')
        return isObject(data) ? data : {}
      } catch {
        return fail(`${file} is not valid JSON`)
      }
    })
    const conflicts = []
    const { sessions, ...rest } = merge3(...sides.map(({ nodes, connections, ...other }) => other), 'index', conflicts)
    const merged = {
      ...rest,
      nodes: mergeList(n => n.slug, sides.map(s => s.nodes), 'node', conflicts),
      connections: mergeList(c => `${c.from} -> ${c.to} (${c.type})`, sides.map(s => s.connections), 'connection', conflicts),
      ...(sessions ? { sessions } : {}),
    }
    fs.writeFileSync(ours, `${JSON.stringify(merged, null, 2)}\n`)
    if (conflicts.length) fail(`index.json: both sides changed ${conflicts.join(', ')} — kept ours, fix it by hand`)
    return 'OK merged index.json'
  },
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

// slug -> number of sessions that changed it (the node's revision)
const revs = sessions => {
  const out = new Map()
  for (const slug of sessions.flatMap(changedBy)) out.set(slug, (out.get(slug) ?? 0) + 1)
  return out
}

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

// [done, total] in a tasks.md, counted the way OpenSpec counts them.
const countTasks = text => {
  // ponytail: reads tasks.md only; a custom schema whose apply.tracks names another file shows no tasks
  const found = (text ?? '')
    .split('\n')
    .map(line => TASK_LINE.exec(line))
    .filter(Boolean)
  return [found.filter(m => (m[1] ?? '').toLowerCase() === 'x').length, found.length]
}

// What one place holds under openspec/changes/: active changes, archived ones with their dates, and an active
// change's [done, total] tasks. `where` names a remote branch; the working tree has none.
const changesIn = (where, dirs, readFile) => {
  const archived = new Map()
  for (const d of dirs(`${CHANGES}/archive`)) {
    // sorted, so the latest date wins
    const m = ARCHIVED_CHANGE.exec(d)
    if (m) archived.set(m[2], m[1])
  }
  return { where, proposed: dirs(CHANGES).filter(d => d !== 'archive'), archived, tasks: c => countTasks(readFile(`${CHANGES}/${c}/tasks.md`)) }
}

// On a shared board the code lives on many branches: openspec/changes/ on every branch of the remote counts too,
// open pull requests included, so the stages read the same whichever branch this checkout is on. The remote's
// default branch comes first; branches with the same changes tree are read once.
const remoteChanges = () => {
  if (!shared()) return []
  const prefix = `refs/remotes/${remote()}/`
  const head = git(['symbolic-ref', '-q', `${prefix}HEAD`]).out
  const refs = git(['for-each-ref', '--format=%(refname)', prefix])
    .out.split('\n')
    .filter(r => r && r !== `${prefix}HEAD` && r !== `${prefix}${boardBranch()}`)
    .sort((a, b) => (b === head) - (a === head))
  if (!refs.length) return []
  const trees = git(['cat-file', '--batch-check'], refs.map(r => `${r}:${CHANGES}\n`).join('')).out.split('\n')
  const seen = new Map()
  refs.forEach((ref, i) => {
    const [oid, type] = (trees[i] ?? '').split(' ')
    if (type === 'tree' && !seen.has(oid)) seen.set(oid, ref.slice('refs/remotes/'.length))
  })
  return [...seen].map(([oid, where]) => {
    const paths = git(['ls-tree', '-r', '--name-only', oid]).out.split('\n')
    // the directories right under dir, as subdirs() lists them on disk
    const dirs = dir => {
      const under = dir === CHANGES ? '' : `${dir.slice(CHANGES.length + 1)}/`
      const names = paths.filter(p => p.startsWith(under)).map(p => p.slice(under.length).split('/'))
      return [...new Set(names.filter(parts => parts.length > 1 && !parts[0].startsWith('.')).map(parts => parts[0]))].sort()
    }
    const readFile = file => {
      const r = git(['cat-file', '-p', `${oid}:${file.slice(CHANGES.length + 1)}`])
      return r.ok ? r.out : null
    }
    return changesIn(where, dirs, readFile)
  })
}

// STAGES and CHANGES_NOT_IN_A_BRIEF lines: what openspec/changes/ holds for each brief's changes.
const implementation = written => {
  const isDir = dir => stat(dir)?.isDirectory() ?? false
  const sources = [changesIn(null, subdirs, read), ...remoteChanges()]
  const anywhere = isDir(CHANGES) || sources.length > 1
  // Within one place an active change wins over an archived one of the same name; across places, archived anywhere
  // wins (a branch merged before the archive still holds it active).
  const places = c => sources.map(s => (s.proposed.includes(c) ? { s } : s.archived.has(c) ? { date: s.archived.get(c) } : null)).filter(Boolean)
  const archivedOn = c => places(c).map(f => f.date).filter(Boolean).sort().at(-1)
  const status = c => {
    const date = archivedOn(c)
    if (date) return { kind: 'archived', date }
    const found = places(c)
    if (!found.length) return { kind: 'not proposed' }
    // the furthest progress, and where; the working tree wins a tie
    const best = found
      .map(f => ({ where: f.s.where, counts: f.s.tasks(c) }))
      .reduce((x, y) => (y.counts[0] > x.counts[0] || (y.counts[0] === x.counts[0] && y.counts[1] > x.counts[1]) ? y : x))
    return { kind: 'proposed', ...best }
  }
  const stages = written.filter(([, meta]) => !('Superseded by' in meta)).map(([name]) => name)
  const names = new Map(stages.map(name => [name, briefChanges(name)]))
  const out = [`STAGES ${stages.length}${isDir('openspec') || anywhere ? '' : ' — no openspec/ directory here'}`]
  for (const name of stages) {
    if (!names.get(name).length) {
      out.push(`  ${name} — unknown: its OpenSpec Handoff names no changes`)
      continue
    }
    if (isDir('openspec') && !anywhere) {
      // ponytail: a store-backed OpenSpec root keeps its changes outside the repo; reading them needs the CLI
      out.push(`  ${name} — unknown: openspec/changes/ not found (store-backed root?)`)
      continue
    }
    const parts = []
    const kinds = new Set()
    let done = 0
    for (const c of names.get(name)) {
      const st = status(c)
      kinds.add(st.kind)
      if (st.kind === 'proposed') {
        const [n, total] = st.counts
        const on = st.where ? ` on ${st.where}` : ''
        done += n
        parts.push(total ? `${c} ${n}/${total} tasks${on}` : `${c} proposed (no tasks yet)${on}`)
      } else parts.push(st.kind === 'archived' ? `${c} archived ${st.date}` : `${c} not proposed`)
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
  if (anywhere) {
    const listed = new Set([...names.values()].flat())
    // archived changes older than the first brief predate arch's handoff
    const since = written
      .map(([, meta]) => (meta.Created ?? '').slice(0, 10))
      .filter(d => DATE.test(d))
      .sort()[0]
    const all = [...new Set(sources.flatMap(s => [...s.proposed, ...s.archived.keys()]))].filter(c => !listed.has(c)).sort()
    const extra = [
      ...all.filter(c => !archivedOn(c)),
      ...all.filter(c => since && archivedOn(c) >= since).map(c => `${c} (archived ${archivedOn(c)})`),
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
  const rev = revs(sessions)
  const lastUpdated = sessions.map(s => s.date).sort().at(-1) ?? data.created ?? 'none'
  const out = [
    `ARCH_SESSION project=${data.project ?? 'none'} created=${data.created ?? 'none'} last_updated=${lastUpdated} ` +
      `nodes=${nodes.length} archived=${archived.length} revision=${sessions.length}`,
  ]

  const total = nodes.length || 1
  const counts = MATURITY.map(m => [m, nodes.filter(n => n.maturity === m).length])
  out.push(`MATURITY ${counts.map(([m, c]) => `${m}=${c}(${Math.round((100 * c) / total)}%)`).join(' ')}`)
  out.push(`STAGE ${stage(nodes)}`)

  out.push('NODES priority maturity slug h=history-lines rev=revision — summary')
  const hist = new Map(live.map(([n, h]) => [n.slug, h]))
  const order = (x, y) =>
    rank(PRIORITY, x.priority) - rank(PRIORITY, y.priority) || rank(MATURITY, x.maturity) - rank(MATURITY, y.maturity) || cmp(x.slug ?? '', y.slug ?? '')
  for (const n of [...nodes].sort(order))
    out.push(
      `  ${String(n.priority).padEnd(9)} ${String(n.maturity).padEnd(8)} ${n.slug} h=${(hist.get(n.slug) ?? []).length} ` +
        `rev=${rev.get(n.slug) ?? 0} — ${n.summary ?? ''}`,
    )

  const blocking = nodes.filter(n => n.priority === 'blocking' && n.maturity !== 'ready')
  const reasons = [
    ...(blocking.length ? [`not ready: ${blocking.map(n => `${n.slug}(${n.maturity})`).join(', ')}`] : []),
    ...(found.length ? [`${found.length} problem(s), see PROBLEMS`] : []),
  ]
  out.push(`FINALIZE_GATE ${reasons.length ? `closed — ${reasons.join('; ')}` : 'open — every blocking node is ready and there are no problems'}`)
  const rest = nodes.filter(n => n.priority !== 'blocking' && n.maturity !== 'ready').map(n => n.slug)
  if (rest.length) out.push(`NOT_READY_NON_BLOCKING ${rest.join(', ')}`)

  out.push(`CONNECTIONS ${connections.length}`, ...connections.map(c => `  ${c.from} -> ${c.to} (${c.type})`))

  // only a full map makes the whole graph fresh; a node changed since when its revision outgrew the one the map saw
  const last = sessions.findLastIndex(s => s.skill === 'map' && s.scope === 'full')
  if (last >= 0) {
    const map = sessions[last]
    // a map logged before 4.0 saw every session before it
    const seen = map.seen ?? Object.fromEntries(revs(sessions.slice(0, last + 1)))
    const at = map.revision ?? last + 1
    const changed = [...rev]
      .filter(([slug, n]) => n > (seen[slug] ?? 0) && hist.has(slug))
      .map(([slug]) => slug)
      .sort()
    out.push(
      `LAST_MAP ${map.date} (full map, revision ${at}, ${sessions.length - at} sessions since) — ` +
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
      // _Arch revision: stack=3, sync=1_ — a node it does not name is at 0
      const at = new Map(
        (meta['Arch revision'] ?? '').split(',').map(pair => {
          const [slug, n] = pair.split('=').map(s => s.trim())
          return [slug, Number(n) || 0]
        }),
      )
      const why = briefSlugs(meta)
        .filter(slug => !handedOn.get(name)?.has(slug))
        .flatMap(slug => {
          if (!hist.has(slug)) return [`${slug} archived`]
          const later = sessions.filter(s => changedBy(s).includes(slug)).slice(at.get(slug) ?? 0)
          const skills = [...new Set(later.map(s => s.skill))].sort()
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

  out.push(...locksReport(), ...report(found))
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

// Opens a file with the system's default app, without waiting for it.
const openFile = file => {
  const [cmd, ...args] =
    process.platform === 'darwin' ? ['open', file] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', file] : ['xdg-open', file]
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => undefined).unref()
}

// A page opened from disk cannot read index.json, but it can load a script next to it: board.html is the plugin's
// page, copied once (again only when the plugin's changes), and polls board.js, the board state this writes.
const writeBoard = data => {
  const page = read(TEMPLATE)
  if (page !== null && read(BOARD_PAGE) !== page) fs.writeFileSync(BOARD_PAGE, page)
  const report = summary(data)
  const locks = shared() ? readLocks() : null
  const who = locks ? me() : null
  const rev = revs(data.sessions)
  const board = {
    project: data.project ?? 'arch',
    written: now(),
    stage: stage(data.nodes),
    revision: data.sessions.length,
    gate: /^FINALIZE_GATE (.*)$/m.exec(report)?.[1] ?? '',
    nodes: data.nodes.map(n => {
      const holder = locks?.nodes[n.slug]
      return {
        ...n,
        rev: rev.get(n.slug) ?? 0,
        lock: holder ? { who: isMine(holder, who) ? 'you' : holder.owner, host: holder.host, since: holder.since } : null,
        text: read(nodePath(n)) ?? '',
      }
    }),
    connections: data.connections,
    problems: problems(data),
    report,
  }
  // derived and rewritten often: no lock, no temp file; a page that reads it half-written skips that poll
  fs.writeFileSync(BOARD_DATA, `archBoard(${JSON.stringify(board)})\n`)
  addLines(GITIGNORE, ['board.html', 'board.js'])
}

const COMMANDS = {
  board(data, args, { open = false }) {
    writeBoard(data)
    if (open) openFile(path.resolve(BOARD_PAGE))
    return `OK ${BOARD_PAGE} shows the board — ${pathToFileURL(path.resolve(BOARD_PAGE)).href}`
  },

  init(data, [project]) {
    if (data !== null) fail(`${INDEX} already exists`)
    fs.mkdirSync(`${ARCH}/ideas`, { recursive: true })
    saveIndex({ project, created: today(), nodes: [], connections: [] })
    return `OK created ${INDEX}`
  },

  'add-node'(data, [slug, name, priority, summary]) {
    if (!SLUG.test(slug)) fail('slug must be lowercase words joined by hyphens, e.g. tech-stack')
    if (!PRIORITY.includes(priority)) fail(`priority must be one of ${PRIORITY.join(', ')}`)
    if (data.nodes.some(n => n.slug === slug)) fail(`node ${q(slug)} already exists`)
    requireLock(slug)
    const rel = `ideas/${slug}.md`
    if (read(`${ARCH}/${rel}`) === null) fail(`write ${ARCH}/${rel} first`)
    data.nodes.push({ slug, name, priority, maturity: 'raw-idea', file: rel, summary })
    saveIndex(data)
    return `OK added node ${slug}`
  },

  archive(data, [slug]) {
    const node = findNode(data, slug)
    requireLock(slug)
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
    requireLock(slug)
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
    if (full) Object.assign(entry, { scope: 'full', revision: data.sessions.length + 1, seen: Object.fromEntries(revs(data.sessions)) })
    entry.summary = summary
    addLines(ATTRIBUTES, ['sessions.jsonl merge=union'])
    write(SESSIONS, `${read(SESSIONS) ?? ''}${JSON.stringify(entry)}\n`)
    return `OK logged ${JSON.stringify(entry)}`
  },

  claim(data, keys) {
    keys.forEach(checkKey)
    if (!shared() && !fetchLocks().ok) return 'OK not shared — no lock needed'
    const name = requireBoard()
    setUpGit()
    const who = me()
    // the node as the others last released it
    const failed = pullBoard(name, `arch: work in progress — ${who.owner}`)
    if (failed) fail(`pulling the board branch ${name} failed and was undone — run git -C ${ARCH} pull, resolve it, then claim again:\n${failed}`)
    return changeLocks(`claim ${keys.join(' ')} — ${who.owner}`, locks => {
      for (const key of keys) {
        const holder = locks.nodes[key]
        if (holder && !isMine(holder, who)) fail(`${key} is locked by ${holderText(holder)}`)
        const at = locks.released[key]
        if (at && !boardGit(['merge-base', '--is-ancestor', at, 'HEAD']).ok)
          fail(`${key} was released in ${at.slice(0, 7)}, which ${name} here does not have yet — claim again in a moment`)
      }
      for (const key of keys) locks.nodes[key] ??= { owner: who.owner, host: who.host, since: now() }
      return `OK ${keys.join(', ')} held by ${who.owner} on ${who.host}`
    })
  },

  release() {
    if (!shared()) return 'OK not shared — nothing to release'
    const name = requireBoard()
    setUpGit()
    gitFiles()
    const who = me()
    const mine = Object.entries(readLocks()?.nodes ?? {})
      .filter(([, h]) => isMine(h, who))
      .map(([key]) => key)
    for (let tries = 0; ; tries++) {
      const failed = pullBoard(name, `arch: ${mine.join(', ') || 'board'} — ${who.owner}`)
      if (failed)
        fail(`pulling the board branch ${name} failed and was undone; your locks are kept — run git -C ${ARCH} pull, resolve it, then /arch-release:\n${failed}`)
      const pushed = boardGit(['push', '-q', remote(), `HEAD:${name}`])
      if (pushed.ok) break
      if (tries === 2) fail(`git push to ${name} failed; your locks are kept:\n${pushed.err}`)
    }
    const head = boardGit(['rev-parse', 'HEAD']).out
    return changeLocks(`release — ${who.owner}`, locks => {
      const freed = Object.keys(locks.nodes).filter(key => isMine(locks.nodes[key], who))
      for (const key of freed) {
        delete locks.nodes[key]
        locks.released[key] = head
      }
      return `OK pushed ${head.slice(0, 7)} to ${name} on ${remote()}; freed ${freed.join(', ') || 'nothing'}`
    })
  },

  unlock(data, [key], { force = false }) {
    checkKey(key)
    if (!shared()) return 'OK not shared — no lock'
    const who = me()
    return changeLocks(`unlock ${key} — ${who.owner}`, locks => {
      const holder = locks.nodes[key]
      if (!holder) return `OK ${key} was not locked`
      const theirs = !isMine(holder, who)
      if (theirs && !force) fail(`${key} is locked by ${holderText(holder)} — --force frees it, only when the user says it is abandoned`)
      delete locks.nodes[key]
      return `OK freed ${key}${theirs ? ` — changes ${holder.owner} made under it and never released may conflict later` : ''}`
    })
  },
}

// index.json with its sessions, or the line that says why there is none
const load = () => {
  // a clone of a shared board works on the board branch only, never on a stale or missing copy
  const name = shared() ? boardBranch() : null
  if (name && !isBoard(name))
    return { message: `INDEX_INVALID — this project's board is shared on the branch ${name}, and ${ARCH}/ here is not its worktree: run /arch-share` }
  if (!stat(INDEX)?.isFile()) return { message: `NO_ARCH_SESSION — ${INDEX} not found in ${process.cwd()}` }
  let data = null
  let invalid = null
  try {
    data = JSON.parse(read(INDEX))
  } catch (e) {
    invalid = `${INDEX} is not valid JSON: ${e.message}`
  }
  const logged = []
  for (const [i, line] of lines(read(SESSIONS)).entries()) {
    try {
      if (line.trim()) logged.push(JSON.parse(line))
    } catch (e) {
      invalid ??= `${SESSIONS} line ${i + 1} is not valid JSON: ${e.message}`
    }
  }
  if (!invalid && isObject(data) && Array.isArray(data.sessions ?? [])) {
    legacySessions = data.sessions ?? []
    data.sessions = [...legacySessions, ...logged]
  }
  if (!invalid && schemaError(data)) invalid = `${INDEX}: ${schemaError(data)}`
  if (invalid) return { message: `INDEX_INVALID — ${invalid}` }
  for (const key of ['nodes', 'connections', 'sessions']) data[key] ??= []
  return { data }
}

const main = argv => {
  const [cmd, ...rest] = argv
  if (cmd === '-h' || cmd === '--help') return console.log(DOC)
  if (!Object.hasOwn(ARGS, cmd ?? '')) fail(`command must be one of ${Object.keys(ARGS).join(', ')} (--help for details)`)
  // Only log's --node and --full and unlock's --force are options; any other word, '-' first or not, is positional.
  // `--` ends options.
  const args = []
  const values = { node: [], full: false, force: false }
  for (let i = 0, options = true; i < rest.length; i++) {
    const word = rest[i]
    if (options && word === '--') options = false
    else if (options && cmd === 'log' && word === '--full') values.full = true
    else if (options && cmd === 'unlock' && word === '--force') values.force = true
    else if (options && cmd === 'board' && word === '--open') values.open = true
    else if (options && cmd === 'log' && word === '--node') values.node.push(rest[++i] ?? fail("option '--node' needs a SLUG"))
    else args.push(word)
  }
  // KEY... takes one or more
  const words = ARGS[cmd].split(' ').filter(w => /^\[?[A-Z]+\]?$|^[A-Z]+\.\.\.$/.test(w))
  const most = words.some(w => w.endsWith('...')) ? Infinity : words.length
  if (args.length < words.filter(w => !w.startsWith('[')).length || args.length > most) fail(`usage: ${cmd} ${ARGS[cmd]}`.trim())
  if (Object.hasOwn(STANDALONE, cmd)) return console.log(STANDALONE[cmd](args))

  const reading = ['summary', 'check', 'board'].includes(cmd)
  if (!reading && stat(ARCH)?.isDirectory()) lock()
  const { data = null, message } = load()
  if (message && (cmd !== 'init' || !message.startsWith('NO_ARCH_SESSION'))) {
    console.log(message)
    process.exitCode = reading ? 0 : 1
    return
  }
  if (cmd === 'summary') console.log(summary(data))
  else if (cmd === 'check') console.log(report(problems(data)).join('\n'))
  else console.log(COMMANDS[cmd](data, args, values))
  if (!reading) {
    // the board page follows every write; it is a view, so a failure here never fails the write
    try {
      const fresh = load().data
      if (fresh) writeBoard(fresh)
    } catch {}
  }
}

main(process.argv.slice(2))
