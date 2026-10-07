export type LeftoverKind = 'launchd' | 'systemd' | 'cron' | 'docker' | 'background' | 'repo' | 'backup'

export type Leftover = {
  id: string
  kind: LeftoverKind
  host: string
  label: string
  undo: string
  day: string
  session: string
}

export type DirtyRepo = { path: string; label: string; files: number }

declare module 'claude-code' {
  interface PluginState {
    leftovers: { items: Leftover[]; dirty: DirtyRepo[]; isOpen: boolean }
  }
}
