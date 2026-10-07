export type Shell = 'bash' | 'powershell'

export type Piece = { source: string; language?: string; path?: string }

export type Block = { kind: 'code'; piece: Piece } | { kind: 'row'; pieces: Piece[] }

type Span = { start: number; end: number; language?: string; path?: string; closer?: number }

const MAX_ELEMENT_CHARS = 10000

const INTERPRETERS: Record<string, string> = {
  node: 'javascript',
  nodejs: 'javascript',
  bun: 'typescript',
  deno: 'typescript',
  tsx: 'typescript',
  python: 'python',
  python3: 'python',
  py: 'python',
  ruby: 'ruby',
  perl: 'perl',
  php: 'php',
  psql: 'sql',
  sqlite3: 'sql',
  mysql: 'sql',
  bash: 'bash',
  sh: 'bash',
  zsh: 'bash',
  pwsh: 'powershell',
  powershell: 'powershell',
  cmd: 'bat',
}

const EVAL_FLAGS: Record<string, string[]> = {
  javascript: ['-e', '--eval', '-p', '--print'],
  typescript: ['-e', '--eval', '-p', '--print', 'eval'],
  python: ['-c'],
  ruby: ['-e'],
  perl: ['-e', '-E'],
  php: ['-r'],
  bash: ['-c', '-ic', '-lc', '-ilc', '-lic'],
  powershell: ['-c', '-Command', '-command'],
  bat: ['/c', '/C', '/k', '/K'],
}

const INTERPRETER_NAMES = Object.keys(INTERPRETERS).join('|')
const EVAL = new RegExp(
  `(?<![\\w./-])(${INTERPRETER_NAMES})(?:\\.exe)?[ \\t]+(?:-[\\w=:.-]+[ \\t]+)*?(\\/?[\\w-]+)[ \\t]+(['"])`,
  'g',
)
const INTERPRETER_WORD = new RegExp(`(?<![\\w./-])(${INTERPRETER_NAMES})(?:\\.exe)?(?![\\w.-])`)
const HEREDOC = /<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n/g
const HERE_STRING = /@(['"])[ \t]*\n/g
const REDIRECT = /(?:>>?|\btee(?:[ \t]+-a)?|\b(?:Set-Content|Add-Content|Out-File)(?:[ \t]+-(?:Path|FilePath|LiteralPath))?)[ \t]*(['"]?)([^\s'"|;&<>]+)\1/
const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g
const WIDE = /[\u{1100}-\u{115f}\u{2e80}-\u{a4cf}\u{ac00}-\u{d7a3}\u{f900}-\u{faff}\u{fe30}-\u{fe4f}\u{ff00}-\u{ff60}\u{ffe0}-\u{ffe6}\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u
const UNSURE_WIDTH = /[\u{300}-\u{36f}\u{483}-\u{489}\u{591}-\u{5c7}\u{610}-\u{61a}\u{64b}-\u{65f}\u{900}-\u{dff}\u{e31}-\u{e4e}\u{200b}-\u{200f}\u{2028}-\u{202e}\u{2060}-\u{206f}\u{2600}-\u{27bf}\u{fe00}-\u{fe0f}\u{1f1e6}-\u{1f1ff}\u{e0000}-\u{e0fff}]/u

export function cells(text: string): number {
  let width = 0
  for (const ch of text) width += WIDE.test(ch) ? 2 : 1
  return width
}

function breakAt(source: string, room: number): number {
  let used = 0
  let at = 0
  let quote = ''
  let isEscaped = false
  let outsideQuotes = 0
  let anywhere = 0
  for (const ch of source) {
    used += WIDE.test(ch) ? 2 : 1
    if (used > room) break
    at += ch.length
    if (isEscaped) isEscaped = false
    else if (ch === '\\') isEscaped = true
    else if (quote !== '') quote = ch === quote ? '' : quote
    else if (ch === "'" || ch === '"' || ch === '`') quote = ch
    if (ch === ' ') {
      anywhere = at
      if (quote === '') outsideQuotes = at
    }
  }
  return outsideQuotes > 0 ? outsideQuotes : anywhere > 0 ? anywhere : -at
}

function wrap(parts: Piece[], columns: number): Piece[][] {
  const rows: Piece[][] = [[]]
  const queue = [...parts]
  let room = columns
  for (let piece = queue.shift(); piece !== undefined; piece = queue.shift()) {
    const row = rows[rows.length - 1] ?? []
    const width = cells(piece.source)
    if (width <= room) {
      row.push(piece)
      room -= width
      continue
    }
    const found = breakAt(piece.source, room)
    const cut = found > 0 ? found : row.length > 0 ? 0 : Math.max(-found, [...piece.source][0]?.length ?? 1)
    if (cut > 0) row.push({ ...piece, source: piece.source.slice(0, cut) })
    queue.unshift({ ...piece, source: piece.source.slice(cut) })
    rows.push([])
    room = columns
  }
  return rows.filter(row => row.length > 0)
}

export function visible(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, ch => (ch === '\u007f' ? '␡' : String.fromCharCode(0x2400 + ch.charCodeAt(0))))
}

function closingQuote(text: string, from: number, quote: string, shell: Shell): number {
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (quote === '"' && ch === (shell === 'bash' ? '\\' : '`')) {
      i++
    } else if (ch === quote) {
      if (shell === 'bash' && quote === "'" && text.startsWith("'\\''", i)) i += 3
      else if (shell === 'powershell' && text[i + 1] === quote) i++
      else return i
    }
  }
  return -1
}

function lineAround(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index - 1) + 1
  const end = text.indexOf('\n', index)
  return text.slice(start, end === -1 ? text.length : end)
}

function languageOfLine(line: string): Pick<Span, 'language' | 'path'> {
  const interpreter = INTERPRETER_WORD.exec(line)?.[1]
  if (interpreter !== undefined) return { language: INTERPRETERS[interpreter] }
  const target = REDIRECT.exec(line.replace(/<<-?[ \t]*['"]?\w+['"]?/, ''))?.[2]
  return target === undefined ? {} : { path: target }
}

function spans(command: string, shell: Shell): Span[] {
  const found: Span[] = []

  for (const match of command.matchAll(EVAL)) {
    const language = INTERPRETERS[match[1] ?? '']
    if (language === undefined || !(EVAL_FLAGS[language] ?? []).includes(match[2] ?? '')) continue
    const start = match.index + match[0].length
    const end = closingQuote(command, start, match[3] ?? '', shell)
    if (end > start) found.push({ start, end, language, closer: 1 })
  }

  for (const match of command.matchAll(HEREDOC)) {
    const start = match.index + match[0].length
    const terminator = new RegExp(`^[ \\t]*${match[2]}[ \\t]*$`, 'm')
    const rest = command.slice(start)
    const at = terminator.exec(rest)
    if (at === null || at.index === 0) continue
    found.push({ start, end: start + at.index - 1, ...languageOfLine(lineAround(command, match.index)) })
  }

  if (shell === 'powershell') {
    for (const match of command.matchAll(HERE_STRING)) {
      const start = match.index + match[0].length
      const close = command.indexOf(`\n${match[1]}@`, start - 1)
      if (close < start) continue
      const opening = lineAround(command, match.index)
      const closing = lineAround(command, close + 1)
      const hint = languageOfLine(opening)
      found.push({ start, end: close, closer: 3, ...(hint.language ?? hint.path ? hint : languageOfLine(closing)) })
    }
  }

  found.sort((a, b) => a.start - b.start)
  const kept: Span[] = []
  for (const span of found) {
    const last = kept[kept.length - 1]
    if (last === undefined || span.start >= last.end) kept.push(span)
  }
  return kept
}

function isSameLanguage(a: Piece, b: Piece): boolean {
  return a.language === b.language && a.path === b.path
}

export function layout(command: string, shell: Shell, columns: number): Block[] {
  const pieces: Piece[] = []
  let at = 0
  for (const span of spans(command, shell)) {
    pieces.push({ source: command.slice(at, span.start), language: shell })
    pieces.push({ source: command.slice(span.start, span.end), language: span.language, path: span.path })
    at = span.end
    if (span.closer !== undefined) {
      pieces.push({ source: command.slice(at, at + span.closer), language: shell })
      at += span.closer
    }
  }
  pieces.push({ source: command.slice(at), language: shell })

  const lines: Piece[][] = [[]]
  for (const piece of pieces) {
    piece.source.split('\n').forEach((part, index) => {
      if (index > 0) lines.push([])
      lines[lines.length - 1]?.push({ ...piece, source: part })
    })
  }

  const blocks: Block[] = []
  for (const line of lines) {
    const filled = line.filter(piece => piece.source !== '')
    const parts = filled.length > 0 ? filled : line.slice(0, 1)
    const single: Piece =
      parts.length === 1 && parts[0] !== undefined
        ? parts[0]
        : { source: parts.map(piece => piece.source).join(''), language: shell }
    if (parts.length > 1 && !UNSURE_WIDTH.test(single.source)) {
      for (const pieces of wrap(parts, columns)) blocks.push({ kind: 'row', pieces })
      continue
    }
    const last = blocks[blocks.length - 1]
    if (last?.kind === 'code' && isSameLanguage(last.piece, single)) {
      last.piece = { ...last.piece, source: `${last.piece.source}\n${single.source}` }
    } else {
      blocks.push({ kind: 'code', piece: single })
    }
  }
  return blocks
}

export function lineCount(blocks: Block[]): number {
  return blocks.reduce((sum, block) => sum + (block.kind === 'row' ? 1 : block.piece.source.split('\n').length), 0)
}

export function takeLines(blocks: Block[], count: number): Block[] {
  const taken: Block[] = []
  let room = count
  for (const block of blocks) {
    if (room <= 0) break
    if (block.kind === 'row') {
      taken.push(block)
      room -= 1
      continue
    }
    const lines = block.piece.source.split('\n')
    taken.push({ kind: 'code', piece: { ...block.piece, source: lines.slice(0, room).join('\n') } })
    room -= lines.length
  }
  return taken
}

export function chunks(text: string): string[] {
  const out: string[] = []
  let current: string | null = null
  for (const line of text.split('\n')) {
    for (let from = 0; from === 0 || from < line.length; from += MAX_ELEMENT_CHARS) {
      const part = line.slice(from, from + MAX_ELEMENT_CHARS)
      if (current === null) {
        current = part
      } else if (current.length + 1 + part.length > MAX_ELEMENT_CHARS) {
        out.push(current)
        current = part
      } else {
        current = `${current}\n${part}`
      }
    }
  }
  out.push(current ?? '')
  return out.map(chunk => (chunk === '' ? ' ' : chunk))
}

export function outputLines(output: unknown): string[] {
  const parts =
    typeof output === 'string'
      ? [output]
      : output !== null && typeof output === 'object'
        ? [(output as { stdout?: unknown }).stdout, (output as { stderr?: unknown }).stderr]
        : []
  const text = parts
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .map(part => part.replace(/[\r\n]+$/, ''))
    .join('\n')
    .replace(ANSI, '')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
  return text.trim() === '' ? [] : text.split('\n')
}
