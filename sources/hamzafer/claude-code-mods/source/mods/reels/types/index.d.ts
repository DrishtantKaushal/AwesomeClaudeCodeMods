export type ReelsStatus = 'off' | 'starting' | 'paused' | 'playing' | 'consent' | 'missing' | 'failed'

declare module 'claude-code' {
  interface PluginState {
    'reels': { status: ReelsStatus; isMuted: boolean }
  }
}
