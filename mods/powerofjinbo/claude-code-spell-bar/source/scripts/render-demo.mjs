#!/usr/bin/env node
// Renders the README's demo assets from the plugin's own drawing code:
//
//   docs/demo.gif      the desktop banner (hooks/scene.ts) at all six ranks,
//                      stacked rank I on top, animated on one shared clock
//   docs/terminal.png  the terminal band (hooks/pixels.ts) at all six ranks,
//                      caught mid-curse, drawn cell by cell
//
// usage: node scripts/render-demo.mjs [gif|terminal]... [--keep]
//
// Needs node 22.18+ (it imports the plugin's TypeScript directly), Google
// Chrome (set CHROME to use another binary), perl, and python3 with Pillow
// (set PYTHON to use another interpreter). --keep leaves the temporary
// directory behind and prints where it is.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { frame, RASTER_ROWS } from '../plugins/spell-bar/hooks/pixels.ts'
import { scene, SCENE_HEIGHT } from '../plugins/spell-bar/hooks/scene.ts'
import { levelOf, SPELLS } from '../plugins/spell-bar/hooks/spells.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(ROOT, 'docs')
const COMPOSE = join(ROOT, 'scripts', 'compose-demo.py')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PYTHON = process.env.PYTHON ?? 'python3'

// What the detail line under each title says.
const MODEL = 'claude-opus-5-5'
const detailOf = spell => `${levelOf(spell)} · ${MODEL}`

const GIF = {
  out: join(DOCS, 'demo.gif'),
  width: 800,
  fps: 12,
  background: '#0d1117',
  padding: 12,
  gap: 10,
  // Copies of one banner per row of a sheet.
  columns: 4,
  // The tick of the shared clock the GIF starts on. Six casts of different
  // lengths never line up again, so the loop cuts every rank somewhere; from
  // tick 28 (2.33 s) the cut lands while I to IV rest, VI is a whole cast
  // round, and V only loses the last of its afterglow.
  startTick: 28,
  maxBytes: 8_000_000,
}

const TERMINAL = {
  out: join(DOCS, 'terminal.png'),
  // The band's own width on a wide terminal (register.tsx caps it at 56).
  columns: 56,
  // One cell, in CSS pixels: a half-block pixel comes out square.
  cellWidth: 9,
  cellHeight: 18,
  scale: 2,
  background: '#0e1116',
  foreground: '#d5dae1',
  // When each rank is caught, in ticks of the band's 12 fps clock: just after
  // the curse leaves the wand, at V and VI with a strike out of the sky, and
  // at VI between two flashes of its strobe, so Clawd stays in sight.
  ticks: [10, 9, 10, 10, 11, 14],
  fps: 12,
}

// A hard cap on one Chrome run. Chrome keeps running while a page animates,
// so the run is ended as soon as the screenshot is on disk; the alarm is the
// fallback.
const CHROME_SECONDS = 60

const escapeHtml = text =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Copies of one SVG in one page share a document, so every id and every
// reference to one gets a suffix per copy.
function isolate(svg, tag) {
  return svg
    .replace(/(\s)id="([^"]+)"/g, (_, space, id) => `${space}id="${id}-${tag}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${id}-${tag})`)
    .replace(/href="#([^"]+)"/g, (_, id) => `href="#${id}-${tag}"`)
}

// Stops every animation inside each [data-t] box at its own time, in seconds:
// SMIL through the SVG's clock, CSS through the Web Animations API.
const FREEZE = `<script>
for (const box of document.querySelectorAll('[data-t]')) {
  const t = Number(box.dataset.t)
  for (const svg of box.querySelectorAll('svg')) {
    svg.pauseAnimations()
    svg.setCurrentTime(t)
  }
  for (const a of box.getAnimations({ subtree: true })) {
    a.pause()
    a.currentTime = t * 1000
  }
}
</script>`

// One sheet: `times.length` copies of `svg` in a grid, each frozen at its time.
// A banner's CSS lives in the page, so a sheet only ever holds one rank.
function sheetPage(svg, times, width, height, columns, background) {
  const cells = times
    .map((t, k) => `<div class="cell" data-t="${t.toFixed(5)}">${isolate(svg, `c${k}`)}</div>`)
    .join('\n')

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:${background}}
.sheet{display:grid;grid-template-columns:repeat(${columns},${width}px);grid-auto-rows:${height}px}
.cell{width:${width}px;height:${height}px;overflow:hidden}
.cell>svg{display:block}
</style></head><body><div class="sheet">
${cells}
</div>
${FREEZE}
</body></html>`
}

// Block and quadrant glyphs as the four quarters of a cell they fill
// (1 upper left, 2 upper right, 4 lower left, 8 lower right): terminals draw
// these as shapes, not text, so neighbouring cells meet without seams.
const QUARTERS = new Map([
  [0x20, 0],
  [0x2580, 3],
  [0x2584, 12],
  [0x2588, 15],
  [0x258c, 5],
  [0x2590, 10],
  [0x2596, 4],
  [0x2597, 8],
  [0x2598, 1],
  [0x2599, 13],
  [0x259a, 9],
  [0x259b, 7],
  [0x259c, 11],
  [0x259d, 2],
  [0x259e, 6],
  [0x259f, 14],
])

const css = value => `#${(value & 0xffffff).toString(16).padStart(6, '0')}`

// Raster cells as hooks/pixels.ts packs them: base64 of little-endian u32
// triplets [code point, foreground 0xRRGGBB, background].
function cellsOf(packed, columns, rows) {
  const bytes = Buffer.from(packed, 'base64')

  if (bytes.length !== columns * rows * 12) {
    throw new Error(`expected ${columns * rows * 12} bytes of cells, got ${bytes.length}`)
  }

  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: columns }, (_, x) => {
      const i = (r * columns + x) * 12

      return { glyph: bytes.readUInt32LE(i), fg: bytes.readUInt32LE(i + 4), bg: bytes.readUInt32LE(i + 8) }
    }),
  )
}

function cellHtml({ glyph, fg, bg }) {
  const mask = QUARTERS.get(glyph)

  if (mask === undefined) {
    return `<i style="color:${css(fg)};background:${css(bg)}">${escapeHtml(String.fromCodePoint(glyph))}</i>`
  }

  const at = bit => css(mask & bit ? fg : bg)
  const top = `linear-gradient(90deg,${at(1)} 50%,${at(2)} 50%) top/100% 50% no-repeat`
  const bottom = `linear-gradient(90deg,${at(4)} 50%,${at(8)} 50%) bottom/100% 50% no-repeat`

  return `<i style="background:${top},${bottom}"></i>`
}

// The terminal band as register.tsx lays it out on a wide terminal: the
// Raster, two columns of gap, then the title, the detail and the pips.
function terminalPage() {
  const { columns, cellWidth: w, cellHeight: h, background, foreground } = TERMINAL
  const bands = SPELLS.map((spell, tier) => {
    const time = TERMINAL.ticks[tier] / TERMINAL.fps
    const rows = cellsOf(frame(tier, columns, RASTER_ROWS, time), columns, RASTER_ROWS)
      .map(row => `<div class="row">${row.map(cellHtml).join('')}</div>`)
      .join('')
    const pips = SPELLS.map((other, i) =>
      i <= tier ? `<span style="color:${other.hex}">✦</span>` : '<span style="color:#4a4a4a">✧</span>',
    ).join('')

    return `<div class="band">
<div class="raster">${rows}</div>
<div class="text">
<div class="title" style="color:${spell.hex}">${escapeHtml(`${spell.name} ${spell.rank}`)}</div>
<div class="dim">${escapeHtml(detailOf(spell))}</div>
<div>${pips}</div>
</div>
</div>`
  }).join('\n')

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:${background}}
.screen{display:inline-flex;flex-direction:column;gap:${h}px;padding:${h}px ${2 * w}px;background:${background};color:${foreground};font:15px/${h}px Menlo,monospace;white-space:nowrap}
.band{display:flex;gap:${2 * w}px}
.row{display:flex;height:${h}px}
.row>i{display:block;flex:none;width:${w}px;height:${h}px;font-style:normal;text-align:center;overflow:hidden}
.title{font-weight:bold}
.dim{opacity:.55}
</style></head><body><div class="screen">
${bands}
</div>
</body></html>`
}

const sleep = ms => new Promise(done => setTimeout(done, ms))

// A finished PNG ends with its IEND chunk.
function isWritten(png) {
  if (!existsSync(png)) {
    return false
  }

  const bytes = readFileSync(png)

  return bytes.length > 12 && bytes.subarray(-8).toString('latin1') === 'IEND\xae\x42\x60\x82'
}

// One headless Chrome run that screenshots `page` into `png`, with its own
// profile under `work`.
async function screenshot(work, name, page, png, width, height, scale = 1) {
  const profile = join(work, `profile-${name}`)
  mkdirSync(profile, { recursive: true })
  const args = [
    '-e',
    `alarm ${CHROME_SECONDS}; exec @ARGV`,
    CHROME,
    '--headless=new',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--mute-audio',
    `--user-data-dir=${profile}`,
    `--force-device-scale-factor=${scale}`,
    `--window-size=${width},${height}`,
    `--screenshot=${png}`,
    pathToFileURL(page).href,
  ]
  const child = spawn('perl', args, { stdio: ['ignore', 'ignore', 'pipe'], detached: true })
  let log = ''
  child.stderr.on('data', chunk => {
    log += chunk
  })
  const exited = new Promise(done => child.on('exit', (code, signal) => done({ code, signal })))
  let isDone = false
  void exited.then(() => {
    isDone = true
  })

  // Wait for the PNG, then end Chrome and every process it started.
  let lastSize = -1
  while (!isDone) {
    if (isWritten(png)) {
      const size = statSync(png).size

      if (size === lastSize) {
        break
      }

      lastSize = size
    }

    await sleep(250)
  }

  if (!isDone) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Already gone.
    }
  }

  await exited
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })

  if (!isWritten(png)) {
    throw new Error(`Chrome wrote no screenshot for ${name}:\n${log.slice(-2000)}`)
  }
}

function python(args) {
  const result = spawnSync(PYTHON, [COMPOSE, ...args], { stdio: 'inherit' })

  if (result.status !== 0) {
    throw new Error(`${PYTHON} ${COMPOSE} ${args[0]} failed`)
  }
}

async function renderGif(work) {
  const { width, fps, columns, background } = GIF
  const height = SCENE_HEIGHT
  // One shared clock, long enough for a whole cast of the slowest rank.
  const count = Math.ceil(Math.max(...SPELLS.map(spell => spell.seconds)) * fps)
  const times = Array.from({ length: count }, (_, k) => (GIF.startTick + k) / fps)
  const rows = Math.ceil(count / columns)
  const sheets = []

  for (const [tier, spell] of SPELLS.entries()) {
    const svg = scene(tier, { width, detail: detailOf(spell) })
    const page = join(work, `sheet-${tier}.html`)
    const png = join(work, `sheet-${tier}.png`)
    writeFileSync(page, sheetPage(svg, times, width, height, columns, background))
    process.stdout.write(`rank ${spell.rank}: ${count} frames of ${svg.length} characters of SVG\n`)
    await screenshot(work, `sheet-${tier}`, page, png, columns * width, rows * height)
    sheets.push(png)
  }

  const manifest = join(work, 'gif.json')
  writeFileSync(
    manifest,
    JSON.stringify(
      {
        out: GIF.out,
        sheets,
        count,
        columns,
        width,
        height,
        fps,
        background,
        padding: GIF.padding,
        gap: GIF.gap,
        maxBytes: GIF.maxBytes,
      },
      null,
      2,
    ),
  )
  python(['gif', manifest])
}

async function renderTerminal(work) {
  const { columns, cellWidth: w, cellHeight: h, scale } = TERMINAL
  const page = join(work, 'terminal.html')
  const png = join(work, 'terminal-full.png')
  writeFileSync(page, terminalPage())
  // Every band is RASTER_ROWS rows tall with an empty row between: the crop
  // must come out exactly that tall, or something drew where it should not.
  const drawn = h * (SPELLS.length * (RASTER_ROWS + 1) - 1)
  // Roomier than the screen on both sides; cropped to it below.
  const width = (columns + 2 + 2 + 48 + 2) * w
  const height = drawn + 6 * h
  await screenshot(work, 'terminal', page, png, width, height, scale)
  // The same margin as the page: a row above and below, two columns aside.
  python([
    'terminal',
    png,
    TERMINAL.out,
    String(2 * w * scale),
    String(h * scale),
    String(drawn * scale),
    TERMINAL.background,
  ])
}

async function main() {
  const args = process.argv.slice(2)
  const isKept = args.includes('--keep')
  const wanted = args.filter(arg => arg !== '--keep')
  const jobs = wanted.length === 0 ? ['gif', 'terminal'] : wanted

  for (const job of jobs) {
    if (job !== 'gif' && job !== 'terminal') {
      throw new Error(`unknown argument "${job}"; usage: node scripts/render-demo.mjs [gif|terminal]... [--keep]`)
    }
  }

  if (!existsSync(CHROME)) {
    throw new Error(`no Chrome at ${CHROME}; set CHROME to its binary`)
  }

  mkdirSync(DOCS, { recursive: true })
  const work = mkdtempSync(join(tmpdir(), 'spell-bar-demo-'))

  try {
    if (jobs.includes('gif')) {
      await renderGif(work)
    }

    if (jobs.includes('terminal')) {
      await renderTerminal(work)
    }
  } finally {
    if (isKept) {
      process.stdout.write(`kept ${work}\n`)
    } else {
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    }
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
  process.exit(1)
})
