export type Position = {
  symbol: string
  chain: string
  wallet: string
  value: number
  cost: number
  upnl: number
}

declare module 'claude-code' {
  interface PluginState {
    'pumpfun-utilities': {
      rows: Position[]
      failed: string[]
      isBusy: boolean
      problem: string | null
      updatedAt: string
      isRevealed: boolean
      isOpen: boolean
      isAuto: boolean
      turn: string
    }
  }
}
