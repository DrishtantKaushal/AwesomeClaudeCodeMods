export type GateStatus = {
  pr: number
  title: string
  branch: string
  pass: number
  fail: number
  pending: number
  failing: string[]
  codex: number
}

declare module 'claude-code' {
  interface PluginState {
    'merge-gate': { status: GateStatus | null }
  }
}
