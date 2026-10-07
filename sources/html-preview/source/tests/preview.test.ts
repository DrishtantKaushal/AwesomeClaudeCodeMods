import { describe, expect, mock, test } from 'claude-code/testing'

const PAGE = '/work/plan.html'

describe('html-preview', () => {
  test('a written .html file opens in a terminal-browser split', { options: { mode: 'split' } }, async ($, on) => {
    const runs: (readonly string[])[] = []
    const toasts: string[] = []
    on('tool.call', () => ({ result: { type: 'create', filePath: PAGE, content: '', structuredPatch: [], originalFile: null } } as never))
    on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 0 } } as never))
    on('process.run', (_$, e) => {
      if (e.argv[0] !== '/bin/sh') runs.push(e.argv)
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('ui.toast', (_$, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })

    await $.tool.call({ tool: 'Write', file_path: PAGE, content: '<h1>hi</h1>' })

    expect(runs).toEqual([['terminal-browser', 'open', PAGE, '--split', 'right']])
    expect(toasts[0]).toContain('Opened /work/plan.html')
  })

  test('auto mode with Chrome shows a written .html file in the Claude Code pane', async ($, on) => {
    const runs: (readonly string[])[] = []
    const opened: string[] = []
    on('tool.call', () => ({ result: { type: 'create', filePath: PAGE, content: '', structuredPatch: [], originalFile: null } } as never))
    on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 0 } } as never))
    on('process.run', (_$, e) => {
      runs.push(e.argv)
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('ui.open', (_$, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } }
    })

    await $.tool.call({ tool: 'Write', file_path: PAGE, content: '<h1>hi</h1>' })

    expect(opened).toEqual(['html-preview'])
    expect(runs.some(argv => argv[0] === 'terminal-browser')).toBe(false)
  })

  test('other files are left alone', { options: { mode: 'split' } }, async ($, on) => {
    const runs: (readonly string[])[] = []
    on('tool.call', () => ({ result: { type: 'create', filePath: '/work/a.ts', content: '', structuredPatch: [], originalFile: null } } as never))
    on('process.run', (_$, e) => {
      if (e.argv[0] !== '/bin/sh') runs.push(e.argv)
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })

    await $.tool.call({ tool: 'Write', file_path: '/work/a.ts', content: 'x' })

    expect(runs).toEqual([])
  })

  test('a missing terminal-browser is explained, not installed unasked', { options: { mode: 'split' } }, async ($, on) => {
    const runs: (readonly string[])[] = []
    on('tool.call', () => ({ deny: 'dismissed' }))
    on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 0 } } as never))
    on('process.run', (_$, e) => {
      runs.push(e.argv)
      const isMissing = e.argv[2] === "command -v 'terminal-browser'"
      return { value: { exitCode: isMissing ? 1 : 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })

    const ran = await $.command.run({ command: 'preview', args: PAGE } as never)

    expect(ran.text).toContain('brew install terminal-browser')
    expect(runs.some(argv => argv[0] === 'brew' || argv[0] === 'terminal-browser')).toBe(false)
  })

  test('builtin mode without Chrome shows the page as text in a pane', { options: { mode: 'builtin' } }, async ($, on) => {
    const clock = mock.clock(on)
    on('fs.stat', (_$, e) => (e.path === PAGE ? { value: { kind: 'file', size: 10, mtimeMs: 0 } } : { deny: 'ENOENT' }) as never)
    on('fs.read', () => ({ value: '<h1>Plan</h1><p>Ship &amp; test</p>' }))
    on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))

    const ran = await $.command.run({ command: 'preview', args: PAGE } as never)
    expect(ran.text).toContain('preview pane')
    await clock.advance(0)

    const ui = await $.ui.mount({ plugin: 'html-preview', surface: 'terminal', component: 'Pane', requestId: 'html-preview', props: {} as never })
    expect((await ui.find({ type: 'Markdown' }))?.text).toContain('# Plan')
    expect(await ui.find({ type: 'Text', text: /Chrome\/Chromium not found/ })).toBeDefined()
  })

  test('/preview without a file explains its usage', async $ => {
    const ran = await $.command.run({ command: 'preview', args: '' } as never)

    expect(ran.text).toContain('Usage: /preview')
  })
})
