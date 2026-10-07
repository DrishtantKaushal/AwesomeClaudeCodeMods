import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { applyDetected, detect, summary } from '../hooks/detect'
import { STRINGS } from '../hooks/i18n'

const META = { day: '09-23', session: 'abcd1234' }
const TYPED = {
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const
const SITE = { scroll: { offset: 0, bodyRows: 20 }, view: {} } as const
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, ...SITE },
} as const
const ROW = {
  component: 'CommandOutput',
  requestId: 'm1',
  props: { command: 'leftovers', args: '', text: '', isErrored: false },
} as const

const left = (...commands: string[]) =>
  commands
    .reduce((list, command) => applyDetected(list, detect(command), META), [] as ReturnType<typeof applyDetected>)
    .map(item => `${item.kind} ${item.label} @ ${item.host}`)

test('認得遠端和本機留下的東西', () => {
  expect(
    left(
      "ssh -o ConnectTimeout=15 prod-1 'sudo systemctl enable --now backup-sync.timer'",
      "ssh prod-1 'cd ~/app; docker compose up -d 2>&1 | tail -2'",
      'launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.watcher.plist',
      'cp ~/.config/app/settings.json ~/.config/app/settings.json.bak-v2',
      'gh repo create acme/side-project --private --source=. --push',
      'git worktree add -q -b feat/x /Users/x/app-wt/font origin/main',
    ),
  ).toEqual([
    'systemd backup-sync.timer @ prod-1',
    'docker ~/app @ prod-1',
    'launchd com.example.watcher @ local',
    'backup ~/.config/app/settings.json.bak-v2 @ local',
    'repo side-project @ GitHub',
    'repo /Users/x/app-wt/font @ local',
  ])
})

test('收掉的指令會把對應那項拿掉', () => {
  expect(
    left(
      "ssh prod-1 'sudo systemctl enable --now backup-sync.timer'",
      'launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.watcher.plist',
      'cp a.json a.json.bak',
      'gh repo create acme/demo-app --private',
      "ssh prod-1 'sudo systemctl disable --now backup-sync.timer'",
      'launchctl bootout gui/$(id -u)/com.example.watcher; rm -v a.json.bak',
      'gh repo delete acme/demo-app --yes',
    ),
  ).toEqual([])
  expect(left('docker run -d --name mt-bench img && sleep 5 && docker rm -f mt-bench')).toEqual([])
})

test('查詢和重啟類的指令不記', () => {
  expect(
    left(
      "ssh prod-1 'sudo systemctl restart cloudflared && systemctl is-active cloudflared'",
      'crontab -l | grep backup',
      'docker compose exec app sh -c "echo up"',
      'docker run --rm -d img',
      'git status && cp a b',
    ),
  ).toEqual([])
})

test('指令裡的 undo 會帶上機器', () => {
  const [op] = detect("ssh prod-1 'sudo systemctl enable --now backup-sync.timer'").ops

  expect(op).toEqual({
    add: {
      kind: 'systemd',
      host: 'prod-1',
      label: 'backup-sync.timer',
      undo: "ssh prod-1 'sudo systemctl disable --now backup-sync.timer'",
    },
  })
  expect(summary(STRINGS.en, [], [])).toBe(undefined)
})

test('worktree 路徑接上當時的工作目錄', () => {
  const place = { cwd: '/Users/x/proj', home: '/Users/x' }
  const labels = (command: string) =>
    applyDetected([], detect(command, place), META).map(item => `${item.label} | ${item.undo}`)

  expect(labels('git worktree add .claude/worktrees/a -b fix/a')).toEqual([
    '~/proj/.claude/worktrees/a | git worktree remove ~/proj/.claude/worktrees/a',
  ])
  expect(labels('cd ../other && git -C sub worktree add ./wt')).toEqual([
    '~/other/sub/wt | git worktree remove ~/other/sub/wt',
  ])
  expect(labels('git worktree add /tmp/wt && git worktree remove ../../../tmp/wt')).toEqual([])
})

test('寫檔用的 heredoc 內容不當指令，餵給 shell 的才算', () => {
  expect(left("cat > notes.md <<'EOF'\ndocker compose up -d\ncrontab jobs.txt\nEOF")).toEqual([])
  expect(left("python3 - <<'EOF'\nprint('docker run -d img')\nEOF\ncp a.json a.json.bak")).toEqual([
    'backup a.json.bak @ local',
  ])
  expect(left("bash <<'EOF'\ndocker run -d --name cache redis\nEOF")).toEqual(['docker cache @ local'])
})

test('同一條指令設的變數會代回去再記', () => {
  expect(
    left(
      "P=~/Library/LaunchAgents/me.ezlo.tunnel.plist; cat > $P <<'EOF'\n<plist/>\nEOF\nplutil -lint $P && launchctl bootstrap gui/$(id -u) $P",
    ),
  ).toEqual(['launchd me.ezlo.tunnel @ local'])
  expect(left('export NAME="cache"; docker run -d --name ${NAME} redis')).toEqual(['docker cache @ local'])
  expect(left("ssh prod-1 'U=sync.timer; sudo systemctl enable --now $U'")).toEqual(['systemd sync.timer @ prod-1'])
  expect(left('launchctl bootstrap gui/$(id -u) $UNSET')).toEqual(['launchd $UNSET @ local'])
})

test('備份檔路徑接上工作目錄，家目錄縮成 ~', () => {
  const place = { cwd: '/Users/x/proj', home: '/Users/x' }
  const labels = (command: string) =>
    applyDetected([], detect(command, place), META).map(item => `${item.label} | ${item.undo}`)

  expect(labels('cp /Users/x/proj/config.json /Users/x/proj/config.json.bak')).toEqual([
    '~/proj/config.json.bak | rm ~/proj/config.json.bak',
  ])
  expect(labels('cp config.json config.json.bak && rm /Users/x/proj/config.json.bak')).toEqual([])
  expect(labels("ssh prod-1 'cp app.conf app.conf.bak'")).toEqual(['app.conf.bak | ssh prod-1 \'rm app.conf.bak\''])
})

test('worktree 目錄不見了就自動劃掉', async ($, on) => {
  let isThere = true
  mock.clock(on, { now: Date.UTC(2026, 8, 23, 4) })
  mock.store(on)
  mock.env(on, { HOME: '/Users/x' })
  on('session.id', () => ({ value: 'abcd1234-rest' }))
  on('session.cwd', () => ({ value: '/Users/x/proj' }))
  on('ui.log', () => ({ value: undefined }))
  on('fs.exists', ($, e) => ({ value: isThere && e.path === '/Users/x/proj/.claude/worktrees/a' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  on('turn.complete', ($, e) => ({ text: e.answer }))

  const turn = { answer: 'done', durationMs: 1, isAborted: false, reason: 'answer' } as const

  await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'git worktree add .claude/worktrees/a -b fix/a' })
  await $.turn.complete({ ...turn, turnId: 'u1' })
  expect((await $.command.run({ command: 'leftovers', ...TYPED })).text).toContain(
    'repo ~/proj/.claude/worktrees/a @ local',
  )

  isThere = false
  await $.turn.complete({ ...turn, turnId: 'u2' })
  expect((await $.command.run({ command: 'leftovers', ...TYPED })).text).toBe('nothing left behind.')
})

test('記帳、band、輸出列的按鈕', async ($, on) => {
  const prompts: string[] = []
  mock.clock(on, { now: Date.UTC(2026, 8, 23, 4) })
  mock.store(on)
  mock.env(on, { HOME: '/Users/x' })
  on('session.id', () => ({ value: 'abcd1234-rest' }))
  on('ui.log', () => ({ value: undefined }))
  on('process.run', ($, e) => ({
    value: {
      exitCode: 0,
      stdout: e.argv.includes('rev-parse') ? '/Users/x/proj\n' : ' M a.ts\n?? b.ts\n',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  on('tool.call', { tool: 'Edit' }, () => ({ result: {} as never }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)

    return { text: e.text }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  await $.tool.call({
    tool: 'Bash',
    tool_use_id: 't1',
    command: "ssh prod-1 'sudo systemctl enable --now backup-sync.timer'",
  })
  await $.tool.call({
    tool: 'Edit',
    tool_use_id: 't2',
    file_path: '/Users/x/proj/src/a.ts',
    old_string: 'a',
    new_string: 'b',
  })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 'u1', reason: 'answer' })

  const band = await $.ui.mount({ plugin: 'leftovers', surface: 'terminal', ...BAND })

  expect((await band.find({ type: 'Button', key: 'toggle' }))?.props.label).toBe('2 leftovers ▾')
  expect((await band.find({ type: 'Text', text: /backup-sync/ }))?.text).toBe('systemd backup-sync.timer')
  expect(JSON.stringify(await band.drawn())).toContain('"hover":{"color":"#fabd2f"}')
  expect(JSON.stringify(await band.drawn())).toContain('"hover":{"color":"#b8bb26","dimColor":false}')
  expect(await band.find({ type: 'Text', text: '~/proj' })).toBe(undefined)

  await band.press({ key: 'toggle' })
  expect((await band.find({ type: 'Button', key: 'toggle' }))?.props.label).toBe('2 leftovers ▴')
  expect(await band.find({ type: 'Text', text: '~/proj' })).toBeDefined()

  await band.press({ key: 'toggle' })
  expect(await band.find({ type: 'Text', text: '~/proj' })).toBe(undefined)
  await band.press({ key: 'toggle' })

  await band.press({ key: 'review-1' })
  expect(prompts.at(-1)).toContain('uncommitted changes in ~/proj')
  await band.unmount()

  const listed = await $.command.run({ command: 'leftovers', ...TYPED })

  expect(listed.text?.split('\n').slice(0, 4)).toEqual([
    '2 leftovers: 1 service · 1 repo uncommitted',
    '1. 09-23 systemd backup-sync.timer @ prod-1',
    "   clean up: ssh prod-1 'sudo systemctl disable --now backup-sync.timer'",
    '- ~/proj 2 files uncommitted',
  ])

  for (const surface of ['terminal', 'desktop'] as const) {
    const row = await $.ui.mount({ plugin: 'leftovers', surface, ...ROW })

    expect(await row.find({ type: 'Text', text: 'backup-sync.timer' })).toBeDefined()
    expect(await row.find({ type: 'Text', text: '~/proj' })).toBeDefined()
    await row.unmount()
  }

  const row = await $.ui.mount({ plugin: 'leftovers', surface: 'terminal', ...ROW })

  await row.press({ key: 'undo-1' })
  expect(prompts.at(-1)).toContain('backup-sync.timer (prod-1, created 09-23)')

  await row.press({ key: 'skip-1' })

  const single = await $.ui.mount({ plugin: 'leftovers', surface: 'terminal', ...BAND })

  expect((await single.find({ type: 'Text', text: /leftover/ }))?.text).toBe('1 leftover')
  expect(await single.find({ type: 'Button', key: 'toggle' })).toBe(undefined)
  await single.press({ key: 'drop-1' })
  expect(await single.find({ type: 'Text', text: /leftover/ })).toBe(undefined)
  await single.unmount()

  expect(await row.find({ type: 'Text', text: 'Nothing left behind.' })).toBeDefined()
})

test('舊版帳本的本機和未命名 container 會換成語言中立代號', async ($, on) => {
  mock.store(on, {
    items: [
      {
        id: 'docker:本機:未命名 container',
        kind: 'docker',
        host: '本機',
        label: '未命名 container',
        undo: 'docker ps',
        day: '09-20',
        session: 's',
      },
    ],
  })
  mock.env(on, { HOME: '/Users/x' })
  on('ui.log', () => ({ value: undefined }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', () => ({ cwd: '/Users/x' }))

  await $.session.start({ cwd: '/Users/x', surface: 'terminal', isInteractive: true })

  expect((await $.command.run({ command: 'leftovers', ...TYPED })).text?.split('\n')[1]).toBe(
    '1. 09-20 docker unnamed container @ local',
  )
})

const SEEDED = [
  {
    id: 'launchd:local:com.example.watcher',
    kind: 'launchd',
    host: 'local',
    label: 'com.example.watcher',
    undo: 'launchctl bootout gui/$(id -u)/com.example.watcher',
    day: '09-23',
    session: 's',
  },
  {
    id: 'background:prod-1:tmux build',
    kind: 'background',
    host: 'prod-1',
    label: 'tmux build',
    undo: "ssh prod-1 'tmux kill-session -t build'",
    day: '09-24',
    session: 's',
  },
]

const startSeeded = async ($: Engine, on: On, prompts: string[]) => {
  mock.store(on, { items: SEEDED })
  mock.env(on, { HOME: '/Users/x' })
  on('ui.log', () => ({ value: undefined }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', () => ({ cwd: '/Users/x' }))
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)

    return { text: e.text }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  await $.session.start({ cwd: '/Users/x', surface: 'terminal', isInteractive: true })
}

test('繁體中文', { options: { language: 'zh-TW' } }, async ($, on) => {
  const prompts: string[] = []
  await startSeeded($, on, prompts)

  expect((await $.command.run({ command: 'leftovers', ...TYPED })).text?.split('\n')).toEqual([
    '留著 2 項：2 服務',
    '1. 09-23 launchd com.example.watcher @ 本機',
    '   收掉：launchctl bootout gui/$(id -u)/com.example.watcher',
    '2. 09-24 背景程序 tmux build @ prod-1',
    "   收掉：ssh prod-1 'tmux kill-session -t build'",
    '',
    '/leftovers drop <編號> 從帳本拿掉，/leftovers clear 全清',
  ])

  const band = await $.ui.mount({ plugin: 'leftovers', surface: 'terminal', ...BAND })

  expect((await band.find({ type: 'Button', key: 'toggle' }))?.props.label).toBe('留著 2 項 ▾')
  expect((await band.find({ type: 'Button', key: 'undo-1' }))?.props.label).toBe('收掉')
  await band.press({ key: 'undo-1' })
  expect(prompts.at(-1)).toContain('收掉 leftovers 記的這一項：launchd com.example.watcher（本機，09-23 建的）')
  await band.unmount()
})

test('简体中文', { options: { language: 'zh-CN' } }, async ($, on) => {
  await startSeeded($, on, [])

  const lines = (await $.command.run({ command: 'leftovers', ...TYPED })).text?.split('\n')

  expect(lines?.[0]).toBe('遗留 2 项：2 个服务')
  expect(lines?.[3]).toBe('2. 09-24 后台进程 tmux build @ prod-1')

  const band = await $.ui.mount({ plugin: 'leftovers', surface: 'terminal', ...BAND })

  expect((await band.find({ type: 'Button', key: 'toggle' }))?.props.label).toBe('遗留 2 项 ▾')
  expect((await band.find({ type: 'Button', key: 'undo-1' }))?.props.label).toBe('清理')
  await band.unmount()
})
