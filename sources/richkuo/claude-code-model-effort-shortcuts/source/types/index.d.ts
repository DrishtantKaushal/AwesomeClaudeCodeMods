declare module 'claude-code' {
  interface PluginState {
    'model-effort-shortcuts': {
      pick: Record<string, 'low' | 'medium' | 'high' | 'xhigh' | 'max'>
      engine: Record<string, 'low' | 'medium' | 'high' | 'xhigh' | 'max'>
      modelPick: string | null
      engineModel: string | null
      footer: string | null
    }
  }
}
