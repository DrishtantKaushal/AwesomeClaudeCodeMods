import { describe, expect, test } from 'bun:test'
import {
  ANSI_PALETTE,
  ansiLineOf,
  fitLines,
  inlineTextOf,
  kindOf,
  leftToRightOf,
  pickLayout,
  mermaidBlocksOf,
  plainOf,
  renderOf,
  widthOf,
  withoutPseudoStates,
  type Segment,
} from '../hooks/diagrams.ts'

const FLOW = 'flowchart LR\n  A[Prompt] --> B{Mermaid?}\n  B -- yes --> C[Draw]'
const SEQ = 'sequenceDiagram\n  participant U as User\n  U->>C: prompt\n  C-->>U: reply'

const linesOf = (source: string, useAscii = false): Segment[][] => {
  const art = renderOf(source, useAscii)
  if (!('lines' in art)) throw new Error(art.error)
  return art.lines
}
const textOf = (lines: Segment[][]) => lines.map(plainOf).join('\n')
const seg = (text: string, role: Segment['role'] = null): Segment => ({ text, role })

describe('mermaidBlocksOf', () => {
  test('finds each closed fence and keeps the offsets of the whole fence', () => {
    const text = `Here:\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n\nand\n\n~~~mermaid\n${SEQ}\n~~~\ndone`
    const blocks = mermaidBlocksOf(text)
    expect(blocks.map(b => b.source)).toEqual([FLOW, SEQ])
    expect(text.slice(blocks[0]!.start, blocks[0]!.end)).toBe(`\`\`\`mermaid\n${FLOW}\n\`\`\``)
    expect(text.slice(blocks[1]!.start, blocks[1]!.end)).toBe(`~~~mermaid\n${SEQ}\n~~~`)
  })

  test('an unclosed fence, as a streaming block has, is not a block yet', () => {
    expect(mermaidBlocksOf('```mermaid\nflowchart LR\n  A --> B')).toEqual([])
  })

  test('other languages and empty fences are left alone', () => {
    expect(mermaidBlocksOf('```ts\nconst a = 1\n```\n```mermaid\n\n```')).toEqual([])
  })

  test('an indented fence inside a list item counts, and keeps its indent', () => {
    const blocks = mermaidBlocksOf(`- step\n  \`\`\`mermaid\n  graph TD\n    A --> B\n  \`\`\``)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.source).toBe('graph TD\n    A --> B')
    expect(blocks[0]!.indent).toBe('  ')
  })

  test('the info string is the whole word: mermaidjs is not mermaid, Mermaid is', () => {
    expect(mermaidBlocksOf('```mermaidjs\nflowchart LR\n  A --> B\n```')).toEqual([])
    expect(mermaidBlocksOf('```mermaid-x\nflowchart LR\n  A --> B\n```')).toEqual([])
    expect(mermaidBlocksOf('```Mermaid\nflowchart LR\n  A --> B\n```')).toHaveLength(1)
    expect(mermaidBlocksOf('```mermaid {title="x"}\nflowchart LR\n  A --> B\n```')).toHaveLength(1)
  })

  test('a longer fence is closed by its own length, not by three backticks inside', () => {
    const blocks = mermaidBlocksOf('````mermaid\nflowchart LR\n```\n  A --> B\n````')
    expect(blocks.map(b => b.source)).toEqual(['flowchart LR\n```\n  A --> B'])
  })

  test('a closing fence with trailing words is not a close', () => {
    expect(mermaidBlocksOf('```mermaid\nflowchart LR\n  A --> B\n``` done')).toEqual([])
  })

  test('CRLF line endings are normalised out of the source', () => {
    const blocks = mermaidBlocksOf('```mermaid\r\nflowchart LR\r\n  A --> B\r\n```')
    expect(blocks.map(b => b.source)).toEqual(['flowchart LR\n  A --> B'])
  })

  test('the first fence closing does not swallow a second one', () => {
    const text = `\`\`\`mermaid\n${FLOW}\n\`\`\`\ntext\n\`\`\`mermaid\n${SEQ}\n\`\`\``
    expect(mermaidBlocksOf(text).map(b => b.source)).toEqual([FLOW, SEQ])
  })
})

describe('kindOf', () => {
  test('names the diagram by its header, skipping comments and front matter', () => {
    expect(kindOf(FLOW)).toBe('flowchart')
    expect(kindOf(SEQ)).toBe('sequence')
    expect(kindOf('%% a comment\nstateDiagram-v2\n  [*] --> A')).toBe('state')
    expect(kindOf('---\ntitle: x\n---\nerDiagram\n  A ||--o{ B : has')).toBe('er')
    expect(kindOf('pie\n  "a": 1')).toBe('pie')
    expect(kindOf('gitGraph\n  commit')).toBe('gitgraph')
    expect(kindOf('nonsense')).toBe('diagram')
  })

  test('a directive before the header still names the kind', () => {
    expect(kindOf('%%{init: {"theme": "dark"}}%%\nflowchart LR\n  A --> B')).toBe('flowchart')
    expect(kindOf('---\nconfig:\n  theme: dark\n---\n%% note\nsequenceDiagram\n  A->>B: x')).toBe('sequence')
  })

  test('unclosed front matter is not a header', () => {
    expect(kindOf('---\ntitle: x\nflowchart LR')).toBe('diagram')
  })
})

describe('renderOf', () => {
  test('draws a flowchart as box art, trimmed of blank edges and trailing spaces', () => {
    const lines = linesOf(FLOW)
    const text = textOf(lines)
    expect(text).toContain('Prompt')
    expect(text).toContain('Draw')
    expect(text).toContain('┌')
    expect(lines[0]!.length).toBeGreaterThan(0)
    expect(lines[lines.length - 1]!.length).toBeGreaterThan(0)
    expect(lines.every(line => !plainOf(line).endsWith(' '))).toBe(true)
  })

  test('tags runs by role: labels are text, boxes are borders, heads are arrows', () => {
    const lines = linesOf(FLOW)
    const roles = new Set(lines.flat().map(s => s.role))
    expect(roles.has('text')).toBe(true)
    expect(roles.has('border')).toBe(true)
    expect(roles.has('arrow')).toBe(true)
    const prompt = lines.flat().find(s => s.text.includes('Prompt'))
    expect(prompt?.role).toBe('text')
    const head = lines.flat().find(s => s.text.includes('►'))
    expect(head?.role).toBe('arrow')
    expect(lines.flat().every(s => !s.text.includes('\x1b'))).toBe(true)
  })

  test('plain ASCII uses no box-drawing characters', () => {
    const text = textOf(linesOf(FLOW, true))
    expect(text).not.toMatch(/[┌─│►]/)
    expect(text).toContain('+--')
  })

  test.each([
    ['sequence', SEQ, ['User', 'prompt', 'reply']],
    ['state', 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Working: prompt\n  Working --> [*]', ['Idle', 'Working', 'prompt']],
    ['class', 'classDiagram\n  class Animal {\n    +String name\n    +speak()\n  }\n  Animal <|-- Dog', ['Animal', 'Dog', '+speak']],
    ['er', 'erDiagram\n  USER ||--o{ SESSION : has\n  USER {\n    string id\n  }', ['USER', 'SESSION', 'has']],
    ['subgraph', 'flowchart LR\n  subgraph Client\n    A[CLI] --> B[Hooks]\n  end\n  B --> C[Engine]', ['Client', 'CLI', 'Engine']],
    ['chart', 'xychart-beta\n  title "Sales"\n  x-axis [a, b, c]\n  y-axis "n" 0 --> 10\n  bar [3, 6, 9]', ['Sales']],
  ])('draws a %s diagram with its labels', (_kind, source, labels) => {
    const text = textOf(linesOf(source))
    for (const label of labels) expect(text).toContain(label)
  })

  test('a kind the renderer lacks says so instead of throwing', () => {
    const art = renderOf('gantt\n  title x\n  section A\n  task :a1, 2024-01-01, 1d', false)
    expect(art).toEqual({ error: 'gantt diagrams are not drawn yet' })
    expect(renderOf('pie\n  "a": 1', false)).toEqual({ error: 'pie diagrams are not drawn yet' })
  })

  test('a broken flowchart is an error, not a throw', () => {
    const art = renderOf('flowchart LR\n  A --> \n  --> B', false)
    expect('error' in art || 'lines' in art).toBe(true)
  })

  test('a dense graph that fences its own edges in still draws in well under a second', () => {
    const dense = 'flowchart TD\n' + Array.from({ length: 6 }, (_, i) => `  N${i} --> N${(i + 1) % 6}\n  N${i} --> N${(i * 7 + 3) % 6}`).join('\n')
    const chain = 'flowchart LR\n' + Array.from({ length: 60 }, (_, i) => `  N${i} --> N${i + 1}`).join('\n')
    for (const source of [dense, chain]) {
      const started = performance.now()
      const art = renderOf(source, false)
      expect(performance.now() - started).toBeLessThan(1000)
      expect('lines' in art).toBe(true)
    }
  })
})

describe('fitLines', () => {
  test('lines within the width pass through', () => {
    const lines = [[seg('abc', 'text')], [seg('de')]]
    expect(fitLines(lines, 5)).toEqual({ lines, width: 3, overflow: 0 })
  })

  test('wider lines are cut across segments with an ellipsis and the overflow reported', () => {
    const fit = fitLines([[seg('┌──', 'border'), seg('long', 'text'), seg('──┐', 'border')], [seg('short')]], 6)
    expect(fit.lines[0]).toEqual([seg('┌──', 'border'), seg('lo', 'text'), seg('…')])
    expect(fit.lines[1]).toEqual([seg('short')])
    expect(fit.width).toBe(10)
    expect(fit.overflow).toBe(4)
  })

  test('width counts code points, not UTF-16 units', () => {
    expect(widthOf([[seg('┌─┐')]])).toBe(3)
  })
})

describe('ansiLineOf', () => {
  test('wraps each coloured role in its SGR and resets after, leaving text and spaces bare', () => {
    const line = [seg('┌─┐', 'border'), seg(' '), seg('ab', 'text'), seg('►', 'arrow')]
    expect(ansiLineOf(line, ANSI_PALETTE)).toBe('\x1b[36m┌─┐\x1b[0m ab\x1b[33m►\x1b[0m')
  })

  test('no palette means plain text', () => {
    expect(ansiLineOf([seg('┌─┐', 'border'), seg('ab', 'text')], null)).toBe('┌─┐ab')
  })
})

describe('inlineTextOf', () => {
  test('swaps each fence for a text fence of its art and keeps the rest', () => {
    const text = `before\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n\nafter`
    const out = inlineTextOf(text, mermaidBlocksOf(text), () => ['[art]', '[more]'])
    expect(out).toBe('before\n\n```text\n[art]\n[more]\n```\n\nafter')
  })

  test('a block without art keeps its fence', () => {
    const text = `\`\`\`mermaid\n${FLOW}\n\`\`\``
    expect(inlineTextOf(text, mermaidBlocksOf(text), () => null)).toBe(text)
  })

  test('art inside a list item keeps the fence indent, so the list goes on', () => {
    const text = `- step\n  \`\`\`mermaid\n  graph TD\n    A --> B\n  \`\`\`\n- next`
    const out = inlineTextOf(text, mermaidBlocksOf(text), () => ['[a]', '[b]'])
    expect(out).toBe('- step\n  ```text\n  [a]\n  [b]\n  ```\n- next')
  })

  test('two fences back to back, one drawn and one not', () => {
    const text = `\`\`\`mermaid\n${FLOW}\n\`\`\`\n\`\`\`mermaid\n${SEQ}\n\`\`\``
    const out = inlineTextOf(text, mermaidBlocksOf(text), b => (b.source === FLOW ? ['[flow]'] : null))
    expect(out).toBe(`\`\`\`text\n[flow]\n\`\`\`\n\`\`\`mermaid\n${SEQ}\n\`\`\``)
  })
})

describe('withoutPseudoStates', () => {
  test('drops [*] transitions from a state diagram that has others', () => {
    expect(withoutPseudoStates('stateDiagram-v2\n  [*] --> A\n  A --> B\n  B --> [*]')).toBe('stateDiagram-v2\n  A --> B')
  })

  test('keeps them when nothing else would remain, and other kinds alone', () => {
    const only = 'stateDiagram-v2\n  [*] --> A\n  A --> [*]'
    expect(withoutPseudoStates(only)).toBe(only)
    expect(withoutPseudoStates(FLOW)).toBe(FLOW)
  })
})

describe('leftToRightOf', () => {
  test('turns a top-down flowchart sideways, whatever the header form', () => {
    expect(leftToRightOf('flowchart TD\n  A --> B')).toBe('flowchart LR\n  A --> B')
    expect(leftToRightOf('graph TB\n  A --> B')).toBe('graph LR\n  A --> B')
    expect(leftToRightOf('%% note\nflowchart BT\n  A --> B')).toBe('%% note\nflowchart LR\n  A --> B')
  })

  test('adds a direction to a state diagram that has none', () => {
    expect(leftToRightOf('stateDiagram-v2\n  A --> B')).toBe('stateDiagram-v2\n  direction LR\n  A --> B')
    expect(leftToRightOf('stateDiagram\n  A --> B')).toBe('stateDiagram\n  direction LR\n  A --> B')
  })

  test('leaves a sideways source, a chosen direction, and other kinds alone', () => {
    expect(leftToRightOf(FLOW)).toBeNull()
    expect(leftToRightOf('flowchart RL\n  A --> B')).toBeNull()
    expect(leftToRightOf('stateDiagram-v2\n  direction TB\n  A --> B')).toBeNull()
    expect(leftToRightOf(SEQ)).toBeNull()
    expect(leftToRightOf('classDiagram\n  A <|-- B')).toBeNull()
  })
})

describe('pickLayout', () => {
  const td = 'stateDiagram-v2\n  A --> B: go\n  B --> C: on'
  const back = 'stateDiagram-v2\n  A --> B: go\n  B --> A: back'
  const both = (source: string) => [renderOf(source, false), renderOf(leftToRightOf(source)!, false)] as const

  test('takes the sideways layout when it fits and keeps every word', () => {
    const [base, lr] = both(td)
    const picked = pickLayout(base, lr, 100)
    expect(picked).toBe(lr)
    expect(('lines' in picked ? picked.lines : []).length).toBeLessThan(('lines' in base ? base.lines : []).length)
  })

  test('keeps the original when the sideways one loses an edge label', () => {
    const [base, lr] = both(back)
    expect(textOf('lines' in lr ? lr.lines : [])).not.toContain('back')
    expect(pickLayout(base, lr, 100)).toBe(base)
  })

  test('keeps the original when the sideways one is both too wide and wider', () => {
    const [base, lr] = both(td)
    expect(pickLayout(base, lr, 20)).toBe(base)
  })

  test('an error on either side keeps the original', () => {
    const [base] = both(td)
    expect(pickLayout(base, { error: 'x' }, 100)).toBe(base)
    expect(pickLayout({ error: 'x' }, base, 100)).toEqual({ error: 'x' })
  })
})
