/**
 * Renders the sample scenes (or a JSON file of your own) to a gallery page, so
 * scenes and styles can be tuned without a Claude session:
 *
 *   bun scripts/preview.ts [scenes.json] [--look <name>|all] > gallery.html
 */
import { readFileSync } from 'node:fs'

import { DEFAULT_LOOK, LOOK_NAMES } from '../hooks/looks'
import { parseScene } from '../hooks/scene'
import { sceneToSvg } from '../hooks/svg'

import { SAMPLES } from './samples'

const args = process.argv.slice(2)
const lookAt = args.indexOf('--look')
const lookArg = lookAt >= 0 ? args.splice(lookAt, 2)[1] : undefined
const looks = lookArg === 'all' ? LOOK_NAMES : [lookArg ?? DEFAULT_LOOK]
const file = args[0]
const scenes: unknown[] = file ? JSON.parse(readFileSync(file, 'utf8')) : SAMPLES
const tiles = looks.flatMap(look =>
  scenes.map((raw, i) => {
    const scene = parseScene(raw)
    if (!scene) return `<p>scene ${i}: rejected by parseScene</p>`
    const svg = sceneToSvg(scene, { look, figure: '3d' })
    // Each scene is its own image: in the band only one is ever on screen, and its ids are its own.
    const src = `data:image/svg+xml,${encodeURIComponent(svg)}`
    return `<figure><figcaption>${i} · ${look} · ${scene.backdrop} · ${scene.hero.action} · ${svg.length} chars</figcaption><img src="${src}" width="960"></figure>`
  }),
)
console.log(`<!doctype html><meta charset="utf-8"><title>Claude Fables preview</title>
<style>body{background:#1a1a19;color:#9a978e;font:12px ui-monospace,monospace;margin:16px}figure{margin:0 0 18px}img{max-width:100%;height:auto;display:block;margin-top:4px}</style>
${tiles.join('\n')}`)
