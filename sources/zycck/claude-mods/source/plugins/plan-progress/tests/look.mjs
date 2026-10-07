// renders the bars as the desktop draws them: the track in a sandboxed frame, strips as images
import fs from 'node:fs'
import { boot, S, st } from './engine.mjs'
const E = await boot('./register.mjs')
await E.call({ id: 'a', title: 'API review', stages: [S('Scan', st('Routes', 'active'), 'Services'), S('Report', 'Summary')] })
await E.spawn('g1', 'Count route files'); await E.spawn('g2', 'List service modules')
E.tick(56_000); await E.agentTool('g1', 'Glob'); await E.turnComplete('g2')
await E.call({ id: 'b', title: 'UI audit', stages: [S('Collect', st('Components', 'active'), 'Styles'), S('Check', 'Icons')] })
E.tick(23_000); await E.call({ id: 'b', state: 'done' })
const esc = h => h.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const img = (src, w, h) => `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}" width="${w}" height="${h}" style="display:block">`
const svgs = await E.svgs()
const html = E.plans().map(p => {
  const v = svgs.filter(s => s.alt.startsWith(p.title + ':') || String(s.key ?? '').startsWith(`strip-${p.id}-`))
  const track = v[0], strips = v.slice(1)
  const overlay = svgs.slice(svgs.indexOf(track) + 1).find(s => s.isInteractive)
  return `<div style="position:relative;margin:8px 0">${img(track.source, track.width, track.height)}${strips.map(s => img(s.source, s.width, s.height)).join('')}` +
    `<iframe sandbox="" srcdoc="${esc(overlay.source)}" width="${overlay.width}" height="${overlay.height}" style="border:0;position:absolute;top:0;left:0"></iframe></div>`
}).join('')
fs.writeFileSync('look.html', `<!doctype html><html style="color-scheme:dark"><head><meta charset="utf-8"></head><body style="background:#1f1e1d;padding:10px;zoom:1.3">${html}</body></html>`)
