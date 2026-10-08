export type Task = { line: number; section: string; text: string; isDone: boolean }
export type Change = { name: string; tasks: Task[] }

declare module 'claude-code' {
  interface PluginState {
    'openspec-dashboard': { changes: Change[]; open: string | null }
  }
}
