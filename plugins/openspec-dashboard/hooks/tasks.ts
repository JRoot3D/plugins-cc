import type { Change, Task } from '../types'

// `- [ ] 1.1 Text`; the trailing \s* also eats a CRLF's \r
const TASK = /^\s*- \[([ xX])\] (.*?)\s*$/

export const parseTasks = (md: string): Task[] => {
  let section = ''
  const tasks: Task[] = []
  md.split('\n').forEach((row, line) => {
    if (row.startsWith('## ')) section = row.slice(3).trim()
    const m = TASK.exec(row)
    if (m) tasks.push({ line, section, text: m[2] ?? '', isDone: m[1] !== ' ' })
  })
  return tasks
}

// Flips the checkbox on `task.line` only while that line still holds the same task;
// undefined when the file moved on since it was read.
export const toggle = (md: string, task: Task): string | undefined => {
  const rows = md.split('\n')
  const row = rows[task.line] ?? ''
  const m = TASK.exec(row)
  if (!m || m[2] !== task.text) return undefined
  rows[task.line] = row.replace(/\[([ xX])\]/, (_, c) => (c === ' ' ? '[x]' : '[ ]'))
  return rows.join('\n')
}

export const taskId = (task: Task) => /^\d+(\.\d+)*/.exec(task.text)?.[0]

export const doneOf = (change: Change) => change.tasks.filter(t => t.isDone).length
