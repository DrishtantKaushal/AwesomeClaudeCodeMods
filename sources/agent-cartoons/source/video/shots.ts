/**
 * The launch video's script: every scene Claude Fables draws in it, the mock
 * conversation, the camera and the sound cues, all on one clock in seconds.
 *
 * The scenes are hand-written in the shape the narrator asks the model for
 * (like scripts/samples.ts) and drawn by the mod's own sceneToSvg. Cuts land
 * on bar lines of the soundtrack: one bar is BAR seconds.
 */

/** One bar of the soundtrack (4 beats at 133⅓ BPM). */
export const BAR = 1.8
export const FPS = 30
export const DURATION = 35 * BAR // 63s

/** The UI is laid out at 1280×720 CSS pixels and captured at 1.5×, so 1920×1080. */
export const VIEW = { width: 1280, height: 720, scale: 1.5 }
/** The band's size in the mock window, as in the desktop app: as wide as the column, 192 px tall. */
export const BAND = { width: 860, height: 192 }
/** A cartoon shown full screen: the narrowest stage, letterboxed. */
export const FULL = { width: 1280, height: 512 }

export type Shot = {
  id: string
  look: string
  /** When the scene's own clock reads 0, on the video's clock. */
  start: number
  raw: Record<string, unknown>
  /** The scene opens on a new setting, so it fades in from the last one (as the narrator's loop sets it). */
  fade?: boolean
}

const b = (bars: number) => Math.round(bars * BAR * 1000) / 1000

/** Cold open, the working turn, the payoff and the closing scene. */
const STORY: Shot[] = [
  {
    id: 'hello',
    look: 'pixel',
    start: 0.3,
    fade: true,
    raw: { backdrop: 'forest', hero: { action: 'wave', from: 46, to: 46 }, particles: { kind: 'leaves', density: 0.4 }, caption: "Oh hi! I'm Claude. Got a bug for me?", title: 'once upon a turn' },
  },
  {
    id: 'sneak',
    look: 'pixel',
    start: b(6.2),
    raw: { backdrop: 'forest', hero: { action: 'sneak', from: 6, to: 38, then: 'peek' }, particles: { kind: 'leaves', density: 0.3 }, caption: 'Tiptoeing into dates.test.ts. Something flaky lives here.', title: 'field notes' },
  },
  {
    id: 'dig',
    look: 'pixel',
    start: b(8),
    fade: true,
    raw: { backdrop: 'desert', hero: { action: 'dig', from: 40, to: 40 }, caption: 'Digging for daysInMonth() in src/dates.ts...' },
  },
  {
    id: 'trip',
    look: 'pixel',
    start: b(10),
    fade: true,
    raw: { backdrop: 'city', hero: { action: 'trip', from: 30, to: 30, then: 'shrug' }, particles: { kind: 'rain', density: 0.5 }, caption: '`npm test`: 1 failed. Year 1900 strikes again >_<', tone: 'trouble' },
  },
  {
    id: 'found',
    look: 'pixel',
    start: b(12),
    fade: true,
    raw: { backdrop: 'lab', hero: { action: 'point', from: 36, to: 36 }, caption: 'Found it! daysInMonth() forgets the century rule.', title: 'eureka' },
  },
  {
    id: 'party',
    look: 'pixel',
    start: b(25) + 0.6,
    fade: true,
    raw: { backdrop: 'city', hero: { action: 'celebrate', from: 40, to: 40 }, particles: { kind: 'sparks', density: 0.3 }, caption: '42/42 passed. The calendar fears us now \\o/', title: 'done', tone: 'milestone' },
  },
  {
    id: 'nap',
    look: 'pixel',
    start: b(31.2),
    fade: true,
    raw: { backdrop: 'night', hero: { action: 'sleep', from: 44, to: 44 }, particles: { kind: 'stars', density: 0.5 }, caption: 'Turn done, fix shipped. Nap time... zzz', title: 'the end' },
  },
]

/** The montage: one beat per look, every one of the eleven, each in its own voice. */
export const MONTAGE_START = b(14)
export const MONTAGE_BEAT = BAR
/** How far into its own clock each montage scene is when it cuts in, so the caption is already typing. */
export const MONTAGE_PREROLL = 0.25

export const MONTAGE: { look: string; label: string; raw: Record<string, unknown> }[] = [
  { look: 'pixel', label: 'Pixel Art', raw: { backdrop: 'city', hero: { action: 'run', from: 8, to: 46 }, caption: 'Racing to src/dates.ts!' } },
  { look: 'original', label: 'The Original', raw: { backdrop: 'desert', hero: { action: 'walk', from: 30, to: 46 }, caption: 'Every 4 years... except every 100.' } },
  { look: 'cave', label: 'Cave Painting', raw: { backdrop: 'forest', hero: { action: 'dance', from: 44, to: 44 }, caption: 'Hero find bad day. Hero fix day.' } },
  { look: 'blueprint', label: 'Blueprint', raw: { backdrop: 'lab', hero: { action: 'inspect', from: 40, to: 40 }, caption: 'FIG. 2: daysInMonth(), leap rule added.' } },
  { look: 'mosaic', label: 'Mosaic', raw: { backdrop: 'desert', hero: { action: 'carry', from: 30, to: 48 }, caption: 'HERE THE HERO CARRIES THE FIX' } },
  { look: 'aero', label: 'Frutiger Aero', raw: { backdrop: 'space', hero: { action: 'fly', from: 20, to: 48 }, caption: 'Fresh. Clean. Leap-year ready!' } },
  { look: 'engraving', label: 'Copperplate Engraving', raw: { backdrop: 'forest', hero: { action: 'sneak', from: 34, to: 48 }, caption: 'Fig. 3: the flaky test, at rest.' } },
  { look: 'tapestry', label: 'Millefleur Tapestry', raw: { backdrop: 'night', hero: { action: 'spin', from: 44, to: 44 }, caption: 'Here the hero mendeth the calendar.' } },
  { look: 'golden', label: 'Golden Age Comic', raw: { backdrop: 'city', hero: { action: 'jump', from: 30, to: 50 }, caption: 'WHAM! The off-by-one is DOWN!' } },
  { look: 'ukiyoe', label: 'Ukiyo-e', raw: { backdrop: 'volcano', hero: { action: 'think', from: 42, to: 42 }, caption: 'Rain on the suite. One test remains.' } },
  { look: 'kamon', label: 'Kamon', raw: { backdrop: 'night', hero: { action: 'celebrate', from: 44, to: 44 }, caption: 'One rule. Four hundred years.' } },
]

export const SHOTS: Shot[] = [
  ...STORY,
  ...MONTAGE.map((m, i) => ({ id: `style-${m.look}`, look: m.look, start: MONTAGE_START + i * MONTAGE_BEAT - MONTAGE_PREROLL, raw: m.raw })),
]

/**
 * What the band in the mock window shows: from each time on, that scene (the
 * scene queue, as the plugin plays it). The montage never plays in the band.
 */
export const BAND_QUEUE: { at: number; id: string }[] = [
  { at: 0, id: 'hello' },
  { at: STORY[1]!.start, id: 'sneak' },
  { at: STORY[2]!.start, id: 'dig' },
  { at: STORY[3]!.start, id: 'trip' },
  { at: STORY[4]!.start, id: 'found' },
  { at: STORY[5]!.start, id: 'party' },
  { at: STORY[6]!.start, id: 'nap' },
]

/** Stretches of the video where a cartoon fills the screen, letterboxed. */
export type FullSpan = { from: number; to: number; id: string; top?: string; bottom?: string; count?: string; wipe?: boolean }

export const FULL_SPANS: FullSpan[] = [
  { from: 0, to: b(3), id: 'hello', top: '', bottom: '' },
  { from: b(10.15), to: b(12), id: 'trip', top: '● Bash(npm test)', bottom: '⎿  ✗ 1 failed, 41 passed' },
  ...MONTAGE.map((m, i): FullSpan => ({
    from: MONTAGE_START + i * MONTAGE_BEAT,
    to: MONTAGE_START + (i + 1) * MONTAGE_BEAT,
    id: `style-${m.look}`,
    top: `/fables style ${m.look}`,
    bottom: m.label,
    count: `${String(i + 1).padStart(2, '0')} / ${MONTAGE.length}`,
    wipe: i > 0,
  })),
  { from: b(27), to: b(29), id: 'party', top: '● Bash(npm test)', bottom: '⎿  ✓ 42/42 passed (2.41s)' },
  { from: b(32), to: DURATION, id: 'nap', top: '', bottom: '' },
]

/** The camera on the mock window: where it looks (CSS px of the 1280×720 window) and how close. */
export type Cam = { t: number; x: number; y: number; z: number }

/** The band's middle in the window; the camera's push-ins aim here (layout in ui.css). */
export const BAND_CENTER = { x: 640, y: 516 }
const BAND_FILL = 1280 / BAND.width

export const CAMERA: Cam[] = [
  { t: b(3), ...BAND_CENTER, z: BAND_FILL },
  { t: b(4), x: 640, y: 360, z: 1 },
  { t: b(7), x: 640, y: 360, z: 1 },
  { t: b(10), x: 640, y: 430, z: 1.18 },
  { t: b(10.15), ...BAND_CENTER, z: BAND_FILL },
  // back from the trip
  { t: b(12), ...BAND_CENTER, z: BAND_FILL },
  { t: b(12.8), x: 640, y: 380, z: 1.04 },
  { t: b(13.4), x: 640, y: 420, z: 1.12 },
  { t: b(14), ...BAND_CENTER, z: BAND_FILL },
  // back from the montage
  { t: b(25), ...BAND_CENTER, z: BAND_FILL },
  { t: b(25.8), x: 640, y: 360, z: 1 },
  { t: b(26.6), x: 640, y: 420, z: 1.14 },
  { t: b(27), ...BAND_CENTER, z: BAND_FILL },
  // back from the party, to read the answer
  { t: b(29), ...BAND_CENTER, z: BAND_FILL },
  { t: b(29.8), x: 640, y: 330, z: 1.06 },
  { t: b(31.3), x: 640, y: 380, z: 1.1 },
  { t: b(32), ...BAND_CENTER, z: BAND_FILL },
]

/** The conversation. Text streams in from `t` at `cps` characters a second; `code` spans are written `like this`. */
export type ChatItem =
  | { t: number; kind: 'user'; text: string }
  | { t: number; kind: 'text'; text: string; cps?: number }
  | { t: number; kind: 'tool'; name: string; arg: string }
  | { t: number; kind: 'result'; text: string; tone?: 'ok' | 'bad' }
  | { t: number; kind: 'diff'; lines: string[] }

export const PROMPT = 'the date tests fail every few runs. can you fix it?'
export const PROMPT_TYPING = { from: b(3.4), to: b(4.5) }
export const SEND_AT = b(4.8)
/** The turn: from the prompt being sent until the final answer finishes. */
export const TURN = { from: SEND_AT, to: b(31.1) }

export const CHAT: ChatItem[] = [
  { t: SEND_AT, kind: 'user', text: PROMPT },
  { t: SEND_AT + 0.6, kind: 'text', text: "On it. I'll start with the test file and see what makes it flaky." },
  { t: b(5.6), kind: 'tool', name: 'Read', arg: 'tests/dates.test.ts' },
  { t: b(5.6) + 0.5, kind: 'result', text: 'Read 84 lines' },
  { t: b(6.6), kind: 'text', text: 'The test picks a random year. Checking `daysInMonth()` next.' },
  { t: b(7.4), kind: 'tool', name: 'Grep', arg: '"daysInMonth" in src/' },
  { t: b(7.4) + 0.4, kind: 'result', text: 'Found 3 matches in 2 files' },
  { t: b(9.2), kind: 'tool', name: 'Bash', arg: 'npm test -- --seed 1900' },
  { t: b(9.6), kind: 'result', text: '✗ 1 failed, 41 passed', tone: 'bad' },
  { t: b(11.6), kind: 'text', text: "There it is: 1900 counts as a leap year. `daysInMonth()` only checks `year % 4`." },
  { t: b(13), kind: 'tool', name: 'Update', arg: 'src/dates.ts' },
  {
    t: b(13) + 0.4,
    kind: 'diff',
    lines: ['-  const leap = year % 4 === 0', '+  const leap = (year % 4 === 0 && year % 100 !== 0)', '+    || year % 400 === 0'],
  },
  { t: b(25.4), kind: 'tool', name: 'Bash', arg: 'npm test' },
  { t: b(25.4) + 0.5, kind: 'result', text: '✓ 42/42 passed (2.41s)', tone: 'ok' },
  {
    t: b(29) + 0.3,
    kind: 'text',
    cps: 120,
    text:
      'Fixed. `daysInMonth()` treated every year divisible by 4 as a leap year, and the test picks a random year, so it failed whenever it rolled a century like 1900.\n' +
      '• Applied the full Gregorian rule: every 4 years, not every 100, but every 400\n' +
      '• Added cases for 1900, 2000 and 2024\n' +
      '• Pinned the seed in `dates.test.ts`, so a failure replays\n' +
      'All 42 tests pass, ten runs in a row.',
  },
]

/** The working spinner's words while the turn runs. */
export const SPINNER = ['Ultracoding', 'Sleuthing', 'Leap-yearing', 'Ultracoding']

/** The end card, over the sleeping village. */
export const END_CARD = { from: b(33), title: 'Claude Fables', line: 'a Claude Code mod for the desktop app', repo: 'henrik-thevibe/Claude-Fables' }

/** Sound cues on the video's clock. */
export const CUES = {
  stamp: [b(1)],
  keys: { from: PROMPT_TYPING.from, to: PROMPT_TYPING.to, count: PROMPT.length },
  send: [SEND_AT],
  bonk: [b(10) + 0.3 + 0.35],
  whoosh: FULL_SPANS.filter(s => s.from > 0).flatMap(s => [s.from - 0.15]).concat([b(12) - 0.1, b(25) - 0.1, b(29) - 0.1]),
  chime: [b(25.4) + 0.5],
  sparkle: [b(27) + 0.2],
}
