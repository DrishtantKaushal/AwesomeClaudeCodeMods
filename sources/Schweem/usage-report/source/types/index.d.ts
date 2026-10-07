export type Window = { kind: string; percentUsed: number; resetsAt?: string }

/** The last usage figures seen, and when the rate-limit windows were read. */
export type Reading = {
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: Window[]
  cost?: { usd: number }
  /** `$.clock.now()` when the rate-limit windows last arrived. */
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-report': {
      last: Reading | null
      /** Highest warning threshold already toasted, by `${kind}@${resetsAt}`. */
      warned: Record<string, number>
    }
  }
}
