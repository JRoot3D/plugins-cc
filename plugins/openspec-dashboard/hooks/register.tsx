import { update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Change, Task } from '../types'
import { doneOf, parseTasks, taskId, toggle } from './tasks'

const PANE = 'openspec'
const ROOT = 'openspec/changes'
const changesRef = { plugin: 'openspec-dashboard', key: 'changes' } as const
const openRef = { plugin: 'openspec-dashboard', key: 'open' } as const

const tasksPath = (change: string) => `${ROOT}/${change}/tasks.md`
const fit = (text: string, width: number) => (text.length > width ? `${text.slice(0, width - 1)}…` : text)
const bar = (done: number, total: number) => (total ? '█'.repeat(Math.round((done / total) * 8)).padEnd(8, '░') : '')

async function refresh($: EngineInterface) {
  const dirs = (await $.fs.exists(ROOT)) ? await $.fs.list(ROOT) : []
  const changes: Change[] = await Promise.all(
    dirs
      .filter(d => d.kind === 'dir' && d.name !== 'archive')
      .map(async d => {
        const path = tasksPath(d.name)
        const tasks = (await $.fs.exists(path)) ? parseTasks(String(await $.fs.read(path))) : []
        return { name: d.name, tasks }
      }),
  )
  await $.state.set(changesRef, changes)
  $.ui.status(
    changes.length ? `openspec: ${changes.map(c => `${c.name} ${doneOf(c)}/${c.tasks.length}`).join(' · ')}` : undefined,
  )

  return changes
}

async function tick($: EngineInterface, change: string, task: Task) {
  const path = tasksPath(change)
  const text = toggle(String(await $.fs.read(path)), task)
  if (text === undefined) $.ui.toast('tasks.md changed meanwhile: refreshed, press again')
  else await $.fs.write(path, text)
  await refresh($)
}

// Not awaited by the Button: the command is queued and runs once the session is idle.
const run = ($: EngineInterface, command: string, args: string) => {
  void $.command.run({ command, args }).catch(err => $.ui.toast(`/${command} failed: ${err}`))
}

const runTask = ($: EngineInterface, change: string, task: Task) =>
  run($, 'opsx:apply', `${change}: do only task ${taskId(task) ?? `"${task.text}"`}, tick it in tasks.md, then stop`)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'openspec',
      description: 'OpenSpec changes pane: task progress, tick tasks, apply/verify/archive',
    })
    await refresh($)

    return next(e)
  })

  on('command.run', { command: 'openspec' }, async $ => {
    // a dispatch reads state as of its start, so use what refresh read
    const changes = await refresh($)
    await $.ui.open({ id: PANE, title: 'OpenSpec' })

    return {
      text: changes.length
        ? changes.map(c => `${c.name}: ${doneOf(c)}/${c.tasks.length} tasks`).join('\n')
        : 'No active OpenSpec changes.',
    }
  })

  // The model ticks tasks with Edit/Write during /opsx:apply: follow it live.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const isEdit = ['Edit', 'MultiEdit', 'Write'].includes(String(e.tool))
    if (isEdit && 'file_path' in e && String(e.file_path).includes(`${ROOT}/`)) await refresh($)

    return result
  })

  // Catches the rest (an archive moves a folder through Bash).
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)

    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const { value: changes = [] } = await $.state.get(changesRef)
    const { value: open = null } = await $.state.get(openRef)
    const width = Math.max(20, e.props.bodyColumns)

    return (
      <Box flexDirection="column">
        <Button key="refresh" hotkey="r" label="Refresh" onPress={() => refresh($)} />
        {changes.length === 0 && <Text dimColor>No active changes in {ROOT}.</Text>}
        {changes.map(change => {
          const done = doneOf(change)
          const total = change.tasks.length
          const isComplete = total > 0 && done === total
          const isOpen = open === change.name

          return (
            <Box flexDirection="column" marginTop={1}>
              <Button
                plain
                key={`open:${change.name}`}
                label={fit(`${isOpen ? '▾' : '▸'} ${change.name}  ${done}/${total} ${bar(done, total)}`, width)}
                onPress={() => update($, openRef, current => (current === change.name ? null : change.name))}
              />
              <Box gap={1}>
                {!isComplete && (
                  <Button
                    key={`apply:${change.name}`}
                    variant="primary"
                    label="Apply"
                    onPress={() => run($, 'opsx:apply', change.name)}
                  />
                )}
                <Button key={`verify:${change.name}`} label="Verify" onPress={() => run($, 'opsx:verify', change.name)} />
                {isComplete && (
                  <Button
                    key={`archive:${change.name}`}
                    variant="primary"
                    label="Archive"
                    onPress={() => run($, 'opsx:archive', change.name)}
                  />
                )}
              </Box>
              {isOpen &&
                change.tasks.map((task, i) => (
                  <Box flexDirection="column">
                    {task.section !== change.tasks[i - 1]?.section && (
                      <Text bold dimColor>
                        {fit(task.section, width)}
                      </Text>
                    )}
                    <Box gap={1}>
                      {task.isDone ? (
                        <Text> </Text>
                      ) : (
                        <Button
                          plain
                          key={`run:${change.name}:${task.line}`}
                          label="▶"
                          onPress={() => runTask($, change.name, task)}
                        />
                      )}
                      <Button
                        plain
                        dimColor={task.isDone}
                        key={`tick:${change.name}:${task.line}`}
                        label={fit(`${task.isDone ? '[x]' : '[ ]'} ${task.text}`, width - 2)}
                        onPress={() => tick($, change.name, task)}
                      />
                    </Box>
                  </Box>
                ))}
            </Box>
          )
        })}
      </Box>
    )
  })
}
