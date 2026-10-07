import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { LLMock } from '@copilotkit/aimock'

// Drives a real interactive Claude Code in a tmux pane, its model answered by
// aimock from fixtures, the plugin loaded from this repository with
// --plugin-dir. Screens are read with capture-pane; `-e` keeps the SGR codes
// so a test can see colour.

export const REPO = dirname(dirname(import.meta.dir))

export type Fixture = {
  prompt: string
  reply: string
  /** a tool the model calls first; `reply` is what it says once the result is back */
  tool?: { name: string; arguments: Record<string, unknown> }
  /** streamed before the tool call, so a test has a turn to type into first */
  lead?: string
  /** a further condition on the request `reply` answers: the whole body, whatever its shape */
  when?: (request: unknown) => boolean
}

export type Session = {
  send: (text: string) => void
  keys: (...keys: string[]) => void
  /** types text one key at a time (a burst reads as a paste) */
  type: (text: string) => Promise<void>
  /** a mouse report at a 1-based terminal cell: `down` and `up` make a click, `drag` moves with the button held */
  mouse: (kind: 'down' | 'up' | 'drag', column: number, row: number) => Promise<void>
  screen: (withColor?: boolean) => string
  waitFor: (pattern: RegExp | string, timeoutMs?: number) => Promise<string>
  waitForGone: (pattern: RegExp | string, timeoutMs?: number) => Promise<string>
  /** Claude Code's --debug-file for the session; gone after `stop` */
  debugLog: string
  stop: () => Promise<void>
}

const tmux = (...args: string[]) => execFileSync('tmux', args, { encoding: 'utf8' })

export const hasTmux = () => spawnSync('tmux', ['-V']).status === 0
export const hasClaude = () => spawnSync('claude', ['--version']).status === 0

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// patterns read the plain screen; what is returned keeps the colour
const matches = (screen: string, pattern: RegExp | string) => {
  const plain = stripAnsi(screen)
  return typeof pattern === 'string' ? plain.includes(pattern) : pattern.test(plain)
}

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.filter((block: any) => block?.type === 'text').map((block: any) => block.text ?? '').join('')
      : ''

// Claude Code hands a tool.call hook's `context` to the model as a `system`
// message trailing the tool result, and aimock's Anthropic conversion keeps
// only the user and assistant ones: a fixture's `when` would never see it.
// Folding that text into the tool result it belongs to puts it where the model
// reads it and where a predicate can look.
const foldHookContext = (raw: string) => {
  let body: any
  try {
    body = JSON.parse(raw)
  } catch {
    return raw
  }
  if (!Array.isArray(body?.messages)) return raw
  const messages: any[] = []
  let folded = false
  for (const message of body.messages) {
    const previous = messages[messages.length - 1]
    const result =
      message?.role === 'system' && Array.isArray(previous?.content)
        ? [...previous.content].reverse().find((block: any) => block?.type === 'tool_result')
        : undefined
    if (!result) {
      messages.push(message)
      continue
    }
    const text = textOf(message.content)
    if (Array.isArray(result.content)) result.content.push({ type: 'text', text })
    else result.content = `${textOf(result.content)}\n${text}`
    folded = true
  }
  return folded ? JSON.stringify({ ...body, messages }) : raw
}

/** the mock behind a proxy that folds hook context in on the way through */
const startProxy = async (target: string) => {
  const proxy = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', async () => {
      const sent = Buffer.concat(chunks).toString('utf8')
      const headers = Object.fromEntries(
        Object.entries(request.headers).filter(
          ([key, value]) => typeof value === 'string' && key !== 'content-length' && key !== 'host',
        ),
      ) as Record<string, string>
      try {
        const upstream = await fetch(new URL(request.url ?? '/', target), {
          method: request.method,
          headers,
          body: sent === '' ? undefined : foldHookContext(sent),
        })
        response.writeHead(
          upstream.status,
          Object.fromEntries([...upstream.headers].filter(([key]) => key !== 'content-length' && key !== 'content-encoding')),
        )
        // written chunk by chunk: the mock's pacing is what makes a turn long
        if (upstream.body) for await (const chunk of upstream.body as any) response.write(Buffer.from(chunk))
        response.end()
      } catch {
        response.destroy()
      }
    })
  })
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
  return {
    url,
    stop: () =>
      new Promise<void>(resolve => {
        proxy.closeAllConnections?.()
        proxy.close(() => resolve())
      }),
  }
}

export type SessionOptions = {
  columns?: number
  rows?: number
  /** the plugin folder to load; this repository (claude-mermaid) by default */
  pluginDir?: string
  /** the session's working directory; the repository by default */
  cwd?: string
  /** the fullscreen renderer, where panes dock beside the transcript from 110 columns */
  fullscreen?: boolean
  /** ms between streamed chunks of `chunkSize` characters; instant by default */
  latency?: number
  chunkSize?: number
  /** a settings.json for the session (`--settings`), e.g. a plugin's `pluginConfigs` options */
  settings?: string
}

export async function startSession(fixtures: Fixture[], options: SessionOptions = {}): Promise<Session> {
  const { columns = 170, rows = 80, fullscreen = false, latency, chunkSize, pluginDir = REPO, cwd = REPO, settings } = options
  const mock = new LLMock({ port: 0, latency, chunkSize })
  for (const { prompt, reply, tool, lead, when } of fixtures) {
    const also = when ? { predicate: when } : {}
    if (!tool) {
      mock.on({ userMessage: prompt, ...also }, { content: reply })
      continue
    }
    // the first request of the prompt gets the call; the one carrying its result, the reply
    const call = { toolCalls: [{ name: tool.name, arguments: JSON.stringify(tool.arguments) }] }
    mock.on({ userMessage: prompt, hasToolResult: false }, lead ? { content: lead, ...call } : call)
    mock.on({ userMessage: prompt, hasToolResult: true, ...also }, { content: reply })
  }
  await mock.start()
  const proxy = await startProxy(mock.url)

  const name = `mermaid-e2e-${process.pid}-${Date.now().toString(36)}`
  const debugLog = join(mkdtempSync(join(tmpdir(), 'mermaid-e2e-')), 'debug.log')
  const env = [
    `ANTHROPIC_BASE_URL=${proxy.url}`,
    'ANTHROPIC_API_KEY=mock',
    'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1',
    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1',
    `CLAUDE_CODE_NO_FLICKER=${fullscreen ? '1' : '0'}`,
  ].join(' ')
  const command = `${env} claude --plugin-dir ${pluginDir} --model claude-sonnet-5 --debug-file ${debugLog}${settings ? ` --settings ${settings}` : ''}`
  // the repository is the cwd: a folder Claude Code already trusts, so no dialog
  tmux('new-session', '-d', '-s', name, '-x', String(columns), '-y', String(rows), '-c', cwd, command)

  const screen = (withColor = false) => tmux('capture-pane', '-t', name, '-p', ...(withColor ? ['-e'] : []))

  const waitFor = async (pattern: RegExp | string, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs
    let last = ''
    while (Date.now() < deadline) {
      last = screen(true)
      if (matches(last, pattern)) return last
      await sleep(250)
    }
    throw new Error(`waited ${timeoutMs}ms for ${pattern} · debug log ${debugLog} · screen:\n${screen()}`)
  }

  const waitForGone = async (pattern: RegExp | string, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs
    let last = ''
    while (Date.now() < deadline) {
      last = screen(true)
      if (!matches(last, pattern)) return last
      await sleep(250)
    }
    throw new Error(`waited ${timeoutMs}ms for ${pattern} to go · screen:\n${last}`)
  }

  const session: Session = {
    // typed literally so a long prompt never lands as several lines
    send: text => {
      tmux('send-keys', '-t', name, '-l', text)
      // a beat for the composer (and a slash command's typeahead) to settle before Enter
      spawnSync('sleep', ['0.15'])
      tmux('send-keys', '-t', name, 'Enter')
    },
    keys: (...keys) => void tmux('send-keys', '-t', name, ...keys),
    type: async text => {
      // one key at a time: a burst reads as a paste, which a focused pane drops
      for (const ch of text) {
        tmux('send-keys', '-t', name, '-l', ch)
        await sleep(30)
      }
    },
    mouse: async (kind, column, row) => {
      // SGR mouse reports, 1-based cells; Claude Code turns mouse tracking on itself
      const code = kind === 'drag' ? 32 : 0
      tmux('send-keys', '-t', name, '-l', `\x1b[<${code};${column};${row}${kind === 'up' ? 'm' : 'M'}`)
      // events in one frame collapse into the last: give each its own
      await sleep(120)
    },
    screen,
    waitFor,
    waitForGone,
    debugLog,
    stop: async () => {
      try {
        tmux('kill-session', '-t', name)
      } catch {}
      await proxy.stop()
      await mock.stop()
      rmSync(dirname(debugLog), { recursive: true, force: true })
    },
  }

  // the composer's empty prompt marks a ready session
  try {
    await waitFor(/^❯\s*$/m, 40_000)
  } catch (error) {
    await session.stop()
    throw error
  }
  return session
}

/** the plain screen: no SGR codes (tmux -e keeps them), no-break spaces as spaces */
export const stripAnsi = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\u00a0/g, ' ')

/** the fenced reply an assistant would write for a mermaid source */
export const replyWith = (lead: string, ...sources: string[]) =>
  `${lead}\n\n${sources.map(source => '```mermaid\n' + source + '\n```').join('\n\nand\n\n')}\n`
