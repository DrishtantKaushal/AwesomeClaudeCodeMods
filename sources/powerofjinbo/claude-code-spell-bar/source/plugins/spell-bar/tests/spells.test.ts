// Pure logic: the six ranks, how an effort or a typed rank picks one, how the
// desktop's picker reads out of the flag settings, and the two drawings.
import { describe, expect, test } from 'claude-code/testing'

import { frame, RASTER_ROWS } from '../hooks/pixels.ts'
import { fitWidth, scene, SCENE_HEIGHT, sceneBox } from '../hooks/scene.ts'
import { levelOf, pickerEffort, seeded, spellAt, SPELLS, tierNamed, tierOf } from '../hooks/spells.ts'
import { cellWords, RANKS, SVG_CAP } from './helpers.ts'

const LEVELS = ['low', 'medium', 'high', 'xhigh'] as const
const PICKER = ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode'] as const

describe('SPELLS', () => {
  test('six ranks, one per picker position, weakest first', () => {
    expect(SPELLS.map(spell => spell.effort)).toEqual([...PICKER])
    expect(SPELLS.map(spell => spell.rank)).toEqual([...RANKS])
    expect(SPELLS.map(spell => spell.name)).toEqual(Array(6).fill('Avada Kedavra'))

    for (const spell of SPELLS) {
      expect(spell.hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(spell.seconds).toBeGreaterThan(0)
    }
  })

  test('spellAt falls back to rank I off the ends', () => {
    expect(spellAt(5).rank).toBe('VI')
    expect(spellAt(-1).rank).toBe('I')
    expect(spellAt(6).rank).toBe('I')
    expect(spellAt(Number.NaN).rank).toBe('I')
  })

  test('levelOf names the effort, ultracode alone', () => {
    expect(SPELLS.map(levelOf)).toEqual([
      'effort low',
      'effort medium',
      'effort high',
      'effort xhigh',
      'effort max',
      'ultracode',
    ])
  })

  test('seeded is deterministic and in [0, 1)', () => {
    const a = seeded(42)
    const b = seeded(42)
    const c = seeded(43)
    const first = Array.from({ length: 64 }, a)

    expect(Array.from({ length: 64 }, b)).toEqual(first)
    expect(Array.from({ length: 64 }, c)).not.toEqual(first)

    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('pickerEffort', () => {
  test('low..xhigh are read as picked (sent with ultracode:false)', () => {
    for (const level of LEVELS) {
      expect(pickerEffort({ effortLevel: level, ultracode: false }, false)).toBe(level)
      expect(pickerEffort({ effortLevel: level, ultracode: false }, true)).toBe(level)
      expect(pickerEffort({ effortLevel: level }, false)).toBe(level)
    }
  })

  test('max, which the schema drops, reads as max right after a level', () => {
    // A max pick goes out as {effortLevel: "max", ultracode: false}; the
    // schema keeps no "max", so the flags hold what is left.
    expect(pickerEffort({ ultracode: false }, true)).toBe('max')
    expect(pickerEffort({}, true)).toBe('max')
    // A stray "max" the schema would have dropped reads the same way.
    expect(pickerEffort({ effortLevel: 'max', ultracode: false }, true)).toBe('max')
  })

  test('max is never inferred at start, when no level was set before', () => {
    expect(pickerEffort({}, false)).toBeUndefined()
    expect(pickerEffort({ ultracode: false }, false)).toBeUndefined()
    expect(pickerEffort({ effortLevel: 'max' }, false)).toBeUndefined()
    expect(pickerEffort({ model: 'claude-opus-5-5' }, false)).toBeUndefined()
  })

  test('ultracode is sent as {effortLevel: "xhigh", ultracode: true}', () => {
    expect(pickerEffort({ effortLevel: 'xhigh', ultracode: true }, false)).toBe('ultracode')
    expect(pickerEffort({ effortLevel: 'xhigh', ultracode: true }, true)).toBe('ultracode')
    expect(pickerEffort({ ultracode: true }, false)).toBe('ultracode')
  })

  test('a stale ultracode beside another level reads that level', () => {
    expect(pickerEffort({ effortLevel: 'high', ultracode: true }, false)).toBe('high')
    expect(pickerEffort({ effortLevel: 'low', ultracode: true }, true)).toBe('low')
  })

  test('only a boolean true is ultracode, only a named string a level', () => {
    expect(pickerEffort({ effortLevel: 'xhigh', ultracode: 'true' }, false)).toBe('xhigh')
    expect(pickerEffort({ effortLevel: 3 }, false)).toBeUndefined()
    expect(pickerEffort({ effortLevel: 'HIGH' }, false)).toBeUndefined()
    expect(pickerEffort({ effortLevel: 'turbo' }, true)).toBe('max')
  })

  test('every picker position round-trips through the rank it lights', () => {
    const sent: Record<(typeof PICKER)[number], Record<string, unknown>> = {
      low: { effortLevel: 'low', ultracode: false },
      medium: { effortLevel: 'medium', ultracode: false },
      high: { effortLevel: 'high', ultracode: false },
      xhigh: { effortLevel: 'xhigh', ultracode: false },
      max: { ultracode: false },
      ultracode: { effortLevel: 'xhigh', ultracode: true },
    }

    PICKER.forEach((position, tier) => {
      const read = pickerEffort(sent[position], true)
      expect(read).toBe(position)
      expect(tierOf(read ?? null)).toBe(tier)
    })
  })
})

describe('tierOf', () => {
  test('null, a model with no effort setting, is rank I', () => {
    expect(tierOf(null)).toBe(0)
  })

  test('each level and ultracode lights its own rank', () => {
    PICKER.forEach((effort, tier) => expect(tierOf(effort)).toBe(tier))
  })

  test('a numeric thinking budget maps to I..V, never ultracode', () => {
    expect(tierOf('0')).toBe(0)
    expect(tierOf('1024')).toBe(0)
    expect(tierOf('7999')).toBe(0)
    expect(tierOf('8000')).toBe(1)
    expect(tierOf('15999')).toBe(1)
    expect(tierOf('16000')).toBe(2)
    expect(tierOf('20000')).toBe(2)
    expect(tierOf('32000')).toBe(3)
    expect(tierOf('63999')).toBe(3)
    expect(tierOf('64000')).toBe(4)
    expect(tierOf('1000000')).toBe(4)
  })

  test('anything else is rank I', () => {
    expect(tierOf('turbo')).toBe(0)
    expect(tierOf('Infinity')).toBe(0)
    expect(tierOf('NaN')).toBe(0)
  })
})

describe('tierNamed', () => {
  test('1-6', () => {
    for (let n = 1; n <= 6; n++) {
      expect(tierNamed(String(n))).toBe(n - 1)
    }
  })

  test('I-VI in either case, padded or not', () => {
    RANKS.forEach((rank, tier) => {
      expect(tierNamed(rank)).toBe(tier)
      expect(tierNamed(rank.toLowerCase())).toBe(tier)
      expect(tierNamed(`  ${rank} `)).toBe(tier)
    })
  })

  test('the level names, ultracode included', () => {
    PICKER.forEach((effort, tier) => {
      expect(tierNamed(effort)).toBe(tier)
      expect(tierNamed(effort.toUpperCase())).toBe(tier)
    })
  })

  test('junk is no rank', () => {
    for (const junk of ['', ' ', '0', '7', '-1', '1.5', '6.5', 'vii', 'iiii', 'auto', 'on', 'off', 'junk', 'avada']) {
      expect(tierNamed(junk), JSON.stringify(junk)).toBeNull()
    }
  })
})

describe('scene', () => {
  test('fitWidth keeps the banner between 420 and 2400 CSS pixels', () => {
    expect(fitWidth(0)).toBe(420)
    expect(fitWidth(419.6)).toBe(420)
    expect(fitWidth(780)).toBe(780)
    expect(fitWidth(780.4)).toBe(780)
    expect(fitWidth(2400)).toBe(2400)
    expect(fitWidth(99999)).toBe(2400)
  })

  test('every rank at every width says its size and stays under the Svg cap', () => {
    let largest = 0

    for (const width of [0, 420, 780, 1200, 1800, 2400, 99999]) {
      for (let tier = 0; tier < 6; tier++) {
        const source = scene(tier, { width, detail: 'effort ultracode · claude-opus-5-5' })
        const W = fitWidth(width)
        const box = sceneBox(width)

        // Drawn in its box, laid out in a viewBox of the full scene.
        expect(source).toStartWith(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="0 0 ${W} ${SCENE_HEIGHT}">`,
        )
        expect(source).toEndWith('</svg>')
        expect(source).toContain(`>Avada Kedavra ${RANKS[tier]}</text>`)
        expect(source.length, `rank ${RANKS[tier]} at ${W}px`).toBeLessThan(SVG_CAP)
        largest = Math.max(largest, source.length)
      }
    }

    // The biggest banner (rank VI, widest) is the one closest to the cap.
    expect(scene(5, { width: 2400, detail: 'x' }).length).toBeGreaterThan(scene(0, { width: 2400, detail: 'x' }).length)
    expect(largest).toBeLessThan(SVG_CAP)
  })

  test('sceneBox is the scene at full size from 420 px, scaled down below, aspect kept', () => {
    expect(sceneBox(420)).toEqual({ width: 420, height: SCENE_HEIGHT })
    expect(sceneBox(780)).toEqual({ width: 780, height: SCENE_HEIGHT })
    expect(sceneBox(780.4)).toEqual({ width: 780, height: SCENE_HEIGHT })
    expect(sceneBox(2400)).toEqual({ width: 2400, height: SCENE_HEIGHT })
    expect(sceneBox(99999)).toEqual({ width: 2400, height: SCENE_HEIGHT })
    // Under the floor: the room's width, the height scaled with it.
    expect(sceneBox(210)).toEqual({ width: 210, height: 64 })
    expect(sceneBox(156)).toEqual({ width: 156, height: 48 })
    expect(sceneBox(78)).toEqual({ width: 78, height: 24 })
    // Never a zero-sized box.
    expect(sceneBox(0)).toEqual({ width: 1, height: 1 })
    expect(sceneBox(1)).toEqual({ width: 1, height: 1 })

    for (let pixels = 0.5; pixels < 3000; pixels += 1.3) {
      const box = sceneBox(pixels)
      const W = fitWidth(pixels)

      expect(box.width, `${pixels}px`).toBeLessThanOrEqual(Math.max(1, Math.round(pixels)))
      expect(box.width, `${pixels}px`).toBeLessThanOrEqual(W)
      expect(box.height, `${pixels}px`).toBeLessThanOrEqual(SCENE_HEIGHT)
      expect(box.height, `${pixels}px`).toBe(pixels >= 420 ? SCENE_HEIGHT : Math.max(1, Math.round((SCENE_HEIGHT * pixels) / 420)))
      expect(Math.abs(box.height - (box.width * SCENE_HEIGHT) / W), `${pixels}px`).toBeLessThanOrEqual(1)
    }
  })

  test('the same rank and width draw the same banner', () => {
    expect(scene(3, { width: 900, detail: 'd' })).toBe(scene(3, { width: 900, detail: 'd' }))
  })

  test('the caption is escaped into the markup', () => {
    const source = scene(2, { width: 780, detail: 'effort high · <model> & "quoted"' })

    expect(source).toContain('effort high · &lt;model&gt; &amp; &quot;quoted&quot;')
    expect(source).not.toContain('<model>')
  })
})

describe('frame', () => {
  test('packs columns x rows cells of valid glyphs and colors', () => {
    for (const columns of [16, 34, 56, 60]) {
      for (let tier = 0; tier < 6; tier++) {
        const cells = frame(tier, columns, RASTER_ROWS, 1.25)
        // 12 bytes a cell, a multiple of 3, so base64 with no padding.
        expect(cells).toHaveLength(columns * RASTER_ROWS * 16)
        expect(cells).toMatch(/^[A-Za-z0-9+/]+$/)

        const words = cellWords(cells)
        expect(words).toHaveLength(columns * RASTER_ROWS * 3)

        for (let i = 0; i < words.length; i += 3) {
          const glyph = String.fromCodePoint(words[i]!)
          expect(glyph === '▀' || ' ▐▛███▜▌▝▜█████▛▘▘▝'.includes(glyph), `glyph ${glyph}`).toBe(true)
          expect(words[i + 1]!).toBeLessThanOrEqual(0xffffff)
          expect(words[i + 2]!).toBeLessThanOrEqual(0xffffff)
        }
      }
    }
  })

  test('is a pure function of its arguments, and it moves over a cast', () => {
    expect(frame(4, 56, RASTER_ROWS, 0.9)).toBe(frame(4, 56, RASTER_ROWS, 0.9))

    const seen = new Set<string>()
    for (let t = 0; t < 4; t += 0.25) {
      seen.add(frame(4, 56, RASTER_ROWS, t))
    }

    expect(seen.size).toBeGreaterThan(4)
  })
})
