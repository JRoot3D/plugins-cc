import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

// what session start asks arch.mjs, with these paths present
const started = async ($: Engine, on: On, present: string[]) => {
  const ran: string[][] = []
  // the engine hands a hook the path resolved against the session's folder
  on('fs.exists', (_, e) => ({ value: present.some(rel => e.path.replaceAll('\\', '/').endsWith(`/${rel}`)) }))
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    return ok('LOCKS not shared\n')
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', () => ({ cwd: '/p' }))
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  return ran.map(argv => argv.at(-1))
}

test('a fresh clone with no .arch/ syncs at session start, so it can join the board', async ($, on) => {
  expect(await started($, on, [])).toEqual(['sync'])
})

test('a board syncs at session start', async ($, on) => {
  expect(await started($, on, ['.arch', '.arch/index.json'])).toEqual(['sync'])
})

test('a plain .arch/ with no index does not sync: /arch-share moves it aside', async ($, on) => {
  expect(await started($, on, ['.arch'])).toEqual([])
})
