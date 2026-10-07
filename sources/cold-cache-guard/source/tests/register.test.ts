import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { On, PromptOrigin, PromptSubmitInput } from 'claude-code'

tier('user')

const HOUR = 3_600_000

type World = {
  asked: string[]
  submitted: string[]
  filled: string[]
  compactions: number
  clears: number
}

type Setup = { tokens?: number; language?: string; answer?: string }

/**
 * Answers every call the mod makes beneath it, as the engine would, and
 * records what reached the engine.
 */
function worldOf(on: On, { tokens = 100_000, language = 'English', answer }: Setup) {
  const world: World = { asked: [], submitted: [], filled: [], compactions: 0, clears: 0 }
  on('settings.read', () => ({ value: { language } }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000, tokens }, rateLimits: [] },
  }))
  on('classic.SessionStart', () => ({}))
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const question = e.questions[0]?.question ?? ''
    world.asked.push(question)
    if (answer === undefined) {
      return { deny: 'dismissed' }
    }
    return { result: { questions: e.questions, answers: { [question]: answer } } }
  })
  on('prompt.submit', ($, e) => {
    world.submitted.push(e.text)
    return { text: e.text }
  })
  on('prompt.fill', ($, e) => {
    world.filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  on('session.compact', () => {
    world.compactions += 1
    return { messages: [{ role: 'user' as const, text: 'summary', toolUses: [] }] }
  })
  on('command.run', { command: 'clear' }, () => {
    world.clears += 1
    return {}
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  return world
}

const typed = (text: string, origin: PromptOrigin = { kind: 'composer' }): PromptSubmitInput => ({
  text,
  wait: false,
  origin,
})

const ANSWER = {
  answer: 'ok',
  durationMs: 1,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
} as const

describe('register', () => {
  test('a prompt within the cache lifetime goes through without a question', async ($, on) => {
    const clock = mock.clock(on)
    const world = worldOf(on, {})
    await $.turn.complete(ANSWER)
    await clock.advance(HOUR / 2)

    await $.prompt.submit(typed('next'))

    expect(world.asked).toEqual([])
    expect(world.submitted).toEqual(['next'])
  })

  test('Send as is goes through, and the choice holds until the next answer', async ($, on) => {
    const clock = mock.clock(on)
    const world = worldOf(on, { answer: 'Send as is' })
    await $.turn.complete(ANSWER)
    await clock.advance(2 * HOUR)

    await $.prompt.submit(typed('first'))
    await $.prompt.submit(typed('second'))

    expect(world.asked).toHaveLength(1)
    expect(world.asked[0]).toContain('~100k tokens')
    expect(world.submitted).toEqual(['first', 'second'])
  })

  test('Cancel keeps the prompt out and puts it back in the box', async ($, on) => {
    const clock = mock.clock(on)
    const world = worldOf(on, { answer: 'Cancel' })
    await $.turn.complete(ANSWER)
    await clock.advance(2 * HOUR)

    await $.prompt.submit(typed('hello'))

    expect(world.submitted).toEqual([])
    expect(world.filled).toEqual(['hello'])
  })

  test('a dismissed question counts as Cancel', async ($, on) => {
    const clock = mock.clock(on)
    const world = worldOf(on, {})
    await $.turn.complete(ANSWER)
    await clock.advance(2 * HOUR)

    await $.prompt.submit(typed('hello'))

    expect(world.submitted).toEqual([])
    expect(world.filled).toEqual(['hello'])
  })

  test('Compact first compacts once the prompt is dropped, then refills it', async ($, on) => {
    const clock = mock.clock(on)
    const world = worldOf(on, { answer: 'Compact first' })
    await $.turn.complete(ANSWER)
    await clock.advance(2 * HOUR)

    await $.prompt.submit(typed('hello'))
    await clock.advance(0)

    expect(world.submitted).toEqual([])
    expect(world.compactions).toBe(1)
    expect(world.filled).toEqual(['hello'])
  })

  test('Start over clears once the prompt is dropped, then refills it', async ($, on) => {
    const clock = mock.clock(on)
    const world = worldOf(on, { answer: 'Start over (/clear)' })
    await $.turn.complete(ANSWER)
    await clock.advance(2 * HOUR)

    await $.prompt.submit(typed('hello'))
    await clock.advance(0)

    expect(world.submitted).toEqual([])
    expect(world.clears).toBe(1)
    expect(world.filled).toEqual(['hello'])
  })

  test('a small context goes through without a question', async ($, on) => {
    const clock = mock.clock(on)
    const world = worldOf(on, { tokens: 5_000, answer: 'Cancel' })
    await $.turn.complete(ANSWER)
    await clock.advance(2 * HOUR)

    await $.prompt.submit(typed('small'))

    expect(world.asked).toEqual([])
    expect(world.submitted).toEqual(['small'])
  })

  test('a peer message goes through without a question', async ($, on) => {
    const clock = mock.clock(on)
    const world = worldOf(on, { answer: 'Cancel' })
    await $.turn.complete(ANSWER)
    await clock.advance(2 * HOUR)

    await $.prompt.submit(typed('from a peer', { kind: 'peer', from: 'other' } as PromptOrigin))

    expect(world.asked).toEqual([])
    expect(world.submitted).toEqual(['from a peer'])
  })

  test('a cold resume asks before anything is typed, with the estimated price', async ($, on) => {
    const clock = mock.clock(on)
    const world = worldOf(on, { answer: 'Compact now' })

    await $.classic.SessionStart({
      source: 'resume',
      seconds_since_last_response: 7_200,
      context_tokens: 420_000,
      prompt_cache_likely_expired: true,
      estimated_cache_write_usd: 2.63,
    })
    await clock.settle()

    expect(world.asked).toHaveLength(1)
    expect(world.asked[0]).toContain('2h00')
    expect(world.asked[0]).toContain('~420k tokens')
    expect(world.asked[0]).toContain('$2.63')
    expect(world.compactions).toBe(1)

    await $.prompt.submit(typed('after the choice'))
    expect(world.asked).toHaveLength(1)
  })

  test('a warm resume asks nothing', async ($, on) => {
    const clock = mock.clock(on)
    const world = worldOf(on, { answer: 'Compact now' })

    await $.classic.SessionStart({
      source: 'resume',
      seconds_since_last_response: 600,
      context_tokens: 420_000,
      prompt_cache_likely_expired: false,
      estimated_cache_write_usd: 2.63,
    })
    await clock.settle()

    expect(world.asked).toEqual([])
  })

  test('the question follows the language setting', async ($, on) => {
    const clock = mock.clock(on)
    const world = worldOf(on, { language: 'French', answer: 'Envoyer tel quel' })
    await $.turn.complete(ANSWER)
    await clock.advance(2 * HOUR)

    await $.prompt.submit(typed('bonjour'))

    expect(world.asked[0]).toContain('Cache froid')
    expect(world.submitted).toEqual(['bonjour'])
  })
})
