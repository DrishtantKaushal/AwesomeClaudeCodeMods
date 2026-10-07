import { renderMermaidAscii } from './vendor/mermaid-ascii.js'

// Pure functions over mermaid blocks: finding them in a message's markdown,
// drawing them as role-tagged box art, fitting the art to a width, and
// serializing it for the transcript. No `$`, so bun tests these.

export type MermaidBlock = {
  /** the whole fence, opening line through closing line, its indentation included */
  start: number
  end: number
  /** what the fence's lines are indented by (a fence inside a list item) */
  indent: string
  source: string
}

/** what a run of characters is, as the renderer knows it */
export type Role = 'text' | 'border' | 'line' | 'arrow' | 'corner' | 'junction' | 'accent'

export type Segment = { text: string; role: Role | null }

export type Rendered = { lines: Segment[][] } | { error: string }

export type Fitted = { lines: Segment[][]; width: number; overflow: number }

// closing fence must sit alone on its line; an unclosed fence (mid-stream)
// is not a block yet. The info string is `mermaid` as a whole word, so
// `mermaidjs` is some other language
const FENCE = /^([ \t]*)(`{3,}|~{3,})[ \t]*mermaid(?![\w-])[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*$/gim

export const mermaidBlocksOf = (text: string): MermaidBlock[] => {
  const blocks: MermaidBlock[] = []
  for (const match of text.matchAll(FENCE)) {
    const source = (match[3] ?? '').replace(/\r\n?/g, '\n').trim()
    if (source === '') continue
    const start = match.index ?? 0
    blocks.push({ start, end: start + match[0].length, indent: match[1] ?? '', source })
  }
  return blocks
}

const KINDS: [RegExp, string][] = [
  [/^(flowchart|graph)\b/i, 'flowchart'],
  [/^sequenceDiagram/i, 'sequence'],
  [/^classDiagram/i, 'class'],
  [/^stateDiagram/i, 'state'],
  [/^erDiagram/i, 'er'],
  [/^xychart/i, 'chart'],
  [/^gantt/i, 'gantt'],
  [/^pie\b/i, 'pie'],
  [/^mindmap/i, 'mindmap'],
  [/^gitGraph/i, 'gitgraph'],
  [/^journey/i, 'journey'],
  [/^timeline/i, 'timeline'],
  [/^quadrantChart/i, 'quadrant'],
  [/^requirementDiagram/i, 'requirement'],
  [/^C4/, 'c4'],
  [/^sankey/i, 'sankey'],
  [/^block/i, 'block'],
  [/^packet/i, 'packet'],
  [/^kanban/i, 'kanban'],
  [/^architecture/i, 'architecture'],
]

// what the renderer draws; the rest keep their fence
export const DRAWN_KINDS: ReadonlySet<string> = new Set(['flowchart', 'sequence', 'class', 'state', 'er', 'chart'])

// front matter and %% comments precede the header
const headerOf = (source: string): string => {
  const lines = source.split('\n').map(line => line.trim())
  let i = 0
  if (lines[0] === '---') {
    i = lines.indexOf('---', 1) + 1
    if (i === 0) i = lines.length
  }
  return lines.slice(i).find(line => line !== '' && !line.startsWith('%%')) ?? ''
}

export const kindOf = (source: string): string => {
  const head = headerOf(source)
  return KINDS.find(([pattern]) => pattern.test(head))?.[1] ?? 'diagram'
}

// a source past this is not drawn: the layout is quadratic in places
export const MAX_SOURCE_CHARS = 12_000

// the renderer draws a state diagram's `[*]` start and end as an empty
// corner-dotted box; a diagram with other transitions reads better without
export const withoutPseudoStates = (source: string): string => {
  if (kindOf(source) !== 'state') return source
  const kept = source.split('\n').filter(line => !line.includes('[*]'))
  return kept.some(line => line.includes('-->')) ? kept.join('\n') : source
}

// Rows are dear in a terminal and columns are cheap: a top-down flowchart or
// state diagram laid out left to right is a fraction of the height. Null
// when the source already picks a sideways direction, or the kind ignores one
export const leftToRightOf = (source: string): string | null => {
  const kind = kindOf(source)
  if (kind === 'flowchart') {
    const header = /^(\s*(?:flowchart|graph))(?:\s+(TD|TB|BT|LR|RL))?\b([^\n]*)$/im.exec(source)
    if (!header || header[2] === 'LR' || header[2] === 'RL') return null
    return source.replace(header[0], `${header[1]} LR${header[3]}`)
  }
  if (kind === 'state') {
    if (/^\s*direction\s+/im.test(source)) return null
    return source.replace(/^([^\n]*stateDiagram[^\n]*)$/im, '$1\n  direction LR')
  }
  return null
}

const tokensOf = (lines: readonly (readonly Segment[])[]): Map<string, number> => {
  const out = new Map<string, number>()
  for (const line of lines) for (const token of plainOf(line).match(/[\p{L}\p{N}_+#-]+/gu) ?? []) out.set(token, (out.get(token) ?? 0) + 1)
  return out
}

// the sideways layout wins when every word of the original survives (the
// renderer can overwrite the label of an edge that runs back the other way)
// and it fits, or is at least no wider than the original
export const pickLayout = (base: Rendered, sideways: Rendered, columns: number): Rendered => {
  if (!('lines' in base) || !('lines' in sideways)) return base
  const have = tokensOf(sideways.lines)
  for (const [token, count] of tokensOf(base.lines)) if ((have.get(token) ?? 0) < count) return base
  const width = widthOf(sideways.lines)
  return width <= columns || width <= widthOf(base.lines) ? sideways : base
}

// The renderer colours by role but only emits ANSI. Rendering in truecolor
// against a theme of sentinel colours (#00000N, N the role's index) turns
// each escape back into the role it stood for, with no fork of the renderer.
const ROLES: readonly Role[] = ['text', 'border', 'line', 'arrow', 'corner', 'junction', 'accent']
const sentinel = (role: Role) => `#00000${ROLES.indexOf(role) + 1}`
const ROLE_THEME = {
  fg: sentinel('text'),
  border: sentinel('border'),
  line: sentinel('line'),
  arrow: sentinel('arrow'),
  corner: sentinel('corner'),
  junction: sentinel('junction'),
  accent: sentinel('accent'),
  bg: '#000000',
}

const SGR = /\x1b\[([0-9;]*)m/g
const SENTINEL = /^38;2;0;0;(\d)$/

const segmentsOf = (line: string): Segment[] => {
  const out: Segment[] = []
  const push = (text: string, role: Role | null) => {
    if (text === '') return
    const last = out[out.length - 1]
    if (last && last.role === role) last.text += text
    else out.push({ text, role })
  }
  let role: Role | null = null
  let cursor = 0
  for (const match of line.matchAll(SGR)) {
    const at = match.index ?? 0
    push(line.slice(cursor, at), role)
    const params = match[1] ?? ''
    const found = SENTINEL.exec(params)
    role = found ? (ROLES[Number(found[1]) - 1] ?? null) : params === '0' || params === '' ? null : role
    cursor = at + match[0].length
  }
  push(line.slice(cursor), role)
  return out
}

export const plainOf = (line: readonly Segment[]): string => line.map(s => s.text).join('')

export const renderOf = (source: string, useAscii: boolean): Rendered => {
  const kind = kindOf(source)
  if (!DRAWN_KINDS.has(kind)) return { error: `${kind} diagrams are not drawn yet` }
  if (source.length > MAX_SOURCE_CHARS) return { error: `too big to draw (${source.length} characters)` }
  try {
    const art = renderMermaidAscii(source, { useAscii, colorMode: 'truecolor', theme: ROLE_THEME })
    const lines = art.split('\n').map(line => segmentsOf(line.replace(/ +$/, '')))
    while (lines.length > 0 && lines[lines.length - 1]?.length === 0) lines.pop()
    while (lines.length > 0 && lines[0]?.length === 0) lines.shift()
    return lines.length === 0 ? { error: 'nothing to draw' } : { lines }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export const widthOf = (lines: readonly (readonly Segment[])[]): number =>
  lines.reduce((max, line) => Math.max(max, [...plainOf(line)].length), 0)

// lines wider than `columns` are cut with an ellipsis; `overflow` says by how much
export const fitLines = (lines: readonly (readonly Segment[])[], columns: number): Fitted => {
  const width = widthOf(lines)
  const room = Math.max(1, columns)
  if (width <= room) return { lines: lines.map(line => [...line]), width, overflow: 0 }
  const fitted = lines.map(line => {
    if ([...plainOf(line)].length <= room) return [...line]
    const out: Segment[] = []
    let left = room - 1
    for (const segment of line) {
      if (left <= 0) break
      const chars = [...segment.text]
      out.push({ text: chars.slice(0, left).join(''), role: segment.role })
      left -= chars.length
    }
    out.push({ text: '…', role: null })
    return out
  })
  return { lines: fitted, width, overflow: width - room }
}

/** SGR parameters per role: the 16-colour palette, so the terminal's theme decides the shades */
export const ANSI_PALETTE: Readonly<Record<Role, string>> = {
  text: '',
  border: '36',
  line: '2',
  arrow: '33',
  corner: '2',
  junction: '36',
  accent: '35',
}

export const ansiLineOf = (line: readonly Segment[], palette: Readonly<Record<Role, string>> | null): string =>
  line
    .map(({ text, role }) => {
      const code = role && palette ? palette[role] : ''
      return code ? `\x1b[${code}m${text}\x1b[0m` : text
    })
    .join('')

// the message's markdown with each mermaid fence swapped for a text fence of its
// art, so the transcript draws the diagram in place; a block that fails to
// render keeps its fence. The art keeps the fence's indentation, so a diagram
// inside a list item stays in it
export const inlineTextOf = (
  text: string,
  blocks: readonly MermaidBlock[],
  artOf: (block: MermaidBlock) => string[] | null,
): string => {
  let out = ''
  let cursor = 0
  for (const block of blocks) {
    const art = artOf(block)
    out += text.slice(cursor, block.start)
    out += art
      ? [block.indent + '```text', ...art.map(line => block.indent + line), block.indent + '```'].join('\n')
      : text.slice(block.start, block.end)
    cursor = block.end
  }
  return out + text.slice(cursor)
}
