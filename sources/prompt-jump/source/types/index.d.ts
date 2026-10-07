export type PromptEntry = { id: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-jump': { prompts: PromptEntry[]; current: string; isOpen: boolean }
  }
}
