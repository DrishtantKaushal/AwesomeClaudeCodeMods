import { describe, expect, test } from 'claude-code/testing'

import type { FablesScene } from '../types'

import { Director, type Host, LINGER_MS } from '../hooks/director'
import { readMs } from '../hooks/narrator'

/** A reply for each ask, in order: its caption, its backdrop, and how long the model takes. */
type Script = { caption: string; backdrop?: string; after: number }[]

/** The narrator's loop on a clock of its own, a tenth of a second at a time, ticking every second. */
function stage(script: Script, waits: Record<string, number> = {}) {
  let now = 0
  const replies = [...script]
  const timers: { due: number; run: () => void }[] = []
  const band: { at: number; scene: FablesScene | null }[] = []
  const asks: { at: number; prompt: string }[] = []
  const host: Host = {
    now: () => now,
    complete: ask =>
      new Promise(resolve => {
        asks.push({ at: now, prompt: ask.prompt })
        const r = replies.shift()
        const text = r ? JSON.stringify({ backdrop: r.backdrop ?? 'lab', hero: { action: 'think', from: 20, to: 20 }, caption: r.caption }) : ''
        timers.push({ due: now + (r?.after ?? 1000), run: () => resolve({ isAnswered: Boolean(r), text }) })
      }),
    show: scene => void band.push({ at: now, scene }),
    speaksAfter: scene => waits[scene.caption] ?? 0,
  }
  const n = new Director()
  const settle = async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve()
  }
  /** Runs the clock on to `until` ms, doing each of `at` when its time comes. */
  const run = async (until: number, at: Record<number, () => void> = {}) => {
    for (; now <= until; now += 100) {
      at[now]?.()
      for (const t of timers.splice(0).filter(t => (t.due <= now ? true : (timers.push(t), false)))) {
        t.run()
        await settle()
      }
      if (now % 1000 === 0) {
        void n.tick(host)
        await settle()
      }
    }
  }
  /** Every change of the band holds what was up long enough to read, and never shows a scene twice in a row. */
  const isGraceful = () =>
    band.every((b, i) => {
      const prev = band[i - 1]
      return !prev?.scene || b.at - prev.at >= readMs(prev.scene)
    })
  return { n, run, band, asks, isGraceful }
}

const LONG = 'A long caption, the longest the bubble takes whole: four lines of it, read slowly'

describe('the band plays scenes from a queue', () => {
  test('a failure mid-read waits for the line on the band to be read, and breaks in on it in the story', async () => {
    const { n, run, band, asks, isGraceful } = stage([
      { caption: LONG, after: 1000 },
      { caption: 'Wait- `npm test` just went red >_<', after: 1000 },
    ])
    n.submit('fix the test')
    n.tool('Bash', { command: 'npm test' })
    await run(8000, { 2000: () => n.failed('Bash', { command: 'npm test' }) })
    // The news was asked for as soon as the model could be asked again, and came back while the first line was still up.
    expect(asks.length).toBe(2)
    expect(asks[1]?.prompt).toContain('breaks in')
    expect(band.length).toBe(1)
    await run(20000)
    expect(band.length).toBe(2)
    expect(isGraceful()).toBe(true)
  })

  test('a new prompt while the closing scene is on its way: the closing scene still plays, read through, then the new story', async () => {
    const { n, run, band, isGraceful } = stage([
      { caption: 'Looking around', after: 1000 },
      { caption: 'All done \\o/', backdrop: 'city', after: 3000 },
      { caption: 'On to the next thing', after: 1000 },
    ])
    n.submit('one')
    n.tool('Read', { file_path: 'a.ts' })
    await run(3000, { 2000: () => n.complete('answer') })
    await run(30000, {
      // The person asks again before the closing scene has come back.
      3500: () => {
        n.submit('two')
        n.tool('Read', { file_path: 'b.ts' })
      },
    })
    expect(band.map(b => b.scene?.caption)).toEqual(['Looking around', 'All done \\o/', 'On to the next thing'])
    // The closing scene opens on a new setting, so it fades in; the next goes back to the lab, and fades too.
    expect(band.map(b => b.scene?.enter)).toEqual([undefined, 'fade', 'fade'])
    expect(isGraceful()).toBe(true)
  })

  test('a turn with nothing to tell still clears the band once the last scene has lingered', async () => {
    const { n, run, band } = stage([
      { caption: 'Reading', after: 1000 },
      { caption: 'Done', after: 1000 },
    ])
    n.submit('one')
    n.tool('Read', { file_path: 'a.ts' })
    await run(2000, { 1500: () => n.complete('answer') })
    // A second turn that does nothing at all: no scene of its own, and no closing scene.
    await run(LINGER_MS + 20000, {
      10000: () => n.submit('two'),
      11000: () => n.complete('answer'),
    })
    const last = band.at(-1)
    expect(last?.scene).toBe(null)
    expect((last?.at ?? 0) - (band.at(-2)?.at ?? 0)).toBeGreaterThanOrEqual(LINGER_MS)
  })

  test('a slow reply never hurries what is up: the band stays as it is until there is something new to read', async () => {
    const { n, run, band, isGraceful } = stage([
      { caption: 'First', after: 1000 },
      { caption: 'Second, after a long think', after: 12000 },
    ])
    n.submit('go')
    n.tool('Read', { file_path: 'a.ts' })
    await run(4000, { 3000: () => n.tool('Grep', { pattern: 'x' }) })
    await run(25000)
    expect(band.map(b => b.scene?.caption)).toEqual(['First', 'Second, after a long think'])
    expect(isGraceful()).toBe(true)
  })

  test('a bubble that waits for Claude to walk into reach gets its full reading time after it appears', async () => {
    const { n, run, band } = stage(
      [
        { caption: 'A long walk first', after: 1000 },
        { caption: 'Then the next thing', after: 1000 },
      ],
      { 'A long walk first': 4000 },
    )
    n.submit('go')
    n.tool('Read', { file_path: 'a.ts' })
    await run(4000, { 3000: () => n.tool('Grep', { pattern: 'x' }) })
    await run(30000)
    const [first, second] = band
    expect(second?.scene?.caption).toBe('Then the next thing')
    if (!first?.scene) throw new Error('expected the first scene')
    expect((second?.at ?? 0) - first.at).toBeGreaterThanOrEqual(readMs(first.scene) + 4000)
  })
})
