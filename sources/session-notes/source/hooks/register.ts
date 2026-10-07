import type { EngineInterface, Register, RenderElement } from 'claude-code'
import {
  RECENT_LIMIT,
  SECTIONS,
  backgroundOutputFile,
  findArtifactUrl,
  findEntry,
  findServers,
  htmlTitle,
  parseNotes,
  pin,
  pushRecent,
  readsOnly,
  remove,
  serializeNotes,
  serverTitle,
  upsertServer,
} from './notes'
import type { Entry, FoundServer, Notes, SectionId } from './notes'

/**
 * Session Notes: one notes file per project, `.claude/notes.md`.
 *
 * - Servers a command prints (`Local: http://localhost:5173`) land in Servers
 *   by themselves, with the LAN address so a phone can open them. A probe
 *   checks their ports; one dead for DEAD_DROP_MS goes away.
 * - Published artifacts and docs land in Recent, the last RECENT_LIMIT of them.
 * - Pinned holds only what the person chose: the pin button in the pane, or
 *   the agent's `notes` tool when asked to remember something.
 *
 * `/notes` opens the pane and prints the notes into the conversation, which
 * is how they reach a phone.
 */

const PANE_ID = 'session-notes'
const NOTES_FILE = '.claude/notes.md'

/** How wide the docked pane opens, in columns; a width the person dragged wins. */
const PANE_COLUMNS = 64

/** How often the open pane re-checks the ports; without a pane, every PROBE_IDLE_TICKS-th time. */
const PROBE_MS = 5_000
const PROBE_IDLE_TICKS = 12

/** A server whose port stayed closed this long leaves Servers. */
const DEAD_DROP_MS = 10 * 60_000

/** When a background command's output is read again for server addresses. */
const BACKGROUND_CHECKS_MS = [2_000, 5_000, 10_000, 20_000, 40_000, 80_000]

type Engine = EngineInterface
type PortState = 'lan' | 'local' | 'dead'

let lan: string | null = null
const portState = new Map<string, PortState>()
const deadSince = new Map<string, number>()
let probeTick = 0
let probing: Promise<void> | null = null

/** Changes to the file go one after another, so two hooks don't overwrite each other. */
let queue: Promise<unknown> = Promise.resolve()

const notesPath = async ($: Engine): Promise<string> => `${await $.session.cwd()}/${NOTES_FILE}`

const readNotes = async ($: Engine): Promise<Notes> =>
  parseNotes(await $.fs.read(await notesPath($)).catch(() => ''))

/** Keeps the notes out of git: they hold local addresses and maybe test logins. */
const ensureIgnored = async ($: Engine): Promise<void> => {
  const cwd = await $.session.cwd()
  const isRepo = (await $.fs.stat(`${cwd}/.git`).catch(() => null)) !== null
  const ignore = await $.fs.read(`${cwd}/.gitignore`).catch(() => null)
  if (!isRepo && ignore === null) return
  const lines = (ignore ?? '').split(/\r?\n/).map((line) => line.trim())
  if (lines.some((line) => line === NOTES_FILE || line === `/${NOTES_FILE}` || line === '.claude/' || line === '.claude')) return
  const head = ignore === null || ignore === '' || ignore.endsWith('\n') ? ignore ?? '' : `${ignore}\n`
  await $.fs.write(`${cwd}/.gitignore`, `${head}${NOTES_FILE}\n`)
}

const changeNotes = ($: Engine, change: (notes: Notes) => Notes): Promise<Notes> => {
  const run = queue.then(async () => {
    const path = await notesPath($)
    const before = await $.fs.read(path).catch(() => null)
    const notes = change(parseNotes(before ?? ''))
    const text = serializeNotes(notes)
    if (text !== before) {
      await $.fs.write(path, text)
      if (before === null) await ensureIgnored($).catch(() => {})
      $.ui.invalidate('ui.render')
    }
    return notes
  })
  queue = run.catch(() => {})
  return run
}

const minuteStamp = (): string => new Date().toISOString().slice(0, 16)

const shortSession = async ($: Engine): Promise<string> => (await $.session.id().catch(() => '')).slice(0, 8)

/** Runs the probe for `ports`; refreshes the LAN address on the way. */
const runProbe = async ($: Engine, ports: string[]): Promise<Record<string, PortState>> => {
  const result = await $.process.run(['node', `${$.plugin.root}/scripts/probe.mjs`, ...ports], { timeoutMs: 8_000 })
  if (result.exitCode !== 0) return {}
  const parsed = JSON.parse(result.stdout) as { lan: string | null; ports: Record<string, PortState> }
  lan = parsed.lan
  return parsed.ports
}

const portsOf = (notes: Notes): string[] => [
  ...new Set([...notes.servers, ...notes.pinned].map((entry) => entry.meta.port).filter((port) => port !== undefined)),
]

/** Checks every known port, drops servers dead for too long, redraws on a change. */
const probe = ($: Engine): Promise<void> => {
  // A check already running answers for this one too.
  probing ??= checkPorts($).finally(() => {
    probing = null
  })
  return probing
}

const checkPorts = async ($: Engine): Promise<void> => {
  try {
    const notes = await readNotes($)
    const ports = portsOf(notes)
    if (ports.length === 0) return
    const states = await runProbe($, ports)
    const nowMs = Date.now()
    let isChanged = false
    for (const port of ports) {
      const state = states[port] ?? 'dead'
      if (portState.get(port) !== state) isChanged = true
      portState.set(port, state)
      if (state !== 'dead') deadSince.delete(port)
      else if (!deadSince.has(port)) deadSince.set(port, nowMs)
    }
    const expired = notes.servers.filter((server) => {
      const since = deadSince.get(server.meta.port ?? '')
      return since !== undefined && nowMs - since > DEAD_DROP_MS
    })
    if (expired.length > 0) {
      await changeNotes($, (current) => ({
        ...current,
        servers: current.servers.filter((server) => !expired.some((gone) => gone.meta.port === server.meta.port)),
      }))
    }
    if (isChanged) $.ui.invalidate('ui.render')
  } catch {
    // A failed probe leaves the old states; the next tick tries again.
  }
}

/** The address to open a server at: the LAN one when it answers there, else localhost. */
const serverUrl = (entry: Entry): string | undefined => {
  if (entry.url === undefined || entry.meta.port === undefined) return entry.url
  if (portState.get(entry.meta.port) !== 'local') return entry.url
  return entry.url.replace(/^(https?:\/\/)[^/:]+/, '$1localhost')
}

const addServers = async ($: Engine, found: FoundServer[], command: string): Promise<void> => {
  if (found.length === 0) return
  if (lan === null) await runProbe($, []).catch(() => {})
  const session = await shortSession($)
  const title = serverTitle(command)
  await changeNotes($, (notes) =>
    found.reduce((current, server) => {
      const existing = current.servers.find((one) => one.meta.port === server.port)
      // A port already listed keeps its name: a restart or a log shouldn't rename it.
      if (existing !== undefined) return current
      return upsertServer(current, {
        title: title === '' ? `Server :${server.port}` : title,
        url: `http://${lan ?? 'localhost'}:${server.port}${server.path}`,
        meta: { port: server.port, session, at: minuteStamp() },
      })
    }, notes),
  )
  void probe($)
}

const addRecent = async ($: Engine, title: string, url: string, kind: string): Promise<void> => {
  const session = await shortSession($)
  await changeNotes($, (notes) => pushRecent(notes, { title, url, meta: { kind, session, at: minuteStamp() } }))
}

/** A background command's output arrives later: read its file a few times. */
const watchBackground = ($: Engine, file: string, command: string): void => {
  for (const delay of BACKGROUND_CHECKS_MS) {
    $.clock.after(delay, () => {
      void $.fs
        .read(file)
        .then((output) => addServers($, findServers(output), command))
        .catch(() => {})
    })
  }
}

const basename = (path: string): string => path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? path

/** What a finished tool call left behind: servers, artifacts, docs. */
const capture = async ($: Engine, tool: string, input: Record<string, unknown>, text: string): Promise<void> => {
  if (tool === 'Bash' || tool === 'PowerShell') {
    const command = typeof input.command === 'string' ? input.command : ''
    // Reading a log or a file prints the addresses in it, but starts nothing.
    if (readsOnly(command)) return
    await addServers($, findServers(text), command)
    const file = backgroundOutputFile(text)
    if (file !== null) watchBackground($, file, command)
    return
  }

  if (tool === 'Artifact') {
    const action = input.action ?? 'publish'
    if (action !== 'publish' || input.asset === true) return
    const url = findArtifactUrl(text)
    if (url === null) return
    const path = typeof input.file_path === 'string' ? input.file_path : null
    const fromFile = path === null ? null : htmlTitle(await $.fs.read(path).catch(() => ''))
    const title = (typeof input.title === 'string' ? input.title : null) ?? fromFile ?? (path === null ? url : basename(path))
    await addRecent($, title, url, 'artifact')
    return
  }

  // A doc created through the Claude Docs connector.
  if (/Claude_Docs__batch$/.test(tool)) {
    const create = (input.container as { create?: { name?: unknown } } | undefined)?.create
    if (typeof create?.name !== 'string') return
    const url = findArtifactUrl(text)
    if (url !== null) await addRecent($, create.name, url, 'doc')
  }
}

const STATE_GLYPH: Record<PortState, { glyph: string; color: string }> = {
  lan: { glyph: '●', color: 'green' },
  local: { glyph: '◐', color: 'yellow' },
  dead: { glyph: '○', color: 'gray' },
}

const glyphOf = (entry: Entry): { glyph: string; color: string } => {
  const port = entry.meta.port
  const state = port === undefined ? undefined : portState.get(port)
  // Not checked yet: no claim either way.
  return state === undefined ? { glyph: '·', color: 'gray' } : STATE_GLYPH[state]
}

const hostOf = (url: string | undefined): string => {
  if (url === undefined) return ''
  const match = /^https?:\/\/([^/]+)/.exec(url)
  return match?.[1] ?? ''
}

/** Colored marks for the conversation: a plain dot next to a list bullet reads as a second bullet. */
const STATE_EMOJI: Record<PortState, { mark: string; words: string }> = {
  lan: { mark: '🌐', words: '' },
  local: { mark: '🏠', words: ' — localhost only' },
  dead: { mark: '💤', words: ' — not running' },
}

/** The notes with their sections, for the agent: what the `notes` tool's "list" returns. */
const notesMarkdown = (notes: Notes, project: string): string => {
  // The engine puts the plugin's name in front of the first line: give it a line of its own.
  const parts: string[] = [`Notes · ${project}`, '']
  for (const { id, heading } of SECTIONS) {
    if (notes[id].length === 0) continue
    parts.push(`**${heading}**`, '')
    for (const entry of notes[id]) {
      const isServer = entry.meta.port !== undefined
      const url = isServer ? serverUrl(entry) : entry.url
      const known = isServer ? portState.get(entry.meta.port ?? '') : undefined
      const state = known === undefined ? null : STATE_EMOJI[known]
      const head = url === undefined ? entry.title : `[${entry.title}](${url})`
      const address = isServer && url !== undefined ? ` · \`${hostOf(url)}\`` : ''
      const note = entry.note === undefined ? '' : ` — ${entry.note}`
      parts.push(`- ${state === null ? '' : `${state.mark} `}${head}${address}${note}${state?.words ?? ''}`)
    }
    parts.push('')
  }
  return parts.length === 2 ? `Notes · ${project}\n\nNo notes yet.` : parts.join('\n').trim()
}

/**
 * What `/notes` prints: one flat list, for a phone with no buttons to press.
 * Servers with their state first, then the pinned entries, then the recent
 * ones.
 */
const notesCompact = (notes: Notes): string => {
  const link = (entry: Entry, url = entry.url): string => (url === undefined ? entry.title : `[${entry.title}](${url})`)
  const lines: string[] = []
  for (const entry of notes.servers) {
    const known = portState.get(entry.meta.port ?? '')
    lines.push(`- ${known === undefined ? '' : `${STATE_EMOJI[known].mark} `}${link(entry, serverUrl(entry))}`)
  }
  for (const entry of [...notes.pinned, ...notes.recent]) lines.push(`- ${link(entry)}`)
  // The engine puts the plugin's name in front of the text: the leading line
  // break gives it a line of its own instead of the first entry's.
  return `\n${lines.length === 0 ? 'No notes yet.' : lines.join('\n')}`
}

/** Opens the pane; null once it's drawn, else why it isn't. */
const openPane = async ($: Engine): Promise<string | null> => {
  const opened = await $.ui
    .open({ id: PANE_ID, title: 'Notes', columns: PANE_COLUMNS })
    .catch((error: unknown) => ({ isPlaced: false as const, reason: String(error) }))
  return opened.isPlaced ? null : opened.reason
}

const projectName = async ($: Engine): Promise<string> =>
  (await $.session.cwd().catch(() => '')).split(/[\\/]/).filter(Boolean).pop() ?? ''

const TOOL_DESCRIPTION = `The project's notes file (${NOTES_FILE}), shown to the user in a pane and with /notes.

Sections: Servers (filled automatically from command output), Recent (the last ${RECENT_LIMIT} artifacts, automatic), Pinned (only what the user asked to keep).

Use it when the user asks to remember, note down, pin or keep something ("запомни", "сделай заметку", "закрепи", "добавь в заметки"): action "pin" with a title and, when there is one, the url and a short note. "pin" also moves an existing Servers/Recent entry to Pinned when the title or url matches. "remove" deletes an entry by title or url. "list" returns the notes. "show" opens the notes pane in the user's terminal (when they ask to show or open the notes).

When the user asks for a server link or an artifact made earlier, call "list" first instead of searching the conversation. Prefer LAN addresses over localhost so links open on the user's phone, and start dev servers on 0.0.0.0 (e.g. --host). Keep only working, short-lived things here; lasting project knowledge belongs in the repository's docs.`

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command
      .register({ name: 'notes', description: 'Project notes: servers, pinned links, recent artifacts', argumentHint: '[close]' })
      .catch((error: unknown) => $.ui.log(`session-notes: /notes not registered: ${String(error)}`))

    await $.tool
      .register({
        name: 'notes',
        description: TOOL_DESCRIPTION,
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['pin', 'remove', 'list', 'show'] },
            title: { type: 'string', description: 'What the entry is called, or the entry to find' },
            url: { type: 'string', description: 'The link, when there is one' },
            note: { type: 'string', description: 'A few words on what it is' },
          },
          required: ['action'],
        },
      })
      .catch((error: unknown) => $.ui.log(`session-notes: notes tool not registered: ${String(error)}`))

    $.clock.after(0, () => {
      void runProbe($, []).catch(() => {})
      void probe($)
    })

    // Ports are checked often while the pane is open, rarely otherwise; the
    // pane also picks up changes other sessions made to the file.
    $.clock.every(PROBE_MS, () => {
      void $.ui
        .panes()
        .then((panes) => {
          const isOpen = panes.some((pane) => pane.id === PANE_ID)
          probeTick += 1
          if (isOpen) $.ui.invalidate('ui.render')
          if (isOpen || probeTick % PROBE_IDLE_TICKS === 0) void probe($)
        })
        .catch(() => {})
    })

    return next(e)
  })

  on('command.run', { command: 'notes' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE_ID })
      return { text: 'Notes pane closed.' }
    }
    await probe($)
    // The list always goes into the conversation; a pane that can't be placed
    // here (a surface that draws no panes) says why in a toast.
    const opened = await openPane($)
    if (opened !== null) $.ui.toast(`Notes pane: ${opened}`)
    return { text: notesCompact(await readNotes($)) }
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>

    if (/^mcp__session-notes[^_]*__notes$/.test(e.tool)) {
      const action = input.action
      const title = typeof input.title === 'string' ? input.title.trim() : ''
      const url = typeof input.url === 'string' && input.url.trim() !== '' ? input.url.trim() : undefined
      const note = typeof input.note === 'string' && input.note.trim() !== '' ? input.note.trim() : undefined

      if (action === 'list') {
        await probe($)
        return { result: notesMarkdown(await readNotes($), await projectName($)) }
      }
      if (action === 'show') {
        await probe($)
        const opened = await openPane($)
        return { result: opened === null ? 'Notes pane opened.' : `Notes pane not shown: ${opened}` }
      }
      if (action === 'remove') {
        const notes = await readNotes($)
        const found = findEntry(notes, url ?? title)
        if (found === null) return { result: `Nothing in the notes matches "${url ?? title}".` }
        await changeNotes($, (current) => remove(current, found.entry))
        return { result: `Removed "${found.entry.title}".` }
      }
      if (action === 'pin') {
        if (title === '' && url === undefined) return { result: 'Give a title or a url to pin.' }
        const notes = await readNotes($)
        const found = url !== undefined || title !== '' ? findEntry(notes, url ?? title) : null
        // An entry already listed keeps its link and meta; a title or note given now wins.
        const entry: Entry =
          found !== null
            ? {
                ...found.entry,
                ...(title === '' ? {} : { title }),
                ...(note === undefined ? {} : { note }),
                meta: { ...found.entry.meta, at: minuteStamp() },
              }
            : { title: title === '' ? (url ?? '') : title, ...(url === undefined ? {} : { url }), ...(note === undefined ? {} : { note }), meta: { at: minuteStamp() } }
        await changeNotes($, (current) => pin(found === null ? current : remove(current, found.entry, 'pinned'), entry))
        return { result: `Pinned "${entry.title}".` }
      }
      return { result: 'Unknown action: use pin, remove, list or show.' }
    }

    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await capture($, e.tool, input, ran.text ?? '').catch((error: unknown) => {
        $.ui.log(`session-notes: ${String(error)}`)
      })
    }
    return ran
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    const { Box, Text, Button, Markdown } = await $.ui.resolve(e)
    const notes = await readNotes($)
    const cwd = await $.session.cwd().catch(() => '')
    const project = cwd.split(/[\\/]/).filter(Boolean).pop() ?? ''
    const columns = Math.max(20, e.props.bodyColumns - 2)

    const button = (key: string, label: string, onPress: () => void): RenderElement =>
      Button({ key, label, plain: true, dimColor: true, onPress })

    const row = (entry: Entry, section: SectionId, index: number): RenderElement => {
      const key = `${section}-${index}`
      const isServer = entry.meta.port !== undefined
      const url = isServer ? serverUrl(entry) : entry.url
      const mark = glyphOf(entry)
      const isDead = isServer && portState.get(entry.meta.port ?? '') === 'dead'
      const detail = [isServer ? hostOf(url) : '', entry.note ?? ''].filter(Boolean).join(' · ')
      const actions: RenderElement[] = []
      // Servers come and go by themselves; only Recent has something to keep.
      if (section === 'recent') {
        actions.push(button(`pin-${key}`, 'pin', () => void changeNotes($, (current) => pin(current, entry))))
      }
      actions.push(button(`del-${key}`, '✕', () => void changeNotes($, (current) => remove(current, entry, section))))

      return Box({
        key,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ color: mark.color, children: isServer ? mark.glyph : ' ' }),
          Box({
            flexDirection: 'column',
            flexGrow: 1,
            flexShrink: 1,
            children: [
              url === undefined
                ? Text({ dimColor: isDead, wrap: 'truncate-end', children: entry.title })
                : Markdown({ text: `[${entry.title.replace(/[[\]]/g, '')}](${url})`, dimColor: isDead }),
              ...(detail === '' ? [] : [Text({ dimColor: true, wrap: 'truncate-end', children: detail })]),
            ],
          }),
          ...actions,
        ],
      })
    }

    const sections: RenderElement[] = []
    for (const { id, heading } of SECTIONS) {
      if (notes[id].length === 0) continue
      sections.push(
        Box({
          key: `section-${id}`,
          flexDirection: 'column',
          marginBottom: 1,
          children: [Text({ bold: true, dimColor: true, children: heading.toUpperCase() }), ...notes[id].map((entry, index) => row(entry, id, index))],
        }),
      )
    }

    return Box({
      flexDirection: 'column',
      paddingX: 1,
      paddingY: 1,
      children: [
        Box({
          flexDirection: 'row',
          columnGap: 1,
          children: [
            Text({ bold: true, children: 'Notes' }),
            Box({ flexGrow: 1, children: [Text({ dimColor: true, wrap: 'truncate-end', children: project })] }),
            Text({ dimColor: true, children: lan ?? '' }),
          ],
        }),
        Text({ dimColor: true, children: '─'.repeat(columns) }),
        ...(sections.length === 0
          ? [Text({ dimColor: true, children: 'No notes yet. Servers and artifacts show up here by themselves; ask the agent to pin anything else.' })]
          : sections),
      ],
    })
  })
}
