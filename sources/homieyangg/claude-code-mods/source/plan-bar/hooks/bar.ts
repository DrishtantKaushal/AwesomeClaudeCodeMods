import type { Plan, PlanState, Stage } from '../types'
import type { Strings } from './i18n'

export type Sound = 'stage' | 'done' | 'waiting' | 'failed'
export type CellKind = 'done' | 'current' | 'pending' | 'tick' | 'stage'
export type Run = { kind: CellKind; text: string }
export type Change = { plans: Plan[]; sounds: Sound[]; error?: string }

const MAX_PLANS = 6

export const GLYPH: Record<PlanState, string> = { running: '●', waiting: '?', failed: '!', done: '✓' }
export const COLOR: Record<PlanState, string> = {
  running: 'magenta',
  waiting: 'yellow',
  failed: 'red',
  done: 'green',
}

const CELL: Record<CellKind, string> = { done: '█', current: '▒', pending: '░', tick: '│', stage: '┃' }

export const USAGE = [
  'plan-bar: the user sees a live progress bar above the prompt for multi-step work.',
  'When you start work with three or more distinct steps, call mcp__plan-bar__plan_set once with the plan name and its stages, each listing its tasks in order.',
  'After each task finishes, call mcp__plan-bar__plan_update with the total number of tasks completed so far.',
  'Set state to "waiting" when you are blocked on the user, "failed" when a task failed, "running" to resume.',
  'Skip it for short or single-step work. If the tools are deferred, load them with ToolSearch: select:mcp__plan-bar__plan_set,mcp__plan-bar__plan_update',
].join(' ')

export const SET_SCHEMA = {
  type: 'object',
  properties: {
    plan: { type: 'string', description: 'Short name shown to the user, e.g. "Release pipeline"' },
    stages: {
      type: 'array',
      minItems: 1,
      description: 'Stages in order; a plan with no real stages uses one stage named "Tasks"',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          tasks: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
        required: ['name', 'tasks'],
      },
    },
  },
  required: ['plan', 'stages'],
}

export const UPDATE_SCHEMA = {
  type: 'object',
  properties: {
    plan: { type: 'string', description: 'The name given to plan_set' },
    completed: { type: 'integer', minimum: 0, description: 'Total tasks finished so far, not an increment' },
    state: { type: 'string', enum: ['running', 'waiting', 'failed'] },
  },
  required: ['plan', 'completed'],
}

export const totalOf = (plan: Plan): number => plan.stages.reduce((sum, stage) => sum + stage.tasks.length, 0)

export const percentOf = (plan: Plan): number => Math.round((plan.completed / Math.max(1, totalOf(plan))) * 100)

// 目前做到哪個階段的第幾個 task；全部做完時停在最後一個
export const positionOf = (plan: Plan): { stage: Stage; inStage: number; task: string } => {
  const at = Math.min(plan.completed, totalOf(plan) - 1)
  let before = 0

  for (const stage of plan.stages) {
    if (at < before + stage.tasks.length) {
      return { stage, inStage: at - before + 1, task: stage.tasks[at - before] ?? '' }
    }
    before += stage.tasks.length
  }

  return { stage: { name: '', tasks: [] }, inStage: 0, task: '' }
}

export const labelOf = (plan: Plan, t: Strings): string => {
  if (plan.state === 'done') {
    return t.done
  }

  const { stage, inStage } = positionOf(plan)
  const mark = plan.state === 'waiting' ? '? ' : plan.state === 'failed' ? '✗ ' : ''

  return `${mark}${stage.name} ${inStage}/${stage.tasks.length}`
}

// 把進度條畫成 width 格：做完、進行中、還沒做三種底，task 交界畫細線，階段交界畫粗線
export const runsOf = (plan: Plan, width: number): Run[] => {
  const total = Math.max(1, totalOf(plan))
  const stageStarts = new Set<number>()
  let before = 0

  for (const stage of plan.stages) {
    stageStarts.add(before)
    before += stage.tasks.length
  }

  const taskAt = (cell: number) => Math.min(total - 1, Math.floor((cell * total) / width))
  const hasRoomForTicks = width >= total * 2
  const runs: Run[] = []

  for (let cell = 0; cell < width; cell += 1) {
    const task = taskAt(cell)
    const isBoundary = cell > 0 && taskAt(cell - 1) !== task
    const fill: CellKind = task < plan.completed ? 'done' : task === plan.completed ? 'current' : 'pending'
    const kind: CellKind =
      isBoundary && stageStarts.has(task) ? 'stage' : isBoundary && hasRoomForTicks ? 'tick' : fill
    const last = runs.at(-1)

    if (last !== undefined && last.kind === kind) {
      last.text += CELL[kind]
    } else {
      runs.push({ kind, text: CELL[kind] })
    }
  }

  return runs
}

const stageIndexOf = (plan: Plan): number => plan.stages.indexOf(positionOf(plan).stage)

// 模型給的 input 沒有型別保證，壞的直接回錯誤訊息讓它重叫
export const applySet = (plans: readonly Plan[], input: Record<string, unknown>): Change => {
  const name = typeof input.plan === 'string' ? input.plan.trim() : ''
  const stages = (Array.isArray(input.stages) ? input.stages : []).flatMap((raw: unknown): Stage[] => {
    const { name: stageName, tasks } = (raw ?? {}) as { name?: unknown; tasks?: unknown }
    const list = (Array.isArray(tasks) ? tasks : []).filter((task): task is string => typeof task === 'string')

    return typeof stageName === 'string' && list.length > 0 ? [{ name: stageName, tasks: list }] : []
  })

  if (name === '' || stages.length === 0) {
    return { plans: [...plans], sounds: [], error: 'plan_set needs a plan name and at least one stage with tasks.' }
  }

  const plan: Plan = { name, stages, completed: 0, state: 'running' }
  const others = plans.filter(one => one.name !== name)

  return { plans: [...others, plan].slice(-MAX_PLANS), sounds: [] }
}

export const applyUpdate = (plans: readonly Plan[], input: Record<string, unknown>): Change => {
  const current = plans.find(plan => plan.name === input.plan)

  if (current === undefined || typeof input.completed !== 'number') {
    return { plans: [...plans], sounds: [], error: `No plan named "${String(input.plan)}". Call plan_set first.` }
  }

  const total = totalOf(current)
  const completed = Math.max(0, Math.min(total, Math.floor(input.completed)))
  const asked = input.state === 'waiting' || input.state === 'failed' ? input.state : 'running'
  const state: PlanState = completed >= total ? 'done' : asked
  const next: Plan = { ...current, completed, state }
  const sounds: Sound[] = []

  if (state !== current.state && state !== 'running') {
    sounds.push(state)
  } else if (completed > current.completed && stageIndexOf(next) > stageIndexOf(current)) {
    sounds.push('stage')
  }

  return { plans: plans.map(plan => (plan === current ? next : plan)), sounds }
}

export const listText = (plans: readonly Plan[], t: Strings): string => {
  if (plans.length === 0) {
    return t.noPlans
  }

  const lines = plans.map(plan => {
    const task = plan.state === 'done' ? '' : t.current(positionOf(plan).task)

    return `${GLYPH[plan.state]} ${plan.name}  ${labelOf(plan, t)}  ${percentOf(plan)}%${task}`
  })

  return [...lines, '', t.listHint].join('\n')
}
