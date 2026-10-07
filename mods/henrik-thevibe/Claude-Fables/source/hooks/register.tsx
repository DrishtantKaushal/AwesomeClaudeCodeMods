import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { DEFAULT_MODEL, Director, findModel, type Host, MODEL_LABELS, NARRATOR_MODELS, type NarratorModel } from './director'
import { DEFAULT_LOOK, findLook, LOOK_NAMES, LOOKS, lookFor } from './looks'
import type { FablesScene } from '../types'

import { H, MAX_SVG, resumeAt, sceneToSvg, speaksAfter, W } from './svg'

const scene = atom({ plugin: 'fables', key: 'scene' } as const, null)
const enabled = atom({ plugin: 'fables', key: 'enabled' } as const, true)
const style = atom({ plugin: 'fables', key: 'style' } as const, DEFAULT_LOOK)

const STORE_ENABLED = 'enabled'
const STORE_PIXEL = 'pixelArt'
const STORE_STYLE = 'style'
const STORE_MODEL = 'model'
/** Every scene is drawn with the 3D Claude, in the style the person chose (looks.ts). */
const FIGURE = '3d'
/** This plugin's own tools, if it ever registers any, are not part of the story. */
const OWN_TOOLS = 'mcp__fables__'

/**
 * The band's code font advance in CSS pixels: the desktop measures the band in
 * cells of it, and the Svg wants pixels.
 */
const PX_PER_COLUMN = 8
/** CSS pixels per stage unit: the stage's H units come out this many times taller. */
const SCALE = 1.5

/**
 * The band's box in CSS pixels: its whole width, at a fixed height so the art and
 * the caption keep one size whatever the window; the stage widens to fill it.
 */
function bandBox(columns: number): { width: number; height: number } {
  const width = Number.isFinite(columns) && columns > 0 ? Math.round(columns * PX_PER_COLUMN) : W * SCALE
  return { width, height: Math.round(H * SCALE) }
}

/** The narrator's host in a session: Claude Code's clock, its model, the band, and how the band draws a scene. */
function host($: EngineInterface, band: Band): Host {
  return {
    now: () => $.clock.now(),
    complete: ask => $.model.complete(ask),
    show: drawn => update($, scene, () => drawn),
    speaksAfter: async next => speaksAfter((await draw($, band, next)).base) * 1000,
  }
}

async function chooseLook($: EngineInterface, n: Director, name: string) {
  const look = lookFor(name)
  n.look = look.name
  await $.store.set(STORE_STYLE, look.name)
  await update($, style, () => look.name)
  return { text: `Scenes are now drawn as ${look.label}.` }
}

async function chooseModel($: EngineInterface, n: Director, model: NarratorModel) {
  n.model = model
  await $.store.set(STORE_MODEL, model)
  return { text: `${MODEL_LABELS[model]} now writes the story.` }
}

async function setOn($: EngineInterface, n: Director, at: Host, value: boolean) {
  await n.setOn(at, value)
  await $.store.set(STORE_ENABLED, value)
  await update($, enabled, () => value)
}

/**
 * The scene up now, when it went up, and its drawing in the box and style last
 * asked for. The band is drawn again whenever its props change (the turn
 * ending flips isWorking, the window is resized) and the desktop may start the
 * frame over then; so every drawing after the first is set to the scene's own
 * clock, and it carries on where it was instead of typing its caption again.
 */
type Drawn = { scene: string; at: number; key: string; base: string }
/** The drawing kept, and the band's box as last drawn, so a scene can be drawn the moment it goes up. */
type Band = { drawn?: Drawn; box: { width: number; height: number } }

/** The scene in the band's box and style, drawn once and kept: a scene going up starts its clock. */
async function draw($: EngineInterface, band: Band, next: FablesScene): Promise<Drawn> {
  const look = await read($, style)
  const key = `${band.box.width}x${band.box.height}|${look}`
  const same = JSON.stringify(next)
  const kept = band.drawn
  if (kept?.scene === same && kept.key === key) return kept
  const at = kept?.scene === same ? kept.at : await $.clock.now()
  band.drawn = { scene: same, at, key, base: sceneToSvg(next, { ...band.box, look, figure: FIGURE }) }
  return band.drawn
}

export const register: Register = (on, options) => {
  const n = new Director()
  const band: Band = { box: bandBox(NaN) }
  // The config menu's choice is the default; /fables model overrides it.
  const configured = findModel(options.model) ?? DEFAULT_MODEL
  n.model = configured
  n.look = DEFAULT_LOOK

  on('session.start', async ($, e, next) => {
    n.isOn = (await $.store.get(STORE_ENABLED)) !== false
    n.model = findModel(await $.store.get(STORE_MODEL)) ?? configured
    await update($, enabled, () => n.isOn)
    const saved = await $.store.get(STORE_STYLE)
    // Pixel art was once a switch of its own: someone who turned it off keeps the original look, drawn smooth.
    const smooth = (await $.store.get(STORE_PIXEL)) === false
    n.look = typeof saved === 'string' && LOOKS[saved] ? saved : smooth ? 'original' : DEFAULT_LOOK
    await update($, style, () => n.look)
    await $.command.register({
      name: 'fables',
      description: 'Claude Fables: turn the cartoons above the prompt on or off, pick a style, or pick the model that writes them',
      argumentHint: '[on|off|style [name|off]|model [sonnet|haiku]]',
    })
    $.clock.every(1000, () => void n.tick(host($, band)))
    return next(e)
  })

  on('command.run', { command: 'fables' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const md = /^(?:model|models|narrator)\b\s*(.*)$/.exec(arg)
    if (md) {
      const want = (md[1] ?? '').trim()
      if (!want) {
        const list = NARRATOR_MODELS.map(m => `${m === n.model ? '▸' : ' '} ${m} · ${MODEL_LABELS[m]}`).join('\n')
        return { text: `${MODEL_LABELS[n.model]} writes the story. Pick another with /fables model <name>:\n${list}` }
      }
      const model = findModel(want)
      if (!model) return { text: `No narrator called "${want}". Try /fables model sonnet or /fables model haiku.` }
      return chooseModel($, n, model)
    }
    const st = /^(?:style|styles|look)\b\s*(.*)$/.exec(arg)
    if (st) {
      const want = (st[1] ?? '').trim()
      if (!want) {
        const list = LOOK_NAMES.map(name => `${name === n.look ? '▸' : ' '} ${name} · ${lookFor(name).label}`).join('\n')
        return { text: `Scenes are drawn in ${lookFor(n.look).label}. Pick a style with /fables style <name>, or /fables style off for the default:\n${list}` }
      }
      const look = /^(off|none|default|plain)$/.test(want) ? lookFor(DEFAULT_LOOK) : findLook(want)
      if (!look) return { text: `No style called "${want}". /fables style lists them.` }
      return chooseLook($, n, look.name)
    }
    // Pixel art is a style now; the old switch still works, as a way to pick it or the smooth original.
    const px = /^pixel(?:\s+(on|off))?$/.exec(arg)
    if (px) return chooseLook($, n, px[1] === 'off' || (!px[1] && n.look === 'pixel') ? 'original' : 'pixel')
    const value = arg === 'on' ? true : arg === 'off' ? false : !n.isOn
    await setOn($, n, host($, band), value)
    return {
      text: value
        ? `Claude Fables is on: cartoons written by ${MODEL_LABELS[n.model]} play above the prompt while Claude works.`
        : 'Claude Fables is off.',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    n.submit(e.text)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const isTold = e.agentId === undefined && !tool.startsWith(OWN_TOOLS)
    if (isTold) n.tool(tool, e)
    const ran = await next(e)
    if (isTold && (ran.deny !== undefined || ran.isError === true)) n.failed(tool, e)
    return ran
  })

  on('session.append', async ($, e, next) => {
    if (e.door === 'response' && e.agentId === undefined && Array.isArray(e.message.content)) {
      const said = e.message.content
        .map(block => (block.type === 'text' ? block.text : ''))
        .join(' ')
        .trim()
      n.said(said)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) n.complete(e.reason)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)
    const current = await read($, scene)
    if (!current || !(await read($, enabled))) return next(e)
    const { Svg } = $.ui.resolve(e)
    // The interactive frame does not size itself from the markup (left alone it
    // is a 300x150 box), so give it the band's box; a new width draws anew.
    band.box = bandBox(e.props.bodyColumns)
    const { width, height } = band.box
    const { base, at } = await draw($, band, current)
    // To a tenth of a second, so drawings in the same moment stay the same.
    const along = Math.floor(((await $.clock.now()) - at) / 100) / 10
    const resumed = resumeAt(base, along)
    return (
      <Svg
        source={resumed.length <= MAX_SVG ? resumed : base}
        alt={current.caption}
        width={width}
        height={height}
        isInteractive
      />
    )
  })
}
