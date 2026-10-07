// The desktop's banner: an animated SVG of Clawd casting the Killing Curse at
// one of six ranks. Each rank keeps every layer of the rank below and adds
// its own, and everything that can grow (reach, width, flash, shake, sparks,
// how long the jet holds) grows with the rank. It all moves by CSS and SMIL
// inside the SVG, so nothing redraws while it plays.
import { seeded, spellAt, SPELLS, type Spell } from './spells.ts'

export const SCENE_HEIGHT = 128

type Point = { x: number; y: number }

type Stage = {
  spell: Spell
  // 0 for rank I up to 5 for rank VI.
  level: number
  W: number
  // One cast, in seconds.
  D: number
  // The curse's room: from the wand tip to short of the title.
  zx0: number
  zx1: number
  rand: () => number
}

type Layer = {
  css: string
  defs: string
  back: string
  front: string
  flash: string
  eyes: boolean
  shake: boolean
}

const H = SCENE_HEIGHT

// Clawd as the logo draws him (▐▛███▜▌ / ▝▜█████▛▘ / ▘▘ ▝▝): quadrant pixels,
// twice as tall as wide.
const U = 6
const V = 12
const X0 = 26
const GROUND = 118
const Y0 = GROUND - 5 * V
const PIVOT: Point = { x: X0 + 16 * U - 2, y: Y0 + 2.5 * V }
const WAND = 50
const AIM = (-14 * Math.PI) / 180
// Where the wand tip points while the curse leaves it.
const TIP: Point = {
  x: PIVOT.x + WAND * Math.cos(AIM),
  y: PIVOT.y + WAND * Math.sin(AIM),
}

// Voldemort as the films show him, drawn about a head 58 tall: the bald egg of
// a skull, a deep V of robe, the black cloth going to smoke at the edges.
const HEAD =
  'M0 -28C14 -28 21 -18 21 -4C21 8 15 18 9 25C6 28 3 30 0 30C-3 30 -6 28 -9 25C-15 18 -21 8 -21 -4C-21 -18 -14 -28 0 -28Z'
const CHEST = 'M-7 22L-9 40L0 64L9 40L7 22Z'
const ROBE = 'M-8 34C-18 38 -34 42 -48 52C-62 63 -70 90 -78 150L78 150C70 90 62 63 48 52C34 42 18 38 8 34L0 64Z'

// Per rank, I to VI.
const REACH = [0, 0.45, 1, 1, 1, 1]
const BEAM = [0, 2.4, 5, 8, 11, 15]
const HOLD = [0.3, 0.4, 0.46, 0.52, 0.6, 0.86]
const FLASH = [0.05, 0.12, 0.26, 0.42, 0.6, 0.82]
const SHAKE = [0, 0, 0, 1.2, 2.2, 3.4]

const n = (value: number) => Math.round(value * 10) / 10

const times = <T>(count: number, make: (index: number) => T): T[] =>
  Array.from({ length: count }, (_, index) => make(index))

const pct = (fraction: number) => `${Math.round(fraction * 10000) / 100}%`

const delay = (seconds: number) => `animation-delay:${seconds.toFixed(3)}s`

// Shifts an animation so its 0% keyframe lands at fraction `q` of the cast.
const at = (q: number, D: number) => delay(-(1 - q) * D)

const pick = (list: readonly number[], level: number) => list[level] ?? list[list.length - 1] ?? 0

const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const textRoom = (W: number) => Math.round(Math.max(210, Math.min(310, W * 0.36)))

// The banner's width for the room it is given, in CSS pixels.
export function fitWidth(pixels: number): number {
  return Math.round(Math.max(420, Math.min(2400, pixels)))
}

// The banner's drawn box for `pixels` of room: the scene laid out at
// fitWidth(pixels), scaled down (viewBox kept) when the room is narrower than
// the scene's floor, so it never overflows its slot.
export function sceneBox(pixels: number): { width: number; height: number } {
  const W = fitWidth(pixels)
  const k = Math.min(1, pixels / W)

  return { width: Math.max(1, Math.round(W * k)), height: Math.max(1, Math.round(SCENE_HEIGHT * k)) }
}

function sparkle(x: number, y: number, r: number): string {
  const c = `${n(x)} ${n(y)}`

  return `M${n(x)} ${n(y - r)}Q${c} ${n(x + r)} ${n(y)}Q${c} ${n(x)} ${n(y + r)}Q${c} ${n(x - r)} ${n(y)}Q${c} ${n(x)} ${n(y - r)}Z`
}

// A crooked line from a to b, still at both ends: lightning.
function jagged(a: Point, b: Point, segments: number, amplitude: number, rand: () => number): Point[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1

  return times(segments + 1, i => {
    const t = i / segments
    const swing = (rand() - 0.5) * 2 * amplitude * Math.sin(Math.PI * t)

    return { x: a.x + dx * t - (dy / length) * swing, y: a.y + dy * t + (dx / length) * swing }
  })
}

const poly = (points: Point[]) => `M${points.map(p => `${n(p.x)} ${n(p.y)}`).join('L')}`

// Keyframes that flicker between `high` and `low` from `from` to `to`, dark outside.
function flicker(name: string, from: number, to: number, step: number, high: number, low: number): string {
  const frames = [`0%,${pct(from - 0.01)}{opacity:0}`]
  let isHigh = true

  for (let p = from; p < to; p += step) {
    frames.push(`${pct(p)}{opacity:${isHigh ? high : low}}`)
    isHigh = !isHigh
  }

  frames.push(`${pct(to + 0.02)},100%{opacity:0}`)

  return `@keyframes ${name}{${frames.join('')}}`
}

// A screen shake: still until `from`, a jitter until `to`, still again.
function shake(from: number, to: number, step: number, amplitude: number, rand: () => number): string {
  const frames = [`0%,${pct(from - 0.002)}{transform:translate(0,0)}`]

  for (let p = from; p < to; p += step) {
    const x = n((rand() - 0.5) * 2 * amplitude)
    const y = n((rand() - 0.5) * 1.4 * amplitude)
    frames.push(`${pct(p)}{transform:translate(${x}px,${y}px)}`)
  }

  frames.push(`${pct(to)},100%{transform:translate(0,0)}`)

  return `.shake{animation:shake var(--cast) linear infinite}@keyframes shake{${frames.join('')}}`
}

function clawdRects(x: number, y: number, u: number, v: number): string {
  // [column, row, width, height] in quadrant pixels: body, arms, four legs.
  const runs = [
    [2, 0, 12, 4],
    [0, 2, 16, 1],
    [3, 4, 1, 1],
    [5, 4, 1, 1],
    [10, 4, 1, 1],
    [12, 4, 1, 1],
  ] as const

  return runs
    .map(
      ([c, r, w, h]) =>
        `<rect x="${n(x + c * u)}" y="${n(y + r * v)}" width="${n(w * u)}" height="${n(h * v)}"/>`,
    )
    .join('')
}

function clawdEyes(x: number, y: number, u: number, v: number): string {
  return [4, 11]
    .map(c => `<rect x="${n(x + c * u)}" y="${n(y + v)}" width="${n(u)}" height="${n(v)}"/>`)
    .join('')
}

function wand(spell: Spell, isBone: boolean): string {
  const shaft = isBone
    ? `<path d="M-6 -2.6C-10.5 -3.4 -13.5 -0.4 -12.2 3.2C-11.4 5.2 -8.8 5.6 -8.2 3.6" fill="none" stroke="url(#bone)" stroke-width="2.6" stroke-linecap="round"/>
<polygon points="-7,-2.8 12,-2.3 ${WAND},-0.8 ${WAND},0.8 12,2.3 -7,2.8" fill="url(#bone)"/>
<g fill="#ddd5bf" stroke="#8d846c" stroke-width=".5"><ellipse cx="2.5" rx="2.4" ry="3.2"/><ellipse cx="10" rx="2" ry="2.8"/><ellipse cx="22" rx="1.4" ry="1.9"/></g>`
    : `<polygon points="-6,-2.7 12,-2.3 ${WAND},-0.9 ${WAND},0.9 12,2.3 -6,2.7" fill="url(#wood)"/>
<rect x="4" y="-3" width="1.6" height="6" fill="#2a160a"/><rect x="8.5" y="-3.1" width="2.2" height="6.2" fill="#2a160a"/>`

  return `<g transform="translate(${n(PIVOT.x)} ${n(PIVOT.y)})"><g class="wand">
${shaft}
<g transform="translate(${WAND} 0)"><circle r="9" fill="url(#tipglow)" class="tip"/><circle r="2.1" fill="${spell.core}"/></g>
</g></g>`
}

// Rank VI: Clawd turned Dark Lord. Pale green skin, a black robe with a deep V
// over the body and legs, red slit eyes, snake slits for a nose, a thin
// downturned mouth, smoke coming off the shoulders and Voldemort's own wand.
function darkClawd(st: Stage): string {
  const { spell, rand } = st
  const px = (c: number) => n(X0 + c * U)
  const py = (r: number) => n(Y0 + r * V)
  const mid = X0 + 8 * U
  const hemTop = Y0 + 4 * V
  const teeth = times(7, i => {
    const x = X0 + 1.4 * U + (i / 6) * 13.2 * U

    return `${n(x)},${n(GROUND + (i % 2 === 0 ? 1 : -5))}`
  }).reverse()
  const hem = `${px(1.6)},${n(hemTop - 1)} ${px(14.4)},${n(hemTop - 1)} ${teeth.join(' ')}`
  const robe = `<rect x="${px(2)}" y="${py(2)}" width="${12 * U}" height="${2 * V}"/>
<rect x="${px(0)}" y="${py(2)}" width="${2 * U}" height="${V}"/><rect x="${px(14)}" y="${py(2)}" width="${2 * U}" height="${V}"/>
<polygon points="${hem}"/>`
  const smoke = times(6, () => {
    const side = rand() < 0.5 ? -1 : 1
    const seconds = 2.2 + rand() * 2

    return `<ellipse cx="${n(mid + side * (20 + rand() * 30))}" cy="${n(Y0 + 2 * V + rand() * 2 * V)}" rx="${n(5 + rand() * 6)}" ry="${n(4 + rand() * 4)}" class="vsm" style="--x:${n(side * (8 + rand() * 14))}px;animation-duration:${n(seconds)}s;${delay(-rand() * seconds)}"/>`
  }).join('')

  return `<g class="hop">
<g class="lit"><ellipse cx="${mid}" cy="${n(Y0 + 2.2 * V)}" rx="70" ry="44" fill="${spell.hex}" fill-opacity=".35" filter="url(#b8)"/></g>
<ellipse cx="${mid}" cy="${n(Y0 + 2.2 * V)}" rx="58" ry="38" fill="${spell.hex}" fill-opacity=".14" filter="url(#b8)" class="aura"/>
<g filter="url(#b4)">${smoke}</g>
<g shape-rendering="crispEdges">
<g fill="url(#vskin)">${clawdRects(X0, Y0, U, V)}</g>
<g fill="url(#vcloak)" stroke="${spell.hex}" stroke-opacity=".55" stroke-width="1">${robe}</g>
<polygon points="${n(mid - 11)},${py(2)} ${n(mid)},${n(Y0 + 2.75 * V)} ${n(mid + 11)},${py(2)}" fill="url(#vskin)"/>
<path d="M${n(mid - 11)} ${py(2)}L${n(mid)} ${n(Y0 + 2.75 * V)}L${n(mid + 11)} ${py(2)}" stroke="#2c4a36" stroke-width="1.2" fill="none"/>
<rect x="${px(15)}" y="${py(2)}" width="${U}" height="${V}" fill="url(#vskin)"/>
<g fill="#050806" class="blink">${clawdEyes(X0, Y0, U, V)}</g>
</g>
<g fill="#ff2a2a" filter="url(#g2)" class="veye">${[4, 11].map(c => `<rect x="${n(X0 + c * U + U * 0.33)}" y="${n(Y0 + V * 0.18)}" width="${n(U * 0.34)}" height="${n(V * 0.64)}" rx=".6"/>`).join('')}</g>
<path d="M${n(mid - 3)} ${n(Y0 + V * 1.2)}l-1 4.2M${n(mid + 3)} ${n(Y0 + V * 1.2)}l1 4.2" stroke="#1d3a26" stroke-width="1.5" stroke-linecap="round"/>
<path d="M${n(mid - 9)} ${n(Y0 + V * 1.88)}Q${mid} ${n(Y0 + V * 1.72)} ${n(mid + 9)} ${n(Y0 + V * 1.88)}" stroke="#1d3a26" stroke-width="1.3" fill="none" stroke-linecap="round"/>
${wand(spell, true)}</g>`
}

function clawd(st: Stage, eyes: boolean): string {
  if (st.level === 5) {
    return darkClawd(st)
  }

  const body = clawdRects(X0, Y0, U, V)
  const eyeRects = clawdEyes(X0, Y0, U, V)
  const glowingEyes = eyes
    ? `<g class="lit"><g fill="${st.spell.hex}" filter="url(#g3)">${eyeRects}</g></g>`
    : ''

  return `<g class="hop"><g shape-rendering="crispEdges">
<g fill="#d97757">${body}</g>
<g class="lit"><g fill="url(#rim)">${body}</g></g>
<g fill="#1a1210" class="blink">${eyeRects}</g>
${glowingEyes}
</g>${wand(st.spell, false)}</g>`
}

function glowFilter(id: string, blur: number, W: number): string {
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${-W}" y="${-2 * H}" width="${3 * W}" height="${5 * H}"><feGaussianBlur stdDeviation="${blur}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
}

function blurFilter(id: string, blur: number, W: number): string {
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${-W}" y="${-2 * H}" width="${3 * W}" height="${5 * H}"><feGaussianBlur stdDeviation="${blur}"/></filter>`
}

function commonDefs(st: Stage): string {
  const { W, spell } = st

  return [
    `<clipPath id="card"><rect width="${W}" height="${H}" rx="12"/></clipPath>`,
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${spell.sky[0]}"/><stop offset="1" stop-color="${spell.sky[1]}"/></linearGradient>`,
    `<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${spell.glow}" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>`,
    `<radialGradient id="vig" cx=".4" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>`,
    `<linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".4" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>`,
    `<linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f5e34"/><stop offset=".5" stop-color="#5b361a"/><stop offset="1" stop-color="#2c180a"/></linearGradient>`,
    `<radialGradient id="tipglow"><stop offset="0" stop-color="${spell.core}"/><stop offset=".35" stop-color="${spell.hex}" stop-opacity=".85"/><stop offset="1" stop-color="${spell.glow}" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="rim" gradientUnits="userSpaceOnUse" cx="${n(TIP.x)}" cy="${n(TIP.y)}" r="130"><stop offset="0" stop-color="${spell.core}" stop-opacity=".95"/><stop offset=".4" stop-color="${spell.hex}" stop-opacity=".5"/><stop offset="1" stop-color="${spell.glow}" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="ttl" x1="0" y1="0" x2="0" y2="1"><stop offset=".15" stop-color="${spell.core}"/><stop offset="1" stop-color="${spell.hex}"/></linearGradient>`,
    `<linearGradient id="bone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3eedf"/><stop offset=".6" stop-color="#d2c8ad"/><stop offset="1" stop-color="#9c9278"/></linearGradient>`,
    `<linearGradient id="vskin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4f5dc"/><stop offset="1" stop-color="#6fbf86"/></linearGradient>`,
    `<linearGradient id="vcloak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#24452f"/><stop offset=".5" stop-color="#11241a"/><stop offset="1" stop-color="#08120c"/></linearGradient>`,
    `<radialGradient id="burst"><stop offset="0" stop-color="${spell.core}"/><stop offset=".3" stop-color="${spell.hex}" stop-opacity=".85"/><stop offset="1" stop-color="${spell.glow}" stop-opacity="0"/></radialGradient>`,
    glowFilter('g2', 2, W),
    glowFilter('g3', 3, W),
    glowFilter('g4', 4, W),
    blurFilter('b2', 2, W),
    blurFilter('b4', 4, W),
    blurFilter('b8', 8, W),
  ].join('')
}

// The wand's swing, Clawd's hop and the tip's charge: raised by 16%, flicked
// at 19%, aimed from 21.5% while the curse plays.
function commonCss(st: Stage): string {
  return `:root{--cast:${st.D}s}
.fb{transform-box:fill-box;transform-origin:center}
.hop{animation:hop var(--cast) ease-in-out infinite}
@keyframes hop{0%,11%{transform:translateY(0)}16%{transform:translateY(2px)}20.5%{transform:translateY(-3px)}28%,100%{transform:translateY(0)}}
.wand{animation:wand var(--cast) cubic-bezier(.3,.7,.3,1) infinite}
@keyframes wand{0%{transform:rotate(-24deg)}9%{transform:rotate(-30deg)}16%{transform:rotate(-66deg)}19%{transform:rotate(-4deg)}21.5%{transform:rotate(-14deg)}50%{transform:rotate(-12deg)}75%{transform:rotate(-15deg)}88%{transform:rotate(-14deg)}100%{transform:rotate(-24deg)}}
.tip{transform-box:fill-box;transform-origin:center;animation:tip var(--cast) ease-out infinite}
@keyframes tip{0%{transform:scale(1);opacity:.55}14%{transform:scale(1.7);opacity:1}19%{transform:scale(2.6);opacity:1}27%{transform:scale(1.3);opacity:.85}100%{transform:scale(1);opacity:.55}}
.lit{animation:lit var(--cast) linear infinite}
.blink{transform-box:fill-box;transform-origin:center;animation:blink 4.3s linear infinite}
@keyframes blink{0%,93%{transform:scaleY(1)}95%{transform:scaleY(.12)}97%,100%{transform:scaleY(1)}}
.cur{transform-box:fill-box;transform-origin:center;animation:pip 1.6s ease-in-out infinite}
@keyframes pip{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.25);opacity:1}}
.ttl{font-family:Luminari,'Apple Chancery',Trattatello,Palatino,Georgia,serif}
.sub{font-family:'SF Mono',Menlo,Monaco,monospace;font-size:10.5px;letter-spacing:1.4px;fill:rgba(255,255,255,.72)}
@keyframes spin{to{transform:rotate(360deg)}}
.bolts path{fill:none;stroke-linejoin:round;stroke-linecap:round}`
}

// Film lightning: a trunk that meanders every `spacing` pixels, with sharp
// kinks between, and forks.
function bolt(a: Point, b: Point, spacing: number, amplitude: number, rand: () => number): Point[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const coarse = jagged(a, b, Math.max(3, Math.round(length / spacing)), amplitude, rand)
  const fine: Point[] = [a]

  for (let i = 1; i < coarse.length; i++) {
    fine.push(...jagged(coarse[i - 1] ?? a, coarse[i] ?? b, 4, amplitude * 0.4, rand).slice(1))
  }

  return fine
}

function forksOf(trunk: Point[], count: number, reach: number, amplitude: number, rand: () => number): string {
  const first = trunk[0] ?? { x: 0, y: 0 }
  const last = trunk[trunk.length - 1] ?? first
  const heading = Math.atan2(last.y - first.y, last.x - first.x)

  return times(count, () => {
    const from = trunk[1 + Math.floor(rand() * Math.max(1, trunk.length - 3))] ?? first
    const turn = heading + (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.75)
    const length = reach * (0.4 + rand() * 0.6)
    const to = { x: from.x + Math.cos(turn) * length, y: from.y + Math.sin(turn) * length }

    return poly(jagged(from, to, 3 + Math.floor(rand() * 3), amplitude, rand))
  }).join('')
}

// The Dark Lord behind the curse, more of him at every rank: at I only his
// eyes, at VI a face the flashes keep lighting green.
function voldemort(st: Stage): { css: string; defs: string; back: string } {
  const { rand, spell, zx0, zx1, level: L } = st
  const x = zx0 + (zx1 - zx0) * 0.55
  const place = `translate(${n(x)} 33) scale(.95)`
  const presence = [0.16, 0.24, 0.34, 0.46, 0.58, 0.7][L] ?? 0.4
  const glare = [0.45, 0.55, 0.7, 0.85, 1, 1][L] ?? 1
  const reveal = [0, 0, 0.22, 0.32, 0.42, 0.55][L] ?? 0
  const smoke = times(2 + 2 * L, () => {
    const side = rand() < 0.5 ? -1 : 1
    const seconds = 3 + rand() * 3

    return `<ellipse cx="${n(side * (34 + rand() * 40))}" cy="${n(50 + rand() * 70)}" rx="${n(10 + rand() * 14)}" ry="${n(6 + rand() * 8)}" class="vsm" style="--x:${n(side * (14 + rand() * 26))}px;animation-duration:${n(seconds)}s;${delay(-rand() * seconds)}"/>`
  }).join('')
  const eye = (side: number) =>
    `<ellipse cx="${side * 8.5}" cy="-2.6" rx="3.2" ry="1.1" transform="rotate(${-side * 14} ${side * 8.5} -2.6)"/>`
  const socket = (side: number) =>
    `<ellipse cx="${side * 8.5}" cy="-3" rx="7" ry="4.4" transform="rotate(${-side * 14} ${side * 8.5} -3)"/>`
  const face = `<path d="${HEAD}" fill="url(#vface)"/>
<path d="M-16 -9Q-8 -12 -2 -6M16 -9Q8 -12 2 -6" stroke="#000" stroke-opacity=".25" stroke-width="2" fill="none"/>
<g fill="#121815" fill-opacity=".85">${socket(-1)}${socket(1)}</g>
<g fill="#000" fill-opacity=".18"><ellipse cx="-13" cy="10" rx="5.5" ry="9"/><ellipse cx="13" cy="10" rx="5.5" ry="9"/></g>
<path d="M-1.6 -1L-2.4 7.5M1.6 -1L2.4 7.5" stroke="#1b221e" stroke-opacity=".3" stroke-width=".8" fill="none"/>
<path d="M-3.4 8C-4.6 10.2 -4.8 12 -3.8 13.6M3.4 8C4.6 10.2 4.8 12 3.8 13.6" stroke="#1b221e" stroke-width="1.5" fill="none" stroke-linecap="round"/>
<path d="M-9 21Q0 18.6 9 21" stroke="#1b221e" stroke-width="1.4" fill="none" stroke-linecap="round"/>
<path d="M-5 23.4Q0 22.4 5 23.4" stroke="#1b221e" stroke-opacity=".35" stroke-width=".9" fill="none"/>
<ellipse cx="-6" cy="-19" rx="8" ry="4.5" fill="#fff" fill-opacity=".14"/>`

  return {
    css: `.vbob{animation:vbob 6s ease-in-out infinite alternate}
@keyframes vbob{from{transform:translateY(-2px)}to{transform:translateY(3px)}}
.vsm{fill:#000;fill-opacity:.55;animation:vsm 4s ease-out infinite}
@keyframes vsm{0%{transform:translate(0,0) scale(.7);opacity:0}25%{opacity:1}100%{transform:translate(var(--x),-18px) scale(1.6);opacity:0}}
.veye{animation:veye 3s ease-in-out infinite alternate}
.aura{transform-box:fill-box;transform-origin:center;animation:aura 1.4s ease-in-out infinite alternate}
@keyframes aura{from{transform:scale(.9);opacity:.6}to{transform:scale(1.12);opacity:1}}
@keyframes veye{from{opacity:${n(glare * 0.6)}}to{opacity:${glare}}}`,
    defs: `<linearGradient id="vface" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9e3da"/><stop offset=".55" stop-color="#aab6ac"/><stop offset="1" stop-color="#5c6a60"/></linearGradient>
<linearGradient id="vrobe" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0d1d13"/><stop offset=".4" stop-color="#050a07"/><stop offset="1" stop-color="#020403"/></linearGradient>
<radialGradient id="vaura"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`,
    back: `<g transform="${place}"><g class="vbob">
<ellipse cx="0" cy="30" rx="120" ry="80" fill="url(#vaura)" fill-opacity="${n(0.3 + 0.12 * L)}"/>
<g opacity="${presence}">
<path d="${CHEST}" fill="#8f9c92"/>
<path d="${ROBE}" fill="url(#vrobe)"/>
<path d="M-8 34L0 64L8 34M-30 48C-36 70 -40 100 -44 150M30 48C36 70 40 100 44 150" stroke="#1c2a22" stroke-width="1.3" fill="none"/>
<path d="${ROBE}" fill="none" stroke="${spell.hex}" stroke-opacity="${n(0.12 + 0.05 * L)}" stroke-width="1.5" filter="url(#b2)"/>
${face}
</g>
${reveal > 0 ? `<g class="lit"><path d="${HEAD}" fill="${spell.hex}" fill-opacity="${reveal}" filter="url(#b2)"/></g>` : ''}
<g fill="#ff3b30" filter="url(#g2)" class="veye">${eye(-1)}${eye(1)}</g>
<g filter="url(#b4)">${smoke}</g>
</g></g>`,
  }
}

// The curse, rank by rank. `L` is 0 for rank I; every `L >= k` block is a
// layer that rank k+1 adds and every rank above keeps.
function avada(st: Stage): Layer {
  const { W, D, rand, spell, zx0, zx1, level: L } = st
  const Z = zx1 - zx0
  const T = { x: TIP.x + (zx1 - 8 - TIP.x) * pick(REACH, L), y: TIP.y - 2 }
  const body = `M${n(TIP.x)} ${n(TIP.y)}Q${n((TIP.x + T.x) / 2)} ${n(TIP.y - 7)} ${n(T.x)} ${n(T.y)}`
  const width = pick(BEAM, L)
  const hold = pick(HOLD, L)
  const flash = pick(FLASH, L)
  const lord = voldemort(st)
  const css: string[] = [lord.css]
  const back: string[] = [lord.back]
  const front: string[] = []
  const flashes: string[] = []

  // How bright the scene is lit: a pulse at the cast, held as long as the jet.
  css.push(
    L === 5
      ? flicker('lit', 0.2, hold, 0.035, 1, 0.7)
      : `@keyframes lit{0%,20%{opacity:0}22%{opacity:${n(0.4 + 0.12 * L)}}27%{opacity:${n(0.2 + 0.08 * L)}}${pct(hold)}{opacity:${n(0.15 + 0.06 * L)}}${pct(hold + 0.06)},100%{opacity:0}}`,
  )

  // I: green sparks spit from the tip, and the curse fizzles.
  const wisps = times(2 + 2 * L, k => `<circle r="${n(2 + rand() * (2 + L * 0.6))}" class="wisp fb" style="${delay(-k * 0.29)}"/>`).join('')
  const fizzle = times(
    6 + 3 * L,
    () =>
      `<g transform="rotate(${n(-120 + rand() * 240)})"><line x1="3" y1="0" x2="${n(6 + rand() * 5)}" y2="0" class="fiz" style="--d:${n(8 + rand() * (10 + 4 * L))}px;${at(0.195 + rand() * 0.02, D)}"/></g>`,
  ).join('')
  css.push(`.wisp{animation:wisp ${n(2.6 - 0.2 * L)}s ease-out infinite}
@keyframes wisp{0%{transform:translate(0,0) scale(.6);opacity:0}15%{opacity:.55}100%{transform:translate(8px,-${24 + 4 * L}px) scale(1.9);opacity:0}}
.fiz{animation:fiz var(--cast) ease-out infinite}
@keyframes fiz{0%{transform:translateX(0);opacity:1}10%,100%{transform:translateX(var(--d));opacity:0}}
.fl{animation:fl var(--cast) linear infinite}`)
  front.push(`<g transform="translate(${n(TIP.x)} ${n(TIP.y)})"><g fill="${spell.hex}" filter="url(#b2)">${wisps}</g><g stroke="${spell.core}" stroke-width="1.4" stroke-linecap="round">${fizzle}</g></g>`)

  // II: the jet, a crooked bolt that never holds one shape; full length from
  // III, and with every rank thicker, more crooked, more forked, faster.
  if (L >= 1) {
    const variants = L + 2
    const period = n(0.36 - 0.03 * L)
    const spacing = 60 - 6 * L
    const amplitude = 3 + 2.4 * L
    const trunk = width * 0.6
    const reveal = pct(L === 1 ? 0.24 : 0.225)
    css.push(`.awin{animation:awin var(--cast) linear infinite}
@keyframes awin{0%,19%{opacity:0}20%{opacity:1}${pct(hold - 0.05)}{opacity:1}${pct(hold)},100%{opacity:0}}
.after{animation:after var(--cast) linear infinite}
@keyframes after{0%,22.5%{opacity:0}23%{opacity:1}${pct(hold - 0.05)}{opacity:1}${pct(hold)},100%{opacity:0}}
.abeam{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100 100;animation:abeam var(--cast) cubic-bezier(.2,.8,.3,1) infinite}
@keyframes abeam{0%,19%{stroke-dashoffset:100}${reveal},100%{stroke-dashoffset:0}}
.bv{animation:bv ${period}s steps(1) infinite}
@keyframes bv{0%{opacity:1}${pct(1 / variants)},100%{opacity:0}}
${L >= 4 ? `.abeam.throb{animation:abeam var(--cast) cubic-bezier(.2,.8,.3,1) infinite,throb .11s ease-in-out infinite alternate}@keyframes throb{from{stroke-width:${n(trunk)}}to{stroke-width:${n(trunk * 1.5)}}}` : ''}`)

    const jets = times(variants, k => {
      const points = bolt(TIP, T, spacing, amplitude, rand)
      const d = poly(points)
      const forks = forksOf(points, L === 1 ? 1 : 2 * L, 10 + 7 * L, 3 + L, rand)

      return `<g class="bv" style="${delay((-k * period) / variants)}">
<path d="${d}" pathLength="100" stroke="${spell.glow}" stroke-width="${n(trunk * 2.4)}" stroke-opacity=".55" filter="url(#b4)" class="abeam"/>
<path d="${d}" pathLength="100" stroke="${spell.hex}" stroke-width="${n(trunk)}" class="abeam${L >= 4 ? ' throb' : ''}"/>
<path d="${d}" pathLength="100" stroke="${spell.core}" stroke-width="${n(Math.max(1, trunk * 0.45))}" class="abeam"/>
<g class="after bolts"><path d="${forks}" stroke="${spell.hex}" stroke-width="${n(Math.max(0.8, trunk * 0.35))}" filter="url(#g2)"/></g>
</g>`
    }).join('')
    front.push(`<g class="awin">
<path d="${body}" pathLength="100" stroke="${spell.glow}" stroke-width="${n(width * 2.6)}" stroke-opacity="${n(0.18 + 0.04 * L)}" filter="url(#b8)" class="abeam"/>
${jets}
</g>`)

    const sparks = times(
      4 * L,
      () =>
        `<g transform="rotate(${n(rand() * 360)})"><line x1="6" y1="0" x2="${n(10 + rand() * (4 + 2 * L))}" y2="0" class="spk" style="--d:${n(16 + rand() * (10 + 12 * L))}px;${at(0.225 + rand() * 0.04, D)}"/></g>`,
    ).join('')
    css.push(`.imp{animation:imp var(--cast) ease-out infinite}
@keyframes imp{0%,22%{transform:scale(.2);opacity:0}23.5%{transform:scale(1.3);opacity:1}${pct(hold - 0.05)}{transform:scale(1);opacity:.8}${pct(hold + 0.04)},100%{transform:scale(1.6);opacity:0}}
.spk{animation:spk var(--cast) ease-out infinite}
@keyframes spk{0%{transform:translateX(0);opacity:1}18%,100%{transform:translateX(var(--d));opacity:0}}`)
    front.push(`<g transform="translate(${n(T.x)} ${n(T.y)})"><circle r="${12 + 7 * L}" fill="url(#burst)" class="imp fb"/><g stroke="${spell.core}" stroke-width="1.8" stroke-linecap="round">${sparks}</g></g>`)
  }

  // III: smoke, shockwave rings, a flash over everything.
  if (L >= 2) {
    const smoke = times(
      3 + L,
      () =>
        `<ellipse cx="${n((rand() - 0.5) * Z)}" cy="${n((rand() - 0.5) * 70)}" rx="${n(40 + rand() * 60)}" ry="${n(9 + rand() * 12)}" transform="rotate(${n(rand() * 180)})" fill="#0f7a38" fill-opacity="${n(0.1 + 0.04 * L)}" filter="url(#b8)"/>`,
    ).join('')
    const rings = times(L - 1, k => `<circle r="12" stroke="${spell.hex}" stroke-width="${n(1.6 + 0.4 * L)}" class="ring fb" style="${at(0.225 + k * 0.035, D)}"/>`).join('')
    css.push(`.swirl{animation:spin ${60 - 6 * L}s linear infinite}
.ring{fill:none;animation:ring var(--cast) ease-out infinite}
@keyframes ring{0%{transform:scale(.2);opacity:1}22%,100%{transform:scale(${2 + L});opacity:0}}`)
    back.push(`<g transform="translate(${n(zx0 + Z / 2)} 64)"><g class="swirl">${smoke}</g></g>`)
    front.push(`<g transform="translate(${n(T.x)} ${n(T.y)})">${rings}</g>`)
  }

  css.push(
    L === 5
      ? flicker('fl', 0.21, hold, 0.045, flash, 0.08)
      : `@keyframes fl{0%,20.5%{opacity:0}22%{opacity:${flash}}25%{opacity:${n(flash * 0.15)}}${L >= 3 ? `29%{opacity:${n(flash * 0.6)}}34%{opacity:.04}` : ''}40%,100%{opacity:0}}`,
  )
  flashes.push(`<rect width="${W}" height="${H}" fill="#2bff66" class="fl"/>`)

  // IV: arcs that wrap the jet, green eyes, a shake. More arcs at V and VI.
  if (L >= 3) {
    const arcs = times(
      L - 2,
      k =>
        `<path d="${poly(bolt(TIP, T, 40, 9 + 3 * L, rand))}" stroke="${k === 0 ? spell.core : spell.hex}" stroke-width="${n(0.9 + 0.2 * L)}" filter="url(#g2)" class="arc" style="${delay(-k * 0.09)}"/>`,
    ).join('')
    css.push(`.arc{animation:arc .27s steps(1) infinite}
@keyframes arc{0%{opacity:1}45%,100%{opacity:0}}`)
    front.push(`<g class="after bolts">${arcs}</g>`)
    css.push(shake(0.205, L === 5 ? hold : 0.32, 0.012, pick(SHAKE, L), rand))
  }

  // V: forked lightning out of the sky, four strikes at VI.
  if (L >= 4) {
    const strikes = L === 5 ? 4 : 1
    times(strikes, k => {
      const x = zx0 + Z * (0.15 + rand() * 0.75)
      const points = bolt({ x: x + (rand() - 0.5) * 60, y: -6 }, { x, y: GROUND - rand() * 30 }, 30, 9, rand)
      const d = poly(points) + forksOf(points, 3, 26, 4, rand)
      const q = 0.215 + k * ((hold - 0.27) / Math.max(1, strikes))
      css.push(`@keyframes strike${k}{0%{opacity:1}1.2%{opacity:.15}2.4%{opacity:.9}4.5%,100%{opacity:0}}.strike${k}{animation:strike${k} var(--cast) linear infinite}`)
      back.push(`<g class="strike${k} bolts" style="${at(q, D)}"><path d="${d}" stroke="${spell.hex}" stroke-width="5" stroke-opacity=".5" filter="url(#b4)"/><path d="${d}" stroke="${spell.core}" stroke-width="1.5"/></g>`)
    })
  }

  // VI: it holds, and the whole bar burns at the edges.
  if (L >= 5) {
    flashes.push(`<g class="lit"><rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="11" fill="none" stroke="${spell.hex}" stroke-width="5" filter="url(#b4)"/></g>`)
    back.push(`<g class="lit"><ellipse cx="${n(T.x)}" cy="${n(T.y)}" rx="${n(Z * 0.6)}" ry="70" fill="url(#burst)" fill-opacity=".35"/></g>`)
  }

  return {
    css: css.join('\n'),
    defs: lord.defs,
    back: back.join('\n'),
    front: front.join('\n'),
    flash: flashes.join('\n'),
    eyes: L >= 3,
    shake: L >= 3,
  }
}

function title(st: Stage, detail: string, layer: Layer): string {
  const { W, spell, level } = st
  const right = W - 22
  const room = textRoom(W)
  const name = `${spell.name} ${spell.rank}`
  const size = n(Math.max(15, Math.min(34, (room - 8) / (name.length * 0.56))))
  const gap = 17
  const pips = SPELLS.map((other, i) => {
    const x = right - 6 - (SPELLS.length - 1 - i) * gap

    if (i > level) {
      return `<path d="${sparkle(x, 99, 5.6)}" fill="#fff" fill-opacity=".05" stroke="#fff" stroke-opacity=".28" stroke-width=".8"/>`
    }

    return `<path d="${sparkle(x, 99, i === level ? 7.6 : 5.6)}" fill="${other.hex}" filter="url(#g2)"${i === level ? ' class="cur"' : ''}/>`
  }).join('')
  const words = `x="${right}" y="54" text-anchor="end" font-size="${size}"`

  return `<g${layer.shake ? ' class="shake"' : ''}>
<text ${words} class="ttl" fill="${spell.glow}" fill-opacity="${n(0.3 + 0.08 * level)}" filter="url(#b4)">${escape(name)}</text>
<g class="lit"><text ${words} class="ttl" fill="${spell.core}" filter="url(#b8)">${escape(name)}</text></g>
<text ${words} class="ttl" fill="url(#ttl)" stroke="#000" stroke-opacity=".55" stroke-width="3" paint-order="stroke">${escape(name)}</text>
<text x="${right}" y="78" text-anchor="end" class="sub">${escape(detail)}</text>
${pips}
</g>`
}

// `width` is the room in CSS pixels; the banner is SCENE_HEIGHT tall, scaled
// down only when the room is narrower than its 420 px floor.
export function scene(tier: number, options: { width: number; detail: string }): string {
  const spell = spellAt(tier)
  const W = fitWidth(options.width)
  const box = sceneBox(options.width)
  const room = textRoom(W)
  const st: Stage = {
    spell,
    level: SPELLS.indexOf(spell),
    W,
    D: spell.seconds,
    zx0: TIP.x + 14,
    zx1: W - room - 18,
    rand: seeded(tier * 7919 + W),
  }
  const layer = avada(st)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="0 0 ${W} ${H}">
<defs>${commonDefs(st)}${layer.defs}<style>${commonCss(st)}
${layer.css}</style></defs>
<g clip-path="url(#card)">
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<g${layer.shake ? ' class="shake"' : ''}>
${layer.back}
<rect y="${GROUND}" width="${W}" height="${H - GROUND}" fill="url(#ground)"/>
<g class="lit"><ellipse cx="${n(TIP.x + 30)}" cy="${GROUND + 2}" rx="150" ry="10" fill="${spell.glow}" fill-opacity=".5" filter="url(#b4)"/></g>
<ellipse cx="${X0 + 8 * U}" cy="${GROUND + 1}" rx="46" ry="3.5" fill="#000" fill-opacity=".6"/>
${clawd(st, layer.eyes)}
${layer.front}
</g>
${layer.flash}
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<rect x="${W - room - 46}" width="${room + 46}" height="${H}" fill="url(#shade)"/>
${title(st, options.detail, layer)}
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="none" stroke="${spell.hex}" stroke-opacity="${n(0.15 + 0.07 * st.level)}"/>
</g>
</svg>`
}
