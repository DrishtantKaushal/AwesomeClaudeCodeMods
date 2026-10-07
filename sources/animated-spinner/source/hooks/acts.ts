// Clawd acts out the spinner's word ("Sautéing", "Vibing", "Pondering"...), in the spinner's row.
// Pure: frame() turns (the word, time, width) into Raster cells. Each cell is two pixels stacked (▀).

export type Act = 'cook' | 'think' | 'dance' | 'build' | 'compute' | 'stroll' | 'herd' | 'weather' | 'garden' | 'space' | 'magic'

export type Moment = {
  word: string  // the spinner's word, as drawn
  t: number  // ms since the turn began
}

export const ROWS = 8
export const PH = ROWS * 2
const DEF = 0x01000000  // the terminal's own colour: transparent here
const GROUND = PH - 1

// ------------------------------------------------------------------ which act

// Stems of Claude Code's 179 spinner words, grouped by what Clawd can act out. Anything else: magic.
const STEMS: [Act, RegExp][] = [
  ['cook', /bak|blanch|brew|bunn|caramel|concoct|cook|drizzl|ferment|flamb|frost|garnish|infus|marinat|percolat|proof|saut|smoosh|stew|temper|whisk|zest/],
  ['think', /cerebrat|cogitat|consider|contemplat|deciph|deliberat|determin|elucidat|envision|ideat|imagin|infer|mull|musing|philosoph|ponder|pontificat|puzzl|ruminat|think|perus|bloviat|befuddl|flummox|combobulat|newspaper/],
  ['dance', /bebop|boogie|choreograph|frolic|groov|jitterbug|moonwalk|sock-hop|vib|razzle|razzmatazz|hullaballoo|tomfool|topsy|wibbl|undulat|noodl|flibbertigibbet|harmoniz|compos|orchestrat|honk|improvis|twist/],
  ['build', /architect|bootstrap|craft|creat|forg|form|generat|sketch|doodl|embellish|tinker|accomplish|action|actualiz|^doing|effect|working|finagl|fiddle|boondoggl|gitif/],
  ['compute', /calculat|churn|comput|crunch|hash|process|reticulat|spinn|whirr|(?<!photo)synthes|quantum|ioniz|nucleat|crystal|coalesc/],
  ['herd', /herd|wrangl|muster/],
  ['stroll', /dilly|gallivant|lollygag|meander|mosey|perambulat|putter|scamper|schlep|scurr|waddl|wander|zigzag|gallop|slither|pounc|spelunk/],
  ['weather', /billow|evaporat|gust|mist|nebuliz|precipitat|thunder|cascad|flow|ebb|whirlpool|swirl|unfurl|osmos|sublimat/],
  ['garden', /cultivat|germinat|photosynth|pollinat|propagat|sprout|nest|roost|incubat|^hatch|symbiot|burrow|flutter/],
  ['space', /beam|catapult|hyperspac|levitat|orbit|swoop|warp/],
]

export function actFor(word: string): Act {
  const w = word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return STEMS.find(([, re]) => re.test(w))?.[0] ?? 'magic'
}

// ------------------------------------------------------------------ pixels

type Canvas = { W: number; px: Uint32Array }
type Cell = [number, number, number]

const canvas = (W: number): Canvas => ({ W, px: new Uint32Array(W * PH).fill(DEF) })

function put(c: Canvas, x: number, y: number, colour: number) {
  x = Math.round(x)
  y = Math.round(y)
  if (x >= 0 && x < c.W && y >= 0 && y < PH) c.px[y * c.W + x] = colour
}

function rect(c: Canvas, x: number, y: number, w: number, h: number, colour: number) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(c, x + i, y + j, colour)
}

function sprite(c: Canvas, art: string[], pal: Record<string, number>, x: number, y: number, flip = false) {
  const w = Math.max(...art.map(r => r.length))
  art.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && pal[ch] !== undefined && put(c, x + (flip ? w - 1 - i : i), y + j, pal[ch]!)))
}

/** A stable random number in [0, 1) for the same inputs. */
export function rnd(a: number, b = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

const mix = (a: number, b: number, k: number) => {
  k = Math.min(1, Math.max(0, k))
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k) << s
  return ch(16) | ch(8) | ch(0)
}

const wave = (t: number, period: number, phase = 0) => (Math.sin((t / period) * Math.PI * 2 + phase) + 1) / 2

// ------------------------------------------------------------------ Clawd

const CLAWD = 0xd97757
const SPARKS = [0xff4b3e, 0xffd54f, 0xdfe7ff, 0xff9e3d]
const CLAWD_ART = [
  '..CCCCCCCCCC..',
  '..CCECCCCECC..',
  '..CCECCCCECC..',
  '..CCCCCCCCCC..',
  '..CCCCCCCCCC..',
]
const LEGS = ['..C.C....C.C..', '...C.C..C.C...']
const CLAWD_TOP = GROUND - CLAWD_ART.length - 1
const START = 3

type Pose = 'stand' | 'cast' | 'walk' | 'pan' | 'hammer' | 'crank' | 'dance' | 'carry' | 'water' | 'umbrella' | 'float'
type Hands = { hand: [number, number]; tip: [number, number] | null }

/** Clawd (no hat here) at x, facing right (1) or left (-1), lifted `lift` pixels. */
function clawd(c: Canvas, t: number, pose: Pose, x: number, facing: 1 | -1 = 1, lift = 0): Hands {
  const f = Math.floor(t / 83)
  const blink = f % 47 < 2
  const ox = Math.round(x)
  const hop = pose === 'dance' ? -(Math.floor(t / 300) % 2) : 0
  const breathe = (pose === 'stand' || pose === 'cast') && Math.floor(t / 700) % 2 ? 1 : 0
  const y = CLAWD_TOP + hop + breathe - lift
  const at = (i: number) => (facing > 0 ? ox + i : ox + 13 - i)
  const P = (i: number, yy: number, colour: number) => put(c, at(i), yy, colour)
  const shade = mix(CLAWD, 0x000000, 0.18)
  const pal: Record<string, number> = { C: CLAWD, E: blink ? CLAWD : 0x1a1410 }
  CLAWD_ART.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && pal[ch] !== undefined && P(i, y + j, pal[ch]!)))
  for (let i = 2; i < 12; i++) P(i, y + 4, shade)
  const stepping = pose === 'walk' || pose === 'dance' || pose === 'carry' || pose === 'umbrella'
  ;[...LEGS[stepping ? (f >> 1) % 2 : 0]!].forEach((ch, i) => ch === 'C' && P(i, CLAWD_TOP + CLAWD_ART.length + hop - lift, shade))
  const armY = y + 2
  const beat = Math.floor(t / 300) % 2
  const left: [number, number][] = pose === 'dance' && beat === 0 ? [[1, armY - 1], [0, armY - 2]] : [[1, armY], [0, armY]]
  let right: [number, number][] = [[12, armY], [13, armY]]
  if (pose === 'cast' || (pose === 'dance' && beat === 1) || pose === 'umbrella') right = [[12, armY - 1], [13, armY - 2]]
  if (pose === 'hammer') right = t % 700 < 450 ? [[12, armY - 1], [13, armY - 2]] : [[12, armY], [13, armY + 1]]
  if (pose === 'crank') right = [[12, armY], [13 + Math.round(Math.cos(t / 250)), armY + Math.round(Math.sin(t / 250))]]
  if (pose === 'pan' || pose === 'water' || pose === 'carry') right = [[12, armY], [13, armY], [14, armY]]
  for (const [i, yy] of [...left, ...right]) P(i, yy, CLAWD)
  const [hi, hy] = right[right.length - 1]!
  const hand: [number, number] = [at(hi), hy]
  if (pose !== 'stand' && pose !== 'cast') return { hand, tip: null }
  const wood = 0x7a4a24
  P(hi + 1, hy - 1, wood); P(hi + 2, hy - 2, wood)
  const tip: [number, number] = [at(hi + 3), hy - 3]
  if (pose === 'cast' || f % 14 < 7) put(c, tip[0], tip[1], SPARKS[f % SPARKS.length]!)
  return { hand, tip }
}

// ------------------------------------------------------------------ walking routes

const WALK = 0.016  // pixels per ms

type Stop = { x: number; stay: number; pose: Pose }
type Where = { x: number; facing: 1 | -1; pose: Pose; stop: number; still: boolean; stayed: number }

/** Clawd's place on a looping route: stands at each stop for `stay` ms, walks between them. */
function along(stops: Stop[], ms: number, walkPose: Pose = 'walk'): Where {
  const legs = stops.map((s, i) => {
    const next = stops[(i + 1) % stops.length]!
    return { s, next, walk: Math.abs(next.x - s.x) / WALK }
  })
  const total = legs.reduce((sum, l) => sum + l.s.stay + l.walk, 0) || 1
  let t = ms % total
  for (const [i, l] of legs.entries()) {
    if (t < l.s.stay) return { x: l.s.x, facing: 1, pose: l.s.pose, stop: i, still: true, stayed: t }
    t -= l.s.stay
    if (t < l.walk) return { x: l.s.x + (l.next.x - l.s.x) * (t / l.walk), facing: l.next.x >= l.s.x ? 1 : -1, pose: walkPose, stop: i, still: false, stayed: 0 }
    t -= l.walk
  }
  return { x: stops[0]!.x, facing: 1, pose: stops[0]!.pose, stop: 0, still: true, stayed: 0 }
}

const spot = (W: number, k: number) => Math.round(Math.max(24, Math.min(W - 24, W * k)))

function ground(c: Canvas, colour = 0x2a2d36) {
  for (let x = 0; x < c.W; x++) put(c, x, GROUND, colour)
}

// ------------------------------------------------------------------ the acts

type Glyph = { x: number; row: number; ch: string; fg: number }
type Draw = (c: Canvas, m: Moment, glyphs: Glyph[]) => void

const cook: Draw = (c, m) => {
  const fire = spot(c.W, 0.35)
  const table = spot(c.W, 0.62)
  // campfire: logs and flames
  rect(c, fire - 3, GROUND - 1, 7, 1, 0x5a3a22)
  for (let i = -2; i <= 2; i++) {
    const h = 1 + Math.floor(rnd(i + 5, Math.floor(m.t / 110)) * 3)
    for (let k = 0; k < h; k++) put(c, fire + i, GROUND - 2 - k, k === h - 1 ? 0xffd54f : 0xff8c2a)
  }
  // prep table with a cutting board and veg
  rect(c, table - 4, GROUND - 5, 9, 1, 0x7a4a24); put(c, table - 3, GROUND - 4, 0x7a4a24); put(c, table + 3, GROUND - 4, 0x7a4a24)
  for (let k = 0; k < 3; k++) rect(c, table - 3 + k * 2, GROUND - 4, 1, 4, 0x7a4a24)
  put(c, table - 1, GROUND - 6, 0x6aa84f); put(c, table + 1, GROUND - 6, 0xd9534f)
  const at = along([{ x: fire - 19, stay: 3200, pose: 'pan' }, { x: table - 19, stay: 1600, pose: 'hammer' }], m.t)
  const { hand } = clawd(c, m.t, at.pose, at.x, at.facing)
  if (at.pose === 'pan' && at.still) {
    rect(c, hand[0] + 1, hand[1], 5, 1, 0x3a3a42)  // the pan over the fire
    const flip = (m.t % 1400) / 1400
    if (flip < 0.6) {
      const fx = hand[0] + 3
      const fy = hand[1] - Math.sin((flip / 0.6) * Math.PI) * 6
      put(c, fx, fy, 0xfff3d6); put(c, fx + 1, fy, 0xffd54f)
    } else { put(c, hand[0] + 3, hand[1] - 1, 0xfff3d6); put(c, hand[0] + 4, hand[1] - 1, 0xffd54f) }
    for (let k = 0; k < 3; k++) {  // steam
      const life = ((m.t / 120) + k * 5) % 8
      put(c, hand[0] + 2 + k, hand[1] - 2 - life, mix(0x9aa0b0, 0x1a1c24, life / 8))
    }
  }
  if (at.pose === 'hammer' && at.still && m.t % 700 > 450) put(c, table + (rnd(Math.floor(m.t / 700)) > 0.5 ? 1 : -1), GROUND - 7, 0x6aa84f)
  ground(c)
}

const think: Draw = (c, m, glyphs) => {
  const at = along([{ x: START, stay: 1800, pose: 'stand' }, { x: spot(c.W, 0.45), stay: 1800, pose: 'stand' }], m.t)
  clawd(c, m.t, at.pose, at.x, at.facing)
  const hx = Math.round(at.x) + (at.facing > 0 ? 13 : 0)
  const dir = at.facing
  put(c, hx + dir * 2, CLAWD_TOP + 1, 0xc8ccd8)
  put(c, hx + dir * 4, CLAWD_TOP - 1, 0xc8ccd8)
  // the thought: a cloud, and now and then a lit bulb
  const cx = hx + dir * 6 - (dir < 0 ? 8 : 0)
  const eureka = m.t % 6000 > 4800
  if (eureka) {
    sprite(c, ['.yyy.', 'yyyyy', 'yyyyy', '.yyy.', '.ggg.'], { y: 0xffe066, g: 0x9aa0b0 }, cx + 2, 0)
    for (const [dx, dy] of [[-1, 1], [7, 1], [3, -1]]) if (m.t % 300 < 150) put(c, cx + 2 + dx!, dy!, 0xfff6c8)
  } else {
    sprite(c, ['.ccccc.', 'ccccccc', '.ccccc.'], { c: 0x5e6478 }, cx, 0)
    const dots = Math.floor(m.t / 400) % 4
    for (let k = 0; k < dots; k++) put(c, cx + 2 + k * 2, 1, 0xe8e4c8)
  }
  ground(c)
  void glyphs
}

const dance: Draw = (c, m, glyphs) => {
  const moon = /moonwalk/i.test(m.word)
  const at = along([{ x: START, stay: 900, pose: 'dance' }, { x: spot(c.W, 0.5), stay: 900, pose: 'dance' }], m.t, 'dance')
  // moonwalking: facing away from where he glides
  clawd(c, m.t, 'dance', at.x, moon ? (at.facing > 0 ? -1 : 1) : at.facing)
  // the disco floor under him
  const beat = Math.floor(m.t / 300)
  for (let x = 0; x < c.W; x++) put(c, x, GROUND, Math.abs(x - at.x - 7) < 14 ? [0xd94f8a, 0x4fa3d9, 0xd9c84f, 0x6ad94f][(Math.floor(x / 3) + beat) % 4]! : 0x2a2d36)
  // notes float up from him
  for (let k = 0; k < 3; k++) {
    const life = ((m.t / 700) + k / 3) % 1
    glyphs.push({ x: Math.round(at.x) + 15 + k * 3 + Math.round(life * 4), row: Math.max(0, 3 - Math.floor(life * 4)), ch: k % 2 ? '♫' : '♪', fg: [0xd94f8a, 0x4fa3d9, 0xd9c84f][k]! })
  }
}

const build: Draw = (c, m) => {
  const anvil = spot(c.W, 0.35)
  const forge = spot(c.W, 0.65)
  sprite(c, ['aaaaaaa', '.aaaaa.', '..aaa..', '.aaaaa.'], { a: 0x55555f }, anvil - 3, GROUND - 4)
  const hot = mix(0xff4b3e, 0xffd54f, wave(m.t, 600))
  rect(c, anvil - 1, GROUND - 5, 4, 1, hot)
  // the forge: a brick hearth with a glow
  sprite(c, ['bbbbbbb', 'b.....b', 'b.....b', 'bbbbbbb'], { b: 0x7a3b2e }, forge - 3, GROUND - 4)
  for (let i = -2; i <= 2; i++) if (rnd(i + 9, Math.floor(m.t / 120)) > 0.3) put(c, forge + i, GROUND - 2 - Math.floor(rnd(i, Math.floor(m.t / 120)) * 2), rnd(i + 2, Math.floor(m.t / 120)) > 0.5 ? 0xff8c2a : 0xffd54f)
  const at = along([{ x: anvil - 17, stay: 3500, pose: 'hammer' }, { x: forge - 19, stay: 1200, pose: 'stand' }], m.t, 'carry')
  const { hand } = clawd(c, m.t, at.pose, at.x, at.facing)
  if (at.pose === 'hammer') {
    const down = m.t % 700 >= 450
    rect(c, hand[0] + 1, hand[1] - (down ? 0 : 2), 2, 2, 0x8a919b)  // hammer head
    if (down) for (let s = 0; s < 6; s++) {
      const k = ((m.t % 700) - 450) / 250
      put(c, anvil + Math.cos(s * 1.1) * k * 5, GROUND - 6 - Math.abs(Math.sin(s * 1.1)) * k * 4, s % 2 ? 0xffd54f : 0xff8c2a)
    }
  }
  if (at.pose === 'carry') rect(c, hand[0] + (at.facing > 0 ? 1 : -3), hand[1] - 1, 3, 1, hot)
  ground(c)
}

function gear(c: Canvas, cx: number, cy: number, r: number, angle: number, colour: number) {
  for (let a = 0; a < 24; a++) put(c, cx + Math.cos((a / 24) * Math.PI * 2) * r, cy + Math.sin((a / 24) * Math.PI * 2) * r, colour)
  for (let k = 0; k < 6; k++) {
    const a = angle + (k / 6) * Math.PI * 2
    put(c, cx + Math.cos(a) * (r + 1), cy + Math.sin(a) * (r + 1), colour)
  }
  put(c, cx, cy, mix(colour, 0xffffff, 0.4))
}

const compute: Draw = (c, m, glyphs) => {
  const g = spot(c.W, 0.35)
  const cab = spot(c.W, 0.65)
  gear(c, g, 9, 4, m.t / 400, 0x8a919b)
  gear(c, g + 8, 5, 2, -m.t / 200, 0xb08d57)
  // a cabinet of blinking lights
  rect(c, cab - 3, GROUND - 9, 7, 9, 0x2e3440)
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) if (rnd(i + j * 3, Math.floor(m.t / 250)) > 0.4) put(c, cab - 2 + i * 2, GROUND - 8 + j * 2, [0x6ad94f, 0xd9c84f, 0x4fa3d9][(i + j) % 3]!)
  const at = along([{ x: g - 19, stay: 3200, pose: 'crank' }, { x: cab - 19, stay: 1400, pose: 'stand' }], m.t)
  clawd(c, m.t, at.pose, at.x, at.facing)
  for (let k = 0; k < 3; k++) {
    const life = ((m.t / 900) + k / 3) % 1
    glyphs.push({ x: g - 2 + k * 3, row: Math.max(0, 3 - Math.floor(life * 4)), ch: rnd(k, Math.floor(m.t / 900)) > 0.5 ? '1' : '0', fg: mix(0x6ad94f, 0x1a1c24, life * 0.7) })
  }
  ground(c)
}

/** Walks the whole strip and wraps; quicker for scurrying, scampering and galloping. */
const stroll: Draw = (c, m) => {
  const fast = /scurr|scamper|gallop|pounc|zigzag/i.test(m.word) ? 2.2 : 1
  const span = c.W + 18
  const x = ((m.t * WALK * fast) % span) - 16
  const lift = /gallop/i.test(m.word) ? Math.floor(m.t / 200) % 2 : 0
  clawd(c, m.t, 'walk', x, 1, lift)
  for (let k = 0; k < c.W; k += 9) put(c, k + Math.floor(rnd(k, 1) * 5), GROUND - 1, 0x3d5a3a)  // grass tufts
  ground(c, 0x2d4a2b)
}

const herd: Draw = (c, m) => {
  const span = c.W + 60
  const x = ((m.t * WALK) % span) - 16
  clawd(c, m.t, 'walk', x)
  for (let k = 0; k < 3; k++) {  // sheep trot ahead of him
    const sx = x + 22 + k * 9
    const step = Math.floor(m.t / 160 + k) % 2
    sprite(c, ['.www.', 'wwwwk', '.wwww', step ? '.l.l.' : 'l...l'], { w: 0xeeeeee, k: 0x2a2a30, l: 0x2a2a30 }, sx, GROUND - 4)
  }
  ground(c, 0x2d4a2b)
}

const weather: Draw = (c, m) => {
  const at = along([{ x: START, stay: 1500, pose: 'umbrella' }, { x: spot(c.W, 0.55), stay: 1500, pose: 'umbrella' }], m.t, 'umbrella')
  clawd(c, m.t, at.pose, at.x, at.facing)
  const ux = Math.round(at.x) + 7
  // umbrella over the hat, and the cloud that follows him
  rect(c, ux - 6, CLAWD_TOP - 2, 13, 1, 0xd94f4f); rect(c, ux - 4, CLAWD_TOP - 3, 9, 1, 0xd94f4f)
  for (let j = CLAWD_TOP - 1; j < CLAWD_TOP + 7; j++) put(c, ux + 6, j, 0x5a3a22)
  const gusty = /gust|billow|swirl|whirl|unfurl/i.test(m.word)
  const storm = /thunder/i.test(m.word)
  const cloud = storm ? 0x3a3d4a : 0x6b7086
  if (!gusty) {
    rect(c, ux - 7, 0, 15, 1, cloud); rect(c, ux - 5, -1, 9, 1, cloud)
    for (let d = 0; d < 7; d++) {
      const fall = ((m.t / 60) + d * 7) % (CLAWD_TOP - 1)
      const rx = ux - 7 + d * 2
      if (Math.abs(rx - ux) > 6 || fall < CLAWD_TOP - 4) put(c, rx, 1 + fall, 0x7fa6d6)
    }
    for (let x = 0; x < c.W; x++) if (Math.abs(x - ux) > 7 && rnd(x, Math.floor(m.t / 70)) > 0.97) put(c, x, rnd(x, 3) * (GROUND - 1), 0x5c7ea8)
    if (storm && m.t % 3000 < 160) {
      let lx = ux + 14
      for (let y = 0; y < GROUND; y++) { put(c, lx, y, 0xfff6c8); lx += (y % 3) - 1 }
    }
  } else {
    for (let k = 0; k < 6; k++) {  // wind streaks
      const wx = (m.t / 25 + k * 37) % (c.W + 20) - 10
      rect(c, wx, 2 + k * 2, 5, 1, mix(0x9aa0b0, 0x1a1c24, 0.4))
    }
  }
  ground(c)
}

const garden: Draw = (c, m) => {
  const beds = [0.3, 0.45, 0.6].map(k => spot(c.W, k))
  for (const [i, bx] of beds.entries()) {  // plants grow, bloom, start over
    const grow = ((m.t / 4000) + i * 0.33) % 1
    const h = 1 + Math.floor(grow * 6)
    for (let k = 0; k < h; k++) put(c, bx, GROUND - 1 - k, 0x4f9a3a)
    if (h > 2) { put(c, bx - 1, GROUND - 3, 0x6ab84f); put(c, bx + 1, GROUND - 4, 0x6ab84f) }
    if (h > 5) sprite(c, ['.p.', 'pyp', '.p.'], { p: [0xd94f8a, 0xd9c84f, 0x9a6ad9][i]!, y: 0xffe066 }, bx - 1, GROUND - 1 - h - 2)
  }
  if (/nest|roost|incubat|hatch/i.test(m.word)) {  // a nest whose egg wobbles and hatches
    const nx = spot(c.W, 0.75)
    rect(c, nx - 3, GROUND - 2, 7, 2, 0x7a5a3a)
    const crack = m.t % 5000 > 3600
    if (crack) sprite(c, ['.y.', 'yyy'], { y: 0xffe066 }, nx - 1, GROUND - 5)
    else rect(c, nx - 1 + (Math.floor(m.t / 200) % 2), GROUND - 4, 2, 2, 0xf3efe0)
  }
  const stops = beds.map(bx => ({ x: bx - 18, stay: 1300, pose: 'water' as Pose }))
  const at = along(stops, m.t)
  const { hand } = clawd(c, m.t, at.pose, at.x, at.facing)
  if (at.pose === 'water' && at.still) {
    rect(c, hand[0] + 1, hand[1] - 1, 3, 2, 0x7f8fa6)  // the watering can
    for (let d = 0; d < 3; d++) put(c, hand[0] + 4, hand[1] + 1 + ((m.t / 80 + d * 2) % 4), 0x7fa6d6)
  }
  // a butterfly
  const bx = spot(c.W, 0.5) + Math.sin(m.t / 900) * 18
  const by = 4 + Math.sin(m.t / 300) * 2
  const flap = Math.floor(m.t / 120) % 2
  put(c, bx, by, 0x2a2a30); put(c, bx - 1, by - flap, 0xffb22e); put(c, bx + 1, by - flap, 0xffb22e)
  ground(c, 0x4a3a2a)
}

const space: Draw = (c, m, glyphs) => {
  const streak = /hyperspac|warp/i.test(m.word)
  for (let k = 0; k < c.W / 4; k++) {  // stars, streaking in hyperspace
    const sx = streak ? (rnd(k, 1) * c.W - (m.t / 8) * (0.5 + rnd(k, 2))) % c.W : rnd(k, 1) * c.W
    const x = sx < 0 ? sx + c.W : sx
    const y = rnd(k, 3) * GROUND
    put(c, x, y, 0xdfe7ff)
    if (streak) for (let tail = 1; tail < 4; tail++) put(c, x + tail, y, mix(0xdfe7ff, 0x1a1c24, tail / 4))
  }
  const at = along([{ x: START, stay: 1600, pose: 'stand' }, { x: spot(c.W, 0.5), stay: 1600, pose: 'stand' }], m.t, 'float')
  const lift = 2 + Math.round(wave(m.t, 1600) * 2)
  clawd(c, m.t, at.still ? 'cast' : 'float', at.x, at.facing, lift)
  // a little planet circles him
  const a = m.t / 500
  const px = at.x + 7 + Math.cos(a) * 11
  const py = 8 + Math.sin(a) * 4
  rect(c, px - 1, py - 1, 3, 3, 0x6a8fd9); put(c, px - 2, py, 0xd9c84f); put(c, px + 2, py, 0xd9c84f)
  void glyphs
}

const magic: Draw = (c, m) => {
  const target = spot(c.W, 0.4)
  const at = along([{ x: START, stay: 2600, pose: 'cast' }, { x: target - 26, stay: 2600, pose: 'cast' }], m.t)
  const { tip } = clawd(c, m.t, at.pose, at.x, at.facing)
  const cx = Math.round(at.x) + 26
  if (tip && at.still) {
    for (let k = 0; k < 10; k++) {  // a swirl of sparkles
      const a = m.t / 250 + k * 0.63
      const r = 1 + ((k + m.t / 200) % 10) * 0.45
      put(c, cx + Math.cos(a) * r * 1.4, 8 + Math.sin(a) * r * 0.7, SPARKS[k % SPARKS.length]!)
    }
    // a top hat; the rabbit pops out every few seconds
    rect(c, cx - 3, GROUND - 1, 7, 1, 0x4a4a5a); rect(c, cx - 2, GROUND - 4, 5, 3, 0x4a4a5a); rect(c, cx - 2, GROUND - 2, 5, 1, 0xae0001)
    if (at.stayed > 1400) sprite(c, ['w.w', 'w.w', 'www', 'wkw'], { w: 0xf4f4f4, k: 0xe88aa0 }, cx - 1, GROUND - 8)
  }
  ground(c)
}

const ACTS: Record<Act, Draw> = { cook, think, dance, build, compute, stroll, herd, weather, garden, space, magic }

// ------------------------------------------------------------------ cells

/** The frame's cells, packed for a Raster: columns * ROWS triplets of [codePoint, fg, bg]. */
export function frame(m: Moment, columns: number): Uint32Array {
  const c = canvas(columns)
  const glyphs: Glyph[] = []
  ACTS[actFor(m.word)](c, m, glyphs)
  const cells: Cell[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let x = 0; x < columns; x++) {
      const top = c.px[2 * r * columns + x]!
      const bot = c.px[(2 * r + 1) * columns + x]!
      if (top === DEF && bot === DEF) cells.push([0x20, DEF, DEF])
      else if (top === bot) cells.push([0x2588, top, DEF])
      else if (top === DEF) cells.push([0x2584, bot, DEF])
      else cells.push([0x2580, top, bot])
    }
  }
  for (const g of glyphs) {
    const i = g.row * columns + g.x
    if (g.x >= 0 && g.x < columns && g.row >= 0 && g.row < ROWS && cells[i]![0] === 0x20) cells[i] = [g.ch.codePointAt(0)!, g.fg, DEF]
  }
  const out = new Uint32Array(cells.length * 3)
  cells.forEach(([cp, fg, bg], i) => out.set([cp, fg, bg], i * 3))
  return out
}

/** Base64 of the cells, as RasterProps.cells wants them. */
export const encode = (cells: Uint32Array): string => new Uint8Array(cells.buffer).toBase64()

/** "12s", "1m 4s": the turn's time, as the spinner shows it. */
export const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
