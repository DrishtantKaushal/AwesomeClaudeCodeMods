export type MaskHit = { tool: string; where: string; count: number }

declare module 'claude-code' {
  interface PluginState {
    'secret-mask': { hits: MaskHit[]; isOff: boolean }
  }
}
