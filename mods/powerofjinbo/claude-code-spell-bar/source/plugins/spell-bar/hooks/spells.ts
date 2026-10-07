// Six ranks of one curse, weakest first, each adding a layer to the one below:
// one per position of the effort picker, ultracode the strongest. A model that
// takes no effort setting, or one not seen yet, shows rank I.
export type Spell = {
  id: string
  name: string
  rank: string
  effort: string
  // Main colour, the glow around it, and the white-hot core.
  hex: string
  glow: string
  core: string
  // Sky gradient, top to bottom.
  sky: [string, string]
  // One cast, in seconds.
  seconds: number
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode']
const RANKS = ['I', 'II', 'III', 'IV', 'V', 'VI']
const HEXES = ['#1f8a44', '#27a852', '#30c45f', '#3ddf6c', '#5cff86', '#9dffbb']
const SKIES: Array<[string, string]> = [
  ['#010302', '#050c07'],
  ['#010402', '#061209'],
  ['#010503', '#07170c'],
  ['#010603', '#081d0f'],
  ['#010804', '#0a2414'],
  ['#020b05', '#0d2e19'],
]
const SECONDS = [3.2, 3.2, 3.4, 3.6, 3.8, 4.4]

export const SPELLS: readonly Spell[] = EFFORTS.map((effort, i) => ({
  id: effort,
  name: 'Avada Kedavra',
  rank: RANKS[i] ?? '',
  effort,
  hex: HEXES[i] ?? '#3ddf6c',
  glow: '#00c853',
  core: '#ecfff2',
  sky: SKIES[i] ?? ['#000502', '#04190c'],
  seconds: SECONDS[i] ?? 3.6,
}))

export function spellAt(tier: number): Spell {
  return SPELLS[tier] ?? SPELLS[0]!
}

export function levelOf(spell: Spell): string {
  return spell.effort === 'ultracode' ? 'ultracode' : `effort ${spell.effort}`
}

// A small seeded generator, so a scene comes out the same on every redraw.
export function seeded(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// An integer thinking budget has no named level; these cut-offs are rough.
const BUDGETS = [8000, 16000, 32000, 64000]

export function tierOf(effort: string | null): number {
  if (effort === null) {
    return 0
  }

  const level = EFFORTS.indexOf(effort)

  if (level >= 0) {
    return level
  }

  const budget = Number(effort)

  if (Number.isFinite(budget)) {
    const below = BUDGETS.findIndex(cut => budget < cut)

    return below < 0 ? 4 : below
  }

  return 0
}

// `/spell <arg>`: a number 1-6, a roman rank, or an effort level.
export function tierNamed(arg: string): number | null {
  const word = arg.trim().toLowerCase()
  const index = Number(word)

  if (Number.isInteger(index) && index >= 1 && index <= SPELLS.length) {
    return index - 1
  }

  const found = SPELLS.findIndex(spell => spell.effort === word || spell.rank.toLowerCase() === word)

  return found < 0 ? null : found
}

const NAMED = ['low', 'medium', 'high', 'xhigh']

// The effort picker's position, from the flag settings the desktop applies it
// as. The settings schema drops "max", so max reads as no level at all, which
// only means max when the flags just moved off a level the picker set
// (`wasSet`); at startup the desktop passes the effort as a flag of the
// process instead. Ultracode is its own boolean, sent with effort xhigh.
// Undefined when the flags cannot tell.
export function pickerEffort(flag: Readonly<Record<string, unknown>>, wasSet: boolean): string | undefined {
  const level = typeof flag['effortLevel'] === 'string' && NAMED.includes(flag['effortLevel']) ? flag['effortLevel'] : undefined

  if (flag['ultracode'] === true && (level === undefined || level === 'xhigh')) {
    return 'ultracode'
  }

  if (level !== undefined) {
    return level
  }

  return wasSet ? 'max' : undefined
}
