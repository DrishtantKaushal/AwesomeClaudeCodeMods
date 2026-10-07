// What the main loop last asked for: `effort` is null for a model that takes none.
export type Cast = {
  effort: string | null
  model: string
  // `turn` from a model request, `live` from the picker as it moved.
  source: 'turn' | 'live'
}

declare module 'claude-code' {
  interface PluginState {
    'spell-bar': {
      cast: Cast | null
      // A tier the person pinned with /spell, or null to follow the effort.
      preview: number | null
      isHidden: boolean
    }
  }
}
