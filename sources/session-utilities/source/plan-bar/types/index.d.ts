export type PlanState = 'running' | 'waiting' | 'failed' | 'done'

export type Stage = { name: string; tasks: string[] }

export type Plan = {
  name: string
  stages: Stage[]
  completed: number
  state: PlanState
}

declare module 'claude-code' {
  interface PluginState {
    'plan-bar': { plans: Plan[]; isMuted: boolean; frame: number }
  }
}
