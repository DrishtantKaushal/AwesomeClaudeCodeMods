import { expect, mock, test } from 'claude-code/testing'

import { clip, merge, neighbor, parseTranscript, tickWindow } from '../hooks/register'

const BAR = {
  plugin: 'prompt-jump',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const row = (o: object) => JSON.stringify(o)

test('reads only typed prompts out of a transcript', async () => {
  const jsonl = [
    row({ type: 'user', uuid: 'c1', message: { content: '<command-name>/model</command-name>' } }),
    row({ type: 'user', uuid: 'm1', isMeta: true, message: { content: 'caveat' } }),
    row({ type: 'user', uuid: 'p1', message: { content: 'hello' } }),
    row({ type: 'assistant', uuid: 'a1', message: { content: [{ type: 'text', text: 'hi' }] } }),
    row({ type: 'user', uuid: 't1', message: { content: [{ type: 'tool_result', content: 'x' }] } }),
    row({
      type: 'user',
      uuid: 'p2',
      message: { content: [{ type: 'text', text: '跳转到 prompt' }, { type: 'image' }] },
    }),
    '{broken',
  ].join('\n')
  expect(parseTranscript(jsonl)).toEqual([
    { id: 'p1', text: 'hello' },
    { id: 'p2', text: '跳转到 prompt' },
  ])
})

test('merge keeps transcript order and appends live-only prompts', async () => {
  const merged = merge([{ id: 'a', text: 'A' }], [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }])
  expect(merged.map(p => p.id)).toEqual(['a', 'b'])
})

test('clip counts wide glyphs as two cells', async () => {
  expect(clip('你好世界', 6)).toBe('你好…')
  expect(clip('a  b\nc', 10)).toBe('a b c')
})

test('tickWindow keeps the current prompt inside the window', async () => {
  const list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  expect(tickWindow(list, 2, 20)).toEqual({ items: list, from: 0 })
  expect(tickWindow(list, 9, 4)).toEqual({ items: [7, 8, 9, 10], from: 6 })
  expect(tickWindow(list, 5, 4)).toEqual({ items: [4, 5, 6, 7], from: 3 })
})

test('◀ goes to the current prompt first when its top is scrolled away', async () => {
  const list = [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ]
  const atTop = new Map([['b', { first: 0 }]])
  const scrolled = new Map([['b', { first: 9 }]])
  expect(neighbor(list, 'b', -1, atTop)).toBe('a')
  expect(neighbor(list, 'b', -1, scrolled)).toBe('b')
  expect(neighbor(list, 'b', 1, atTop)).toBe('c')
  expect(neighbor(list, 'c', 1, atTop)).toBeUndefined()
  expect(neighbor(list, 'gone', -1, atTop)).toBe('b')
})

test('/prompts shows the bar: a tick per prompt; pressing one asks to jump', async ($, on) => {
  const file = '/home/me/.claude/projects/-work/s-1.jsonl'
  const jsonl = [
    row({ type: 'user', uuid: 'u-1', message: { content: 'first prompt' } }),
    row({ type: 'user', uuid: 'u-2', message: { content: [{ type: 'text', text: 'second prompt' }] } }),
  ].join('\n')
  mock.env(on, { HOME: '/home/me' })
  on('session.id', () => ({ value: 's-1' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('fs.stat', (_$, e) => {
    if (e.path !== file) throw new Error('ENOENT')
    return { value: { kind: 'file', size: jsonl.length, mtimeMs: 0, isLink: false } }
  })
  on('fs.read', (_$, e) => {
    if (e.path !== file) throw new Error('ENOENT')
    return { value: jsonl }
  })
  on('command.register', () => ({ value: { command: 'prompts' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  // The engine's own band: nothing of its own to draw.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  const run = (args: string) =>
    $.command.run({
      command: 'prompts',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 150 },
    })

  // Hidden until /prompts.
  const ui = await $.ui.mount({ ...BAR, surface: 'terminal' })
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)

  expect((await run('')).text).toBe('Prompt bar shown.')
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.map(b => b.key)).toEqual(['jump:prev', 'jump:u-1', 'jump:u-2', 'jump:next'])
  // The newest prompt is the current one until the transcript says otherwise.
  expect((await ui.find({ key: 'jump:u-2' }))?.text).toBe('┃')
  expect(await ui.find({ type: 'Text', text: /2\/2/ })).toBeDefined()

  // No transcript is drawn under the test kit, so the jump is refused and said so.
  await ui.press({ key: 'jump:u-1' })
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('没能跳到这条 prompt')

  expect((await run('')).text).toBe('Prompt bar hidden.')
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  await ui.unmount()
})
