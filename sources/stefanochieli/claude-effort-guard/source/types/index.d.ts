export type Metrics = {
  contextPercent: number | null
  lastTurnTokens: number | null
  consecutiveStruggles: number
}

export type LogEntry = {
  ts: string
  contextPercent: number | null
  lastTurnTokens: number | null
  struggled: boolean
  reason: string | null
  consecutiveStruggles: number
}

declare module 'claude-code' {
  interface PluginState {
    'effort-guard': { metrics: Metrics; log: LogEntry[] }
  }
}
