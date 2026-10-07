// The launch video's page, drawn as a pure function of the video's clock:
// window.renderAt(t) sets every element for time t, so each frame can be
// captured on its own. window.DATA is the script (shots.ts), filled in by render.ts.
/* eslint-disable no-undef */
const D = window.DATA
const $ = sel => document.querySelector(sel)
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const easeOut = x => 1 - (1 - x) ** 3
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Every scene's drawing, in an iframe of its own so the SVGs' ids never meet. */
const frames = {}
function mount(where, key, svg, w, h) {
  const f = document.createElement('iframe')
  f.width = w
  f.height = h
  f.srcdoc = `<!doctype html><html><body style="margin:0;overflow:hidden;background:#0b0b10">${svg}</body></html>`
  where.appendChild(f)
  frames[key] = f
  return new Promise(resolve => (f.onload = resolve))
}

window.ready = (async () => {
  const loads = []
  for (const s of D.shots) {
    if (s.band) loads.push(mount($('#band'), `band-${s.id}`, s.band, D.BAND.width, D.BAND.height))
    if (s.full) loads.push(mount($('#full .layer.a'), `full-${s.id}`, s.full, D.FULL.width, D.FULL.height))
  }
  await Promise.all(loads)
  for (const f of Object.values(frames)) f.contentDocument.querySelector('svg').pauseAnimations()
  await document.fonts.ready
  return true
})()

const start = Object.fromEntries(D.shots.map(s => [s.id, s.start]))
let shown = []
/** Shows the scene `key` (and only the frames in `keep`), its clock at `t` on the video's. */
function show(key, t, extra = {}) {
  const f = frames[key]
  const svg = f.contentDocument.querySelector('svg')
  svg.setCurrentTime(Math.max(0, t - start[key.replace(/^(band|full)-/, '')]))
  f.style.visibility = 'visible'
  f.style.clipPath = extra.clip ?? ''
  f.style.zIndex = extra.z ?? 0
  shown.push(f)
}

// ── the conversation ─────────────────────────────────────
function inline(text) {
  // `code` spans, closing one left open by streaming.
  const parts = text.split('`')
  return parts.map((p, i) => (i % 2 ? `<code>${esc(p)}</code>` : esc(p))).join('')
}
function richText(text) {
  return text
    .split('\n')
    .map(line => (line.startsWith('• ') ? `<span class="bullet">${inline(line)}</span>` : inline(line) + '\n'))
    .join('')
    .replace(/\n$/, '')
}

function chatHtml(t) {
  const items = D.CHAT.filter(c => c.t <= t)
  const out = []
  items.forEach((c, i) => {
    if (c.kind === 'user') out.push(`<div class="user">${esc(c.text)}</div>`)
    if (c.kind === 'text') {
      const n = Math.floor((t - c.t) * (c.cps ?? 70))
      out.push(`<div class="text">${richText(c.text.slice(0, n))}</div>`)
    }
    if (c.kind === 'tool') {
      const res = items.slice(i + 1).find(r => r.kind === 'result' || r.kind === 'diff')
      const cls = !res ? 'run' : res.tone === 'bad' ? 'bad' : ''
      const blink = !res && Math.floor(t * 2.5) % 2 ? ' style="opacity:.35"' : ''
      out.push(`<div class="tool"><i class="dot ${cls}"${blink}></i><b>${c.name}</b><span class="arg">(${esc(c.arg)})</span></div>`)
    }
    if (c.kind === 'result') out.push(`<div class="result ${c.tone ?? ''}">⎿&nbsp; ${esc(c.text)}</div>`)
    if (c.kind === 'diff') {
      const rows = c.lines.map(l => `<div class="${l[0] === '-' ? 'del' : 'add'}">${esc(l)}</div>`)
      out.push(`<div class="diff">${rows.join('')}</div>`)
    }
  })
  if (t >= D.TURN.from && t < D.TURN.to) {
    const glyph = '✻✽✶✳✢·'[Math.floor(t * 6) % 6]
    const word = D.SPINNER[Math.floor(((t - D.TURN.from) / (D.TURN.to - D.TURN.from)) * D.SPINNER.length)] ?? D.SPINNER[0]
    const secs = Math.floor(t - D.TURN.from)
    out.push(`<div class="spinner"><span class="glyph">${glyph}</span>${word}…<span class="hint">${secs}s · esc to interrupt</span></div>`)
  }
  return out.join('')
}

let lastChat = ''
function renderUi(t) {
  const html = chatHtml(t)
  if (html !== lastChat) $('#chat').innerHTML = lastChat = html
  // the prompt box
  const { from, to } = D.PROMPT_TYPING
  const caret = Math.floor(t * 2) % 2 === 0 ? '<i class="caret"></i>' : '<i class="caret" style="opacity:0"></i>'
  let input
  if (t < from || t >= D.SEND_AT) input = `<span class="ph">Type / for commands</span>`
  else {
    const n = Math.round(clamp((t - from) / (to - from)) * D.PROMPT.length)
    input = `<span>${esc(D.PROMPT.slice(0, n))}</span>${caret}`
  }
  $('#input .text').innerHTML = input
  $('#footer .ring').style.visibility = t >= D.TURN.from && t < D.TURN.to ? 'visible' : 'hidden'
  $('#footer .ring').style.transform = `rotate(${(t * 400) % 360}deg)`
  // the band: the scene the queue is on
  const q = [...D.BAND_QUEUE].reverse().find(e => e.at <= t)
  if (q) show(`band-${q.id}`, t)
  // the camera
  const cam = camAt(t)
  const z = cam.z
  $('#ui').style.transform = `translate(${640 - cam.x * z}px, ${360 - cam.y * z}px) scale(${z})`
}

function camAt(t) {
  const C = D.CAMERA
  if (t <= C[0].t) return C[0]
  for (let i = 1; i < C.length; i++) {
    const a = C[i - 1]
    const b = C[i]
    if (t <= b.t) {
      const k = ease(clamp((t - a.t) / (b.t - a.t)))
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k }
    }
  }
  return C[C.length - 1]
}

// ── the full-screen cartoon ──────────────────────────────
const IN = 0.22
const OUT = 0.3
function renderFull(t) {
  const spans = D.FULL_SPANS
  const joins = j => spans[j + 1] && Math.abs(spans[j + 1].from - spans[j].to) < 1e-6
  let i = spans.findIndex(s => t >= s.from && t < s.to)
  if (i < 0) i = spans.findIndex((s, j) => t >= s.to && t < s.to + OUT && !joins(j))
  const s = spans[i]
  if (!s) {
    $('#full').style.opacity = 0
    return
  }
  const prev = spans[i - 1]
  const next = spans[i + 1]
  const joinedBefore = prev && Math.abs(prev.to - s.from) < 1e-6
  const joinedAfter = next && Math.abs(next.from - s.to) < 1e-6
  const fadeIn = joinedBefore || s.from === 0 ? 1 : clamp((t - s.from) / IN)
  const fadeOut = joinedAfter || s.to >= D.DURATION ? 1 : clamp((s.to + OUT - t) / OUT)
  $('#full').style.opacity = Math.min(fadeIn, fadeOut)
  // A push in from the band carries on into the full shot; leaving, it pushes on a little.
  const push = joinedBefore || s.from === 0 ? 1 : 1.05 - 0.05 * easeOut(clamp((t - s.from) / 0.6))
  const pull = t > s.to && !joinedAfter ? 1 + 0.08 * clamp((t - s.to) / OUT) : 1
  $('#full .layer.a').style.transform = `scale(${push * pull})`
  // A wipe from the last span, left to right on a slant.
  const w = s.wipe ? clamp((t - s.from) / 0.26) : 1
  if (w < 1 && prev) {
    show(`full-${prev.id}`, t, { z: 0 })
    const x = easeOut(w) * 130 - 15
    show(`full-${s.id}`, t, { z: 1, clip: `polygon(0 0, ${x + 15}% 0, ${x}% 100%, 0 100%)` })
  } else show(`full-${s.id}`, t)

  // the bars
  const top = s.top ?? ''
  let topHtml = ''
  if (top.startsWith('/')) {
    const n = Math.round(clamp((t - s.from) / 0.45) * top.length)
    const tick = Math.floor(t * 3) % 2 === 0 || n < top.length ? '<i class="tick"></i>' : ''
    topHtml = `<span class="prompt">›</span><span class="mono">${esc(top.slice(0, n))}</span>${tick}`
  } else if (top) topHtml = `<span class="mono">${esc(top)}</span>`
  $('#full .bar.top').innerHTML = topHtml
  const bottom = s.bottom ?? ''
  const tone = bottom.includes('✗') ? 'bad' : bottom.includes('✓') ? 'ok' : ''
  const lift = easeOut(clamp((t - s.from) / 0.3))
  $('#full .bar.bottom').innerHTML = bottom
    ? `<span class="${bottom.startsWith('⎿') ? 'mono ' + tone : ''}" style="opacity:${lift};transform:translateY(${(1 - lift) * 10}px);display:inline-block;${bottom.startsWith('⎿') ? 'font-size:20px;font-weight:500' : ''}">${esc(bottom)}</span>${s.count ? `<span class="count">${s.count}</span>` : ''}`
    : ''
}

function renderTitle(t) {
  const at = D.CUES.stamp[0]
  const k = clamp((t - at) / 0.35)
  // stamped: in big, lands with a little overshoot, then leaves before the pull back
  const scale = k < 1 ? 1.8 - 0.9 * easeOut(k) : 1 - 0.1 * Math.sin(Math.min(1, (t - at - 0.35) / 0.2) * Math.PI) * clamp(1 - (t - at - 0.35) / 0.2)
  const leave = clamp((D.FULL_SPANS[0].to - 0.2 - t) / 0.3)
  $('#title').style.opacity = t < at ? 0 : Math.min(clamp(k * 2), leave)
  $('#title .name').style.transform = `scale(${scale})`
  $('#title .sub').style.opacity = clamp((t - at - 0.6) / 0.4)
}

function renderCard(t) {
  const c = D.END_CARD
  const k = easeOut(clamp((t - c.from) / 0.9))
  $('#card').style.opacity = k
  $('#card').style.transform = `translateY(${(1 - k) * 16}px)`
  $('#card .line').style.opacity = clamp((t - c.from - 0.4) / 0.6)
  $('#card .repo').style.opacity = clamp((t - c.from - 0.8) / 0.6)
  $('#full .layer.a').style.filter = t > c.from ? `brightness(${1 - 0.62 * k}) saturate(${1 - 0.25 * k}) blur(${k * 5}px)` : ''
  $('#black').style.opacity = clamp((t - (D.DURATION - 0.7)) / 0.7)
}

window.renderAt = t => {
  for (const f of shown) f.style.visibility = 'hidden'
  shown = []
  renderUi(t)
  renderFull(t)
  renderTitle(t)
  renderCard(t)
}
