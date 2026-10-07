import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Page } from '../types'
import { CELL_RATIO, CHROMES, FIT_SLACK, SCHEME, VIEW, fileUrl, fitHeight, htmlToMarkdown, wrap } from './builtin'

// The noun the terminal-browser Claude Code plugin adds to `$`
// (zenbu-labs/terminal-browser, claude-code-plugin/hooks/browser.d.ts).
// Declared here rather than as a dependency so this mod still loads, and
// falls back, when that plugin is not installed.
type BrowserOpenResult = { ok: true; url: string } | { ok: false; error: string }
type Browser = { open: (input: { url?: string }) => Promise<BrowserOpenResult> }
type WithBrowser = EngineInterface & { browser: Browser }

const HTML = /\.html?$/i
const PANE = 'html-preview'
const STEP = 600
// CSS pixels per wheel tick.
const WHEEL = 120
const BREW = 'Install with Homebrew'
const INSTALL_HELP = [
  'terminal-browser is not installed. Install it, then try again:',
  '  brew install terminal-browser',
  '  # or: curl -fsSL https://terminal-browser.sh/install | bash',
  'Or run /preview setup, or set the mode option to builtin.',
].join('\n')
const PLUGIN_HELP =
  'The terminal-browser plugin is not installed: claude plugin marketplace add zenbu-labs/terminal-browser && claude plugin install terminal-browser@terminal-browser'

const page = atom({ plugin: 'html-preview', key: 'page' } as const, null)

async function has($: EngineInterface, command: string): Promise<boolean> {
  const run = await $.process.run(['/bin/sh', '-c', `command -v '${command}'`]).catch(() => undefined)
  return run?.exitCode === 0
}

async function findChrome($: EngineInterface, configured: string): Promise<string | undefined> {
  for (const candidate of configured ? [configured] : CHROMES) {
    if (candidate.startsWith('/')) {
      const stat = await $.fs.stat(candidate).catch(() => undefined)
      if (stat?.kind === 'file') return candidate
    } else if (await has($, candidate)) {
      return candidate
    }
  }

  return undefined
}

async function workDir($: EngineInterface): Promise<string> {
  const tmp = (await $.env.get('TMPDIR')) || '/tmp'

  return `${tmp.replace(/\/$/, '')}/claude-html-preview`
}

/**
 * Renders `target` (an absolute path or a URL) to a PNG and answers its path.
 * Chrome can stay up after it writes the screenshot, so the run ends as soon
 * as Chrome reports the file, and a timer stops a Chrome that never does.
 */
async function screenshot(
  $: EngineInterface,
  chrome: string,
  target: string,
  scrollY: number,
  height: number,
  generation: number,
): Promise<string> {
  const dir = await workDir($)
  const png = `${dir}/shot-${generation}.png`
  const profile = `${dir}/profile`
  let url = target
  if (!SCHEME.test(target)) {
    const page = `${dir}/page.html`
    await $.fs.write(page, wrap(await $.fs.read(target), target, scrollY))
    url = fileUrl(page)
  }

  const child = $.process.spawn({
    argv: [
      chrome,
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      `--screenshot=${png}`,
      `--window-size=${VIEW.width},${height}`,
      '--virtual-time-budget=1500',
      url,
    ],
  })
  const stop = () => void $.process.run(['pkill', '-f', `--user-data-dir=${profile}`]).catch(() => undefined)
  const watchdog = $.clock.after(20000, stop)
  try {
    for await (const { text } of child) {
      if (/written to file/i.test(text)) break
    }
  } finally {
    watchdog.cancel()
    stop()
  }

  const stat = await $.fs.stat(png).catch(() => undefined)
  if (stat?.kind !== 'file' || stat.size === 0) throw new Error('Chrome did not write a screenshot')
  if (generation > 1) void $.process.run(['rm', '-f', `${dir}/shot-${generation - 1}.png`]).catch(() => undefined)

  return png
}

// Undefined when the terminal-browser plugin is not loaded (no `browser` noun)
// or its noun throws, so the caller falls back.
async function openInPane($: EngineInterface, url: string): Promise<BrowserOpenResult | undefined> {
  try {
    return await ($ as WithBrowser).browser.open({ url })
  } catch {
    return undefined
  }
}

async function resolvePath($: EngineInterface, target: string): Promise<string> {
  if (SCHEME.test(target) || target.startsWith('/')) return target
  const home = target.startsWith('~/') ? await $.env.get('HOME') : undefined
  if (home) return `${home}/${target.slice(2)}`
  return `${await $.session.cwd()}/${target.replace(/^\.\//, '')}`
}

// Offers a Homebrew install when brew is there; never runs the curl installer
// on the person's behalf. Answers the line to show either way.
async function setup($: EngineInterface): Promise<string> {
  if (await has($, 'terminal-browser')) return 'terminal-browser is installed.'
  if (!(await has($, 'brew'))) return INSTALL_HELP

  const choice = await $.ui
    .ask('terminal-browser is not installed. Install it now with Homebrew?', [BREW, 'Not now'])
    .catch(() => undefined)
  if (choice !== BREW) return INSTALL_HELP

  $.ui.toast('Installing terminal-browser with Homebrew...')
  const run = await $.process
    .run(['brew', 'install', 'terminal-browser'], { timeoutMs: 600000 })
    .catch(err => ({ exitCode: 1, stdout: '', stderr: String(err) }))
  if (run.exitCode === 0) return 'Installed terminal-browser.'

  return `brew install terminal-browser failed:\n${(run.stderr || run.stdout).trim().split('\n').slice(-5).join('\n')}`
}

async function openInSplit($: EngineInterface, target: string, split: string): Promise<string> {
  try {
    const run = await $.process.run(['terminal-browser', 'open', target, '--split', split], { timeoutMs: 10000 })
    if (run.exitCode === 0) return `Opened ${target} in terminal-browser (split ${split})`
    return `terminal-browser failed: ${(run.stderr || run.stdout).trim() || `exit ${run.exitCode}`}`
  } catch (err) {
    return `terminal-browser could not start (${err})`
  }
}

// One render at a time: they share Chrome's profile folder. A reload of the
// module starts these over, as it drops the timers that ran a render.
let isRendering = false
let isStale = false

async function render($: EngineInterface, options: PluginOptions): Promise<void> {
  if (isRendering) {
    isStale = true
    return
  }
  isRendering = true
  try {
    do {
      isStale = false
      await renderOnce($, options)
    } while (isStale)
  } finally {
    isRendering = false
  }
}

async function renderOnce($: EngineInterface, options: PluginOptions): Promise<void> {
  const current = await read($, page)
  if (!current) return
  const generation = current.generation + 1
  const land = (fields: Partial<Page>) =>
    update($, page, shown => (shown?.target === current.target ? { ...shown, ...fields } : shown))
  try {
    const text = SCHEME.test(current.target) ? undefined : htmlToMarkdown(await $.fs.read(current.target))
    const chrome = await findChrome($, String(options.chromePath ?? ''))
    if (!chrome) {
      await land({ text, status: 'error', error: 'Chrome/Chromium not found: showing the page as text' })
      return
    }
    const height = current.height ?? VIEW.height
    const png = await screenshot($, chrome, current.target, current.scrollY, height, generation)
    await land({ png, generation, rendered: height, text, status: 'ready', error: undefined })
  } catch (err) {
    await land({ status: 'error', error: String(err) })
  }
}

// Renders off the calling dispatch, which may end before Chrome does.
function renderLater($: EngineInterface, options: PluginOptions): void {
  $.clock.after(0, () => void render($, options))
}

async function showBuiltin($: EngineInterface, target: string, options: PluginOptions): Promise<string> {
  await update($, page, shown =>
    shown?.target === target
      ? { ...shown, status: 'rendering' as const }
      : { target, generation: shown?.generation ?? 0, scrollY: 0, status: 'rendering' as const },
  )
  renderLater($, options)
  const opened = await $.ui.open({ id: PANE, title: 'HTML preview' }).catch(() => undefined)
  if (opened && !opened.isPlaced) return `Preview of ${target} is ready: run /preview ${target} to show it`

  return `Showing ${target} in the preview pane`
}

async function preview($: EngineInterface, raw: string, options: PluginOptions): Promise<string> {
  const target = await resolvePath($, raw)
  if (!SCHEME.test(target) && !(await $.fs.stat(target).catch(() => undefined))) return `No such file: ${target}`
  const mode = String(options.mode)
  const split = String(options.split)
  if (mode === 'builtin') return showBuiltin($, target, options)

  if (mode !== 'split') {
    const opened = await openInPane($, SCHEME.test(target) ? target : fileUrl(target))
    if (opened?.ok) return `Opened ${target} in terminal-browser`
    if (mode === 'pane') return opened ? opened.error : PLUGIN_HELP
  }

  // auto keeps the page in a Claude Code pane: the built-in renderer when
  // Chrome is there, the CLI split only when it is not.
  if (mode === 'auto' && (await findChrome($, String(options.chromePath ?? '')))) return showBuiltin($, target, options)
  if (await has($, 'terminal-browser')) return openInSplit($, target, split)
  if (mode === 'auto') return showBuiltin($, target, options)

  const setUp = await setup($)
  return setUp.startsWith('Installed') ? openInSplit($, target, split) : setUp
}

export const register: Register = (on, options: PluginOptions) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'preview',
      description: 'Show an HTML file (or URL) like a browser; /preview setup installs terminal-browser',
      argumentHint: '<file.html | url | setup>',
    })
    const mode = String(options.mode)
    if ((mode === 'split' || mode === 'pane') && !(await has($, 'terminal-browser'))) {
      $.ui.log('html-preview: terminal-browser is not installed. Run /preview setup, or: brew install terminal-browser')
    }

    return started
  })

  on('command.run', { command: 'preview' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'setup') return { text: await setup($) }
    if (!arg) {
      const shown = await read($, page)
      if (!shown) return { text: 'Usage: /preview <file.html | url>  ·  /preview setup' }
      await $.ui.open({ id: PANE, title: 'HTML preview' })
      return { text: `Showing ${shown.target}` }
    }

    return { text: await preview($, arg, options) }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (!options.autoOpen || ran.deny !== undefined || ran.isError) return ran
    if (e.tool !== 'Write' && e.tool !== 'Edit') return ran
    if (!HTML.test(e.file_path) || e.agentId) return ran

    $.ui.toast(await preview($, e.file_path, options))

    return ran
  })

  // The wheel scrolls the page, not the pane: each tick moves the screenshot
  // and renders again. Bursts of ticks fold into one render.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const shown = await read($, page)
    if (!shown?.png || e.by === 0) return {}
    await update($, page, p => (p ? { ...p, scrollY: Math.max(0, p.scrollY + e.by * WHEEL), status: 'rendering' as const } : p))
    renderLater($, options)

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const shown = await read($, page)
    if (!shown) return <Text dimColor>Nothing to preview yet. Run /preview file.html</Text>

    const scrollBy = (delta: number) => async () => {
      await update($, page, p => (p ? { ...p, scrollY: delta === 0 ? 0 : Math.max(0, p.scrollY + delta), status: 'rendering' as const } : p))
      renderLater($, options)
    }
    const reload = async () => {
      await update($, page, p => (p ? { ...p, status: 'rendering' as const } : p))
      renderLater($, options)
    }
    const name = shown.target.split('/').pop() || shown.target
    const state = shown.status === 'rendering' ? 'rendering…' : shown.status === 'error' ? shown.error : `scroll ${shown.scrollY}px`
    const controls = (
      <Box flexDirection="row">
        <Text bold wrap="truncate">{name} </Text>
        <Text dimColor wrap="truncate">{state} </Text>
        <Button label="↑" hotkey="k" onPress={scrollBy(-STEP)} />
        <Button label="↓" hotkey="j" onPress={scrollBy(STEP)} />
        <Button label="top" hotkey="t" onPress={scrollBy(0)} />
        <Button label="reload" hotkey="r" onPress={reload} />
        <Button label="close" hotkey="x" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
      </Box>
    )

    if (e.surface === 'terminal' && shown.png) {
      const { Image } = $.ui.resolve(e)
      const room = Math.max(4, Math.min(255, e.props.scroll.bodyRows - 2))
      let columns = Math.max(1, Math.min(255, e.props.bodyColumns))
      // Render the page at the pane's shape, so the picture fills it.
      const fitted = fitHeight(columns, room)
      if (Math.abs(fitted - (shown.height ?? VIEW.height)) >= FIT_SLACK) {
        $.clock.after(0, async () => {
          await update($, page, p => (p ? { ...p, height: fitted, status: 'rendering' as const } : p))
          void render($, options)
        })
      }
      const ratio = ((shown.rendered ?? VIEW.height) / VIEW.width) * CELL_RATIO
      let rows = Math.max(1, Math.round(columns * ratio))
      if (rows > room) {
        rows = room
        columns = Math.max(1, Math.min(columns, Math.round(rows / ratio)))
      }

      return (
        <Box flexDirection="column">
          {controls}
          <Image
            key="view"
            source={{ file: shown.png, format: 'png', generation: shown.generation }}
            columns={columns}
            rows={rows}
            alt={`${name} (this terminal cannot draw images)`}
          />
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {controls}
        {shown.text ? <Markdown text={shown.text} /> : <Text dimColor>rendering…</Text>}
      </Box>
    )
  })
}
