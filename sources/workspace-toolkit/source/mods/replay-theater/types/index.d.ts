export type ReplayStep = { file: string; kind: 'edit' | 'write'; before: string; after: string }

declare module 'claude-code' {
  interface PluginState {
    'replay-theater': { replay: ReplayStep[]; pos: number }
  }
}
