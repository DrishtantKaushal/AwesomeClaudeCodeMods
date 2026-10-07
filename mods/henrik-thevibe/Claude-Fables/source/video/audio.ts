/**
 * The launch video's soundtrack, synthesized from scratch: a cozy chiptune
 * (pulse lead, triangle bass, a noise kit) on the shot list's bar grid, and
 * the sound effects at its cues. Written as 16-bit stereo PCM, no samples.
 */
import { writeFileSync } from 'node:fs'

import { BAR, CUES, DURATION } from './shots'

const RATE = 44100
const BEAT = BAR / 4
const STEP = BEAT / 2 // an eighth

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

type Chord = { root: number; shape: number[] }
const C: Chord = { root: 48, shape: [0, 4, 7, 11] }
const Am: Chord = { root: 45, shape: [0, 3, 7, 10] }
const F: Chord = { root: 41, shape: [0, 4, 7, 11] }
const G: Chord = { root: 43, shape: [0, 4, 7, 9] }
const E: Chord = { root: 40, shape: [0, 4, 7, 10] }
const Dm: Chord = { root: 38, shape: [0, 3, 7, 10] }

/** One chord a bar, bar 0 to 34. */
const CHORDS: Chord[] = [
  C, Am, F, // cold open
  G, C, // the prompt
  Am, F, G, C, F, Am, E, Am, G, // the work; trouble at bar 10, found at 12
  C, Am, F, G, C, Am, F, G, Dm, G, C, // the montage, bars 14 to 24
  F, G, C, C, // the payoff
  Am, F, G, // the answer
  C, F, C, // goodnight
]

/** Bars and what plays in them. */
const section = (bar: number) =>
  bar < 3 ? 'open' : bar < 5 ? 'prompt' : bar < 14 ? 'work' : bar < 25 ? 'montage' : bar < 29 ? 'payoff' : bar < 32 ? 'answer' : 'end'

/** The lead's phrase: four bars of eighths (null rests), sung over C Am F G. */
const PHRASE: (number | null)[][] = [
  [76, null, 79, null, 81, 79, 76, null],
  [72, null, 76, null, 74, 72, 69, null],
  [69, 72, 77, null, 76, null, 72, null],
  [71, 74, 79, null, 77, 76, 74, null],
]
const TROUBLE: (number | null)[][] = [
  [76, null, 74, null, 72, null, 71, null],
  [68, null, 71, null, null, null, null, null],
]

// ── voices ───────────────────────────────────────────────
const L = new Float32Array(Math.ceil((DURATION + 1.5) * RATE))
const R = new Float32Array(L.length)

function add(at: number, dur: number, gain: number, pan: number, wave: (t: number, k: number) => number, attack = 0.005, release = 0.06) {
  const s0 = Math.round(at * RATE)
  const n = Math.round((dur + release) * RATE)
  const gl = gain * Math.min(1, 1 - pan)
  const gr = gain * Math.min(1, 1 + pan)
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    const env = t < attack ? t / attack : t < dur ? 1 : Math.max(0, 1 - (t - dur) / release)
    const v = wave(t, t / (dur + release)) * env
    const j = s0 + i
    if (j < 0 || j >= L.length) continue
    L[j] += v * gl
    R[j] += v * gr
  }
}

const pulse = (f: number, duty: number) => (t: number) => ((t * f) % 1 < duty ? 1 : -1)
const tri = (f: number) => (t: number) => 1 - 4 * Math.abs(((t * f + 0.25) % 1) - 0.5)
const sine = (f: number) => (t: number) => Math.sin(2 * Math.PI * f * t)
let seed = 7
const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1

function kick(at: number, gain = 0.55) {
  add(at, 0.16, gain, 0, t => Math.sin(2 * Math.PI * (55 * t + (110 / 18) * (1 - Math.exp(-18 * t)))) * Math.exp(-14 * t), 0.001, 0.02)
}
function snare(at: number, gain = 0.2) {
  add(at, 0.12, gain, 0.1, t => (noise() * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * Math.exp(-22 * t), 0.001, 0.03)
}
function hat(at: number, gain = 0.07, open = false) {
  let prev = 0
  add(at, open ? 0.12 : 0.03, gain, -0.25, () => {
    const x = noise()
    const hp = x - prev
    prev = x
    return hp
  }, 0.001, 0.02)
}

function music() {
  CHORDS.forEach((chord, bar) => {
    const at = bar * BAR
    const part = section(bar)
    const tones = chord.shape.map(s => chord.root + s)
    // pad: the cold open, the answer and goodnight
    if (part === 'open' || part === 'answer' || part === 'end' || part === 'prompt') {
      for (const m of tones) add(at, BAR * 0.98, part === 'end' ? 0.05 : 0.04, 0, tri(freq(m + 12)), 0.25, 0.4)
    }
    // the arp: sixteenths up through the chord, two octaves up
    const arpGain = part === 'open' || part === 'end' ? 0.05 : part === 'answer' || part === 'prompt' ? 0.04 : 0.035
    for (let i = 0; i < 16; i++) {
      if (part === 'end' && bar === 34 && i > 0) break
      const m = tones[i % tones.length]! + (i % 8 < 4 ? 24 : 36) - (part === 'end' ? 0 : 12)
      const voice = part === 'end' || part === 'open' ? sine(freq(m)) : pulse(freq(m), 0.125)
      add(at + i * (BEAT / 4), part === 'end' && bar === 34 ? BAR * 1.5 : BEAT / 4 - 0.01, arpGain * (part === 'end' ? 1.4 : 1), i % 2 ? 0.35 : -0.35, voice, 0.002, part === 'end' || part === 'open' ? 0.35 : 0.03)
    }
    // bass: from the work on
    if (part === 'work' || part === 'montage' || part === 'payoff' || part === 'answer') {
      const pattern = part === 'answer' ? [0, null, null, null, 7, null, null, null] : part === 'work' ? [0, null, 0, null, 7, null, 0, 12] : [0, 0, 12, 0, 7, 0, 12, 7]
      pattern.forEach((p, i) => p !== null && add(at + i * STEP, STEP * 0.85, 0.17, 0, tri(freq(chord.root - 12 + p)), 0.003, 0.03))
    }
    // drums
    if (part === 'work') {
      for (let i = 0; i < 8; i++) hat(at + i * STEP, i % 2 ? 0.04 : 0.06)
      kick(at, 0.35)
      kick(at + 2 * BEAT, 0.3)
    }
    if (part === 'montage' || part === 'payoff') {
      for (let i = 0; i < 4; i++) kick(at + i * BEAT, i % 2 ? 0.45 : 0.55)
      snare(at + BEAT)
      snare(at + 3 * BEAT)
      for (let i = 0; i < 8; i++) hat(at + i * STEP + STEP / 2, 0.06, i === 7)
      if (bar === 24) for (let i = 0; i < 4; i++) snare(at + 3 * BEAT + (i * BEAT) / 4, 0.12 + i * 0.03)
    }
    // the lead
    let line: (number | null)[] | undefined
    const phrase = PHRASE[[C, Am, F, G].indexOf(chord)] ?? PHRASE[chord === Dm ? 2 : 0]
    if (bar === 10 || bar === 11) line = TROUBLE[bar - 10]
    else if (part === 'work' && bar % 2 === 0) line = phrase
    else if (part === 'montage' || part === 'payoff') line = phrase
    if (line) {
      const duty = part === 'montage' ? 0.25 : 0.5
      const g = part === 'work' ? 0.06 : 0.075
      line.forEach((m, i) => {
        if (m === null) return
        const legato = line![i + 1] === null ? STEP * 1.6 : STEP * 0.8
        // a little vibrato on the long ones
        add(at + i * STEP, legato, g, 0.15, t => pulse(freq(m) * (1 + 0.004 * Math.sin(2 * Math.PI * 6 * t) * Math.min(1, t * 4)), duty)(t), 0.004, 0.05)
        if (part === 'montage') add(at + i * STEP + 0.12, legato, g * 0.35, -0.5, pulse(freq(m), 0.125), 0.004, 0.05) // echo
      })
    }
  })
  // the payoff's fanfare on bar 24
  ;[60, 64, 67, 72].forEach((m, i) => add(25 * BAR + i * 0.1, 1.2 - i * 0.1, 0.07, 0, pulse(freq(m + 12), 0.25), 0.004, 0.4))
}

function effects() {
  for (const at of CUES.stamp) {
    kick(at, 0.5)
    add(at, 0.25, 0.25, 0, t => noise() * Math.exp(-14 * t), 0.001, 0.05)
    add(at, 0.6, 0.08, 0, pulse(freq(84), 0.5), 0.002, 0.3)
  }
  const { from, to, count } = CUES.keys
  for (let i = 0; i < count; i++) {
    const at = from + ((to - from) * i) / count + (noise() * 0.012)
    add(at, 0.012, 0.09, (noise() * 0.4), t => noise() * Math.exp(-300 * t), 0.0005, 0.01)
  }
  for (const at of CUES.send) add(at, 0.12, 0.08, 0, t => pulse(660 + 900 * t * 8, 0.5)(t), 0.002, 0.05)
  for (const at of CUES.bonk) {
    add(at, 0.45, 0.16, 0, t => pulse(420 * Math.exp(-3.2 * t) * (1 + 0.06 * Math.sin(2 * Math.PI * 18 * t)), 0.5)(t), 0.002, 0.1)
  }
  for (const at of CUES.whoosh) {
    let lp = 0
    add(at - 0.15, 0.4, 0.13, 0, (t, k) => {
      const cut = 0.04 + 0.5 * Math.sin(Math.PI * k)
      lp += cut * (noise() - lp)
      return lp * Math.sin(Math.PI * k)
    }, 0.01, 0.05)
  }
  for (const at of CUES.chime) [84, 88, 91, 96].forEach((m, i) => add(at + i * 0.07, 0.5, 0.09, i % 2 ? 0.3 : -0.3, t => sine(freq(m))(t) * Math.exp(-4 * t), 0.002, 0.4))
  for (const at of CUES.sparkle) for (let i = 0; i < 10; i++) add(at + i * 0.06, 0.08, 0.04, i % 2 ? 0.5 : -0.5, sine(freq(96 + ((i * 5) % 12))), 0.002, 0.15)
}

export function writeSoundtrack(path: string) {
  L.fill(0)
  R.fill(0)
  music()
  effects()
  // the last bars fade out into the end card
  const n = Math.round(DURATION * RATE)
  const fadeFrom = Math.round((DURATION - 1.2) * RATE)
  let peak = 0
  for (let i = 0; i < L.length; i++) {
    const fade = i < fadeFrom ? 1 : Math.max(0, 1 - (i - fadeFrom) / (n - fadeFrom))
    L[i] = Math.tanh(L[i]! * fade * 1.1)
    R[i] = Math.tanh(R[i]! * fade * 1.1)
    peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!))
  }
  const norm = 0.89 / (peak || 1)
  const buf = Buffer.alloc(44 + n * 4)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 4, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 4, 28)
  buf.writeUInt16LE(4, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 4, 40)
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(L[i]! * norm * 32767), 44 + i * 4)
    buf.writeInt16LE(Math.round(R[i]! * norm * 32767), 46 + i * 4)
  }
  writeFileSync(path, buf)
}

if (import.meta.main) writeSoundtrack(process.argv[2] ?? 'soundtrack.wav')
