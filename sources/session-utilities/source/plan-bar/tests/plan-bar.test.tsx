import { expect, mock, test } from 'claude-code/testing'

import type { Plan } from '../types'
import { applySet, applyUpdate, labelOf, percentOf, runsOf } from '../hooks/bar'
import { STRINGS } from '../hooks/i18n'

const STAGES = [
  { name: 'Build', tasks: ['install', 'compile', 'bundle'] },
  { name: 'Deploy', tasks: ['STG', 'PROD'] },
]
const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
const en = STRINGS.en

const planAt = (completed: number): Plan => ({ name: 'Release', stages: STAGES, completed, state: 'running' })
const bar = (plan: Plan, width: number) =>
  runsOf(plan, width)
    .map(run => run.text)
    .join('')

test('進度條：做完、進行中、還沒做，階段交界畫粗線', () => {
  expect(bar(planAt(0), 20)).toBe('▒▒▒▒│░░░│░░░┃░░░│░░░')
  expect(bar(planAt(2), 20)).toBe('████│███│▒▒▒┃░░░│░░░')
  expect(bar(planAt(5), 20)).toBe('████│███│███┃███│███')
  expect(bar(planAt(1), 8)).toBe('██▒▒░┃░░')
})

test('階段標籤和百分比', () => {
  expect([labelOf(planAt(0), en), percentOf(planAt(0))]).toEqual(['Build 1/3', 0])
  expect([labelOf(planAt(3), en), percentOf(planAt(3))]).toEqual(['Deploy 1/2', 60])
  expect(labelOf({ ...planAt(3), state: 'waiting' }, en)).toBe('? Deploy 1/2')
  expect(labelOf({ ...planAt(5), state: 'done' }, en)).toBe('Done')
  expect(labelOf({ ...planAt(5), state: 'done' }, STRINGS['zh-TW'])).toBe('完成')
})

test('跨階段、等待、失敗、完成各有音效，同階段內沒有', () => {
  const start = applySet([], { plan: 'Release', stages: STAGES }).plans
  const step = (list: Plan[], completed: number, state?: string) => applyUpdate(list, { plan: 'Release', completed, state })

  expect(step(start, 2).sounds).toEqual([])
  expect(step(start, 3).sounds).toEqual(['stage'])
  expect(step(start, 3, 'waiting').sounds).toEqual(['waiting'])
  expect(step(start, 4, 'failed').sounds).toEqual(['failed'])
  expect(step(start, 9).sounds).toEqual(['done'])
  expect(step(start, 9).plans[0]?.completed).toBe(5)
  expect(applyUpdate(start, { plan: '沒這個', completed: 1 }).error).toBeDefined()
  expect(applySet(start, { plan: 'x', stages: [] }).error).toBeDefined()
})

test('模型叫工具後 band 出現，等待時變色，按 × 收掉', async ($, on) => {
  const played: string[] = []
  mock.clock(on)
  mock.store(on)
  on('ui.log', () => ({ value: undefined }))
  on('audio.play', ($, e) => {
    played.push(e.clip.asset ?? '')

    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  const set = await $.tool.call({ tool: 'mcp__plan-bar__plan_set', tool_use_id: 't1', plan: 'Release', stages: STAGES })

  expect(set.result).toBe('Plan "Release" is on screen.')

  const moved = await $.tool.call({
    tool: 'mcp__plan-bar__plan_update',
    tool_use_id: 't2',
    plan: 'Release',
    completed: 3,
    state: 'waiting',
  })

  expect(moved.result).toBe('Release: 60%, ? Deploy 1/2')
  expect(played).toEqual(['sounds/waiting.wav'])

  const missing = await $.tool.call({ tool: 'mcp__plan-bar__plan_update', tool_use_id: 't3', plan: 'nope', completed: 1 })

  expect(missing.deny).toBeDefined()

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'plan-bar', surface, ...BAND })
    const label = await ui.find({ type: 'Text', text: '? Deploy 1/2' })

    expect(label?.props.color).toBe('yellow')
    expect((await ui.find({ type: 'Text', text: '60%' }))?.text).toBe('60%')
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'plan-bar', surface: 'terminal', ...BAND })

  await ui.press({ key: 'close-1' })
  expect(await ui.find({ type: 'Text', text: 'Release' })).toBe(undefined)
})

test('/plans demo 照時間走完再自己收掉', async ($, on) => {
  const played: string[] = []
  const clock = mock.clock(on)
  mock.store(on)
  on('ui.log', () => ({ value: undefined }))
  on('audio.play', ($, e) => {
    played.push(e.clip.asset ?? '')

    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  const started = await $.command.run({ command: 'plans', args: 'demo', ...TYPED })

  expect(started.text).toBe('demo running for about 20 seconds, watch above the prompt.')
  await clock.advance(7000)

  const midway = await $.ui.mount({ plugin: 'plan-bar', surface: 'terminal', ...BAND })

  expect(await midway.find({ type: 'Text', text: 'Release v2.4' })).toBeDefined()
  expect(await midway.find({ type: 'Text', text: '? Deploy 2/2' })).toBeDefined()
  expect(await midway.find({ type: 'Text', text: 'Tasks 3/5' })).toBeDefined()
  await midway.unmount()

  await clock.advance(13000)

  const after = await $.ui.mount({ plugin: 'plan-bar', surface: 'terminal', ...BAND })

  expect(await after.find({ type: 'Text', text: /Release v2.4|Refactor/ })).toBe(undefined)
  expect(played).toEqual([
    'sounds/stage.wav',
    'sounds/stage.wav',
    'sounds/waiting.wav',
    'sounds/stage.wav',
    'sounds/failed.wav',
    'sounds/done.wav',
    'sounds/done.wav',
  ])
})

test('語言設成 zh-TW 時指令回覆和示範是中文', { options: { language: 'zh-TW' } }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('ui.log', () => ({ value: undefined }))
  on('audio.play', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  expect((await $.command.run({ command: 'plans', args: '', ...TYPED })).text).toBe(
    '目前沒有 plan。/plans demo 看示範',
  )
  expect((await $.command.run({ command: 'plans', args: 'demo', ...TYPED })).text).toBe(
    '示範開始，大約 20 秒，看 prompt 上方。',
  )
  await clock.advance(1000)
  expect((await $.command.run({ command: 'plans', args: '', ...TYPED })).text?.split('\n')[0]).toBe(
    '● 示範：重構  Tasks 1/5  0%，進行中：讀',
  )

  const band = await $.ui.mount({ plugin: 'plan-bar', surface: 'terminal', ...BAND })

  expect(await band.find({ type: 'Text', text: '示範：Release' })).toBeDefined()
})

test('語言設成 zh-CN 時用簡體', { options: { language: 'zh-CN' } }, async ($, on) => {
  mock.store(on)

  expect((await $.command.run({ command: 'plans', args: 'clear', ...TYPED })).text).toBe('已清空。')
  expect((await $.command.run({ command: 'plans', args: 'sound off', ...TYPED })).text).toBe('音效已关闭。')
})
