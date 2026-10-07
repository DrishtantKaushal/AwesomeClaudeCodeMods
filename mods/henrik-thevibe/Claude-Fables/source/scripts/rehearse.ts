/**
 * Plays a scripted session through the narrator's own loop (hooks/director.ts)
 * on a clock of its own: the person's ask, each tool call and line Claude says
 * arrive at their times, the narrator asks the model when it would, and the
 * model answers with the scripted replies, raw text and all, after their
 * scripted delays. What comes out is the session's timeline, moment by moment:
 * every ask with its prompt, every reply with what the validator made of it,
 * every scene shown. The viewer plays it back; the tests check it.
 */
import type { FablesScene } from '../types'

import { type Answer, Director, type Ending, type Host, LINGER_MS, type NarratorModel } from '../hooks/director'

import type { Scenario, Step } from './scenarios'

export type Moment =
  | { at: number; kind: 'submit'; text: string }
  | { at: number; kind: 'step'; step: Step }
  | { at: number; kind: 'complete'; reason: Ending }
  | { at: number; kind: 'ask'; model: NarratorModel; prompt: string; closing?: Ending; reply?: number }
  | { at: number; kind: 'reply'; model: NarratorModel; text: string; isAnswered: boolean; scene: FablesScene | null; isStale: boolean; took: number }
  | { at: number; kind: 'failed'; error: string }
  | { at: number; kind: 'wait'; until: number; failures: number }
  | { at: number; kind: 'hold'; until: number }
  | { at: number; kind: 'show'; scene: FablesScene }
  | { at: number; kind: 'clear' }

export type Rehearsal = {
  moments: Moment[]
  /** Asks the script had no reply ready for. */
  unscripted: number
  /** Scripted replies the narrator never asked for. */
  unused: number
  /** When the last thing worth watching happened: the closing scene, or the last reply. */
  until: number
}

const STEP_MS = 100

/** Runs the session for one narrating model; `look` is the style the scenes are drawn in (it changes the prompt). */
export async function rehearse(scenario: Scenario, model: NarratorModel, look = 'pixel'): Promise<Rehearsal> {
  let now = 0
  const moments: Moment[] = []
  const timers: { due: number; run: () => void; done?: boolean }[] = []
  const replies = [...scenario.replies[model]]
  let unscripted = 0
  let asked = 0
  const host: Host = {
    now: () => now,
    complete: () =>
      new Promise<Answer>((resolve, reject) => {
        const reply = replies.shift()
        const ask = moments.findLast(m => m.kind === 'ask')
        if (ask && ask.kind === 'ask') ask.reply = asked
        asked++
        if (!reply) {
          unscripted++
          timers.push({ due: now + 1000, run: () => resolve({ isAnswered: false, text: '' }) })
          return
        }
        const took = Math.round(reply.after * 1000)
        timers.push({
          due: now + took,
          run: () => ('fail' in reply ? (reply.fail === 'timeout' ? reject(new Error('The model did not answer within 30s')) : resolve({ isAnswered: false, text: '' })) : resolve({ isAnswered: true, text: reply.text })),
        })
      }),
    show: scene => void moments.push(scene ? { at: now, kind: 'show', scene } : { at: now, kind: 'clear' }),
    trace: event => {
      if (event.kind === 'reply') {
        const ask = moments.findLast(m => m.kind === 'ask')
        moments.push({ ...event, took: ask ? event.at - ask.at : 0 })
      } else if (event.kind !== 'clear') moments.push(event)
    },
  }
  const n = new Director()
  n.model = model
  n.look = look

  // Lets the narrator's awaits settle after anything happens on the clock.
  const settle = async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve()
  }

  const steps = [...scenario.steps]
  const endMs = scenario.end * 1000
  let completed = false
  let closedAt: number | undefined
  const stopAt = endMs + LINGER_MS + 2000
  n.submit(scenario.ask)
  moments.push({ at: 0, kind: 'submit', text: scenario.ask })
  for (now = 0; now <= stopAt; now += STEP_MS) {
    while (steps.length && steps[0]!.at * 1000 <= now) {
      const step = steps.shift()!
      moments.push({ at: now, kind: 'step', step })
      if ('said' in step) n.said(step.said)
      else {
        n.tool(step.tool, step.input)
        if (step.failed) n.failed(step.tool, step.input)
      }
    }
    if (!completed && now >= endMs) {
      completed = true
      const reason = scenario.ending ?? 'answer'
      moments.push({ at: now, kind: 'complete', reason })
      n.complete(reason)
    }
    for (const timer of timers) {
      if (!timer.done && timer.due <= now) {
        timer.done = true
        timer.run()
        await settle()
      }
    }
    if (now % 1000 === 0) {
      void n.tick(host)
      await settle()
    }
    if (completed && closedAt === undefined) {
      const shown = moments.findLast(m => m.kind === 'show')
      if (shown && shown.at >= endMs) closedAt = shown.at
    }
  }
  const lastReply = moments.findLast(m => m.kind === 'reply')?.at ?? 0
  return { moments: moments.sort((a, b) => a.at - b.at), unscripted, unused: replies.length, until: Math.max(closedAt ?? 0, lastReply, endMs) / 1000 }
}
