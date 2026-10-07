import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register } from 'claude-code'

import type { DirtyRepo, Leftover } from '../types'
import {
  LOCAL,
  applyDetected,
  dayOf,
  detect,
  hostName,
  labelName,
  listText,
  migrated,
  ordered,
  whatOf,
} from './detect'
import type { Place } from './detect'
import { STRINGS, langOf } from './i18n'
import type { Strings } from './i18n'

const MAX_REPOS = 20
// Gruvbox：收掉是會動到東西的動作用黃，完成用綠。
// Button 平常不能上色，滑鼠移到那一列才會亮
const UNDO_COLOR = '#fabd2f'
const DONE_COLOR = '#b8bb26'
const SCRATCH = /^\/(private\/)?(tmp|var\/folders)\//

const items = atom({ plugin: 'leftovers', key: 'items' } as const, [])
const dirty = atom({ plugin: 'leftovers', key: 'dirty' } as const, [])
const isOpen = atom({ plugin: 'leftovers', key: 'isOpen' } as const, false)

type Entry = { n: number; item: Leftover } | { n: number; repo: DirtyRepo }

const stored = async <T,>($: EngineInterface, key: string): Promise<T[]> => {
  const value = await $.store.get(key)

  return Array.isArray(value) ? (value as T[]) : []
}

const ledger = async ($: EngineInterface) => (await stored<Leftover>($, 'items')).map(migrated)

// 帳本放 store 才能跨 session；每次重讀再寫，另一個 session 同時在記也不會整份互蓋
const mutate = async ($: EngineInterface, fn: (list: Leftover[]) => Leftover[]) => {
  const list = fn(await ledger($))
  await $.store.set('items', list)
  await update($, items, () => list)
}

// worktree 常被 script 整批清掉，指令裡看不到 remove，所以直接看目錄還在不在
const pruneGone = async ($: EngineInterface) => {
  const home = (await $.env.get('HOME')) ?? ''
  const gone: string[] = []

  for (const item of await ledger($)) {
    const path = item.label.startsWith('~') && home !== '' ? `${home}${item.label.slice(1)}` : item.label

    if (item.kind === 'repo' && item.host === LOCAL && path.startsWith('/') && !(await $.fs.exists(path))) {
      gone.push(item.id)
    }
  }

  if (gone.length > 0) {
    await mutate($, list => list.filter(item => !gone.includes(item.id)))
  }
}

// 指令跑完工作目錄可能已經換了，相對路徑要用跑之前的目錄去接
const placeOf = async ($: EngineInterface): Promise<Place> => {
  try {
    return { cwd: await $.session.cwd(), home: (await $.env.get('HOME')) ?? '' }
  } catch {
    return { cwd: '', home: '' }
  }
}

const git = async ($: EngineInterface, dir: string, ...args: string[]) => {
  try {
    const ran = await $.process.run(['git', '-C', dir, ...args], { timeoutMs: 5000 })

    return ran.exitCode === 0 ? ran.stdout : undefined
  } catch {
    return undefined
  }
}

const askToUndo = ($: EngineInterface, t: Strings, item: Leftover) =>
  $.prompt.submit({
    text: t.askToUndo(whatOf(t, item), hostName(t, item.host), item.day, item.undo),
    asUser: true,
  })

const askToReview = ($: EngineInterface, t: Strings, repo: DirtyRepo) =>
  $.prompt.submit({ text: t.askToReview(repo.label), asUser: true })

// 目錄對到哪個 repo 根目錄不會變，查過就記著
const roots = new Map<string, string | undefined>()

// 把動過的目錄對回 git repo 根目錄，記進要追蹤未 commit 狀態的清單
const track = async ($: EngineInterface, paths: readonly string[]) => {
  const home = (await $.env.get('HOME')) ?? ''
  const ignored = await stored<string>($, 'ignored')
  let repos = await stored<string>($, 'repos')
  const before = repos.length

  for (const raw of paths) {
    const dir = raw.startsWith('~') ? `${home}${raw.slice(1)}` : raw

    if (!dir.startsWith('/') || SCRATCH.test(dir)) {
      continue
    }
    if (!roots.has(dir)) {
      roots.set(dir, (await git($, dir, 'rev-parse', '--show-toplevel'))?.trim())
    }

    const root = roots.get(dir)

    if (root !== undefined && !ignored.includes(root) && !repos.includes(root)) {
      repos = [...repos, root].slice(-MAX_REPOS)
    }
  }

  if (repos.length !== before) {
    await $.store.set('repos', repos)
  }
}

const refreshDirty = async ($: EngineInterface) => {
  const home = (await $.env.get('HOME')) ?? ''
  const repos = await stored<string>($, 'repos')
  const alive: string[] = []
  const found: DirtyRepo[] = []

  for (const path of repos) {
    const status = await git($, path, 'status', '--porcelain')

    if (status === undefined) {
      continue
    }
    alive.push(path)

    const files = status.split('\n').filter(line => line.trim() !== '').length

    if (files > 0) {
      const label = home !== '' && path.startsWith(home) ? `~${path.slice(home.length)}` : path
      found.push({ path, label, files })
    }
  }

  if (alive.length !== repos.length) {
    await $.store.set('repos', alive)
  }
  if (JSON.stringify(found) !== JSON.stringify(await read($, dirty))) {
    await update($, dirty, () => found)
  }
}

const ignoreRepo = async ($: EngineInterface, path: string) => {
  await $.store.set('ignored', [...(await stored<string>($, 'ignored')), path])
  await $.store.set(
    'repos',
    (await stored<string>($, 'repos')).filter(one => one !== path),
  )
  await update($, dirty, list => list.filter(repo => repo.path !== path))
}

// band 的一列：一項加它的兩顆按鈕，key 跟輸出列的按鈕同一套
const bandRow = (
  $: EngineInterface,
  t: Strings,
  { Box, Button, Text }: Pick<ElementTable, 'Box' | 'Button' | 'Text'>,
  entry: Entry,
) =>
  'item' in entry ? (
    <Box key={`item-${entry.n}`} columnGap={1}>
      <Text wrap="truncate-middle">{whatOf(t, entry.item)}</Text>
      <Text dimColor>{hostName(t, entry.item.host)}</Text>
      <Button
        key={`undo-${entry.n}`}
        label={t.undo}
        hover={{ color: UNDO_COLOR }}
        onPress={() => {
          void askToUndo($, t, entry.item)
        }}
      />
      <Button
        key={`drop-${entry.n}`}
        label={t.done}
        dimColor
        hover={{ color: DONE_COLOR, dimColor: false }}
        onPress={() => mutate($, all => all.filter(one => one.id !== entry.item.id))}
      />
    </Box>
  ) : (
    <Box columnGap={1}>
      <Text wrap="truncate-start">{entry.repo.label}</Text>
      <Text dimColor>{t.uncommitted(entry.repo.files)}</Text>
      <Button
        key={`review-${entry.n}`}
        label={t.review}
        onPress={() => {
          void askToReview($, t, entry.repo)
        }}
      />
      <Button key={`skip-${entry.n}`} label={t.ignore} dimColor onPress={() => ignoreRepo($, entry.repo.path)} />
    </Box>
  )

// 記帳出錯不能連累工具本身的結果，只留一行 debug log
const quietly = async ($: EngineInterface, work: () => Promise<void>) => {
  try {
    await work()
  } catch {
    $.ui.log('leftovers: bookkeeping failed', { to: 'debug' })
  }
}

export const register: Register = (on, options) => {
  const t = STRINGS[langOf(options)]

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'leftovers', description: t.description, argumentHint: t.argumentHint })
    await quietly($, async () => {
      await mutate($, list => list)
      await pruneGone($)
      await refreshDirty($)
    })

    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const place = await placeOf($)
    const ran = await next(e)

    if (ran.deny !== undefined || ran.isError === true) {
      return ran
    }

    await quietly($, async () => {
      const detected = detect(e.command, place)

      if (detected.ops.length > 0) {
        const meta = { day: dayOf(await $.clock.now()), session: (await $.session.id()).slice(0, 8) }
        await mutate($, list => applyDetected(list, detected, meta))
      }
      if (detected.dirs.length > 0) {
        await track($, detected.dirs)
      }
    })

    return ran
  })

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)

    await quietly($, () => track($, [e.file_path.slice(0, e.file_path.lastIndexOf('/'))]))

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const ended = await next(e)

    if (e.agentId === undefined) {
      await quietly($, async () => {
        await pruneGone($)
        await refreshDirty($)
      })
    }

    return ended
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const entries: Entry[] = [
      ...ordered(await read($, items)).map((item, index) => ({ n: index + 1, item })),
      ...(await read($, dirty)).map((repo, index) => ({ n: index + 1, repo })),
    ]
    const first = entries[0]

    if (e.props.hasSurvey || first === undefined) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const isListed = entries.length > 1 && (await read($, isOpen))

    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box columnGap={1}>
          <Text color="yellow">●</Text>
          {entries.length > 1 ? (
            <Button
              key="toggle"
              label={`${t.left(entries.length)} ${isListed ? '▴' : '▾'}`}
              plain
              dimColor
              onPress={() => update($, isOpen, open => !open)}
            />
          ) : (
            <Text dimColor>{t.left(entries.length)}</Text>
          )}
          {!isListed && bandRow($, t, ui, first)}
        </Box>
        {isListed && (
          <Box flexDirection="column" paddingLeft={2}>
            {entries.map(entry => bandRow($, t, ui, entry))}
          </Box>
        )}
      </Box>
    )
  })

  // pane 在 fullscreen 會被 dock 到右邊，位置 mod 管不了，所以清單畫在指令的輸出列
  on('ui.render', { component: 'CommandOutput', props: { command: 'leftovers' } }, async ($, e, next) => {
    if (e.props.isErrored || e.props.args.trim().startsWith('clear')) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const list = ordered(await read($, items))
    const repos = await read($, dirty)

    if (list.length === 0 && repos.length === 0) {
      return (
        <Box>
          <Text dimColor>{t.nothingLeft}</Text>
        </Box>
      )
    }

    const hosts = [...new Set(list.map(item => item.host))]

    return (
      <Box flexDirection="column">
        {hosts.map(host => (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>{hostName(t, host)}</Text>
            {list.map((item, index) =>
              item.host !== host ? null : (
                <Box key={`line-${index + 1}`} columnGap={1}>
                  <Text dimColor>{item.day}</Text>
                  <Text>{t.kind[item.kind]}</Text>
                  <Text wrap="truncate-middle">{labelName(t, item.label)}</Text>
                  <Button
                    key={`undo-${index + 1}`}
                    label={t.undo}
                    hover={{ color: UNDO_COLOR }}
                    onPress={() => {
                      void askToUndo($, t, item)
                    }}
                  />
                  <Button
                    key={`drop-${index + 1}`}
                    label={t.done}
                    dimColor
                    hover={{ color: DONE_COLOR, dimColor: false }}
                    onPress={() => mutate($, all => all.filter(one => one.id !== item.id))}
                  />
                </Box>
              ),
            )}
          </Box>
        ))}
        {repos.length > 0 && (
          <Box flexDirection="column">
            <Text bold>{t.uncommittedHeading}</Text>
            {repos.map((repo, index) => (
              <Box columnGap={1}>
                <Text wrap="truncate-start">{repo.label}</Text>
                <Text dimColor>{t.files(repo.files)}</Text>
                <Button
                  key={`review-${index + 1}`}
                  label={t.review}
                  onPress={() => {
                    void askToReview($, t, repo)
                  }}
                />
                <Button
                  key={`skip-${index + 1}`}
                  label={t.ignore}
                  dimColor
                  onPress={() => ignoreRepo($, repo.path)}
                />
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  })

  on('command.run', { command: 'leftovers' }, async ($, e) => {
    const [verb, arg] = e.args.trim().split(/\s+/)

    if (verb === 'clear') {
      await mutate($, () => [])

      return { text: t.cleared }
    }
    if (verb === 'drop') {
      const target = ordered(await read($, items))[Number(arg) - 1]

      if (target !== undefined) {
        await mutate($, list => list.filter(item => item.id !== target.id))
      }
    }

    await quietly($, () => refreshDirty($))

    return { text: listText(t, ordered(await read($, items)), await read($, dirty)) }
  })
}
