import type { RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const ENGINE_ROW: RenderElement = { type: 'Text', props: {}, children: ['engine row'] }
const VIEWPORT = { columns: 100, rows: 30, isFullscreen: true }
const DONE = { isRunning: false, isErrored: false, isInterrupted: false }
const EIGHT_LINES = [1, 2, 3, 4, 5, 6, 7, 8].map(n => `line ${n}`).join('\n')

function row(tool: string, input: unknown, more: Record<string, unknown> = {}) {
  return {
    plugin: 'shell-highlight',
    component: 'ToolUse',
    requestId: 'toolu_1',
    viewport: VIEWPORT,
    props: { tool_use_id: 'toolu_1', tool, input, ...DONE, ...more },
  } as const
}

type GroupCall = { tool: string; input: unknown; tool_use_id?: string; output?: unknown }

function group(calls: readonly GroupCall[], isExpanded = false) {
  return {
    plugin: 'shell-highlight',
    component: 'ToolGroup',
    requestId: 'group_1',
    viewport: VIEWPORT,
    props: { calls: calls.map(call => ({ ...DONE, ...call })), isActive: false, isExpanded },
  } as const
}

const SEQ = { tool_use_id: 'toolu_1', tool: 'Bash', input: { command: 'seq 1 8' }, output: { stdout: EIGHT_LINES, stderr: '' } }
const READ = { tool_use_id: 'toolu_2', tool: 'Read', input: { file_path: 'README.md' } }
const LONG_COMMAND = Array.from({ length: 14 }, (_, n) => `echo ${n + 1}`).join('\n')
const LONG = { tool_use_id: 'toolu_1', tool: 'Bash', input: { command: LONG_COMMAND }, output: { stdout: 'ok', stderr: '' } }

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: a Bash command is drawn as highlighted code`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const ui = await $.ui.mount({ ...row('Bash', { command: 'cd ~/.claude && ls -la', description: 'List' }), surface })
    expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: 'cd ~/.claude && ls -la', language: 'bash' })
    expect(await ui.find({ text: 'List' })).toBeDefined()
    expect(await ui.find({ text: 'engine row' })).toBeUndefined()
    await ui.unmount()
  })

  test(`${surface}: a PowerShell command is drawn as highlighted code`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const ui = await $.ui.mount({ ...row('PowerShell', { command: 'Get-ChildItem -Force' }), surface })
    expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ language: 'powershell' })
    await ui.unmount()
  })

  test(`${surface}: an embedded script is highlighted in its own language`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const command = "node <<'EOF'\nconsole.log(1)\nEOF"
    const ui = await $.ui.mount({ ...row('Bash', { command }), surface })
    const languages = (await ui.findAll({ type: 'Code' })).map(code => code.props?.language)
    expect(languages).toEqual(['bash', 'javascript', 'bash'])
    await ui.unmount()
  })

  test(`${surface}: a command with control characters is still drawn`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const ui = await $.ui.mount({ ...row('Bash', { command: 'printf "\u001b[31mred"' }), surface })
    expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: 'printf "␛[31mred"' })
    await ui.unmount()
  })

  test(`${surface}: a command longer than one element is drawn in several`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const command = Array.from({ length: 8 }, (_, n) => `echo ${'x'.repeat(3000)}${n}`).join('\n')
    const ui = await $.ui.mount({ ...row('Bash', { command }), surface })
    expect((await ui.findAll({ type: 'Code' })).length).toBe(3)
    await ui.unmount()
  })

  test(`${surface}: a row of an unfolded group shows the whole command and the whole output`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const unfolded = await $.ui.mount({ ...group([{ ...LONG, output: SEQ.output }], true), surface })
    const ui = await $.ui.mount({ ...row('Bash', LONG.input, { output: SEQ.output }), surface })
    expect((await ui.find({ type: 'Code' }))?.props?.source).toBe(LONG_COMMAND)
    expect(await ui.find({ text: 'line 8' })).toBeDefined()
    await ui.unmount()
    await unfolded.unmount()
  })

  test(`${surface}: a row of an unfolded group without output says so, a running one says it runs`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const input = { command: 'true' }
    const output = { stdout: '', stderr: '' }
    const unfolded = await $.ui.mount({ ...group([{ tool_use_id: 'toolu_1', tool: 'Bash', input, output }], true), surface })
    const ui = await $.ui.mount({ ...row('Bash', input, { output }), surface })
    expect(await ui.find({ text: '(no output)' })).toBeDefined()
    await ui.redraw({ tool_use_id: 'toolu_1', tool: 'Bash', input, ...DONE, isRunning: true })
    expect(await ui.find({ text: 'Running…' })).toBeDefined()
    await ui.unmount()
    await unfolded.unmount()
  })

  test(`${surface}: a row on its own draws the command and leaves the output to the engine`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const ui = await $.ui.mount({ ...row('Bash', SEQ.input, { output: SEQ.output }), surface })
    expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: 'seq 1 8' })
    expect(await ui.find({ text: 'line 1' })).toBeUndefined()
    await ui.unmount()

    const result = { tool_use_id: 'toolu_1', tool: 'Bash', output: SEQ.output, isErrored: false }
    const block = await $.ui.mount({ plugin: 'shell-highlight', component: 'ToolResult', requestId: 'toolu_1', viewport: VIEWPORT, props: result, surface })
    expect(await block.find({ text: 'engine row' })).toBeDefined()
    await block.unmount()
  })

  test(`${surface}: a call that has not run yet has no output line`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const ui = await $.ui.mount({ ...row('Bash', { command: 'true' }), surface })
    expect(await ui.find({ type: 'Code' })).toBeDefined()
    expect(await ui.find({ text: '(no output)' })).toBeUndefined()
    expect(await ui.find({ text: '⎿' })).toBeUndefined()
    await ui.unmount()
  })

  test(`${surface}: the engine's result block is left empty for a row that drew its output`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const result = { tool_use_id: 'toolu_1', tool: 'Bash', output: SEQ.output, isErrored: false }
    const target = { plugin: 'shell-highlight', component: 'ToolResult', requestId: 'toolu_1', viewport: VIEWPORT, props: result, surface } as const

    const unfolded = await $.ui.mount({ ...group([SEQ], true), surface })
    const drawn = await $.ui.mount({ ...row('Bash', SEQ.input, { output: SEQ.output }), surface })
    expect(await drawn.find({ text: 'line 1' })).toBeDefined()
    const block = await $.ui.mount(target)
    expect(await block.find({ text: 'engine row' })).toBeUndefined()
    await block.unmount()
    await drawn.unmount()
    await unfolded.unmount()
  })

  test(`${surface}: other tools keep the engine's row`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const ui = await $.ui.mount({ ...row('Read', READ.input), surface })
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    expect(await ui.find({ text: 'engine row' })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: a group without shell calls is left alone`, async ($, on) => {
    const seen: boolean[] = []
    on('ui.render', ($$, e) => {
      if (e.component === 'ToolGroup') seen.push(e.props.isExpanded)
      return ENGINE_ROW
    })
    const ui = await $.ui.mount({ ...group([READ]), surface })
    expect(seen).toEqual([false])
    expect(await ui.find({ text: 'engine row' })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: a folded group of shell calls is drawn as folded commands`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const ui = await $.ui.mount({ ...group([SEQ]), surface })
    expect(await ui.find({ text: 'engine row' })).toBeUndefined()
    expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: 'seq 1 8' })
    expect(await ui.find({ text: 'line 5' })).toBeDefined()
    expect(await ui.find({ text: 'line 6' })).toBeUndefined()
    expect(await ui.find({ text: '… +3 lines (click to expand)' })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: a folded group cuts a long command and counts its lines`, async ($, on) => {
    on('ui.render', () => ENGINE_ROW)
    const ui = await $.ui.mount({ ...group([LONG]), surface })
    expect((await ui.find({ type: 'Code' }))?.props?.source).toBe(LONG_COMMAND.split('\n').slice(0, 10).join('\n'))
    expect(await ui.find({ text: '… +4 lines (click to expand)' })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: a folded mixed group keeps the engine's line above the commands`, async ($, on) => {
    const seen: boolean[] = []
    on('ui.render', ($$, e) => {
      if (e.component === 'ToolGroup') seen.push(e.props.isExpanded)
      return ENGINE_ROW
    })
    const ui = await $.ui.mount({ ...group([READ, SEQ]), surface })
    expect(seen).toEqual([false])
    expect(await ui.find({ text: 'engine row' })).toBeDefined()
    expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: 'seq 1 8' })
    expect(await ui.find({ text: '… +3 lines (click to expand)' })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: an unfolded group is the engine's, which draws each call as a row`, async ($, on) => {
    const seen: boolean[] = []
    on('ui.render', ($$, e) => {
      if (e.component === 'ToolGroup') seen.push(e.props.isExpanded)
      return ENGINE_ROW
    })
    const ui = await $.ui.mount({ ...group([SEQ], true), surface })
    expect(seen).toEqual([true])
    expect(await ui.find({ text: 'engine row' })).toBeDefined()
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    await ui.unmount()
  })
}
