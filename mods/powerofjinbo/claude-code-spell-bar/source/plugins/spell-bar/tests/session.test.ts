// What the band follows: the desktop's effort picker, polled from the flag
// settings once the session starts, and the effort each main-loop request asks
// for; and the terminal's frame clock that repaints a mounted Raster.
import type { On, RenderSurface, TurnStepInput } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { describe, expect, mock, test } from 'claude-code/testing'

import { RASTER_ROWS } from '../hooks/pixels.ts'
import {
  band,
  bandColumns,
  cellWords,
  engineBand,
  expectBand,
  mountBand,
  mountBook,
  rankShown,
  spell,
  SURFACES,
} from './helpers.ts'

const MODEL = 'claude-opus-5-5'
const POLL = 1500
const FRAME = Math.round(1000 / 12)
// Two seconds of frames: the refusals in a row a mounted Raster outlasts.
const MISSES = 12 * 2

type Blit = { requestId: string; key: string; cells: string | undefined }

type World = {
  // The flag settings the picker writes, which the test moves; null when
  // they cannot be read.
  flag: Record<string, unknown> | null
  // Set, a read of the flags throws it instead of answering.
  readError: Error | undefined
  registered: string[]
  reads: number
  // What the frame clock repainted, and the engine's refusal, if any.
  blits: Blit[]
  blitDeny: string | undefined
  // While set, each blit waits for the test to answer it from `held`, with a
  // refusal or (undefined) the cells taken: an answer that comes late.
  holdBlits: boolean
  held: Array<(deny: string | undefined) => void>
}

// The engine beneath the plugin for a session drawn on `surfaces`.
function world(on: On, surfaces: readonly RenderSurface[], flag: Record<string, unknown> | null = {}): World {
  const w: World = {
    flag,
    readError: undefined,
    registered: [],
    reads: 0,
    blits: [],
    blitDeny: undefined,
    holdBlits: false,
    held: [],
  }

  on('command.register', (_$, e) => {
    w.registered.push(e.name)

    return { value: { command: e.name } }
  })
  on('settings.read', (_$, e) => {
    w.reads += 1

    if (e.source !== 'flag') {
      return { deny: `spell-bar read the ${e.source ?? 'merged'} settings, not the flags` }
    }

    if (w.readError !== undefined) {
      throw w.readError
    }

    return w.flag === null ? { deny: 'no flag settings here' } : { value: w.flag }
  })
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.model', () => ({ value: MODEL }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.blit', (_$, e) => {
    w.blits.push({ requestId: e.requestId, key: e.key, cells: 'cells' in e ? e.cells : undefined })

    if (w.holdBlits) {
      return new Promise<{ value: { deny?: string } }>(resolve => {
        w.held.push(deny => resolve({ value: deny === undefined ? {} : { deny } }))
      })
    }

    return { value: w.blitDeny === undefined ? {} : { deny: w.blitDeny } }
  })

  return w
}

function start($: Engine, surface: RenderSurface | null = null) {
  return $.session.start({ cwd: '/work', surface, isInteractive: true })
}

// The status line of /spell: "Now: ..." or "Pinned to rank ...".
async function now($: Engine): Promise<string> {
  return (await spell($)).split('\n')[7] ?? ''
}

// The engine's answer to a main-loop request, beneath the plugin.
function requests(on: On) {
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
}

let turns = 0

async function step($: Engine, input: Partial<TurnStepInput>) {
  turns += 1
  const stream = $.turn.step({ turnId: `turn-${turns}`, index: 0, model: MODEL, messageCount: 1, ...input })

  for await (const _chunk of stream) {
    // The engine's chunks pass through untouched.
  }
}

describe('session.start', () => {
  test('registers /spell and /spellbook and reads the flags once', async ($, on) => {
    mock.clock(on)
    const w = world(on, ['desktop'])

    expect(await start($)).toEqual({ cwd: '/work' })
    expect(w.registered).toEqual(['spell', 'spellbook'])
    expect(w.reads).toBe(1)
    expect(await now($)).toBe('Now: effort not seen yet.')
  })

  test('takes the level the picker shows at start', async ($, on) => {
    mock.clock(on)
    world(on, ['desktop'], { effortLevel: 'high', ultracode: false })
    await start($)

    expect(await now($)).toBe(`Now: effort high · ${MODEL}.`)
  })

  test('takes ultracode at start', async ($, on) => {
    mock.clock(on)
    world(on, ['desktop'], { effortLevel: 'xhigh', ultracode: true })
    await start($)

    expect(await now($)).toBe(`Now: ultracode · ${MODEL}.`)
  })

  test('does not infer max from flags with no level at start', async ($, on) => {
    mock.clock(on)
    world(on, ['desktop'], { ultracode: false })
    await start($)

    expect(await now($)).toBe('Now: effort not seen yet.')
  })

  test('starts even when the flags cannot be read', async ($, on) => {
    mock.clock(on)
    world(on, ['desktop'], null)

    expect(await start($)).toEqual({ cwd: '/work' })
    expect(await now($)).toBe('Now: effort not seen yet.')
  })

  test('starts even when reading the flags throws', async ($, on) => {
    mock.clock(on)
    const w = world(on, ['desktop'], { effortLevel: 'high', ultracode: false })
    w.readError = new Error('the flag settings are unreadable')

    expect(await start($)).toEqual({ cwd: '/work' })
    expect(await now($)).toBe('Now: effort not seen yet.')
  })
})

describe('following the picker', () => {
  test('every position, as the desktop writes it', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['desktop'])
    await start($)

    const moves: Array<[Record<string, unknown>, string]> = [
      [{ effortLevel: 'low', ultracode: false }, `Now: effort low · ${MODEL}.`],
      [{ effortLevel: 'medium', ultracode: false }, `Now: effort medium · ${MODEL}.`],
      [{ effortLevel: 'high', ultracode: false }, `Now: effort high · ${MODEL}.`],
      [{ effortLevel: 'xhigh', ultracode: false }, `Now: effort xhigh · ${MODEL}.`],
      // Max: the schema drops the level, so the flags lose it.
      [{ ultracode: false }, `Now: effort max · ${MODEL}.`],
      [{ effortLevel: 'xhigh', ultracode: true }, `Now: ultracode · ${MODEL}.`],
      // From ultracode straight to max.
      [{ ultracode: false }, `Now: effort max · ${MODEL}.`],
      [{ effortLevel: 'low', ultracode: false }, `Now: effort low · ${MODEL}.`],
      // Max with the key gone altogether.
      [{}, `Now: effort max · ${MODEL}.`],
    ]

    for (const [flag, expected] of moves) {
      w.flag = flag
      await clock.advance(POLL)
      expect(await now($), JSON.stringify(flag)).toBe(expected)
    }
  })

  test('a flag change that names no level after max leaves max', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['desktop'], { effortLevel: 'high', ultracode: false })
    await start($)

    w.flag = { ultracode: false }
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort max · ${MODEL}.`)

    w.flag = {}
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort max · ${MODEL}.`)
  })

  test('only the move off a level reads as max, not a later change without one', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['desktop'], { effortLevel: 'high', ultracode: false })
    requests(on)
    await start($)

    w.flag = { ultracode: false }
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort max · ${MODEL}.`)

    // The effort moves without the picker (a request says medium), then the
    // flags change again with still no level in them: that is not max again.
    await step($, { effort: 'medium' })
    expect(await now($)).toBe(`Now: effort medium · ${MODEL}.`)
    w.flag = {}
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort medium · ${MODEL}.`)
  })

  test('the first pick of a session started with no flags can be max', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['desktop'], {})
    await start($)
    expect(await now($)).toBe('Now: effort not seen yet.')

    // Every pick writes the ultracode key; max writes no level beside it.
    w.flag = { ultracode: false }
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort max · ${MODEL}.`)

    // And the picker is followed from there.
    w.flag = { effortLevel: 'low', ultracode: false }
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort low · ${MODEL}.`)
    w.flag = { ultracode: false }
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort max · ${MODEL}.`)
  })

  for (const surface of SURFACES) {
    test(`${surface}: a first pick of max lights rank V`, async ($, on) => {
      const clock = mock.clock(on)
      const w = world(on, [surface], {})
      await start($, surface)
      const ui = await mountBand($, surface, 100)
      await expectBand(ui, surface, 0, 100)

      w.flag = { ultracode: false }
      await clock.advance(POLL)
      await expectBand(ui, surface, 4, 100)
    })
  }

  test('after a refused read at start, the first good read is the starting point, not a pick', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['desktop'], null)
    await start($)

    // The startup flags, unchanged, once they can be read.
    w.flag = { ultracode: false }
    await clock.advance(POLL)
    expect(await now($)).toBe('Now: effort not seen yet.')

    // Moves from there are followed.
    w.flag = { effortLevel: 'high', ultracode: false }
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort high · ${MODEL}.`)
    w.flag = { ultracode: false }
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort max · ${MODEL}.`)
  })

  test('ultracode:false that was there from the start is no pick, whatever else changes', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['desktop'], { ultracode: false })
    await start($)

    w.flag = { ultracode: false, theme: 'dark' }
    await clock.advance(POLL)
    expect(await now($)).toBe('Now: effort not seen yet.')

    // The key going away is no pick either.
    w.flag = { theme: 'dark' }
    await clock.advance(POLL)
    expect(await now($)).toBe('Now: effort not seen yet.')
  })

  test('a refused flag read is no move of the picker', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['desktop'], { effortLevel: 'low', ultracode: false })
    await start($)

    w.flag = { effortLevel: 'high', ultracode: false }
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort high · ${MODEL}.`)

    // The flags cannot be read for a few polls: that says nothing of the picker.
    w.flag = null
    await clock.advance(POLL * 3)
    expect(await now($)).toBe(`Now: effort high · ${MODEL}.`)

    // Readable again, the picker where it was: still high.
    w.flag = { effortLevel: 'high', ultracode: false }
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort high · ${MODEL}.`)

    // Then a real pick of max is followed.
    w.flag = { ultracode: false }
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort max · ${MODEL}.`)
  })

  test('a flag read that throws during a high pick does not swallow the max pick after it', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['desktop'], { effortLevel: 'high', ultracode: false })
    await start($)
    expect(await now($)).toBe(`Now: effort high · ${MODEL}.`)

    w.readError = new Error('the flag settings are unreadable')
    await clock.advance(POLL * 2)
    expect(await now($)).toBe(`Now: effort high · ${MODEL}.`)

    // The picker moved to max while the reads failed; the next read shows it.
    w.readError = undefined
    w.flag = { ultracode: false }
    await clock.advance(POLL)
    expect(await now($)).toBe(`Now: effort max · ${MODEL}.`)
  })

  for (const surface of SURFACES) {
    test(`${surface}: a refused flag read leaves the band where it was`, async ($, on) => {
      const clock = mock.clock(on)
      const w = world(on, [surface], { effortLevel: 'high', ultracode: false })
      await start($, surface)
      const ui = await mountBand($, surface, 100)
      await expectBand(ui, surface, 2, 100)

      w.flag = null
      await clock.advance(POLL)
      await expectBand(ui, surface, 2, 100)

      w.flag = { ultracode: false }
      await clock.advance(POLL)
      await expectBand(ui, surface, 4, 100)
    })
  }

  test('polls every 1.5 s and only acts on a change', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['desktop'], { effortLevel: 'low' })
    await start($)
    expect(w.reads).toBe(1)

    w.flag = { effortLevel: 'high' }
    await clock.advance(POLL - 1)
    expect(await now($)).toBe(`Now: effort low · ${MODEL}.`)
    await clock.advance(1)
    expect(await now($)).toBe(`Now: effort high · ${MODEL}.`)
    expect(w.reads).toBe(2)

    await clock.advance(POLL * 4)
    expect(w.reads).toBe(6)
    expect(await now($)).toBe(`Now: effort high · ${MODEL}.`)
  })

  for (const surface of SURFACES) {
    test(`${surface}: the band follows the picker, unless pinned`, async ($, on) => {
      const clock = mock.clock(on)
      const w = world(on, [surface], { effortLevel: 'medium' })
      await start($, surface)
      const ui = await mountBand($, surface, 100)
      await expectBand(ui, surface, 1, 100)

      w.flag = { effortLevel: 'xhigh', ultracode: true }
      await clock.advance(POLL)
      await expectBand(ui, surface, 5, 100)

      await spell($, '2')
      w.flag = { ultracode: false }
      await clock.advance(POLL)
      await expectBand(ui, surface, 1, 100)

      await spell($, 'auto')
      await expectBand(ui, surface, 4, 100)
    })
  }
})

describe('turn.step', () => {
  test('records the effort of a main-loop request', async ($, on) => {
    world(on, ['desktop'])
    requests(on)

    await step($, { effort: 'max' })
    expect(await now($)).toBe(`Now: effort max · ${MODEL}.`)

    await step($, { effort: 'low', model: 'claude-haiku-5' })
    expect(await now($)).toBe('Now: effort low · claude-haiku-5.')
  })

  test('a request with no effort is a model that takes none', async ($, on) => {
    world(on, ['desktop'])
    requests(on)

    await step($, { model: 'claude-haiku-4' })
    expect(await now($)).toBe('Now: no effort setting · claude-haiku-4.')
    expect((await spell($)).split('\n')[1]).toStartWith('›')
  })

  test('a request with no effort shows none, whatever the picker says', async ($, on) => {
    const w = world(on, ['desktop'], { effortLevel: 'high', ultracode: false })
    requests(on)

    await step($, { model: 'claude-haiku-4' })
    expect(await now($)).toBe('Now: no effort setting · claude-haiku-4.')
    expect((await spell($)).split('\n')[1]).toStartWith('› I ')

    // Not even ultracode: a model that takes no effort setting gets none.
    w.flag = { effortLevel: 'xhigh', ultracode: true }
    await step($, { model: 'claude-haiku-4' })
    expect(await now($)).toBe('Now: no effort setting · claude-haiku-4.')
  })

  test("the request's level wins over the picker's", async ($, on) => {
    world(on, ['desktop'], { effortLevel: 'high', ultracode: false })
    requests(on)

    // The engine sent less than the picker asks (a model that tops out lower).
    await step($, { effort: 'low' })
    expect(await now($)).toBe(`Now: effort low · ${MODEL}.`)

    await step($, { effort: 'xhigh' })
    expect(await now($)).toBe(`Now: effort xhigh · ${MODEL}.`)
  })

  test('ultracode only for a request at xhigh or max', async ($, on) => {
    world(on, ['desktop'], { effortLevel: 'xhigh', ultracode: true })
    requests(on)

    const shown: Array<[TurnStepInput['effort'], string]> = [
      ['xhigh', `Now: ultracode · ${MODEL}.`],
      ['high', `Now: effort high · ${MODEL}.`],
      ['max', `Now: ultracode · ${MODEL}.`],
      ['medium', `Now: effort medium · ${MODEL}.`],
      ['low', `Now: effort low · ${MODEL}.`],
      [undefined, `Now: no effort setting · ${MODEL}.`],
      [40000, `Now: effort 40000 · ${MODEL}.`],
    ]

    for (const [effort, expected] of shown) {
      await step($, effort === undefined ? {} : { effort })
      expect(await now($), String(effort)).toBe(expected)
    }
  })

  test('a refused flag read leaves the request its own level', async ($, on) => {
    world(on, ['desktop'], null)
    requests(on)

    await step($, { effort: 'xhigh' })
    expect(await now($)).toBe(`Now: effort xhigh · ${MODEL}.`)
  })

  for (const surface of SURFACES) {
    test(`${surface}: the band shows rank I for a model that takes no effort`, async ($, on) => {
      world(on, [surface], { effortLevel: 'high', ultracode: false })
      requests(on)
      const ui = await mountBand($, surface, 100)

      await step($, { effort: 'high' })
      await expectBand(ui, surface, 2, 100)

      await step($, { model: 'claude-haiku-4' })
      await expectBand(ui, surface, 0, 100)

      if (surface === 'terminal') {
        expect(await ui.find({ type: 'Text', text: 'no effort setting · claude-haiku-4' })).toBeDefined()
      } else {
        expect((await ui.find({ type: 'Svg' }))?.props['alt']).toBe(
          'Clawd casts Avada Kedavra I (no effort setting · claude-haiku-4)',
        )
      }
    })
  }

  test('a refused flag read keeps the ultracode already shown', async ($, on) => {
    const w = world(on, ['desktop'], { effortLevel: 'xhigh', ultracode: true })
    requests(on)

    await step($, { effort: 'xhigh' })
    expect(await now($)).toBe(`Now: ultracode · ${MODEL}.`)

    w.flag = null
    await step($, { effort: 'xhigh' })
    expect(await now($)).toBe(`Now: ultracode · ${MODEL}.`)

    // A request at a lower level still says so.
    await step($, { effort: 'high' })
    expect(await now($)).toBe(`Now: effort high · ${MODEL}.`)
  })

  test('a numeric budget lights the rank it rounds to', async ($, on) => {
    world(on, ['desktop'])
    requests(on)

    await step($, { effort: 20000 })
    expect(await now($)).toBe(`Now: effort 20000 · ${MODEL}.`)
    expect((await spell($)).split('\n')[3]).toStartWith('› III')
  })

  test('the picker wins: ultracode goes out as xhigh', async ($, on) => {
    const w = world(on, ['desktop'], { effortLevel: 'xhigh', ultracode: true })
    requests(on)

    await step($, { effort: 'xhigh' })
    expect(await now($)).toBe(`Now: ultracode · ${MODEL}.`)

    // At max the flags hold no level, so the request settles it.
    w.flag = { ultracode: false }
    await step($, { effort: 'max' })
    expect(await now($)).toBe(`Now: effort max · ${MODEL}.`)
  })

  test("a subagent's requests are not the main loop's", async ($, on) => {
    world(on, ['desktop'])
    requests(on)

    await step($, { effort: 'high' })
    await step($, { effort: 'low', agentId: 'agent-1', model: 'claude-haiku-5' })
    expect(await now($)).toBe(`Now: effort high · ${MODEL}.`)
  })

  for (const surface of SURFACES) {
    test(`${surface}: the band shows the request's effort`, async ($, on) => {
      world(on, [surface])
      requests(on)
      const ui = await mountBand($, surface, 100)

      for (const [effort, tier] of [['low', 0], ['medium', 1], ['high', 2], ['xhigh', 3], ['max', 4]] as const) {
        await step($, { effort })
        await expectBand(ui, surface, tier, 100)
      }

      expect(await rankShown(ui, surface)).toBe('V')
    })
  }
})

describe('terminal frame clock', () => {
  test('repaints a mounted band at 12 fps', async ($, on) => {
    const clock = mock.clock(on)
    const seen = world(on, ['terminal']).blits
    await start($, 'terminal')
    const ui = await mountBand($, 'terminal', 100, 'band')
    await spell($, '6')
    await ui.drawn()

    await clock.advance(FRAME * 3)
    expect(seen).toHaveLength(3)

    for (const blit of seen) {
      expect(blit.requestId).toBe('band')
      expect(blit.key).toBe('spell')
      expect(cellWords(blit.cells ?? '')).toHaveLength(bandColumns(100) * RASTER_ROWS * 3)
    }

    // Frames move.
    expect(new Set(seen.map(blit => blit.cells)).size).toBeGreaterThan(1)
  })

  test('repaints every rank of a mounted spellbook', async ($, on) => {
    const clock = mock.clock(on)
    const seen = world(on, ['terminal']).blits
    await start($, 'terminal')
    await $.ui.mount({
      plugin: 'spell-bar',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'spellbook',
      props: { title: 'Spellbook', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 48 }, view: {} },
    })

    await clock.advance(FRAME)
    expect(seen.map(blit => `${blit.requestId}/${blit.key}`).sort()).toEqual([
      'spellbook/tier-0',
      'spellbook/tier-1',
      'spellbook/tier-2',
      'spellbook/tier-3',
      'spellbook/tier-4',
      'spellbook/tier-5',
    ])
  })

  test('stops repainting a band the plugin passed on', async ($, on) => {
    const clock = mock.clock(on)
    const seen = world(on, ['terminal']).blits
    engineBand(on)
    await start($, 'terminal')
    const ui = await mountBand($, 'terminal', 100, 'band')

    await clock.advance(FRAME)
    expect(seen).toHaveLength(1)

    await spell($, 'off')
    await ui.drawn()
    seen.length = 0
    await clock.advance(FRAME * 3)
    expect(seen).toHaveLength(0)
  })

  test('stops repainting a Raster the engine no longer holds', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['terminal'])
    w.blitDeny = 'nothing of spell-bar is mounted there'
    const seen = w.blits
    await start($, 'terminal')
    await mountBand($, 'terminal', 100, 'band')

    // Two seconds of nothing but refusals: the one past them is the last.
    await clock.advance(FRAME * (MISSES + 12))
    expect(seen).toHaveLength(MISSES + 1)

    await clock.advance(FRAME * 12)
    expect(seen).toHaveLength(MISSES + 1)
  })

  test('a few refused blits do not stop the clock', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['terminal'])
    const seen = w.blits
    await start($, 'terminal')
    await mountBand($, 'terminal', 100, 'band')
    await spell($, '6')

    // The engine has not committed the Raster yet (a first draw, a resize).
    w.blitDeny = 'nothing of spell-bar is mounted there'
    await clock.advance(FRAME * 3)
    expect(seen).toHaveLength(3)

    w.blitDeny = undefined
    await clock.advance(FRAME * 4)
    expect(seen).toHaveLength(7)

    const after = seen.slice(3)
    for (const blit of after) {
      expect(`${blit.requestId}/${blit.key}`).toBe('band/spell')
      expect(cellWords(blit.cells ?? '')).toHaveLength(bandColumns(100) * RASTER_ROWS * 3)
    }

    // Frames still move.
    expect(new Set(after.map(blit => blit.cells)).size).toBeGreaterThan(1)
  })

  test('only refusals in a row count: a blit taken starts the count again', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['terminal'])
    const seen = w.blits
    await start($, 'terminal')
    await mountBand($, 'terminal', 100, 'band')

    for (let round = 0; round < 3; round++) {
      w.blitDeny = 'not committed yet'
      await clock.advance(FRAME * MISSES)
      w.blitDeny = undefined
      await clock.advance(FRAME)
    }

    expect(seen).toHaveLength((MISSES + 1) * 3)

    await clock.advance(FRAME * 2)
    expect(seen).toHaveLength((MISSES + 1) * 3 + 2)

    // Then more than two seconds of refusals do stop it.
    seen.length = 0
    w.blitDeny = 'nothing of spell-bar is mounted there'
    await clock.advance(FRAME * (MISSES + 6))
    expect(seen).toHaveLength(MISSES + 1)
  })

  test('a spellbook opened while its Rasters are not yet committed still animates', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['terminal'])
    const seen = w.blits
    await start($, 'terminal')

    w.blitDeny = 'nothing of spell-bar is mounted there'
    await mountBook($, 'terminal', 80)
    await clock.advance(FRAME * 2)
    expect(seen).toHaveLength(12)

    w.blitDeny = undefined
    seen.length = 0
    await clock.advance(FRAME * 2)
    expect(seen).toHaveLength(12)
    expect(new Set(seen.map(blit => `${blit.requestId}/${blit.key}`)).size).toBe(6)
  })

  test('a late refusal for a Raster drawn over is not held against the new one', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['terminal'])
    const seen = w.blits
    await start($, 'terminal')
    const ui = await mountBand($, 'terminal', 100, 'band')

    // One refusal short of dropping the band's Raster...
    w.blitDeny = 'not committed yet'
    await clock.advance(FRAME * MISSES)
    expect(seen).toHaveLength(MISSES)

    // ...and the next blit's answer comes late, after a redraw at a new width
    // has put a new Raster there.
    w.holdBlits = true
    await clock.advance(FRAME)
    expect(w.held).toHaveLength(1)
    await ui.redraw(band(80))
    w.holdBlits = false
    w.blitDeny = undefined
    w.held[0]!('another size')
    await clock.settle()

    // The new Raster is repainted, at its own size.
    seen.length = 0
    await clock.advance(FRAME * 3)
    expect(seen).toHaveLength(3)
    for (const blit of seen) {
      expect(cellWords(blit.cells ?? '')).toHaveLength(bandColumns(80) * RASTER_ROWS * 3)
    }
  })

  test('a redraw starts the count again', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on, ['terminal'])
    const seen = w.blits
    await start($, 'terminal')
    const ui = await mountBand($, 'terminal', 100, 'band')

    w.blitDeny = 'not committed yet'
    await clock.advance(FRAME * (MISSES - 4))
    await ui.redraw(band(80))
    await clock.advance(FRAME * (MISSES - 4))
    expect(seen).toHaveLength((MISSES - 4) * 2)

    w.blitDeny = undefined
    seen.length = 0
    await clock.advance(FRAME * 2)
    expect(seen).toHaveLength(2)
  })

  for (const [surfaces, timers] of [
    [['terminal'], [POLL, FRAME]],
    [['terminal', 'desktop'], [POLL, FRAME]],
    [['desktop'], [POLL]],
    [[], [POLL]],
  ] as const) {
    test(`a session on [${surfaces.join(', ')}] starts timers of ${timers.join(' and ')} ms`, async ($, on) => {
      const started: number[] = []
      // A clock that takes each timer and never fires it.
      on('clock.every', (_$, e) => {
        started.push(e.ms)

        return new Promise<never>(() => {})
      })
      world(on, surfaces)
      await start($)

      expect(started).toEqual([...timers])
    })
  }

  test('a session with no terminal runs no frame clock', async ($, on) => {
    const clock = mock.clock(on)
    const seen = world(on, ['desktop']).blits
    await start($)
    await mountBand($, 'desktop', 100, 'band')

    await clock.advance(FRAME * 6)
    expect(seen).toHaveLength(0)
  })
})
