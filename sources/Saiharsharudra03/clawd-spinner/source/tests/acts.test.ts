import { expect, test } from 'claude-code/testing'

import * as A from '../hooks/acts'

const codePoints = (cells: Uint32Array) => cells.filter((_, i) => i % 3 === 0)

test('spinner words map to the act Clawd can play', () => {
  expect(A.actFor('Sautéing')).toBe('cook')
  expect(A.actFor('Baking')).toBe('cook')
  expect(A.actFor('Pondering')).toBe('think')
  expect(A.actFor('Vibing')).toBe('dance')
  expect(A.actFor('Moonwalking')).toBe('dance')
  expect(A.actFor('Forging')).toBe('build')
  expect(A.actFor('Reticulating')).toBe('compute')
  expect(A.actFor('Moseying')).toBe('stroll')
  expect(A.actFor('Herding')).toBe('herd')
  expect(A.actFor('Mustering')).toBe('herd')
  expect(A.actFor('Thundering')).toBe('weather')
  expect(A.actFor('Sprouting')).toBe('garden')
  expect(A.actFor('Hyperspacing')).toBe('space')
  expect(A.actFor('Clauding')).toBe('magic')
  expect(A.actFor('Whatever-new-word')).toBe('magic')
})

test('every act fills exactly columns x rows printable, one-wide cells with valid colours', () => {
  const words = ['Sautéing', 'Pondering', 'Vibing', 'Moonwalking', 'Forging', 'Computing', 'Scurrying', 'Herding',
    'Thundering', 'Gusting', 'Nesting', 'Hyperspacing', 'Levitating', 'Clauding']
  for (const word of words) {
    for (const columns of [50, 140]) {
      for (let t = 0; t < 9000; t += 777) {
        const cells = A.frame({ word, t }, columns)
        expect(cells.length).toBe(columns * A.ROWS * 3)
        expect(codePoints(cells).every(cp => cp >= 0x20 && cp < 0xd800)).toBe(true)
        expect(cells.filter((_, i) => i % 3 !== 0).every(c => c <= 0xffffff || c === 0x01000000)).toBe(true)
      }
    }
  }
})

test('Clawd moves: frames differ over time', () => {
  const at = (t: number) => A.encode(A.frame({ word: 'Moseying', t }, 100))
  expect(at(0) === at(1500)).toBe(false)
  expect(A.elapsed(12_400)).toBe('12s')
  expect(A.elapsed(64_000)).toBe('1m 4s')
})

test('look-alike words go to the right act', () => {
  expect(A.actFor('Photosynthesizing')).toBe('garden')
  expect(A.actFor('Whatchamacalliting')).toBe('magic')
  expect(A.actFor('Noodling')).toBe('dance')
  expect(A.actFor('Canoodling')).toBe('dance')
  expect(A.actFor('Hatching')).toBe('garden')
})
