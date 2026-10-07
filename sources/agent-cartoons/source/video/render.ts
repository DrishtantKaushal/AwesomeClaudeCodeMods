/**
 * Renders the launch video: every cartoon is drawn by the mod's own sceneToSvg,
 * set into a mock of the desktop window (ui.css, stage.js), stepped frame by
 * frame in headless Chromium and encoded with ffmpeg, over a soundtrack made
 * by audio.ts.
 *
 *   bun video/render.ts                   # the whole video → video/out/claude-fables-launch.mp4
 *   bun video/render.ts --still 3.2,17    # single frames → video/out/still-<t>.png
 *   bun video/render.ts --workers 4       # browsers rendering in parallel (default: 4)
 *   bun video/render.ts --resume          # keep the frames already rendered, render the rest
 *   bun video/render.ts --encode          # only encode the frames there are
 */
import { mkdirSync, existsSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { MONOCRAFT } from '../hooks/monocraft'
import { parseScene } from '../hooks/scene'
import { sceneToSvg } from '../hooks/svg'

import { writeSoundtrack } from './audio'
import * as S from './shots'

const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs'
const OUT = join(import.meta.dir, 'out')
const FRAMES = join(OUT, 'frames')

const args = process.argv.slice(2)
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const stills = opt('still')?.split(',').map(Number)
const workers = Number(opt('workers') ?? 4)
const resume = args.includes('--resume')
const encodeOnly = args.includes('--encode')

// ── the scenes, each checked by the validator the plugin uses ──
const bandIds = new Set(S.BAND_QUEUE.map(q => q.id))
const fullIds = new Set(S.FULL_SPANS.map(s => s.id))
const shots = S.SHOTS.map(shot => {
  const parsed = parseScene(shot.raw)
  if (!parsed) throw new Error(`parseScene rejected ${shot.id}`)
  if (parsed.caption !== shot.raw.caption) throw new Error(`${shot.id}: the caption would be cut to "${parsed.caption}"`)
  const scene = { ...parsed, ...(shot.fade ? { enter: 'fade' as const } : {}) }
  return {
    id: shot.id,
    start: shot.start,
    band: bandIds.has(shot.id) ? sceneToSvg(scene, { ...S.BAND, look: shot.look, figure: '3d' }) : undefined,
    full: fullIds.has(shot.id) ? sceneToSvg(scene, { ...S.FULL, look: shot.look, figure: '3d' }) : undefined,
  }
})

// ── fonts: Inter and JetBrains Mono from Google Fonts (cached), Monocraft from the mod ──
async function fontFaces(): Promise<string> {
  const cache = join(OUT, 'fonts.css')
  if (existsSync(cache)) return readFileSync(cache, 'utf8')
  const families = ['Inter:wght@400;500;600', 'JetBrains+Mono:wght@400;600']
  let css = ''
  for (const family of families) {
    const sheet = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}&display=block`, { headers: { 'user-agent': 'Mozilla/5.0 Chrome/120' } })).text()
    // Only the latin faces; each file inlined.
    for (const block of sheet.split('@font-face').slice(1)) {
      if (/unicode-range/.test(block) && !/U\+0000-00FF/.test(block)) continue
      const url = /url\((https:[^)]+)\)/.exec(block)?.[1]
      if (!url) continue
      const data = Buffer.from(await (await fetch(url)).arrayBuffer()).toString('base64')
      const type = url.endsWith('.woff2') ? 'woff2' : 'truetype'
      css += `@font-face${block.replace(/url\([^)]+\)\s*format\('[^']+'\)/, `url(data:font/${type};base64,${data}) format('${type}')`)}\n`
    }
  }
  writeFileSync(cache, css)
  return css
}

const ICON = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
}

async function page(): Promise<string> {
  const data = {
    shots,
    BAND: S.BAND,
    FULL: S.FULL,
    BAND_QUEUE: S.BAND_QUEUE,
    FULL_SPANS: S.FULL_SPANS,
    CAMERA: S.CAMERA,
    CHAT: S.CHAT,
    PROMPT: S.PROMPT,
    PROMPT_TYPING: S.PROMPT_TYPING,
    SEND_AT: S.SEND_AT,
    TURN: S.TURN,
    SPINNER: S.SPINNER,
    END_CARD: S.END_CARD,
    CUES: S.CUES,
    DURATION: S.DURATION,
  }
  const css = readFileSync(join(import.meta.dir, 'ui.css'), 'utf8')
  const js = readFileSync(join(import.meta.dir, 'stage.js'), 'utf8')
  const c = S.END_CARD
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${await fontFaces()}
@font-face { font-family: Monocraft; src: url(data:font/woff2;base64,${MONOCRAFT}) format('woff2'); }
${css}</style></head><body>
<div id="ui">
  <div id="topbar"><div class="dots"><i></i><i></i><i></i></div><span class="title">Fix flaky date tests</span><span>· claude-fables-demo</span><span class="chip">Code</span></div>
  <div id="chat"></div>
  <div id="bandbox"></div>
  <div id="band"></div>
  <div id="input"><span class="text"></span><span class="enter">↵</span></div>
  <div id="footer">${ICON.plus}${ICON.mic}${ICON.down}<span class="mode">${ICON.bolt}Ultracode</span><span class="model">Fable 5.1</span><i class="ring"></i></div>
</div>
<div id="full"><div class="bar top"></div><div class="layer a"></div><div class="bar bottom"></div>
  <div id="title"><div class="name">CLAUDE FABLES</div><div class="sub">your work, told as a cartoon while Claude codes</div></div>
  <div id="card"><div class="name">${c.title}</div><div class="line">${c.line}</div><div class="repo">${c.repo}</div></div>
</div>
<div id="black"></div>
<script>window.DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>${js}</script>
</body></html>`
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const html = join(OUT, 'page.html')
  writeFileSync(html, await page())
  const { chromium } = await import(PLAYWRIGHT)
  const open = async () => {
    const browser = await chromium.launch()
    const p = await browser.newPage({ viewport: { width: S.VIEW.width, height: S.VIEW.height }, deviceScaleFactor: S.VIEW.scale })
    await p.goto(`file://${html}`)
    await p.evaluate(() => (window as any).ready)
    return { browser, p }
  }

  if (stills) {
    const { browser, p } = await open()
    for (const t of stills) {
      await p.evaluate((t: number) => (window as any).renderAt(t), t)
      await p.screenshot({ path: join(OUT, `still-${t}.png`) })
      console.log(`still-${t}.png`)
    }
    await browser.close()
    return
  }

  const total = Math.round(S.DURATION * S.FPS)
  const framePath = (f: number) => join(FRAMES, `${String(f).padStart(5, '0')}.png`)
  if (!resume && !encodeOnly) rmSync(FRAMES, { recursive: true, force: true })
  mkdirSync(FRAMES, { recursive: true })
  // A frame is written whole to a temporary name and then renamed, so one cut off mid-write is never kept.
  const todo = encodeOnly ? [] : Array.from({ length: total }, (_, f) => f).filter(f => !existsSync(framePath(f)))
  const began = Date.now()
  let done = 0
  // Frames are dealt out in turn, so every worker gets light and heavy stretches alike.
  await Promise.all(
    Array.from({ length: Math.min(workers, todo.length) }, async (_, w) => {
      const { browser, p } = await open()
      for (let i = w; i < todo.length; i += workers) {
        const f = todo[i]!
        await p.evaluate((t: number) => (window as any).renderAt(t), f / S.FPS)
        await p.screenshot({ path: `${framePath(f)}.tmp.png` })
        renameSync(`${framePath(f)}.tmp.png`, framePath(f))
        if (++done % 60 === 0) console.log(`${done}/${todo.length} frames, ${Math.round((Date.now() - began) / 1000)}s`)
      }
      await browser.close()
    }),
  )

  const wav = join(OUT, 'soundtrack.wav')
  writeSoundtrack(wav)
  const mp4 = join(OUT, 'claude-fables-launch.mp4')
  const ff = spawnSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-framerate', String(S.FPS), '-i', join(FRAMES, '%05d.png'), '-i', wav, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', mp4],
    { stdio: 'inherit' },
  )
  if (ff.status !== 0) throw new Error('ffmpeg failed')
  console.log(mp4)
}

await main()
