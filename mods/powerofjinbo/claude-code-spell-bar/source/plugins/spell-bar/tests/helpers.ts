// Shared fixtures for the spell-bar tests: the props the engine hands the band
// and the spellbook pane, the /spell command as a person types it, the engine's
// own band beneath the plugin, and the checks every drawing must pass.
import type { CommandRunInput, On, RenderPropsOf, RenderSurface } from 'claude-code'
import type { Engine, FoundElement, Mounted } from 'claude-code/testing'

import { expect } from 'claude-code/testing'

import { RASTER_ROWS } from '../hooks/pixels.ts'
import { fitWidth, SCENE_HEIGHT, sceneBox } from '../hooks/scene.ts'

export const PLUGIN = 'spell-bar'
export const SURFACES = ['terminal', 'desktop'] as const
export const RANKS = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const
// SvgProps.source: "at most 131072 characters".
export const SVG_CAP = 131072
// What the stand-in for the engine draws when the plugin passes the band on.
export const ENGINE_BAND = 'engine band'
// The desktop measures a band or pane in cells of its code font, about 7.9 CSS
// pixels each; the plugin sizes its banner for 7.8 a column.
export const PIXELS_PER_COLUMN = 7.8

export type Surface = (typeof SURFACES)[number]

export function band(
  bodyColumns: number,
  extra: Partial<RenderPropsOf['AbovePrompt']> = {},
): RenderPropsOf['AbovePrompt'] {
  return {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
    ...extra,
  }
}

export function book(bodyColumns: number): RenderPropsOf['Pane'] {
  return {
    title: 'Spellbook',
    isFocused: false,
    bodyColumns,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 48 },
    view: {},
  }
}

function typed(command: string, args: string): CommandRunInput {
  return {
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  }
}

// `/spell <args>` as the person types it; the reply's text.
export async function spell($: Engine, args = ''): Promise<string> {
  return (await $.command.run(typed('spell', args))).text ?? ''
}

export async function spellbook($: Engine): Promise<string> {
  return (await $.command.run(typed('spellbook', ''))).text ?? ''
}

// The engine's own band, beneath the plugin: what shows when it passes.
export function engineBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return Text({ children: ENGINE_BAND })
  })
}

export function mountBand<S extends Surface>($: Engine, surface: S, bodyColumns: number, requestId?: string) {
  const target = { plugin: PLUGIN, surface, component: 'AbovePrompt' as const, props: band(bodyColumns) }

  return $.ui.mount(requestId === undefined ? target : { ...target, requestId })
}

export function mountBook<S extends Surface>($: Engine, surface: S, bodyColumns: number) {
  return $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', props: book(bodyColumns), requestId: 'spellbook' })
}

// The Raster's width the band asks for, from AbovePrompt's layout rule: beside
// the caption from 72 columns, above it below that, never under 16 or over 56.
export function bandColumns(bodyColumns: number): number {
  return bodyColumns >= 72 ? Math.min(56, bodyColumns - 38) : Math.max(16, Math.min(56, bodyColumns - 2))
}

export function bookColumns(bodyColumns: number): number {
  return Math.max(16, Math.min(60, bodyColumns - 2))
}

// The u32 words of a Raster's cells: [codePoint, foreground, background] each.
export function cellWords(cells: string): number[] {
  const text = atob(cells)
  const bytes = new Uint8Array(text.length)

  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i)
  }

  const view = new DataView(bytes.buffer)
  const words: number[] = []

  for (let i = 0; i + 4 <= bytes.length; i += 4) {
    words.push(view.getUint32(i, true))
  }

  return words
}

// RasterProps: cells is padded base64 of columns*rows little-endian u32
// triplets; each code point one printable width-1 BMP character and each color
// 0x00RRGGBB or 0x01000000.
export function expectRaster(raster: FoundElement | undefined, columns: number, rows: number) {
  expect(raster, 'a Raster is drawn').toBeDefined()
  const props = raster!.props
  expect(props['columns']).toBe(columns)
  expect(props['rows']).toBe(rows)
  expect(typeof props['cells']).toBe('string')
  const words = cellWords(props['cells'] as string)
  expect(words).toHaveLength(columns * rows * 3)

  for (let i = 0; i < words.length; i += 3) {
    const point = words[i]!
    expect(point >= 0x20 && point <= 0xffff && !(point >= 0x7f && point < 0xa0), `cell ${i / 3} code point`).toBe(true)
    for (const color of [words[i + 1]!, words[i + 2]!]) {
      expect(color <= 0xffffff || color === 0x01000000, `cell ${i / 3} color`).toBe(true)
    }
  }
}

// An Svg the desktop can size: width and height given, the markup the same
// size, and under the element's cap. The scene is laid out in a viewBox
// SCENE_HEIGHT tall and fitWidth(room) wide, and drawn in a box of the same
// aspect, scaled down (never up) when the room is under the scene's 420 px
// floor. With `bodyColumns`, the box is the one for that many columns.
export function expectSvg(
  svg: FoundElement | undefined,
  bodyColumns?: number,
): { source: string; width: number; height: number; viewWidth: number; alt: string } {
  expect(svg, 'an Svg is drawn').toBeDefined()
  const props = svg!.props
  const source = props['source'] as string
  const width = props['width'] as number
  const height = props['height'] as number
  const alt = props['alt'] as string

  expect(typeof width).toBe('number')
  expect(typeof height).toBe('number')
  expect(Number.isInteger(width) && Number.isInteger(height), `${width}x${height} in whole pixels`).toBe(true)
  expect(width).toBeGreaterThanOrEqual(1)
  expect(width).toBeLessThanOrEqual(2400)
  expect(height).toBeGreaterThanOrEqual(1)
  expect(height).toBeLessThanOrEqual(SCENE_HEIGHT)
  expect(typeof source).toBe('string')
  expect(source.length).toBeLessThan(SVG_CAP)
  expect(source).toStartWith('<svg ')
  expect(source.trimEnd()).toEndWith('</svg>')

  const viewBox = /^<svg [^>]*viewBox="0 0 (\d+) (\d+)"/.exec(source)
  expect(viewBox, 'the markup has a viewBox').not.toBeNull()
  const viewWidth = Number(viewBox![1])
  expect(Number(viewBox![2])).toBe(SCENE_HEIGHT)
  expect(viewWidth).toBeGreaterThanOrEqual(420)
  expect(viewWidth).toBeLessThanOrEqual(2400)
  // The markup says the size the Svg is given.
  expect(source).toContain(`width="${width}" height="${height}" viewBox="0 0 ${viewWidth} ${SCENE_HEIGHT}"`)
  // The same aspect as the viewBox, to the pixel, and never scaled up.
  expect(width).toBeLessThanOrEqual(viewWidth)
  expect(Math.abs(height - (width * SCENE_HEIGHT) / viewWidth), `${width}x${height} for ${viewWidth}x${SCENE_HEIGHT}`).toBeLessThanOrEqual(1)

  if (bodyColumns !== undefined) {
    const room = bodyColumns * PIXELS_PER_COLUMN
    expect({ width, height }, `the box for ${bodyColumns} columns`).toEqual(sceneBox(room))
    expect(viewWidth).toBe(fitWidth(room))
  }

  expect(typeof alt).toBe('string')
  expect(alt.length).toBeGreaterThan(0)

  return { source, width, height, viewWidth, alt }
}

// Which rank the band shows, read off what it drew on that surface.
export async function rankShown(ui: Mounted<RenderSurface, 'AbovePrompt'>, surface: Surface): Promise<string | undefined> {
  if (surface === 'terminal') {
    const title = await ui.find({ type: 'Text', text: /^Avada Kedavra (I|II|III|IV|V|VI)$/ })

    return title?.text.replace('Avada Kedavra ', '')
  }

  const svg = await ui.find({ type: 'Svg' })
  const alt = svg?.props['alt']

  return typeof alt === 'string' ? /Avada Kedavra (I|II|III|IV|V|VI) /.exec(alt)?.[1] : undefined
}

// The band as the plugin draws it, for `tier`, on `surface`.
export async function expectBand(
  ui: Mounted<RenderSurface, 'AbovePrompt'>,
  surface: Surface,
  tier: number,
  bodyColumns: number,
) {
  const rank = RANKS[tier]!

  expect(await ui.find({ type: 'Text', text: ENGINE_BAND })).toBeUndefined()
  expect(await rankShown(ui, surface)).toBe(rank)

  if (surface === 'terminal') {
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
    const rasters = await ui.findAll({ type: 'Raster' })
    expect(rasters).toHaveLength(1)
    expect(rasters[0]!.key).toBe('spell')
    expectRaster(rasters[0], bandColumns(bodyColumns), RASTER_ROWS)

    const tree = await ui.drawn()
    expect(tree).toMatchObject({ type: 'Box', props: { flexDirection: bodyColumns >= 72 ? 'row' : 'column' } })
    // One lit pip per rank up to this one, the rest dark.
    expect(await ui.findAll({ type: 'Text', text: /^✦$/ })).toHaveLength(tier + 1)
    expect(await ui.findAll({ type: 'Text', text: /^✧$/ })).toHaveLength(5 - tier)

    return
  }

  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs).toHaveLength(1)
  const { source, alt } = expectSvg(svgs[0], bodyColumns)
  expect(alt).toStartWith(`Clawd casts Avada Kedavra ${rank} (`)
  expect(source).toContain(`>Avada Kedavra ${rank}</text>`)
}

// The plugin passed the band on: the engine's own drawing, nothing of ours.
export async function expectPassedOn(ui: Mounted<RenderSurface, 'AbovePrompt'>) {
  expect(await ui.find({ type: 'Text', text: ENGINE_BAND })).toBeDefined()
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
}
