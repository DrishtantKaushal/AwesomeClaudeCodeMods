import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { columns, headerCells, parsePositions, rowCells, totalCells } from './parse'

const PANE = 'positions-pane'

const rows = atom({ plugin: 'pumpfun-utilities', key: 'rows' } as const, [])
const failed = atom({ plugin: 'pumpfun-utilities', key: 'failed' } as const, [])
const isBusy = atom({ plugin: 'pumpfun-utilities', key: 'isBusy' } as const, false)
const problem = atom({ plugin: 'pumpfun-utilities', key: 'problem' } as const, null)
const updatedAt = atom({ plugin: 'pumpfun-utilities', key: 'updatedAt' } as const, '')
const isRevealed = atom({ plugin: 'pumpfun-utilities', key: 'isRevealed' } as const, false)
const isOpen = atom({ plugin: 'pumpfun-utilities', key: 'isOpen' } as const, false)
const isAuto = atom({ plugin: 'pumpfun-utilities', key: 'isAuto' } as const, false)
const turn = atom({ plugin: 'pumpfun-utilities', key: 'turn' } as const, '')

// Top-level on purpose: the validator only lets `$` be passed to functions declared here.
// The script is read-only in this mode: no journal, no snapshot, no wallet address printed.
type Settings = { env: Record<string, string>; minUsd: number; mainLabel: string }

const SCRIPT = 'scripts/pumpfun_journal.py'

async function refresh($: EngineInterface, cfg: Settings) {
  // A run can outlast the interval; never stack a second one on top of it.
  if (await read($, isBusy)) return

  await update($, isBusy, () => true)

  try {
    const out = await $.process.run(
      ['python3', `${$.plugin.root}/${SCRIPT}`, '--open-json', '--min-usd', String(cfg.minUsd)],
      { env: cfg.env, timeoutMs: 45_000 },
    )
    const parsed = out.exitCode === 0 ? parsePositions(out.stdout) : null

    if (parsed) {
      await update($, rows, () => parsed.rows)
      await update($, failed, () => parsed.failed)
      await update($, problem, () => null)
      await update($, updatedAt, () => new Date().toTimeString().slice(0, 5))
    } else {
      await update($, problem, () => `positions failed (exit ${out.exitCode}): ${out.stderr.trim().slice(0, 100)}`)
    }
  } catch {
    await update($, problem, () => 'python3 or the journal script is not reachable')
  } finally {
    await update($, isBusy, () => false)
  }
}

async function show($: EngineInterface, cfg: Settings, isAutomatic: boolean) {
  await update($, isOpen, () => true)
  await update($, isAuto, () => isAutomatic)
  await $.ui.open({ id: PANE, title: 'Positions' })
  await refresh($, cfg)
}

// The pane opens only if the turn that armed the timer is still the running one.
async function openIfStillWorking($: EngineInterface, cfg: Settings, id: string) {
  if ((await read($, turn)) === id && !(await read($, isOpen))) {
    await show($, cfg, true)
  }
}

export const register: Register = (on, options) => {
  // Settings reach the script as environment variables, so no secret sits in a command line.
  const env: Record<string, string> = { PUMPFUN_WALLET: String(options.wallet ?? '') }

  if (options.demo) env.PUMPFUN_DEMO = '1'

  if (options.extraWallets) env.PUMPFUN_EXTRA_WALLETS = String(options.extraWallets)
  if (options.journalDir) env.PUMPFUN_JOURNAL_DIR = String(options.journalDir)
  if (options.heliusKey) env.PUMPFUN_HELIUS_KEY = String(options.heliusKey)

  const afterMs = Math.max(1, Number(options.minSeconds)) * 1000
  const cfg: Settings = { env, minUsd: Number(options.minUsd), mainLabel: String(options.mainLabel || 'main') }
  const everyMs = Math.max(5, Number(options.refreshSeconds)) * 1000

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'positions',
      description: 'Open the positions pane: open Solana positions and their profit or loss',
    })
    // Polls only while the pane is open, so an idle session makes no calls.
    await $.command.register({
      name: 'journal',
      description: 'Check the pump.fun journal: /journal for a dry run, /journal write to append new trades, optional number of days',
    })
    $.clock.every(everyMs, async () => {
      if (await read($, isOpen)) {
        await refresh($, cfg)
      }
    })

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, turn, () => e.turnId)
    $.clock.after(afterMs, () => openIfStillWorking($, cfg, e.turnId))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      await update($, turn, () => '')

      if ((await read($, isOpen)) && (await read($, isAuto))) {
        await update($, isOpen, () => false)
        await $.ui.close({ id: PANE })
      }
    }

    return next(e)
  })

  on('command.run', { command: 'positions' }, async $ => {
    await show($, cfg, false)

    return { text: 'Positions pane opened.' }
  })

  on('command.run', { command: 'journal' }, async ($, e) => {
    const words = e.args.split(/\s+/).filter(Boolean)
    const days = words.find(word => /^\d{1,3}$/.test(word))
    const args = [`${$.plugin.root}/${SCRIPT}`, ...(words.includes('write') ? ['--write'] : [])]

    if (days) args.push('--since-days', days)

    const out = await $.process.run(['python3', ...args], { env: cfg.env, timeoutMs: 600_000 })
    const text = out.exitCode === 0 ? out.stdout : `journal failed (exit ${out.exitCode}): ${out.stderr.trim()}`

    // The tail holds the verdict (NEW, MISMATCH, what was written); a long run is cut at the front.
    return { text: text.length > 8000 ? `...\n${text.slice(-8000)}` : text }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, isOpen, () => false)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, rows)
    const trouble = await read($, problem)
    const at = await read($, updatedAt)
    const missing = await read($, failed)
    const revealed = await read($, isRevealed)
    const sum = { upnl: list.reduce((acc, row) => acc + row.upnl, 0) }
    const tint = (n: number) => (n >= 0 ? 'green' : 'red')
    const cols = columns(revealed)
    // One row of fixed-width boxes; numbers sit at the right edge of their box.
    const table = (cells: string[], color: string | undefined, isBold: boolean) => (
      <Box columnGap={1}>
        {cells.map((cell, i) => (
          <Box key={cols[i].label} width={cols[i].width} justifyContent={cols[i].isRight ? 'flex-end' : 'flex-start'}>
            <Text color={color} dimColor={color === undefined} bold={isBold}>
              {cell}
            </Text>
          </Box>
        ))}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {trouble && <Text color="red">{trouble}</Text>}
        {missing.length > 0 && <Text color="yellow">Could not read: {missing.join(', ')}</Text>}
        {list.length === 0 && !trouble && <Text dimColor>No open positions above the dust floor.</Text>}
        {list.length > 0 && table(headerCells(revealed), undefined, false)}
        {list.map(row => (
          <Box key={`${row.wallet}-${row.chain}-${row.symbol}`}>
            {table(rowCells(row, revealed, cfg.mainLabel), tint(row.upnl), false)}
          </Box>
        ))}
        {list.length > 0 && table(totalCells(list, revealed), tint(sum.upnl), true)}
        <Box>
          <Text dimColor>updated {at || 'never'}, every {Math.round(everyMs / 1000)}s </Text>
          <Button
            key="reveal"
            label={revealed ? 'Hide values' : 'Reveal values'}
            onPress={() => update($, isRevealed, v => !v)}
          />
          <Button key="close" label="Close" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
