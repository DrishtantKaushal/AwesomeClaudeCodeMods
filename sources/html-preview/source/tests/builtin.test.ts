import { describe, expect, test } from 'claude-code/testing'

import { fitHeight } from '../hooks/builtin'

describe('fitHeight', () => {
  test('a tall pane asks for a tall viewport', () => {
    // 80 x 40 cells is square in pixels: 1280 tall, rounded to 50s.
    expect(fitHeight(80, 40)).toBe(1300)
  })

  test('the viewport stays between 400 and 4000 pixels', () => {
    expect(fitHeight(255, 4)).toBe(400)
    expect(fitHeight(10, 255)).toBe(4000)
  })
})
