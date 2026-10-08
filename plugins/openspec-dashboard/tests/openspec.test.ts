import { expect, test } from 'claude-code/testing'

import { parseTasks, toggle } from '../hooks/tasks'

const PATH = 'openspec/changes/add-x/tasks.md'
const MD = '## 1. First\n\n- [ ] 1.1 Do a\n      more detail\n- [x] 1.2 Do b\r\n## 2. Second\n- [ ] 2.1 Do c\n'

test('parses tasks under their sections and toggles only an unchanged line', async () => {
  const tasks = parseTasks(MD)
  expect(tasks.map(t => [t.line, t.section, t.text, t.isDone])).toEqual([
    [2, '1. First', '1.1 Do a', false],
    [4, '1. First', '1.2 Do b', true],
    [6, '2. Second', '2.1 Do c', false],
  ])
  const [a, b] = tasks
  expect(toggle(MD, a!)).toBe(MD.replace('- [ ] 1.1', '- [x] 1.1'))
  expect(toggle(MD, b!)).toBe(MD.replace('- [x] 1.2', '- [ ] 1.2'))
  expect(toggle(MD.replace('1.1 Do a', '1.1 Do A'), a!)).toBeUndefined()
})

test('the pane lists active changes and ticks a task in tasks.md', async ($, on) => {
  const files: Record<string, string> = { [PATH]: MD }
  const dir = (name: string) => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })
  // the engine hands hooks absolute paths under the session's cwd
  const rel = (path: string) => path.slice(path.indexOf('openspec/'))
  on('fs.exists', (_, e) => ({ value: rel(e.path) === 'openspec/changes' || rel(e.path) in files }))
  on('fs.list', () => ({ value: [dir('add-x'), dir('archive')] }))
  on('fs.read', (_, e) => ({ value: files[rel(e.path)] ?? '' }))
  on('fs.write', (_, e) => {
    files[rel(e.path)] = e.text
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))

  const { text } = await $.command.run({
    command: 'openspec',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
  expect(text).toBe('add-x: 1/3 tasks')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'openspec-dashboard',
      surface,
      component: 'Pane',
      requestId: 'openspec',
      props: {
        title: 'OpenSpec',
        isFocused: true,
        bodyColumns: 60,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 30 },
        view: {},
      },
    })
    expect(await ui.find({ key: 'archive:archive' })).toBeUndefined()
    expect(await ui.find({ key: 'tick:add-x:2' })).toBeUndefined()

    await ui.press({ key: 'open:add-x' })
    await ui.press({ key: 'tick:add-x:2' })
    expect(files[PATH]).toContain('- [x] 1.1 Do a')
    expect(await ui.find({ key: 'run:add-x:2' })).toBeUndefined()

    await ui.press({ key: 'tick:add-x:2' })
    expect(files[PATH]).toBe(MD)
    await ui.press({ key: 'open:add-x' })
    await ui.unmount()
  }
})
