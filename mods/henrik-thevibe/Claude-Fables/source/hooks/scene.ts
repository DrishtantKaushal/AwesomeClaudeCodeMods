import type {
  FablesBackdrop,
  FablesHeroAction,
  FablesMotion,
  FablesParticles,
  FablesPixelArt,
  FablesProp,
  FablesScene,
} from '../types'

import { SPRITE_NAMES } from './sprites'

export const BACKDROPS: readonly FablesBackdrop[] = [
  'forest',
  'space',
  'city',
  'desert',
  'volcano',
  'lab',
  'night',
]
export const HERO_ACTIONS: readonly FablesHeroAction[] = [
  'walk',
  'run',
  'fly',
  'carry',
  'sneak',
  'jump',
  'tumble',
  'dig',
  'inspect',
  'celebrate',
  'think',
  'panic',
  'sleep',
  'dance',
  'spin',
  'wave',
  'point',
  'peek',
  'trip',
  'shrug',
]
export const MOTIONS: readonly FablesMotion[] = [
  'none',
  'bob',
  'drift',
  'shake',
  'fall',
  'spin',
  'blink',
  'scroll',
]
export const PARTICLES: readonly FablesParticles[] = [
  'stars',
  'rain',
  'bubbles',
  'sparks',
  'snow',
  'leaves',
]

export const MAX_PROPS = 8
/** What the narrator is asked to keep a caption to. */
export const CAPTION_BUDGET = 70
/** The hard limit: the most the bubble shows whole, at its widest, in four lines. Longer is cut at a sentence or a word. */
export const MAX_CAPTION = 80
/** How fast the bubble types its caption out, per character. */
export const TYPE_SECONDS_PER_CHAR = 0.03
/** How long a scene in a new setting takes to fade in from the last; its caption starts after. */
export const ENTRANCE_SECONDS = 0.6
export const MAX_LABEL = 18
export const MAX_TITLE = 24
export const MAX_PIXEL_SIDE = 16
const PIXEL_KEYS = /^[a-zA-Z0-9]$/

type Loose = Record<string, unknown>

const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v)

/** `#abc` or `#aabbcc` only, normalised to lower-case six digits. */
export function parseHex(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v.trim())
  if (!m || m[1] === undefined) return undefined
  const hex = m[1].toLowerCase()
  return hex.length === 3 ? `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}` : `#${hex}`
}

function oneOf<T extends string>(v: unknown, among: readonly T[], fallback: T): T {
  return typeof v === 'string' && (among as readonly string[]).includes(v) ? (v as T) : fallback
}

function clampNumber(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

/** Single-line, printable text, cut to `max` characters (an ellipsis marks the cut). */
export function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const flat = v
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat === '') return undefined
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/**
 * The caption, cut to fit the bubble whole: at the last sentence that fits if
 * that keeps most of it, else at the last word, with an ellipsis; never mid-word.
 */
export function cleanCaption(v: unknown): string | undefined {
  const flat = cleanText(v, Infinity)
  if (!flat || flat.length <= MAX_CAPTION) return flat
  const head = flat.slice(0, MAX_CAPTION)
  const sentence = /^.*[.!?](?=\s)/.exec(head)?.[0]
  if (sentence && sentence.length >= MAX_CAPTION * 0.6) return sentence
  const room = flat.slice(0, MAX_CAPTION - 1)
  const space = room.lastIndexOf(' ')
  const words = space >= MAX_CAPTION / 2 ? room.slice(0, space) : room
  return `${words.replace(/[\s,;:.\-–—]+$/, '')}…`
}

function parsePixelArt(v: Loose): FablesPixelArt | undefined {
  if (!Array.isArray(v.pixels) || !isObject(v.colors)) return undefined
  const colors: Record<string, string> = {}
  for (const [key, value] of Object.entries(v.colors)) {
    const hex = parseHex(value)
    if (PIXEL_KEYS.test(key) && hex) colors[key] = hex
  }
  const pixels = v.pixels
    .slice(0, MAX_PIXEL_SIDE)
    .filter((row): row is string => typeof row === 'string')
    .map(row => [...row.slice(0, MAX_PIXEL_SIDE)].map(c => (colors[c] ? c : '.')).join(''))
  const isEmpty = pixels.every(row => /^\.*$/.test(row))
  return pixels.length > 0 && !isEmpty ? { pixels, colors } : undefined
}

function parseProp(v: unknown): FablesProp | undefined {
  if (!isObject(v)) return undefined
  let sprite: FablesProp['sprite'] | undefined
  if (typeof v.sprite === 'string') {
    const name = v.sprite.toLowerCase().trim()
    sprite = (SPRITE_NAMES as readonly string[]).includes(name) ? name : undefined
  } else if (isObject(v.sprite)) {
    sprite = parsePixelArt(v.sprite)
  }
  if (sprite === undefined) return undefined
  const prop: FablesProp = {
    sprite,
    x: Math.round(clampNumber(v.x, 0, 100, 50)),
    y: oneOf(v.y, ['ground', 'air', 'sky'] as const, 'ground'),
    motion: oneOf(v.motion, MOTIONS, 'none'),
  }
  const label = cleanText(v.label, MAX_LABEL)
  if (label) prop.label = label
  const color = parseHex(v.color)
  if (color) prop.color = color
  return prop
}

/**
 * Validates whatever the model sent back into a Scene the renderer can trust:
 * unknown fields dropped, numbers clamped, strings flattened and cut, colors
 * checked. Answers null when there is no caption to tell.
 */
export function parseScene(raw: unknown): FablesScene | null {
  if (!isObject(raw)) return null
  const caption = cleanCaption(raw.caption)
  if (!caption) return null

  const hero = isObject(raw.hero) ? raw.hero : {}
  const palette = isObject(raw.palette) ? raw.palette : {}
  const scene: FablesScene = {
    backdrop: oneOf(raw.backdrop, BACKDROPS, 'night'),
    palette: {},
    hero: {
      action: oneOf(hero.action, HERO_ACTIONS, 'walk'),
      from: Math.round(clampNumber(hero.from, 0, 100, 10)),
      to: Math.round(clampNumber(hero.to, 0, 100, 60)),
      // What comes next is played where Claude stands, so a second journey is just its moves in place.
      ...(typeof hero.then === 'string' && (HERO_ACTIONS as readonly string[]).includes(hero.then) ? { then: hero.then as FablesHeroAction } : {}),
    },
    props: (Array.isArray(raw.props) ? raw.props : [])
      .map(parseProp)
      .filter((p): p is FablesProp => p !== undefined)
      .slice(0, MAX_PROPS),
    caption,
  }
  for (const key of ['sky', 'ground', 'accent'] as const) {
    const hex = parseHex(palette[key])
    if (hex) scene.palette[key] = hex
  }
  if (isObject(raw.particles)) {
    scene.particles = {
      kind: oneOf(raw.particles.kind, PARTICLES, 'stars'),
      density: clampNumber(raw.particles.density, 0, 1, 0.4),
    }
  }
  if (raw.tone === 'trouble' || raw.tone === 'milestone' || raw.tone === 'work') scene.tone = raw.tone
  const title = cleanText(raw.title, MAX_TITLE)
  if (title) scene.title = title
  return scene
}

/**
 * Pulls the first JSON object out of a model reply: tolerates code fences and
 * chatter around it. Never throws; answers undefined when nothing parses.
 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const body = fenced?.[1] ?? text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return undefined
  }
}
