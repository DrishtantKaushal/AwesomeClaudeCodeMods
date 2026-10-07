// /spell and /spellbook as a person types them, and what each does to the band
// on both surfaces.
import { describe, expect, test } from 'claude-code/testing'

import {
  band,
  engineBand,
  expectBand,
  expectPassedOn,
  mountBand,
  RANKS,
  rankShown,
  spell,
  spellbook,
  SURFACES,
} from './helpers.ts'

const HELP = '/spell <1-6|I-VI|low…ultracode> pins a rank · /spell auto follows effort · /spell off hides · /spellbook shows all six'

// The rank rows of /spell's listing, the marked one first in each tuple.
function listing(text: string): { rows: string[]; marked: string[] } {
  const rows = text.split('\n').filter(line => /^[› ] (I|II|III|IV|V|VI)\s+Avada Kedavra /.test(line))

  return { rows, marked: rows.filter(row => row.startsWith('›')).map(row => row.slice(2).split(' ')[0]!) }
}

describe('/spell with no arguments', () => {
  test('lists the six ranks, the one in play marked', async $ => {
    const text = await spell($)
    const lines = text.split('\n')

    expect(lines[0]).toBe("Avada Kedavra ranks, by the main loop's effort:")
    expect(lines.slice(1, 7)).toEqual([
      '› I   Avada Kedavra effort low',
      '  II  Avada Kedavra effort medium',
      '  III Avada Kedavra effort high',
      '  IV  Avada Kedavra effort xhigh',
      '  V   Avada Kedavra effort max',
      '  VI  Avada Kedavra ultracode',
    ])
    expect(lines[7]).toBe('Now: effort not seen yet.')
    expect(lines[8]).toBe(HELP)
    expect(lines).toHaveLength(9)
  })

  test('whitespace alone is no argument', async $ => {
    expect(listing(await spell($, '   ')).rows).toHaveLength(6)
  })

  test('says when a rank is pinned', async $ => {
    await spell($, '4')
    const text = await spell($)

    expect(listing(text)).toEqual({ rows: expect.any(Array), marked: ['IV'] })
    expect(listing(text).rows).toHaveLength(6)
    expect(text).toContain('\nPinned to rank IV.\n')
  })
})

describe('/spell pins a rank', () => {
  for (const args of ['6', 'vi', 'VI', 'ultracode', 'Ultracode', '  6  ']) {
    test(`/spell ${JSON.stringify(args)} pins rank VI`, async $ => {
      expect(await spell($, args)).toBe('Pinned rank VI; /spell auto follows the effort again.')
      expect(listing(await spell($)).marked).toEqual(['VI'])
    })
  }

  const OTHERS: Array<[string, number]> = [
    ['1', 0],
    ['i', 0],
    ['low', 0],
    ['2', 1],
    ['ii', 1],
    ['medium', 1],
    ['3', 2],
    ['III', 2],
    ['high', 2],
    ['4', 3],
    ['iv', 3],
    ['xhigh', 3],
    ['5', 4],
    ['V', 4],
    ['max', 4],
  ]

  test('every other rank by number, numeral or level', async $ => {
    for (const [args, tier] of OTHERS) {
      expect(await spell($, args), args).toBe(`Pinned rank ${RANKS[tier]}; /spell auto follows the effort again.`)
      expect(listing(await spell($)).marked, args).toEqual([RANKS[tier]])
    }
  })

  for (const surface of SURFACES) {
    test(`${surface}: the band shows the pinned rank`, async $ => {
      const ui = await mountBand($, surface, 100)

      for (const args of ['6', 'vi', 'ultracode']) {
        await spell($, 'auto')
        expect(await rankShown(ui, surface)).toBe('I')
        await spell($, args)
        await expectBand(ui, surface, 5, 100)
      }
    })
  }
})

describe('/spell auto', () => {
  test('unpins', async $ => {
    await spell($, '6')
    expect(await spell($, 'auto')).toBe('Spell bar follows the effort again.')

    const text = await spell($)
    expect(listing(text).marked).toEqual(['I'])
    expect(text).toContain('\nNow: effort not seen yet.\n')
    expect(text).not.toContain('Pinned')
  })

  test('unpins in any case, and is harmless when nothing is pinned', async $ => {
    expect(await spell($, 'AUTO')).toBe('Spell bar follows the effort again.')
    await spell($, '2')
    await spell($, ' Auto ')
    expect(listing(await spell($)).marked).toEqual(['I'])
  })

  for (const surface of SURFACES) {
    test(`${surface}: the band goes back to the effort, and shows again if hidden`, async ($, on) => {
      engineBand(on)
      const ui = await mountBand($, surface, 100)

      await spell($, '5')
      await expectBand(ui, surface, 4, 100)
      await spell($, 'off')
      await expectPassedOn(ui)
      await spell($, 'auto')
      await expectBand(ui, surface, 0, 100)
    })
  }
})

describe('/spell off and on', () => {
  test('answer what they did', async $ => {
    expect(await spell($, 'off')).toBe('Spell bar hidden; /spell on brings it back.')
    expect(await spell($, 'on')).toBe('Spell bar shown.')
    expect(await spell($, 'hide')).toBe('Spell bar hidden; /spell on brings it back.')
    expect(await spell($, 'show')).toBe('Spell bar shown.')
    expect(await spell($, 'OFF')).toBe('Spell bar hidden; /spell on brings it back.')
    expect(await spell($, 'On')).toBe('Spell bar shown.')
  })

  for (const surface of SURFACES) {
    test(`${surface}: off passes the band on, on draws it again`, async ($, on) => {
      engineBand(on)
      const ui = await mountBand($, surface, 100)
      await spell($, '3')
      await expectBand(ui, surface, 2, 100)

      await spell($, 'off')
      await expectPassedOn(ui)
      // Still hidden at another width.
      await ui.redraw(band(40))
      await expectPassedOn(ui)

      await spell($, 'on')
      // The pin survives hiding.
      await expectBand(ui, surface, 2, 40)
    })

    test(`${surface}: a band mounted while hidden passes on until shown`, async ($, on) => {
      engineBand(on)
      await spell($, 'hide')
      const ui = await mountBand($, surface, 100)
      await expectPassedOn(ui)

      await spell($, 'show')
      await expectBand(ui, surface, 0, 100)
    })

    test(`${surface}: pinning a rank shows a hidden band`, async ($, on) => {
      engineBand(on)
      const ui = await mountBand($, surface, 100)
      await spell($, 'off')
      await expectPassedOn(ui)

      await spell($, 'ii')
      await expectBand(ui, surface, 1, 100)
    })
  }
})

describe('/spell junk', () => {
  for (const args of ['junk', '0', '7', 'vii', '-1', '1.5', 'avada kedavra']) {
    test(`/spell ${args} answers with a hint`, async $ => {
      expect(await spell($, args)).toBe(
        `No rank "${args}". Try 1-6, I-VI, an effort level, auto, on or off.`,
      )
    })
  }

  test('names the argument as read, trimmed and lowercased', async $ => {
    expect(await spell($, '  JUNK ')).toBe('No rank "junk". Try 1-6, I-VI, an effort level, auto, on or off.')
  })

  for (const surface of SURFACES) {
    test(`${surface}: changes nothing`, async ($, on) => {
      engineBand(on)
      const ui = await mountBand($, surface, 100)
      await spell($, '4')
      await spell($, 'junk')
      await expectBand(ui, surface, 3, 100)
      expect(listing(await spell($)).marked).toEqual(['IV'])

      await spell($, 'off')
      await spell($, 'nope')
      await expectPassedOn(ui)
    })
  }
})

describe('/spellbook', () => {
  test('opens the spellbook pane', async ($, on) => {
    const opened: Array<{ id: string; title: string | undefined }> = []
    on('ui.open', (_$, e) => {
      opened.push({ id: e.id, title: e.title })

      return { value: { isPlaced: true } }
    })

    expect(await spellbook($)).toBe('Spellbook open.')
    expect(opened).toEqual([{ id: 'spellbook', title: 'Spellbook' }])
  })

  test('says why the pane waits', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: false, reason: 'the terminal is 90 columns wide; panes open from 110' } }))

    expect(await spellbook($)).toBe(
      'The spellbook waits for room: the terminal is 90 columns wide; panes open from 110',
    )
  })
})
