import { expect, test } from 'claude-code/testing'

const run = (exitCode: number, stdout: string, stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

test("an edit of another person's node is refused with arch.mjs's reason", async ($, on) => {
  const ran: string[][] = []
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    return run(1, '', 'ERROR: a is locked by bob@x on bob-pc since 2026-10-10 09:00 UTC — leave it to them\n')
  })
  let edited = false
  on('tool.call', () => {
    edited = true
    return { result: 'edited' as never }
  })

  const refused = await $.tool.call({ tool: 'Edit', file_path: '/p/.arch/ideas/a.md', old_string: 'x', new_string: 'y' })
  expect(refused.deny ?? refused.text).toContain('a is locked by bob@x on bob-pc')
  expect(edited).toBe(false)
  expect(ran[0]?.slice(-2)).toEqual(['can-edit', '/p/.arch/ideas/a.md'])
})

test('files outside .arch/ pass without asking arch.mjs', async ($, on) => {
  let asked = false
  on('process.run', () => {
    asked = true
    return run(1, '')
  })
  on('tool.call', () => ({ result: 'written' as never }))

  const written = await $.tool.call({ tool: 'Write', file_path: 'C:\\p\\src\\main.ts', content: 'x' })
  expect(written.result).toBe('written')
  expect(asked).toBe(false)
})

test('a node you hold is edited as usual', async ($, on) => {
  on('process.run', () => run(0, 'OK\n'))
  on('tool.call', () => ({ result: 'edited' as never }))

  const edited = await $.tool.call({ tool: 'Edit', file_path: 'C:\\p\\.arch\\ideas\\b.md', old_string: 'x', new_string: 'y' })
  expect(edited.result).toBe('edited')
})
