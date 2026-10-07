import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PromptEntry } from '../types'

const COMMAND = 'prompts'
const MAX_READ = 4 * 1024 * 1024

const prompts = atom({ plugin: 'prompt-jump', key: 'prompts' } as const, [] as PromptEntry[])
// The prompt the transcript is showing: the topmost one on screen, '' before any is seen.
const current = atom({ plugin: 'prompt-jump', key: 'current' } as const, '')
// Whether /prompts has the bar up above the prompt input.
const isOpen = atom({ plugin: 'prompt-jump', key: 'isOpen' } as const, false)

// Which rows of each prompt the transcript's viewport shows (null: off screen), as the
// UserMessage render hook last heard. Render hooks may not write state, so a timer flushes it.
const onScreen = new Map<string, { first: number } | null>()
let flushPending = false

// Rows the transcript stores as user messages that the person did not type as a prompt.
const NOT_A_PROMPT = /^\s*<(command-|local-command|bash-|task-notification|system-reminder)/

type Block = { type?: string; text?: string }

export function promptText(content: unknown): string | undefined {
  let text: string
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    const blocks = content as Block[]
    if (blocks.some(b => b?.type === 'tool_result')) return undefined
    text = blocks
      .filter(b => b?.type === 'text' && typeof b.text === 'string')
      .map(b => b.text)
      .join('\n')
  } else {
    return undefined
  }
  text = text.trim()
  if (text === '' || NOT_A_PROMPT.test(text)) return undefined
  return text
}

// One transcript line (JSONL) to a prompt, or undefined when it is anything else.
export function parseLine(line: string): PromptEntry | undefined {
  if (!line.includes('"user"')) return undefined
  let row: {
    type?: string
    uuid?: string
    isMeta?: boolean
    isSidechain?: boolean
    message?: { role?: string; content?: unknown }
  }
  try {
    row = JSON.parse(line)
  } catch {
    return undefined
  }
  if (row.type !== 'user' || row.isMeta || row.isSidechain || !row.uuid) return undefined
  const text = promptText(row.message?.content)
  return text === undefined ? undefined : { id: row.uuid, text }
}

export function parseTranscript(jsonl: string): PromptEntry[] {
  const out: PromptEntry[] = []
  const seen = new Set<string>()
  for (const line of jsonl.split('\n')) {
    const entry = parseLine(line)
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id)
      out.push(entry)
    }
  }
  return out
}

// Transcript entries first, in their order; anything recorded live but not yet read back after them.
export function merge(fromFile: PromptEntry[], live: PromptEntry[]): PromptEntry[] {
  const ids = new Set(fromFile.map(p => p.id))
  return [...fromFile, ...live.filter(p => !ids.has(p.id))]
}

const sanitize = (path: string) => path.replace(/[^a-zA-Z0-9]/g, '-')

async function exists($: EngineInterface, path: string): Promise<boolean> {
  try {
    return (await $.fs.stat(path)).kind === 'file'
  } catch {
    return false
  }
}

async function transcriptPath($: EngineInterface): Promise<string | undefined> {
  const configDir =
    (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? ''}/.claude`
  const projects = `${configDir}/projects`
  const file = `${await $.session.id()}.jsonl`
  for (const dir of new Set([await $.session.cwd(), await $.session.root()])) {
    const path = `${projects}/${sanitize(dir)}/${file}`
    if (await exists($, path)) return path
  }
  try {
    for (const entry of await $.fs.list(projects)) {
      if (entry.kind !== 'dir') continue
      const path = `${projects}/${entry.name}/${file}`
      if (await exists($, path)) return path
    }
  } catch {}
  return undefined
}

async function readTranscript($: EngineInterface, path: string): Promise<string> {
  const { size } = await $.fs.stat(path)
  if (size <= MAX_READ) return await $.fs.read(path)
  // Too big for one read: let awk keep only the user rows that are not tool results.
  const { stdout } = await $.process.run([
    'awk',
    'index($0, "\\"type\\":\\"user\\"") && !index($0, "\\"tool_use_id\\"")',
    path,
  ])
  return stdout
}

async function backfill($: EngineInterface): Promise<void> {
  const path = await transcriptPath($)
  if (!path) return
  let fromFile: PromptEntry[]
  try {
    fromFile = parseTranscript(await readTranscript($, path))
  } catch {
    return
  }
  await update($, prompts, live => merge(fromFile, live ?? []))
}

// Display width, counting CJK and other wide glyphs as two cells.
const cellWidth = (ch: string) => {
  const code = ch.codePointAt(0) ?? 0
  return code >= 0x1100 &&
    (code <= 0x115f ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      code >= 0x1f300)
    ? 2
    : 1
}

export function clip(text: string, cells: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  let used = 0
  let out = ''
  for (const ch of flat) {
    const w = cellWidth(ch)
    if (used + w > cells - 1) return `${out}…`
    used += w
    out += ch
  }
  return out
}

async function jumpTo($: EngineInterface, id: string): Promise<void> {
  let reason: string | undefined
  try {
    reason = (await $.ui.scroll({ to: { requestId: id }, block: 'start' })).deny
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err)
  }
  if (reason) void $.ui.toast(`没能跳到这条 prompt：${reason}`)
  else await update($, current, () => id)
}

// The topmost prompt on screen, or undefined when none is.
export function topmostVisible(
  list: readonly PromptEntry[],
  seen: ReadonlyMap<string, { first: number } | null>,
): string | undefined {
  return list.find(p => seen.get(p.id))?.id
}

// Where ◀ / ▶ go from the current prompt: ◀ first to the current prompt's own top when
// it is scrolled away, then to the one before it; ▶ to the one after it.
export function neighbor(
  list: readonly PromptEntry[],
  currentId: string,
  dir: -1 | 1,
  seen: ReadonlyMap<string, { first: number } | null>,
): string | undefined {
  if (list.length === 0) return undefined
  let at = list.findIndex(p => p.id === currentId)
  if (at < 0) at = list.length - 1
  if (dir === -1 && (seen.get(list[at]!.id)?.first ?? 0) > 1) return list[at]!.id
  return list[at + dir]?.id
}

// The prompts the minimap draws: all of them when they fit, else a window around the current.
export function tickWindow<T>(list: readonly T[], at: number, room: number): { items: T[]; from: number } {
  if (list.length <= room) return { items: [...list], from: 0 }
  const from = Math.min(Math.max(0, at - Math.floor(room / 2)), list.length - room)
  return { items: list.slice(from, from + room), from }
}

async function flushCurrent($: EngineInterface): Promise<void> {
  const list = await read($, prompts)
  const top = topmostVisible(list, onScreen)
  if (top !== undefined) await update($, current, was => (was === top ? was : top))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: '在输入框上方显示/收起 prompt 导航条：悬停看内容，点击跳转',
    })
    await backfill($)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim()
    const open = arg === 'close' ? false : arg === 'open' ? true : !(await read($, isOpen))
    if (open) await backfill($)
    await update($, isOpen, () => open)
    return { text: open ? 'Prompt bar shown.' : 'Prompt bar hidden.' }
  })

  on('session.append', { door: 'prompt' }, async ($, e, next) => {
    const stored = await next(e)
    if (stored.deny !== undefined || e.agentId !== undefined) return stored
    if (stored.message.type !== 'user' || stored.message.isMeta) return stored
    const text = promptText(stored.message.content)
    if (text !== undefined) {
      const entry = { id: stored.uuid, text }
      await update($, prompts, list =>
        (list ?? []).some(p => p.id === entry.id) ? list ?? [] : [...(list ?? []), entry],
      )
      await update($, current, () => entry.id)
    }
    return stored
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      onScreen.clear()
      await update($, prompts, () => [])
      await update($, current, () => '')
    }
    return next(e)
  })

  // Hear which prompts the transcript shows; draw them as the engine does.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const seen = e.props.onScreen
    if (e.props.origin.kind === 'composer' && seen !== undefined) {
      onScreen.set(e.requestId, seen && { first: seen.first })
      if (!flushPending) {
        flushPending = true
        $.clock.after(60, () => {
          flushPending = false
          void flushCurrent($)
        })
      }
    }
    return next(e)
  })

  // The bar above the prompt input: ◀, one tick per prompt with the current one bold, ▶,
  // the position. Hovering a tick shows its prompt to the right; pressing it jumps there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOpen))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, prompts)
    if (list.length === 0) return <Text dimColor>还没有 prompt</Text>

    const cur = await read($, current)
    let at = list.findIndex(p => p.id === cur)
    if (at < 0) at = list.length - 1
    const width = Math.max(20, e.props.bodyColumns)
    // Each tick takes two cells; leave a third of the row (at least 24 cells) for the text.
    const room = Math.max(1, Math.floor((width - Math.max(24, Math.floor(width / 3))) / 2))
    const { items, from } = tickWindow(list, at, room)
    const counter = `  ${at + 1}/${list.length}  `
    // The hover text starts after ◀ (2), the ticks (2 each), ▶ (2) and the counter.
    const textAt = 2 + items.length * 2 + 2 + counter.length
    const textRoom = Math.max(8, width - textAt - 4)
    const go = (dir: -1 | 1) => {
      const id = neighbor(list, list[at]!.id, dir, onScreen)
      if (id !== undefined) void jumpTo($, id)
    }

    return (
      <Box flexDirection="row" height={1}>
        <Button key="jump:prev" plain dimColor label="◀ " onPress={() => go(-1)} />
        {items.map((p, i) => {
          const isCurrent = from + i === at
          return (
            <Box key={`tick:${p.id}`} width={2}>
              <Button
                key={`jump:${p.id}`}
                plain
                dimColor={!isCurrent}
                label={isCurrent ? '┃' : '│'}
                onPress={() => void jumpTo($, p.id)}
              />
              <Box
                position="absolute"
                left={textAt - 2 - i * 2}
                display="none"
                hover={{ display: 'flex' }}
              >
                <Text bold wrap="truncate-end">{clip(p.text, textRoom)}</Text>
              </Box>
            </Box>
          )
        })}
        <Button key="jump:next" plain dimColor label=" ▶" onPress={() => go(1)} />
        <Text dimColor>{counter}</Text>
      </Box>
    )
  })
}
