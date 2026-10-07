import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const USAGE = {
  startedAt: 0,
  context: { window: 200_000, tokens: 22_000, percent: 11 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 18, resetsAt: '2026-10-02T07:10:00Z' },
    { kind: 'seven_day', percentUsed: 33 },
  ],
}

test('band shows model display name and meters', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-02T03:00:00Z') })
  on('session.usage', () => ({ value: USAGE }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-meter', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /^Opus 5\.5$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /18%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /↻/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /33%/ })).toBeDefined()
    await ui.unmount()
  }
})

test('band passes while a survey holds it', async ($, on) => {
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))

  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', ...BAND, props: { ...BAND.props, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
  await ui.unmount()
})

test('band keeps what the mods beneath draw, with the meters last', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-02T03:00:00Z') })
  on('session.usage', () => ({ value: USAGE }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['beneath'] }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-meter', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'beneath' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeDefined()
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn.indexOf('beneath')).toBeLessThan(drawn.indexOf('ctx'))
    await ui.unmount()
  }
})
