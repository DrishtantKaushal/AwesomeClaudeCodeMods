import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const FILES = ['src/app/main.ts', 'src/domain/order.ts', 'src/domain/user.ts', 'docs/spec.md', 'README.md', 'src/domain/user.ts.meta', 'src.meta', 'notes.meta'].join('\n')
const CLEAR = {
  command: 'touch-map',
  args: 'clear',
  origin: { kind: 'plugin', name: 'test' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

// エンジンの外側（git、ファイル、時計、ツールの実行）をテストの中で答え、書き出したログを集める
// status は git status --porcelain -z の出力（呼ばれた回数を渡して切り替えられる）、mtimes はファイルごとの更新時刻
// bashText は Bash の出力、ownClock はテストが時計を自分で持つとき
type Extra = { status?: (calls: number) => string; mtimes?: Record<string, number>; bashText?: string; ownClock?: boolean; placed?: boolean }

const stub = (on: On, list = FILES, extra: Extra = {}) => {
  let statusCalls = 0
  const written: { path: string; text: string }[] = []
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.root', async () => ({ value: '/repo' }))
  on('session.cwd', async () => ({ value: '' }))
  on('process.run', async (_$, e) => ({
    value: {
      exitCode: 0,
      stdout: e.argv[0] === 'printenv' ? '/home/me\n' : e.argv[1] === 'status' ? extra.status?.(statusCalls++) ?? '' : list,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('fs.exists', async () => ({ value: false }))
  on('fs.stat', async (_$, e) => ({ value: { kind: 'file' as const, size: 1, mtimeMs: extra.mtimes?.[e.path] ?? 0, isLink: false } }))
  on('fs.write', async (_$, e) => {
    written.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  if (!extra.ownClock) on('clock.now', async () => ({ value: 60_000 }))
  on('session.id', async () => ({ value: 's1' }))
  const store = new Map<string, unknown>()
  on('store.get', async (_$, e) => ({ value: store.get(e.key) ?? null }))
  on('store.set', async (_$, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', async () => ({ value: { command: 'touch-map' } }))
  on('ui.open', async () => ({ value: extra.placed === false ? { isPlaced: false as const, reason: 'narrow' } : { isPlaced: true as const } }))
  on('tool.call', async (_$, e) => {
    // 範囲を指定した Read は、Claude Code と同じく読んだ行と全体の行数を返す（全体は100行）
    if (e.tool === 'Read' && e.offset !== undefined) {
      const numLines = Math.min(e.limit ?? 2000, 101 - e.offset)
      return { result: { type: 'text', file: { filePath: e.file_path, content: '', startLine: e.offset, numLines, totalLines: 100 } }, text: 'ok' }
    }
    return { result: {}, text: e.tool === 'Bash' ? extra.bashText ?? 'src/domain/user.ts:3:export type User' : 'ok' }
  })
  return written
}

test('ファイルごとにいちばん深い状態を残し、区切るとログに書き出す', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/domain/order.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/domain/payment.ts', content: 'x' })
  await $.tool.call({ tool: 'Bash', command: 'grep -rn "User" src' })
  await $.tool.call({ tool: 'Bash', command: 'cat README.md | head -5' })
  await $.tool.call({ tool: 'Bash', command: 'sed -n 1,20p docs/spec.md; head -3 src/app/main.ts' })
  // wc は行数しか出さないので名前だけ
  await $.tool.call({ tool: 'Bash', command: 'wc -l docs/spec.md src/domain/order.ts' })
  await $.command.run(CLEAR)

  expect(written).toHaveLength(1)
  expect(written[0]?.path).toMatch(/^\/home\/me\/\.claude\/touch-map-logs\/.+\.json$/)
  expect(JSON.parse(written[0]?.text ?? '{}')).toMatchObject({
    root: '/repo',
    files: {
      'src/domain/order.ts': { s: 3, c: [1, 0, 1, 1, 0] },
      'src/domain/payment.ts': { s: 4 },
      // grep -rn の「ファイル:行:中身」は部分読取
      'src/domain/user.ts': { s: 1 },
      'README.md': { s: 2 },
      // sed -n・head は一部の行しか見ていない
      'docs/spec.md': { s: 1 },
      'src/app/main.ts': { s: 1 },
    },
  })
})

test('区切ったあとは空から数え直す', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/docs/spec.md' })
  await $.command.run(CLEAR)
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app/main.ts' })
  await $.command.run(CLEAR)

  expect(written).toHaveLength(2)
  expect(Object.keys(JSON.parse(written[1]?.text ?? '{}').files)).toEqual(['src/app/main.ts'])
})

test('ペインを描け、記録したファイルが色付きで並ぶ', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'touch-map',
      surface,
      component: 'Pane',
      requestId: 'touch-map',
      props: { title: 'Touch map', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
      viewport: { columns: 60, rows: 40 },
    })
    expect(await ui.find({ text: 'order.ts' })).toBeDefined()
    expect(await ui.find({ text: /untouched/ })).toBeDefined()
    expect(await ui.find({ key: 'save' })).toBeDefined()
    await ui.unmount()
  }
})

test('compact と /clear で区切る。compact は作業名を残し、/clear は state が消える前に記録する', async ($, on) => {
  const written = stub(on)
  on('classic.SessionStart', async () => ({}))
  on('session.end', async () => ({ sessionId: 's1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/docs/spec.md' })
  await $.classic.SessionStart({ source: 'compact' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app/main.ts' })
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)

  expect(written).toHaveLength(2)
  expect(Object.keys(JSON.parse(written[0]?.text ?? '{}').files)).toEqual(['docs/spec.md'])
  expect(Object.keys(JSON.parse(written[1]?.text ?? '{}').files)).toEqual(['src/app/main.ts'])
})

test('最小化は $.store にも残し、/clear のあとに戻す', async ($, on) => {
  const written = stub(on)
  on('classic.SessionStart', async () => ({}))
  on('session.end', async () => ({ sessionId: 's1' }))
  on('ui.close', async () => ({ value: undefined }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...CLEAR, args: 'debug on' })
  await $.command.run({ ...CLEAR, args: 'min' })
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  await $.classic.SessionStart({ source: 'clear' })
  const view = written.filter(w => w.path.endsWith('.view.txt')).pop()?.text ?? ''
  expect(view).toContain('# Touch map (minimized)')
})

test('最小化するとプロンプトの上に件数と［open］を出す', async ($, on) => {
  stub(on)
  on('ui.close', async () => ({ value: undefined }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/docs/spec.md' })
  await $.command.run({ ...CLEAR, args: 'min' })

  const band = await $.ui.mount({
    plugin: 'touch-map',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {} as never,
  })
  expect(await band.find({ text: '/6' })).toBeDefined()
  expect(await band.find({ key: 'open' })).toBeDefined()
  await band.unmount()
})

test('自動で読み込まれた指示ファイルを記録し、/clear では遅れて読み込まれたものだけ消す', async ($, on) => {
  const written = stub(on)
  on('classic.SessionStart', async () => ({}))
  on('classic.InstructionsLoaded', async () => ({}))
  on('session.end', async () => ({ sessionId: 's1' }))
  // session.start より先に届いても取りこぼさない
  await $.classic.InstructionsLoaded({ file_path: '/repo/CLAUDE.md', memory_type: 'Project', load_reason: 'session_start' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.classic.InstructionsLoaded({ file_path: '/home/me/.claude/CLAUDE.md', memory_type: 'User', load_reason: 'session_start' })
  await $.classic.InstructionsLoaded({ file_path: '/repo/src/domain/CLAUDE.md', memory_type: 'Project', load_reason: 'nested_traversal' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts' })
  await $.command.run(CLEAR)

  expect(JSON.parse(written[0]?.text ?? '{}').instructions).toEqual({
    'CLAUDE.md': 'session_start',
    '~/.claude/CLAUDE.md': 'session_start',
    'src/domain/CLAUDE.md': 'nested_traversal',
  })

  // 手動の区切りでは自動読込は残る。/clear では遅れて読み込まれたものだけ消える
  await $.tool.call({ tool: 'Read', file_path: '/repo/README.md' })
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  await $.classic.SessionStart({ source: 'clear' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/README.md' })
  await $.command.run(CLEAR)
  expect(JSON.parse(written[1]?.text ?? '{}').instructions).toMatchObject({ 'src/domain/CLAUDE.md': 'nested_traversal' })
  expect(JSON.parse(written[2]?.text ?? '{}').instructions).toEqual({
    'CLAUDE.md': 'session_start',
    '~/.claude/CLAUDE.md': 'session_start',
  })
})

test('ヒアドキュメントや引用符の中の > を書き込みとみなさない', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: "python3 - <<'PY'\nif a > 0: print(b => c)\nx = '0\")'\nPY\necho \"a > b\" && cat >> $HOME/x.ts <<'EOF2'\nconst y = z > 1\nEOF2" })
  await $.tool.call({ tool: 'Bash', command: 'echo hi > notes/new.md && sort src/app/main.ts > out.txt 2>&1' })
  await $.command.run(CLEAR)

  expect(Object.keys(JSON.parse(written[0]?.text ?? '{}').files).sort()).toEqual(['notes/new.md', 'out.txt', 'src/app/main.ts'])
})

test('/touch-map debug で on にすると、判定結果とペインの中身をテキストで書き出す', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...CLEAR, args: 'debug' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts' })
  await $.tool.call({ tool: 'Read', file_path: '/elsewhere/notes.md' })
  await $.tool.call({ tool: 'Bash', command: 'grep -rn "User" src' })

  const last = (suffix: string) => written.filter(w => w.path.endsWith(suffix)).pop()?.text ?? ''
  const events = last('.events.jsonl').trim().split('\n').map(l => JSON.parse(l))
  expect(written.every(w => w.path.startsWith('/home/me/.claude/touch-map-logs/debug/s1.'))).toBe(true)
  expect(events.map(ev => ev.ev)).toEqual(['debug', 'tool', 'tool', 'tool'])
  expect(events[1]).toMatchObject({ tool: 'Read', hits: ['read:src/domain/order.ts'] })
  expect(events[2]).toMatchObject({ hits: [], skip: 'outside the repo' })
  expect(events[3]).toMatchObject({ tool: 'Bash', hits: ['partial:src/domain/user.ts'] })
  expect(last('.view.txt')).toContain('[read] order.ts')
  expect(last('.view.txt')).toContain('[partial] user.ts')
})

test('debug が off なら何も書き出さない', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts' })
  expect(written).toHaveLength(0)
})

test('cd した先から相対パスを解決し、リポジトリの外は記録しない', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'cd ~/.claude/memory && echo x >> MEMORY.md && cat MEMORY.md' })
  await $.tool.call({ tool: 'Bash', command: 'cd src/domain && cat order.ts && echo y > note.md' })
  // リポジトリの中の cd は次の呼び出しに持ち越す
  await $.tool.call({ tool: 'Bash', command: 'cat user.ts' })
  await $.tool.call({ tool: 'Bash', command: 'cd $DIR && echo z > a.md' })
  await $.command.run(CLEAR)

  expect(Object.keys(JSON.parse(written[0]?.text ?? '{}').files).sort()).toEqual(['src/domain/note.md', 'src/domain/order.ts', 'src/domain/user.ts'])
})

test('リポジトリの外を ls したときは、出力にリポジトリのファイル名があっても拾わない', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls -lt ~/.claude/touch-map-logs/debug/ | head; cat ~/.claude/touch-map-logs/debug/s1.view.txt' })
  await $.tool.call({ tool: 'Bash', command: 'git ls-files 2>/dev/null | head' })
  await $.command.run(CLEAR)

  // 1つ目（外を見た ls）では拾わず、2つ目（リポジトリの git ls-files）でだけ拾う
  expect(JSON.parse(written[0]?.text ?? '{}').files).toEqual({ 'src/domain/user.ts': { s: 0, c: [1, 0, 0, 0, 0] } })
})

test('ファイルを名指しした grep は部分読取、-l は名前だけ。1回の呼び出しでは1回だけ数える', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'cd src/domain && grep -n "Order" order.ts | head' })
  await $.tool.call({ tool: 'Bash', command: 'cd /repo && grep -n "a" src/domain/user.ts src/app/main.ts; grep -n "b" src/domain/user.ts' })
  await $.tool.call({ tool: 'Bash', command: 'grep -rl User src' })
  await $.command.run(CLEAR)

  expect(JSON.parse(written[0]?.text ?? '{}').files).toEqual({
    'src/domain/order.ts': { s: 1, c: [0, 1, 0, 0, 0] },
    'src/domain/user.ts': { s: 1, c: [1, 1, 0, 0, 0] },
    'src/app/main.ts': { s: 1, c: [0, 1, 0, 0, 0] },
  })
})

test('本体と対になる .meta は一覧から外す', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...CLEAR, args: 'debug on' })
  const view = written.filter(w => w.path.endsWith('.view.txt')).pop()?.text ?? ''
  expect(view).toContain('touched 0/6 (2 .meta hidden)')
})

test('範囲を指定した Read は部分読取。読んだ範囲が合わせて全体になったら読取に上げる', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts', offset: 40, limit: 30 })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts', offset: 60, limit: 41 })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/user.ts', offset: 1, limit: 100 })

  const ui = await $.ui.mount({
    plugin: 'touch-map',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'touch-map',
    props: { title: 'Touch map', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
    viewport: { columns: 80, rows: 40 },
  })
  expect(await ui.find({ text: '40–100' })).toBeDefined()
  await ui.unmount()

  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts', offset: 1, limit: 39 })
  await $.command.run(CLEAR)
  expect(JSON.parse(written[0]?.text ?? '{}').files).toMatchObject({
    'src/domain/order.ts': { s: 2, c: [0, 3, 0, 0, 0], r: [[1, 100]], n: 100 },
    // 1行目から最後まで読んだら、範囲を指定していても読取
    'src/domain/user.ts': { s: 2, c: [0, 0, 1, 0, 0] },
  })
})

test('終了したときも、その区間を記録する', async ($, on) => {
  const written = stub(on)
  on('session.end', async () => ({ sessionId: 's1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/docs/spec.md' })
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1' } as never)
  expect(written).toHaveLength(1)
  expect(Object.keys(JSON.parse(written[0]?.text ?? '{}').files)).toEqual(['docs/spec.md'])
})

test('rm・mv で消したファイルに削除の印を付け、作り直したら外す', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...CLEAR, args: 'debug on' })
  await $.tool.call({ tool: 'Bash', command: 'rm docs/spec.md && git mv src/app/main.ts src/app/entry.ts' })
  await $.tool.call({ tool: 'Bash', command: 'mv README.md docs' })

  const view = written.filter(w => w.path.endsWith('.view.txt')).pop()?.text ?? ''
  expect(view).toContain('[deleted] main.ts')
  expect(view).toContain('[created] entry.ts')
  expect(view).toContain('[deleted] spec.md')
  expect(view).toContain('[created] README.md')

  await $.tool.call({ tool: 'Write', file_path: '/repo/docs/spec.md', content: 'again' })
  await $.command.run(CLEAR)
  const files = JSON.parse(written.filter(w => !w.path.includes('/debug/')).pop()?.text ?? '{}').files
  expect(files['src/app/main.ts']).toMatchObject({ s: 3, d: true })
  expect(files['docs/spec.md'].d).toBeUndefined()
  expect(files['docs/README.md']).toMatchObject({ s: 4 })
})

test('新しく作ったファイルも、骨組みを作り直してツリーに出る', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const mount = () => $.ui.mount({
    plugin: 'touch-map',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'touch-map',
    props: { title: 'Touch map', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
    viewport: { columns: 80, rows: 40 },
  })
  const before = await mount()
  expect(await before.find({ text: /^payment\.ts$/ })).toBeUndefined()
  await before.unmount()
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/domain/payment.ts', content: 'x' })
  const after = await mount()
  expect(await after.find({ text: /^payment\.ts$/ })).toBeDefined()
  await after.unmount()
})

const PANE_PROPS = { title: 'Touch map', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

test('ディレクトリの ▾ を押すと畳み、もう一度押すと開く', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts' })
  const ui = await $.ui.mount({ plugin: 'touch-map', surface: 'terminal', component: 'Pane', requestId: 'touch-map', props: PANE_PROPS, viewport: { columns: 80, rows: 40 } })
  // src/ と domain/ は触った子が1つだけなので1行につながる
  expect(await ui.find({ text: 'src/domain/' })).toBeDefined()
  expect(await ui.find({ text: 'order.ts' })).toBeDefined()
  await ui.press({ key: 'go:dir:src/domain' })
  expect(await ui.find({ text: /^order\.ts$/ })).toBeUndefined()
  await ui.press({ key: 'go:dir:src/domain' })
  expect(await ui.find({ text: /^order\.ts$/ })).toBeDefined()
  await ui.unmount()
})

test('1000 を超える数は縮めて出す', async ($, on) => {
  const many = Array.from({ length: 1834 }, (_, i) => `gen/f${i}.ts`).join('\n')
  const written = stub(on, many)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...CLEAR, args: 'debug on' })
  const view = written.filter(w => w.path.endsWith('.view.txt')).pop()?.text ?? ''
  expect(view).toContain('touched 0/1.8k')
})

// Raster の cells を [文字, 前景, 背景] の組に戻す
const decode = (cells: string) => {
  const bytes = Uint8Array.from(atob(cells), c => c.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer)
  const out: [number, number, number][] = []
  for (let i = 0; i < words.length; i += 3) out.push([words[i] ?? 0, words[i + 1] ?? 0, words[i + 2] ?? 0])
  return out
}

test('アクティビティマップ: ファイルを漏れなくマスに並べ、触ったマスに色を付ける。map off で消える', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts' })
  const mount = () => $.ui.mount({ plugin: 'touch-map', surface: 'terminal', component: 'Pane', requestId: 'touch-map', props: PANE_PROPS, viewport: { columns: 80, rows: 40 } })
  const ui = await mount()
  const map = await ui.find({ key: 'map' })
  const squares = decode(String((map?.props as { cells?: string } | undefined)?.cells ?? '')).filter(([ch]) => ch === 0x25a0)
  // .meta を除いた 6 ファイル、1 マスに 1 ファイル
  expect(squares).toHaveLength(6)
  // 触っていないマスはすべて同じ暗い色。触ったマスだけ色が違う
  expect(squares.filter(([, fg]) => fg !== 0x2b303a)).toHaveLength(1)
  await ui.unmount()

  await $.command.run({ ...CLEAR, args: 'map off' })
  const off = await mount()
  expect(await off.find({ key: 'map' })).toBeUndefined()
  await off.unmount()
})

test('アクティビティマップ: マス目が埋まるだけファイルがあれば、全マスに重なりなく並ぶ', async ($, on) => {
  // 幅 80 桁なら 40×6 = 240 マス
  stub(on, Array.from({ length: 240 }, (_, i) => `pkg${String(i % 7)}/f${String(i).padStart(3, '0')}.ts`).join('\n'))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'touch-map', surface: 'terminal', component: 'Pane', requestId: 'touch-map', props: PANE_PROPS, viewport: { columns: 80, rows: 40 } })
  const map = await ui.find({ key: 'map' })
  expect(decode(String((map?.props as { cells?: string } | undefined)?.cells ?? '')).filter(([ch]) => ch === 0x25a0)).toHaveLength(240)
  await ui.unmount()
})

test('Bash はセッションの現在の場所（cd 済み）から相対パスを解決する', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'cd src/domain' })
  await $.tool.call({ tool: 'Bash', command: 'cat order.ts' })
  await $.command.run(CLEAR)
  expect(Object.keys(JSON.parse(written[0]?.text ?? '{}').files)).toEqual(['src/domain/order.ts'])
})

test('パイプの後ろの grep（標準入力の絞り込み）は、ファイルの中身を見たことにしない', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'grep -ciE "user" src/domain/*.ts | grep -v ":0"' })
  await $.command.run(CLEAR)
  expect(JSON.parse(written[0]?.text ?? '{}').files).toEqual({ 'src/domain/user.ts': { s: 0, c: [1, 0, 0, 0, 0] } })
})

test('アクティビティマップ: ファイルがマスで割り切れなくても、空きマスを作らない', async ($, on) => {
  // 幅 80 桁なら 40×6 = 240 マス。262 件を配ると、1 件のマスと 2 件のマスが混ざって全部埋まる
  stub(on, Array.from({ length: 262 }, (_, i) => `d${String(i % 5)}/f${String(i).padStart(3, '0')}.ts`).join('\n'))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'touch-map', surface: 'terminal', component: 'Pane', requestId: 'touch-map', props: PANE_PROPS, viewport: { columns: 80, rows: 40 } })
  const map = await ui.find({ key: 'map' })
  expect(decode(String((map?.props as { cells?: string } | undefined)?.cells ?? '')).filter(([ch]) => ch === 0x25a0)).toHaveLength(240)
  await ui.unmount()
})

test('アクティビティマップ: 縦長に縮んでも、はみ出さずに全ファイルを並べる', async ($, on) => {
  // 9 件なら幅 2・高さ 6 の縦長になる
  stub(on, Array.from({ length: 9 }, (_, i) => `f${i}.ts`).join('\n'))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'touch-map', surface: 'terminal', component: 'Pane', requestId: 'touch-map', props: PANE_PROPS, viewport: { columns: 80, rows: 40 } })
  const map = await ui.find({ key: 'map' })
  expect(decode(String((map?.props as { cells?: string } | undefined)?.cells ?? '')).filter(([ch]) => ch === 0x25a0)).toHaveLength(9)
  await ui.unmount()
})

test('git worktree の中のファイルは、リポジトリの同じパスとして数える', async ($, on) => {
  const written: { path: string; text: string }[] = []
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.root', async () => ({ value: '/repo' }))
  on('session.cwd', async () => ({ value: '/repo' }))
  on('process.run', async (_$, e) => ({
    value: {
      exitCode: 0,
      stdout: e.argv[0] === 'printenv' ? '/home/me\n' : e.argv[1] === 'worktree' ? 'worktree /repo\nHEAD 1\n\nworktree /work/repo-fix\nHEAD 1\n' : e.init?.cwd === '/work/repo-fix' ? `${FILES}\nsrc/domain/probe.ts` : FILES,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('fs.exists', async () => ({ value: false }))
  on('fs.write', async (_$, e) => {
    written.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('clock.now', async () => ({ value: 60_000 }))
  on('command.register', async () => ({ value: { command: 'touch-map' } }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  on('store.get', async () => ({ value: null }))
  on('tool.call', async () => ({ result: {}, text: 'ok' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/work/repo-fix/src/domain/order.ts' })
  await $.tool.call({ tool: 'Bash', command: 'cd /work/repo-fix && cat docs/spec.md' })
  // ワークツリーにしかないファイルも、名指しの grep で拾える
  await $.tool.call({ tool: 'Bash', command: 'cd /work/repo-fix/src/domain && grep -n "x" probe.ts' })
  await $.tool.call({ tool: 'Read', file_path: '/elsewhere/notes.md' })
  await $.command.run(CLEAR)
  expect(Object.keys(JSON.parse(written[0]?.text ?? '{}').files).sort()).toEqual(['docs/spec.md', 'src/domain/order.ts', 'src/domain/probe.ts'])
})

test('スクリプトでの書き換えは git status と更新時刻で拾う。実行前からの変更は拾わない', async ($, on) => {
  const written = stub(on, FILES, {
    // 1 回目は起動時の控え（README.md はまだある）、2 回目はスクリプトの実行後
    status: calls => (calls === 0 ? ' M docs/spec.md\0' : ' M src/domain/order.ts\0?? notes/gen.md\0 M docs/spec.md\0 D README.md\0'),
    // docs/spec.md はコマンドより前（人の編集）、ほかはコマンドの実行中に書かれた
    mtimes: { '/repo/src/domain/order.ts': 60_000, '/repo/notes/gen.md': 60_000, '/repo/docs/spec.md': 1_000 },
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: "python3 - <<'EOF'\nopen('src/domain/order.ts','w').write('x')\nEOF" })
  await $.command.run(CLEAR)
  const files = JSON.parse(written[0]?.text ?? '{}').files
  expect(Object.keys(files).sort()).toEqual(['README.md', 'notes/gen.md', 'src/domain/order.ts'])
  expect(files['src/domain/order.ts']).toMatchObject({ s: 3 })
  expect(files['notes/gen.md']).toMatchObject({ s: 4 })
  expect(files['README.md']).toMatchObject({ d: true })
})

test('読むだけのコマンドでは git status を走らせない', async ($, on) => {
  let calls = 0
  stub(on, FILES, { status: n => ((calls = n + 1), '') })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const afterStart = calls
  await $.tool.call({ tool: 'Bash', command: 'grep -rn "User" src | head -5; git log -1 2>/dev/null' })
  expect(calls).toBe(afterStart)
  await $.tool.call({ tool: 'Bash', command: 'npm run build' })
  expect(calls).toBe(afterStart + 1)
})

test('Bash の出力はタブや全角空白で区切っても語に分け、引用符や .. を含む名前も拾う', async ($, on) => {
  const written = stub(on, FILES, { bashText: '"src/app/main.ts"\tdocs/spec.md\u3000README.md\n  ./src/../src/domain/order.ts:3:x\r\n' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls src docs' })
  await $.command.run(CLEAR)
  expect(JSON.parse(written[0]?.text ?? '{}').files).toEqual({
    'src/app/main.ts': { s: 0, c: [1, 0, 0, 0, 0] },
    'docs/spec.md': { s: 0, c: [1, 0, 0, 0, 0] },
    'README.md': { s: 0, c: [1, 0, 0, 0, 0] },
    'src/domain/order.ts': { s: 0, c: [1, 0, 0, 0, 0] },
  })
})

test('触っていないものは件数と名前順の先頭を1行に出し、開くと全部並べる', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts' })
  const ui = await $.ui.mount({ plugin: 'touch-map', surface: 'terminal', component: 'Pane', requestId: 'touch-map', props: PANE_PROPS, viewport: { columns: 80, rows: 40 } })
  // src/ と domain/ をつなげた行の下には、domain の未接触と、つなげて飛ばした src/app/ が並ぶ
  expect(await ui.find({ text: '2 untouched: user.ts src/app/' })).toBeDefined()
  // 対になる本体のない .meta は残る
  expect(await ui.find({ text: '3 untouched: docs/ README.md notes.meta' })).toBeDefined()
  expect(await ui.find({ text: /^user\.ts$/ })).toBeUndefined()
  await ui.press({ key: 'go:quiet:src/domain#quiet' })
  expect(await ui.find({ text: /^user\.ts$/ })).toBeDefined()
  expect(await ui.find({ text: /^src\/app\/$/ })).toBeDefined()
  await ui.unmount()
})

test('アクティビティマップ: 光っている途中で状態が変わったら、塗り直しの色も変わる', async ($, on) => {
  const blits: string[] = []
  stub(on, FILES, { ownClock: true })
  const clock = mock.clock(on, { now: 1_000_000 })
  on('ui.blit', async (_$, e) => {
    blits.push(String((e as { cells?: string }).cells ?? ''))
    return { value: undefined } as never
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'touch-map', surface: 'terminal', component: 'Pane', requestId: 'touch-map', props: PANE_PROPS, viewport: { columns: 80, rows: 40 } })
  const colors = () => decode(blits[blits.length - 1] ?? '').filter(([ch]) => ch === 0x25a0).map(([, fg]) => fg)
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts' })
  await clock.advance(4100)
  // 光り終わると読み取りの色
  expect(colors()).toContain(0x60a5fa)
  await $.tool.call({ tool: 'Read', file_path: '/repo/docs/spec.md' })
  await clock.advance(200)
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/domain/order.ts', old_string: 'a', new_string: 'b' })
  await clock.advance(4100)
  // 途中で更新したファイルは更新の色、あとから読んだファイルは読み取りの色
  expect(colors()).toContain(0xfb923c)
  expect(colors()).toContain(0x60a5fa)
  await ui.unmount()
})

test('デバッグ出力: ペインの中身が変わらなければ view は書き直さず、イベントは毎回書く', async ($, on) => {
  const written = stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...CLEAR, args: 'debug on' })
  const count = (suffix: string) => written.filter(w => w.path.endsWith(suffix)).length
  const views = count('.view.txt')
  const events = count('.events.jsonl')
  await $.tool.call({ tool: 'Glob', pattern: '*' } as never)
  await $.tool.call({ tool: 'Glob', pattern: '*' } as never)
  expect(count('.view.txt')).toBe(views)
  expect(count('.events.jsonl')).toBe(events + 2)
  await $.tool.call({ tool: 'Read', file_path: '/repo/docs/spec.md' })
  expect(count('.view.txt')).toBe(views + 1)
  expect(written.filter(w => w.path.endsWith('.view.txt')).pop()?.text).toContain('[read] spec.md')
  // off にしてから on にし直したら、同じ中身でも書く
  await $.command.run({ ...CLEAR, args: 'debug off' })
  await $.command.run({ ...CLEAR, args: 'debug on' })
  expect(count('.view.txt')).toBe(views + 2)
})

test('アクティビティマップ: サブエージェントが触ったマスは黄色で光る', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const mount = () => $.ui.mount({ plugin: 'touch-map', surface: 'terminal', component: 'Pane', requestId: 'touch-map', props: PANE_PROPS, viewport: { columns: 80, rows: 40 } })
  // 配置はペインを描いたときに決まるので、一度描いてから触る
  await (await mount()).unmount()
  // サブエージェントの呼び出しは agentId 付きで届く（テストの型には無いので as never）
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts', agentId: 'sub-1' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/repo/docs/spec.md' })
  const ui = await mount()
  const map = await ui.find({ key: 'map' })
  const fgs = decode(String((map?.props as { cells?: string } | undefined)?.cells ?? '')).filter(([ch]) => ch === 0x25a0).map(([, fg]) => fg)
  expect(fgs).toContain(0xfde047)
  expect(fgs).toContain(0xffffff)
  await ui.unmount()
})

test('帯は「全部は読んでいない」ときだけ出す。ディレクトリは ■、部分読取は ━ と ─。最小化のボタンは置かない', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/user.ts' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/domain/order.ts', offset: 1, limit: 50 })
  const ui = await $.ui.mount({ plugin: 'touch-map', surface: 'terminal', component: 'Pane', requestId: 'touch-map', props: PANE_PROPS, viewport: { columns: 80, rows: 40 } })
  const all = JSON.stringify(await ui.find({ key: 'row:dir:src/domain' }))
  expect(all).toContain('■')
  expect(all).not.toContain('█')
  const partial = JSON.stringify(await ui.find({ key: 'row:file:src/domain/order.ts' }))
  expect(partial).toContain('━')
  expect(partial).toContain('─')
  const full = JSON.stringify(await ui.find({ key: 'row:file:src/domain/user.ts' }))
  expect(full).not.toMatch(/[━─┄■█]/)
  expect(await ui.find({ key: 'min' })).toBeUndefined()
  await ui.unmount()
})

test('帯の [ open ] で開く（ペインが置けるとき）', async ($, on) => {
  const written = stub(on, FILES, { placed: true })
  on('ui.close', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...CLEAR, args: 'debug on' })
  await $.command.run({ ...CLEAR, args: 'min' })
  const band = await $.ui.mount({ plugin: 'touch-map', surface: 'terminal', component: 'AbovePrompt', props: {} as never })
  await band.press({ key: 'open' })
  await band.unmount()
  const view = written.filter(w => w.path.endsWith('.view.txt')).pop()?.text ?? ''
  // 置けたら最小化が解け、保留されたら最小化のまま（帯が残る）
  expect(view.startsWith('# Touch map (minimized)')).toBe(false)
})

test('帯の [ open ] で開く（ペインが保留されるとき）', async ($, on) => {
  const written = stub(on, FILES, { placed: false })
  on('ui.close', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...CLEAR, args: 'debug on' })
  await $.command.run({ ...CLEAR, args: 'min' })
  const band = await $.ui.mount({ plugin: 'touch-map', surface: 'terminal', component: 'AbovePrompt', props: {} as never })
  await band.press({ key: 'open' })
  await band.unmount()
  const view = written.filter(w => w.path.endsWith('.view.txt')).pop()?.text ?? ''
  // 置けたら最小化が解け、保留されたら最小化のまま（帯が残る）
  expect(view.startsWith('# Touch map (minimized)')).toBe(true)
})

test('アクティビティマップ: 新しく作ったファイルのマスも光る', async ($, on) => {
  stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const mount = () => $.ui.mount({ plugin: 'touch-map', surface: 'terminal', component: 'Pane', requestId: 'touch-map', props: PANE_PROPS, viewport: { columns: 80, rows: 40 } })
  // 配置はペインを描いたときに決まる。新しいファイルはそのあとに作る
  await (await mount()).unmount()
  await $.tool.call({ tool: 'Write', file_path: '/repo/notes/new.md', content: 'x' })
  const ui = await mount()
  const map = await ui.find({ key: 'map' })
  const fgs = decode(String((map?.props as { cells?: string } | undefined)?.cells ?? '')).filter(([ch]) => ch === 0x25a0).map(([, fg]) => fg)
  expect(fgs).toContain(0xffffff)
  await ui.unmount()
})
