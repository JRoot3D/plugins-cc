import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const INDEX = JSON.stringify({
  project: 'Demo',
  nodes: [
    { slug: 'node-graph', priority: 'core', maturity: 'raw-idea' },
    { slug: 'canvas-ui', priority: 'core', maturity: 'explored' },
    { slug: 'data-model', priority: 'blocking', maturity: 'decided' },
    { slug: 'tech-stack', priority: 'blocking', maturity: 'ready' },
    { slug: 'loop-b', priority: 'deferred', maturity: 'raw-idea' },
    { slug: 'loop-a', priority: 'extension', maturity: 'raw-idea' },
  ],
  connections: [
    { from: 'tech-stack', to: 'data-model', type: 'dependency' },
    { from: 'tech-stack', to: 'canvas-ui', type: 'dependency' },
    { from: 'data-model', to: 'node-graph', type: 'dependency' },
    { from: 'canvas-ui', to: 'node-graph', type: 'dependency' },
    { from: 'loop-a', to: 'loop-b', type: 'dependency' },
    { from: 'loop-b', to: 'loop-a', type: 'dependency' },
    { from: 'canvas-ui', to: 'node-graph', type: 'shared-concern' },
    { from: 'data-model', to: 'canvas-ui', type: 'conflict' },
    { from: 'tech-stack', to: 'archived-node', type: 'conflict' },
  ],
})

const PANE = {
  plugin: 'arch',
  component: 'Pane',
  requestId: 'arch-graph',
  props: {
    title: 'Arch graph',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// every Text and Button label in document order, rules cut to one dash
const texts = async ($: Engine, surface: 'terminal' | 'desktop') => {
  const ui = await $.ui.mount({ ...PANE, surface })
  const found = (await ui.findAll({}))
    .filter(el => el.type === 'Text' || el.type === 'Button')
    .map(el => el.text.replace(/─+$/, '─'))
  await ui.unmount()
  return found
}

test('draws the index as dependency layers, a cycle, shared concerns and conflicts', async ($, on) => {
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: INDEX }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))

  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await texts($, surface)).toEqual([
      'Demo · 6 nodes · 8 links',
      '── layer 0 ─',
      '✦ tech-stack  blocking',
      '── layer 1 ─',
      '◈ data-model  blocking',
      '    ← tech-stack',
      '◽ canvas-ui  core',
      '    ← tech-stack',
      '── layer 2 ─',
      '◻ node-graph  core',
      '    ← data-model, canvas-ui',
      '── cycle ─',
      '◻ loop-a  extension',
      '    ← loop-b',
      '◻ loop-b  deferred',
      '    ← loop-a',
      '── shared ─',
      '↔ canvas-ui · node-graph',
      '── conflicts ─',
      '⚡ data-model · canvas-ui',
    ])
  }
})

test('says to run /arch:new when there is no index', async ($, on) => {
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => {
    throw new Error('ENOENT')
  })

  expect(await texts($, 'terminal')).toEqual(['No .arch/index.json here — run /arch:new.'])
})

test('pressing a node runs /arch:explore on it', async ($, on) => {
  const ran: string[] = []
  on('fs.read', () => ({ value: INDEX }))
  on('command.run', { command: 'arch:explore' }, (_, e) => {
    ran.push(e.args)
    return { text: '' }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'node:data-model' })
    await ui.unmount()
  }
  expect(ran).toEqual(['data-model', 'data-model'])
})
