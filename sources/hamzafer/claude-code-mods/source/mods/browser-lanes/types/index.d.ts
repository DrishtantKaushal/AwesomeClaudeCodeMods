export type Lane = { owner: string; label: string; since: number; last: number }

// Whether this Claude process has a Playwright browser, and if not, who holds the profile.
export type Attachment = {
  state: 'none' | 'ready' | 'attached' | 'blocked'
  isolated: boolean
  claudePid: number
  serverPid?: number
  chromePid?: number
  profile?: string
  holder?: { claudePid: number; cwd: string; isThisSession: boolean }
  servers: number
}

declare module 'claude-code' {
  interface PluginState {
    'browser-lanes': { holder: Lane | null; waiting: string[]; attachment: Attachment | null }
  }
}
