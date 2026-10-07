// The band above the prompt and the spellbook pane, drawn through the engine on
// the terminal (a Raster beside Text) and the desktop (an Svg that says its
// size), for every rank, at narrow, ordinary and the widest widths.
import { describe, expect, test } from 'claude-code/testing'

import { RASTER_ROWS } from '../hooks/pixels.ts'
import { SCENE_HEIGHT, sceneBox } from '../hooks/scene.ts'
import {
  bandColumns,
  book,
  bookColumns,
  engineBand,
  ENGINE_BAND,
  expectBand,
  expectRaster,
  expectSvg,
  mountBand,
  mountBook,
  PIXELS_PER_COLUMN,
  PLUGIN,
  RANKS,
  spell,
  SURFACES,
  SVG_CAP,
  band,
} from './helpers.ts'

// Narrow (the Raster stacks above the caption on the terminal, the banner at
// its narrowest on the desktop), ordinary, the 72-column switch, and wider than
// any banner (the biggest SVG the plugin makes).
const WIDTHS = [10, 20, 71, 72, 100, 1000] as const
const WIDEST = 1000
// Bands and panes too narrow for the scene's 420 px floor (under 54 columns),
// each a whole number of pixels at 7.8 a column but the last.
const NARROW = [10, 20, 40, 53] as const

for (const surface of SURFACES) {
  describe(`${surface}: band`, () => {
    test('draws rank I before any effort is seen', async $ => {
      const ui = await mountBand($, surface, 100)

      await expectBand(ui, surface, 0, 100)

      if (surface === 'terminal') {
        expect(await ui.find({ type: 'Text', text: 'effort not seen yet' })).toBeDefined()
      } else {
        expect((await ui.find({ type: 'Svg' }))?.props['alt']).toBe('Clawd casts Avada Kedavra I (effort not seen yet)')
      }
    })

    test('follows each rank pinned with /spell', async $ => {
      const ui = await mountBand($, surface, 100)

      for (let tier = 0; tier < 6; tier++) {
        expect(await spell($, String(tier + 1))).toBe(`Pinned rank ${RANKS[tier]}; /spell auto follows the effort again.`)
        await expectBand(ui, surface, tier, 100)
      }

      if (surface === 'terminal') {
        expect(await ui.find({ type: 'Text', text: 'pinned · /spell auto follows effort' })).toBeDefined()
      } else {
        expect((await ui.find({ type: 'Svg' }))?.props['alt']).toBe(
          'Clawd casts Avada Kedavra VI (pinned · /spell auto follows effort)',
        )
      }
    })

    for (const width of WIDTHS) {
      test(`every rank fits a ${width}-column band`, async $ => {
        const ui = await mountBand($, surface, width)

        for (let tier = 5; tier >= 0; tier--) {
          await spell($, RANKS[tier]!)
          await expectBand(ui, surface, tier, width)
        }
      })
    }

    test('the widest band draws the biggest banner under the cap', async $ => {
      const ui = await mountBand($, surface, WIDEST)
      await spell($, 'ultracode')
      await expectBand(ui, surface, 5, WIDEST)

      if (surface === 'terminal') {
        expectRaster(await ui.find({ type: 'Raster' }), 56, RASTER_ROWS)

        return
      }

      const { source, width, height } = expectSvg(await ui.find({ type: 'Svg' }), WIDEST)
      expect(width).toBe(2400)
      expect(height).toBe(SCENE_HEIGHT)
      expect(source.length).toBeGreaterThan(SVG_CAP / 2)
      expect(source.length).toBeLessThan(SVG_CAP)
    })

    test('the banner grows with the band and stops at its bounds', async $ => {
      if (surface === 'terminal') {
        expect([20, 40, 71, 72, 80, 94, 100, WIDEST].map(bandColumns)).toEqual([18, 38, 56, 34, 42, 56, 56, 56])

        for (const width of [40, 80, 94]) {
          const ui = await mountBand($, surface, width)
          expectRaster(await ui.find({ type: 'Raster' }), bandColumns(width), RASTER_ROWS)
          await ui.unmount()
        }

        return
      }

      const widths: number[] = []
      const heights: number[] = []

      for (const columns of [20, 60, 100, 200, WIDEST]) {
        const ui = await mountBand($, surface, columns)
        const drawn = expectSvg(await ui.find({ type: 'Svg' }), columns)
        widths.push(drawn.width)
        heights.push(drawn.height)
        await ui.unmount()
      }

      // Under the scene's floor it shrinks to the band, aspect kept; above it
      // the banner is full height and as wide as the band, up to 2400 px.
      expect({ width: widths[0], height: heights[0] }).toEqual(sceneBox(20 * PIXELS_PER_COLUMN))
      expect(widths[0]).toBe(156)
      expect(heights[0]).toBeLessThan(SCENE_HEIGHT)
      expect(heights.slice(1)).toEqual([SCENE_HEIGHT, SCENE_HEIGHT, SCENE_HEIGHT, SCENE_HEIGHT])
      expect(widths[4]).toBe(2400)
      for (let i = 1; i < widths.length; i++) {
        expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!)
        expect(heights[i]!).toBeGreaterThanOrEqual(heights[i - 1]!)
      }
    })

    if (surface === 'desktop') {
      test('a band under 420 px scales the banner down to fit it, aspect kept', async $ => {
        for (const columns of NARROW) {
          const ui = await mountBand($, surface, columns)
          await spell($, 'ultracode')
          const { source, width, height, viewWidth } = expectSvg(await ui.find({ type: 'Svg' }), columns)

          expect(width, `${columns} columns`).toBeLessThanOrEqual(columns * PIXELS_PER_COLUMN)
          expect(height).toBeLessThan(SCENE_HEIGHT)
          // The scene is still laid out at its 420x128 floor, only drawn smaller.
          expect(viewWidth).toBe(420)
          expect(Math.abs(width / height - 420 / SCENE_HEIGHT)).toBeLessThan(0.05)
          expect(source).toStartWith(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 420 ${SCENE_HEIGHT}">`,
          )
          await ui.unmount()
        }
      })

      test('the banner is never wider than the band, at any width', async $ => {
        for (let columns = 1; columns <= 320; columns++) {
          const ui = await mountBand($, surface, columns)
          const { width, height } = expectSvg(await ui.find({ type: 'Svg' }), columns)
          const room = columns * PIXELS_PER_COLUMN

          // To the nearest pixel of the room, whatever the floor and the cap.
          expect(width, `${columns} columns`).toBeLessThanOrEqual(Math.max(1, Math.round(room)))
          expect(height, `${columns} columns`).toBe(room >= 420 ? SCENE_HEIGHT : sceneBox(room).height)
          await ui.unmount()
        }
      })
    }

    test('yields to a survey', async ($, on) => {
      engineBand(on)
      const ui = await $.ui.mount({
        plugin: PLUGIN,
        surface,
        component: 'AbovePrompt',
        props: band(100, { hasSurvey: true }),
      })

      expect(await ui.find({ type: 'Text', text: ENGINE_BAND })).toBeDefined()
      expect(await ui.findAll({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toHaveLength(0)

      await ui.redraw(band(100))
      await expectBand(ui, surface, 0, 100)
    })

    test('redraws at a new width', async $ => {
      const ui = await mountBand($, surface, 100)
      await spell($, '3')
      await ui.redraw(band(40))
      await expectBand(ui, surface, 2, 40)
      await ui.redraw(band(WIDEST))
      await expectBand(ui, surface, 2, WIDEST)
    })
  })

  describe(`${surface}: spellbook`, () => {
    for (const width of [20, 80, WIDEST]) {
      test(`draws all six ranks at ${width} columns`, async $ => {
        const ui = await mountBook($, surface, width)

        if (surface === 'terminal') {
          expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
          const rasters = await ui.findAll({ type: 'Raster' })
          expect(rasters.map(raster => raster.key)).toEqual(['tier-0', 'tier-1', 'tier-2', 'tier-3', 'tier-4', 'tier-5'])

          for (const raster of rasters) {
            expectRaster(raster, bookColumns(width), RASTER_ROWS)
          }

          for (const rank of RANKS) {
            expect(await ui.find({ type: 'Text', text: new RegExp(`^Avada Kedavra ${rank} · `) })).toBeDefined()
          }

          return
        }

        expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
        const svgs = await ui.findAll({ type: 'Svg' })
        expect(svgs).toHaveLength(6)

        svgs.forEach((svg, tier) => {
          const { source, alt, width: drawn, height } = expectSvg(svg, width)
          expect(alt).toStartWith(`Clawd casts Avada Kedavra ${RANKS[tier]} (`)
          expect(source).toContain(`>Avada Kedavra ${RANKS[tier]}</text>`)
          expect(drawn).toBe(svgs[0]!.props['width'])
          expect(height).toBe(svgs[0]!.props['height'])
        })

        if (width === WIDEST) {
          expect(svgs[0]!.props['width']).toBe(2400)
        }
      })
    }

    if (surface === 'desktop') {
      test('a pane under 420 px scales every banner down to fit it, aspect kept', async $ => {
        for (const columns of NARROW) {
          const ui = await mountBook($, surface, columns)
          const svgs = await ui.findAll({ type: 'Svg' })
          expect(svgs).toHaveLength(6)

          for (const svg of svgs) {
            const { source, width, height, viewWidth } = expectSvg(svg, columns)
            expect(width, `${columns} columns`).toBeLessThanOrEqual(columns * PIXELS_PER_COLUMN)
            expect(height).toBeLessThan(SCENE_HEIGHT)
            expect(viewWidth).toBe(420)
            expect(Math.abs(width / height - 420 / SCENE_HEIGHT)).toBeLessThan(0.05)
            expect(source).toContain(`width="${width}" height="${height}" viewBox="0 0 420 ${SCENE_HEIGHT}"`)
          }

          await ui.unmount()
        }
      })
    }

    test('marks the rank now in play', async $ => {
      const ui = await mountBook($, surface, 80)
      const marked = async () => {
        if (surface === 'terminal') {
          const rows = await ui.findAll({ type: 'Text', text: /^Avada Kedavra (I|II|III|IV|V|VI) · / })
          return rows.filter(row => row.text.endsWith(' · now')).map(row => row.text.split(' ')[2])
        }

        const svgs = await ui.findAll({ type: 'Svg' })
        return svgs.filter(svg => String(svg.props['alt']).endsWith(' · now)')).map(svg => String(svg.props['alt']).split(' ')[4])
      }

      expect(await marked()).toEqual(['I'])

      await spell($, 'xhigh')
      expect(await marked()).toEqual(['IV'])

      if (surface === 'terminal') {
        // The current rank's caption is bold, the rest not.
        const titles = await ui.findAll({ type: 'Text', text: /^Avada Kedavra (I|II|III|IV|V|VI) · / })
        expect(titles.map(title => title.props['bold'])).toEqual([false, false, false, true, false, false])
      }

      await spell($, 'auto')
      expect(await marked()).toEqual(['I'])
    })

    test('redraws at a new width', async $ => {
      const ui = await mountBook($, surface, 80)
      await ui.redraw(book(30))

      if (surface === 'terminal') {
        for (const raster of await ui.findAll({ type: 'Raster' })) {
          expectRaster(raster, bookColumns(30), RASTER_ROWS)
        }
      } else {
        const svgs = await ui.findAll({ type: 'Svg' })
        expect(svgs).toHaveLength(6)

        // 30 columns is under the scene's 420 px floor: each banner shrinks.
        for (const svg of svgs) {
          const { width, height } = expectSvg(svg, 30)
          expect({ width, height }).toEqual(sceneBox(30 * PIXELS_PER_COLUMN))
          expect(width).toBe(234)
          expect(height).toBeLessThan(SCENE_HEIGHT)
        }
      }
    })
  })
}
