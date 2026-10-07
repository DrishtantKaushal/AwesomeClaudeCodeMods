import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Plan, PlanState } from '../types'
import {
  COLOR,
  GLYPH,
  SET_SCHEMA,
  UPDATE_SCHEMA,
  USAGE,
  applySet,
  applyUpdate,
  labelOf,
  listText,
  percentOf,
  runsOf,
} from './bar'
import type { CellKind, Change, Sound } from './bar'
import { STRINGS, langOf } from './i18n'
import type { Strings } from './i18n'

const SHOWN = 4
const LABEL_WIDTH = 16
const PULSE_MS = 600

const plans = atom({ plugin: 'plan-bar', key: 'plans' } as const, [])
const isMuted = atom({ plugin: 'plan-bar', key: 'isMuted' } as const, false)
const frame = atom({ plugin: 'plan-bar', key: 'frame' } as const, 0)

// [幾毫秒後, 是不是 plan_set, 工具的 input]
const demoOf = (t: Strings): readonly (readonly [number, boolean, Record<string, unknown>])[] => {
  const { refactor, release, steps, stages } = t.demo

  return [
    [0, true, { plan: refactor, stages: [steps] }],
    [0, true, { plan: release, stages }],
    [1000, false, { plan: release, completed: 1 }],
    [2000, false, { plan: refactor, completed: 1 }],
    [3000, false, { plan: release, completed: 2 }],
    [4000, false, { plan: release, completed: 3 }],
    [5000, false, { plan: refactor, completed: 2 }],
    [6000, false, { plan: release, completed: 5 }],
    [7000, false, { plan: release, completed: 6, state: 'waiting' }],
    [9000, false, { plan: release, completed: 7 }],
    [10000, false, { plan: refactor, completed: 3 }],
    [11000, false, { plan: release, completed: 7, state: 'failed' }],
    [13000, false, { plan: release, completed: 8 }],
    [14000, false, { plan: release, completed: 9 }],
    [15000, false, { plan: refactor, completed: 5 }],
  ]
}

let isWorking = false

const play = async ($: EngineInterface, sound: Sound) => {
  if (await read($, isMuted)) {
    return
  }

  try {
    if (sound === 'stage') {
      await $.audio.play({ asset: 'sounds/stage.wav' }, { gain: 0.6 })
    } else if (sound === 'done') {
      await $.audio.play({ asset: 'sounds/done.wav' }, { gain: 0.6 })
    } else if (sound === 'waiting') {
      await $.audio.play({ asset: 'sounds/waiting.wav' }, { gain: 0.6 })
    } else {
      await $.audio.play({ asset: 'sounds/failed.wav' }, { gain: 0.6 })
    }
  } catch {
    $.ui.log('plan-bar: could not play sound', { to: 'debug' })
  }
}

// 套用一次變更：寫 state 讓 band 重畫，再放這次變更帶出的音效
const commit = async ($: EngineInterface, change: (list: Plan[]) => Change): Promise<Change> => {
  let outcome: Change = { plans: [], sounds: [] }

  await update($, plans, list => {
    outcome = change(list)

    return outcome.plans
  })

  for (const sound of outcome.sounds) {
    await play($, sound)
  }

  return outcome
}

const drop = ($: EngineInterface, names: readonly string[]) =>
  update($, plans, list => list.filter(plan => !names.includes(plan.name)))

// 進行中那一段隨時間明暗交替，只在 Claude 正在跑而且有 plan 進行中時才動
const pulse = async ($: EngineInterface) => {
  try {
    if (isWorking && (await read($, plans)).some(plan => plan.state === 'running')) {
      await update($, frame, beat => (beat + 1) % 2)
    }
  } catch {
    $.ui.log('plan-bar: pulse failed', { to: 'debug' })
  }
}

const startDemo = ($: EngineInterface, t: Strings) => {
  for (const [at, isSet, input] of demoOf(t)) {
    $.clock.after(at, () => {
      void commit($, list => (isSet ? applySet(list, input) : applyUpdate(list, input))).catch(() => undefined)
    })
  }
  $.clock.after(19000, () => {
    void drop($, [t.demo.refactor, t.demo.release]).catch(() => undefined)
  })
}

const styleOf = (kind: CellKind, state: PlanState, beat: number) => {
  if (kind === 'done') {
    return { color: COLOR[state] }
  }
  if (kind === 'current') {
    return { color: COLOR[state], dimColor: state === 'running' && beat === 1 }
  }

  return kind === 'stage' ? { bold: true } : { dimColor: true }
}

export const register: Register = (on, options) => {
  const t = STRINGS[langOf(options)]

  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'plan_set',
      description:
        "Show a live progress bar above the user's prompt for multi-step work. Call once when starting work with three or more steps: name the plan and list its stages, each with its tasks in order. Calling again with the same plan name replaces it. Then call plan_update as each task finishes.",
      inputSchema: SET_SCHEMA,
    })
    await $.tool.register({
      name: 'plan_update',
      description:
        "Move a plan's progress bar. `completed` is the total number of tasks finished so far, not an increment. Set state to `waiting` when blocked on the user, `failed` when a task failed, `running` to resume. The bar turns done when completed reaches the task count.",
      inputSchema: UPDATE_SCHEMA,
    })
    await $.command.register({
      name: 'plans',
      description: t.commandDescription,
      argumentHint: '[demo|clear|sound off|on]',
    })

    if ((await $.store.get('isMuted')) === true) {
      await update($, isMuted, () => true)
    }
    $.clock.every(PULSE_MS, () => {
      void pulse($)
    })

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      ...composed,
      sections: [...composed.sections, { id: 'plan-bar:usage', text: USAGE, scope: 'session' }],
    }
  })

  on('tool.call', { tool: 'mcp__plan-bar__plan_set' }, async ($, e) => {
    const outcome = await commit($, list => applySet(list, e))

    return outcome.error === undefined ? { result: `Plan "${String(e.plan)}" is on screen.` } : { deny: outcome.error }
  })

  on('tool.call', { tool: 'mcp__plan-bar__plan_update' }, async ($, e) => {
    const outcome = await commit($, list => applyUpdate(list, e))
    const plan = outcome.plans.find(one => one.name === e.plan)

    return outcome.error !== undefined || plan === undefined
      ? { deny: outcome.error ?? 'plan_update failed.' }
      : { result: `${plan.name}: ${percentOf(plan)}%, ${labelOf(plan, STRINGS.en)}` }
  })

  on('turn.start', ($, e, next) => {
    isWorking = true

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ended = await next(e)

    if (e.agentId === undefined) {
      isWorking = false
    }

    return ended
  })

  // 做完的 plan 留到使用者下一次送出 prompt 才收掉
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && (await read($, plans)).some(plan => plan.state === 'done')) {
      await update($, plans, list => list.filter(plan => plan.state !== 'done'))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, plans)

    if (e.props.hasSurvey || list.length === 0) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const beat = await read($, frame)
    const nameWidth = e.props.bodyColumns < 80 ? 14 : 22
    const barWidth = Math.max(10, Math.min(60, e.props.bodyColumns - nameWidth - LABEL_WIDTH - 16))

    return (
      <Box flexDirection="column">
        {await next(e)}
        {list.slice(-SHOWN).map((plan, index) => (
          <Box columnGap={1}>
            <Text color={COLOR[plan.state]}>{GLYPH[plan.state]}</Text>
            <Box width={nameWidth}>
              <Text wrap="truncate-end">{plan.name}</Text>
            </Box>
            <Box>
              {runsOf(plan, barWidth).map(run => (
                <Text {...styleOf(run.kind, plan.state, beat)}>{run.text}</Text>
              ))}
            </Box>
            <Box width={LABEL_WIDTH}>
              <Text color={COLOR[plan.state]} wrap="truncate-end">
                {labelOf(plan, t)}
              </Text>
            </Box>
            <Box width={4} justifyContent="flex-end">
              <Text dimColor>{percentOf(plan)}%</Text>
            </Box>
            <Button key={`close-${index + 1}`} label="×" plain dimColor onPress={() => drop($, [plan.name])} />
          </Box>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'plans' }, async ($, e) => {
    const [verb, arg] = e.args.trim().split(/\s+/)

    if (verb === 'clear') {
      await update($, plans, () => [])

      return { text: t.cleared }
    }
    if (verb === 'sound' && (arg === 'on' || arg === 'off')) {
      await update($, isMuted, () => arg === 'off')
      await $.store.set('isMuted', arg === 'off')

      return { text: arg === 'off' ? t.soundOff : t.soundOn }
    }
    if (verb === 'demo') {
      startDemo($, t)

      return { text: t.demoStarted }
    }

    return { text: listText(await read($, plans), t) }
  })
}
