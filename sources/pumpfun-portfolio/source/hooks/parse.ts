import type { Position } from '../types'

// Reads the JSON `python3 scripts/pumpfun-trades.py --open-json` prints:
// {rows: [{symbol, mint, chain, wallet, value, cost, upnl, mc}], failed: [wallet labels]}.
// Anything else is a failed run, not an empty list.
export function parsePositions(text: string): { rows: Position[]; failed: string[] } | null {
  let data: any

  try {
    data = JSON.parse(text)
  } catch {
    return null
  }

  if (!data || !Array.isArray(data.rows)) {
    return null
  }

  const rows = data.rows
    .filter((row: any) => row && typeof row.symbol === 'string' && typeof row.value === 'number')
    .map((row: any) => ({
      symbol: row.symbol,
      chain: typeof row.chain === 'string' ? row.chain : '',
      wallet: typeof row.wallet === 'string' ? row.wallet : '',
      value: row.value,
      cost: typeof row.cost === 'number' ? row.cost : 0,
      upnl: typeof row.upnl === 'number' ? row.upnl : row.value - (row.cost ?? 0),
    }))
  const failed = Array.isArray(data.failed) ? data.failed.map(String) : []

  return { rows, failed }
}

// The wallet column: the script calls the main wallet "main"; the user's own name for it is a setting.
export function walletName(row: Position, mainLabel: string): string {
  return row.wallet === 'main' || row.wallet === '' ? mainLabel : row.wallet
}

export type Column = { label: string; width?: number; isRight: boolean }

// Columns are drawn as boxes of a fixed width in character cells, not as space-padded text: a
// surface with a proportional font (the desktop app) lines boxes up where padding would not.
// With values hidden only the percentage shows.
export function columns(revealed: boolean): Column[] {
  const wallet = { label: 'Wallet', isRight: false }
  const token = { label: 'Token', width: 10, isRight: false }
  const pct = { label: 'PnL %', width: 9, isRight: true }

  return revealed
    ? [token, { label: 'Value', width: 9, isRight: true }, { label: 'PnL $', width: 10, isRight: true }, pct, wallet]
    : [token, pct, wallet]
}

function pick(revealed: boolean, symbol: string, value: string, pnl: string, pct: string, wallet: string): string[] {
  return revealed ? [symbol, value, pnl, pct, wallet] : [symbol, pct, wallet]
}

export function headerCells(revealed: boolean): string[] {
  return columns(revealed).map(column => column.label)
}

export function rowCells(row: Position, revealed: boolean, mainLabel: string): string[] {
  return pick(revealed, row.symbol, money(row.value), money(row.upnl), percent(row.upnl, row.cost), walletName(row, mainLabel))
}

export function totalCells(rows: Position[], revealed: boolean): string[] {
  const sum = totals(rows)

  return pick(revealed, 'Total', money(sum.value), money(sum.upnl), percent(sum.upnl, sum.cost), '')
}

export function money(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)

  return `${sign}$${abs >= 1000 ? Math.round(abs).toLocaleString('en-US') : abs.toFixed(abs >= 100 ? 0 : 2)}`
}

// Profit or loss against what was paid; a position with no cost basis has no percent.
export function percent(upnl: number, cost: number): string {
  if (cost <= 0) return 'n/a'

  const value = (upnl / cost) * 100

  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

export function totals(rows: Position[]) {
  const value = rows.reduce((sum, row) => sum + row.value, 0)
  const cost = rows.reduce((sum, row) => sum + row.cost, 0)

  return { value, cost, upnl: value - cost }
}
