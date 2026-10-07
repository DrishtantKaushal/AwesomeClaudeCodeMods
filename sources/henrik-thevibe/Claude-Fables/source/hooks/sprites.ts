/**
 * The built-in pixel art. Each sprite is rows of characters; each character is
 * a key into PALETTE ('.' is transparent). The key 'a' is the accent: a prop's
 * own color when the scene gives one, else the sprite's default accent.
 */

export const PALETTE: Record<string, string> = {
  o: '#d97757', // Claude orange
  O: '#b85c3e', // shaded orange
  k: '#1f1e1d', // ink
  w: '#ece9df', // paper
  W: '#b9b5a8', // shaded paper
  g: '#8a8780', // stone
  G: '#5e9c4a', // leaf
  d: '#3c6e34', // deep leaf
  b: '#7a4a2b', // bark
  B: '#5a3520', // dark bark
  r: '#e05252', // red
  y: '#e3b341', // gold
  u: '#4a90c2', // blue
  U: '#2f6690', // deep blue
  p: '#7b5fb5', // purple
  P: '#54408a', // deep purple
  c: '#6fc2c9', // cyan
  l: '#f06a2b', // lava
  s: '#c9a46a', // sand
  m: '#5b5f6b', // metal
  M: '#3b3e47', // dark metal
}

export type Sprite = { rows: readonly string[]; accent: string }

/** The hero: two walk frames of the orange critter. */
export const HERO_FRAMES: readonly (readonly string[])[] = [
  [
    '..ooooooooo..',
    '..ooooooooo..',
    '..okoooooko..',
    '..okoooooko..',
    'ooooooooooooo',
    'ooooooooooooo',
    '..ooooooooo..',
    '..o.o...o.o..',
    '..o.o...o.o..',
  ],
  [
    '..ooooooooo..',
    '..ooooooooo..',
    '..okoooooko..',
    '..okoooooko..',
    'ooooooooooooo',
    'ooooooooooooo',
    '..ooooooooo..',
    '...o.o.o.o...',
    '..o..o...o.o.',
  ],
]

export const SPRITES = {
  bug: {
    accent: '#e05252',
    rows: ['.k...k.', '..k.k..', '.aaaaa.', 'kakakak', '.aaaaa.', 'k.a.a.k', '.k...k.'],
  },
  file: {
    accent: '#ece9df',
    rows: ['aaaaa..', 'aaaaaa.', 'aggggaa', 'aaaaaaa', 'agggaaa', 'aaaaaaa', 'aggggaa', 'aaaaaaa'],
  },
  folder: {
    accent: '#e3b341',
    rows: ['aaa.....', 'aaaaaaaa', 'aaaaaaaa', 'aaaaaaaa', 'aaaaaaaa', 'aaaaaaaa'],
  },
  ship: {
    accent: '#ece9df',
    rows: [
      '......k.......',
      '.....ak.......',
      '....aak.a.....',
      '...aaak.aa....',
      '..aaaak.aaa...',
      '.aaaaak.aaaa..',
      '......k.......',
      'bbbbbbbbbbbbbb',
      '.bbbbbbbbbbbb.',
      '..BBBBBBBBBB..',
    ],
  },
  train: {
    accent: '#4a90c2',
    rows: [
      'aaaaaaaaaaaaaa',
      'awwaawwaawwaaa',
      'awwaawwaawwaaa',
      'aaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaa',
      'mmmmmmmmmmmmmm',
      '.kk......kk...',
    ],
  },
  door: {
    accent: '#7a4a2b',
    rows: ['.aaaa.', 'aaaaaa', 'aBBBBa', 'aBaaBa', 'aBaaBa', 'aBaayB', 'aBaaBa', 'aBaaBa', 'aaaaaa'],
  },
  cloud: {
    accent: '#ece9df',
    rows: ['...aaaa.....', '..aaaaaaa...', '.aaaaaaaaaa.', 'aaaaaaaaaaaa', '.WWWWWWWWWW.'],
  },
  volcano: {
    accent: '#f06a2b',
    rows: [
      '.......aaa........',
      '......aBaBa.......',
      '......bBBBb.......',
      '.....bbbbbbb......',
      '.....bbBbbbb......',
      '....bbbbbbbbb.....',
      '....bbbbbBbbb.....',
      '...bbbBbbbbbbb....',
      '..bbbbbbbbbbbbbb..',
      '..bbbbbbbbBbbbbb..',
      '.bbbbBbbbbbbbbbbb.',
      'bbbbbbbbbbbbbbbbbb',
    ],
  },
  tree: {
    accent: '#5e9c4a',
    rows: ['..aaa..', '.aaaaa.', 'aaaadaa', 'aadaaaa', '.aaaaa.', '..aaa..', '...b...', '...b...', '..bbb..'],
  },
  rocket: {
    accent: '#e05252',
    rows: [
      '...a...',
      '..aaa..',
      '..www..',
      '..wuw..',
      '..www..',
      '..www..',
      '.awwwa.',
      'aawwwaa',
      '..lyl..',
      '...l...',
    ],
  },
  planet: {
    accent: '#7b5fb5',
    rows: [
      '...aaaa...',
      '.aaaaaaaa.',
      'aaPaaaaaaa',
      'aaaaaaPPaa',
      'aaaaaaaaaa',
      'aPPaaaaaaa',
      'aaaaaaaPaa',
      '.aaaaaaaa.',
      '...aaaa...',
    ],
  },
  cactus: {
    accent: '#5e9c4a',
    rows: ['...a...', '...a...', 'a..a...', 'a..a..a', 'aaaa..a', '...aaaa', '...a...', '...a...', '...a...'],
  },
  server: {
    accent: '#5fd35f',
    rows: ['mmmmmmmm', 'mMMMMMam', 'mmmmmmmm', 'mMMMMMym', 'mmmmmmmm', 'mMMMMMam', 'mmmmmmmm', 'mMMMMMam', 'mmmmmmmm', 'k......k'],
  },
  gear: {
    accent: '#8a8780',
    rows: ['...a...', '.aaaaa.', '.aa.aa.', 'aa...aa', '.aa.aa.', '.aaaaa.', '...a...'],
  },
  trophy: {
    accent: '#e3b341',
    rows: ['aaaaaaa', 'aaaaaaa', 'aaaaaaa', '.aaaaa.', '..aaa..', '...a...', '..aaa..', '.aaaaa.'],
  },
  flag: {
    accent: '#e05252',
    rows: ['kaaaa', 'kaaaaa', 'kaaaa', 'k....', 'k....', 'k....', 'k....', 'k....'],
  },
  chest: {
    accent: '#e3b341',
    rows: ['.bbbbbbb.', 'bbbbbbbbb', 'aaaaaaaaa', 'bbbbabbbb', 'bbbbbbbbb', 'bbbbbbbbb'],
  },
  key: {
    accent: '#e3b341',
    rows: ['.aa......', 'a..aaaaaa', '.aa...a.a'],
  },
  bomb: {
    accent: '#3b3e47',
    rows: ['....y', '...b.', '.aaa.', 'aaaaa', 'aaaaa', 'aaaaa', '.aaa.'],
  },
  fish: {
    accent: '#e3b341',
    rows: ['..aaa..a', '.aaaaaaa', 'akaaaa.a', '.aaaaaaa', '..aaa..a'],
  },
  star: {
    accent: '#e3b341',
    rows: ['..a..', '..a..', 'aaaaa', '.aaa.', '.a.a.'],
  },
  beaker: {
    accent: '#6fc2c9',
    rows: ['.ww.', '.ww.', '.ww.', 'w..w', 'waaw', 'waaw', 'wwww'],
  },
  house: {
    accent: '#e05252',
    rows: ['....aa....', '...aaaa...', '..aaaaaa..', '.aaaaaaaa.', 'aaaaaaaaaa', '.wwwwwwww.', '.wuwwwbbw.', '.wwwwwbbw.', '.wwwwwbbw.'],
  },
  mushroom: {
    accent: '#e05252',
    rows: ['..aaaa..', '.awaaaa.', 'aaaaawaa', 'awaaaaaa', '...ww...', '...ww...', '..wwww..'],
  },
  crystal: {
    accent: '#6fc2c9',
    rows: ['..a..', '.aaa.', '.awa.', 'aaaaa', 'aawaa', '.aaa.', '..a..'],
  },
  magnifier: {
    accent: '#6fc2c9',
    rows: ['.mmm...', 'maaam..', 'maaam..', 'maaam..', '.mmmm..', '....mm.', '.....mm'],
  },
  bird: {
    accent: '#4a90c2',
    rows: ['a.....a', '.a...a.', '..aaa..'],
  },
  lamp: {
    accent: '#e3b341',
    rows: ['.mmm.', 'maaam', '.aaa.', '..m..', '..m..', '..m..', '.mmm.'],
  },
  anchor: {
    accent: '#8a8780',
    rows: ['..a..', '.a.a.', '..a..', 'aaaaa', '..a..', 'a.a.a', '.aaa.'],
  },
  ghost: {
    accent: '#ece9df',
    rows: ['.aaaa.', 'aaaaaa', 'akaaka', 'aaaaaa', 'aaaaaa', 'a.aa.a'],
  },
  coin: {
    accent: '#e3b341',
    rows: ['.aaa.', 'aayaa', 'aayaa', 'aayaa', '.aaa.'],
  },
  book: {
    accent: '#4a90c2',
    rows: ['aaaaaaa', 'awwwwwa', 'awgggwa', 'awwwwwa', 'awgggwa', 'aaaaaaa'],
  },
} as const satisfies Record<string, Sprite>

export type SpriteName = keyof typeof SPRITES
export const SPRITE_NAMES = Object.keys(SPRITES) as readonly SpriteName[]
