/** What the main agent did, boiled down to one line the narrator can read. */
export type Activity = { kind: 'tool' | 'failed' | 'said'; text: string }

export const MAX_LOG = 14
const MAX_LINE = 160

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

const cut = (text: string, max = MAX_LINE) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

/** One readable line per tool call: the tool and the part of its input that tells the story. */
export function summarizeTool(tool: string, input: Readonly<Record<string, unknown>>): string {
  const path = str(input.file_path) ?? str(input.notebook_path) ?? str(input.path)
  switch (tool) {
    case 'Bash':
      return `ran shell: ${cut(str(input.description) ?? str(input.command) ?? '', 100)}`
    case 'Read':
      return `read ${path ? basename(path) : 'a file'}`
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `edited ${path ? basename(path) : 'a file'}`
    case 'Write':
      return `wrote ${path ? basename(path) : 'a file'}`
    case 'Grep':
      return `searched code for "${cut(str(input.pattern) ?? '', 60)}"`
    case 'Glob':
      return `looked for files matching ${cut(str(input.pattern) ?? '', 60)}`
    case 'WebFetch':
      return `fetched ${cut(str(input.url) ?? 'a web page', 80)}`
    case 'WebSearch':
      return `searched the web for "${cut(str(input.query) ?? '', 60)}"`
    case 'Agent':
    case 'Task':
      return `sent a helper agent to: ${cut(str(input.description) ?? str(input.prompt) ?? '', 80)}`
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return 'updated the to-do list'
    default:
      return path ? `used ${tool} on ${basename(path)}` : `used ${tool}`
  }
}

/** The assistant's own words between tool calls are the best story material. */
export function summarizeSpeech(text: string): string {
  return cut(text, 220)
}

export function pushActivity(log: Activity[], entry: Activity): Activity[] {
  const last = log[log.length - 1]
  if (last && last.kind === entry.kind && last.text === entry.text) return log
  return [...log, { kind: entry.kind, text: cut(entry.text, 240) }].slice(-MAX_LOG)
}
