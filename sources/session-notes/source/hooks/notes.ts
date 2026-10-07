/**
 * The notes file, `.claude/notes.md`: plain Markdown a person can read and
 * edit, with three sections the plugin knows.
 *
 *   ## Servers   filled by the plugin from command output; dead ones go away
 *   ## Pinned    only what the person (or the agent, when asked) put there
 *   ## Recent    the last few artifacts, newest first; older ones drop out
 *
 * One entry is one line: `- [title](url) — note <!-- key=value ... -->`. The
 * comment holds what the plugin needs (port, session, time) and stays hidden
 * in a Markdown preview. A line without a link is a plain text note.
 *
 * Everything here is pure: parse, change, serialize.
 */

export type SectionId = 'servers' | 'pinned' | 'recent'

export type Entry = {
  title: string
  url?: string
  note?: string
  meta: Record<string, string>
}

export type Notes = Record<SectionId, Entry[]> & {
  /** Sections the plugin doesn't know, kept verbatim at the end. */
  extra: string
}

export const SECTIONS: { id: SectionId; heading: string }[] = [
  { id: 'servers', heading: 'Servers' },
  { id: 'pinned', heading: 'Pinned' },
  { id: 'recent', heading: 'Recent' },
]

/** How many entries Recent keeps. */
export const RECENT_LIMIT = 5

export const emptyNotes = (): Notes => ({ servers: [], pinned: [], recent: [], extra: '' })

const ENTRY = /^\s*[-*]\s+(.*)$/
const META = /\s*<!--(.*?)-->\s*$/
const LINK = /^\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)(.*)$/

const parseEntry = (line: string): Entry | null => {
  const match = ENTRY.exec(line)
  if (match === null) return null
  let body = match[1]

  const meta: Record<string, string> = {}
  const comment = META.exec(body)
  if (comment !== null) {
    body = body.slice(0, comment.index)
    for (const pair of comment[1].trim().split(/\s+/)) {
      const at = pair.indexOf('=')
      if (at > 0) meta[pair.slice(0, at)] = pair.slice(at + 1)
    }
  }

  const link = LINK.exec(body.trim())
  if (link !== null) {
    const note = link[3].replace(/^\s*[—–-]\s*/, '').trim()
    return {
      title: link[1].replace(/\\(.)/g, '$1'),
      url: link[2],
      ...(note === '' ? {} : { note }),
      meta,
    }
  }
  const title = body.trim()
  return title === '' ? null : { title, meta }
}

export const parseNotes = (source: string): Notes => {
  const notes = emptyNotes()
  const extra: string[] = []
  let section: SectionId | 'other' | null = null

  for (const line of source.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading !== null) {
      const known = SECTIONS.find((one) => one.heading.toLowerCase() === heading[1].toLowerCase())
      section = known?.id ?? 'other'
      if (section === 'other') extra.push(line)
      continue
    }
    if (section === 'other') {
      extra.push(line)
      continue
    }
    if (section === null) continue
    const entry = parseEntry(line)
    if (entry !== null) notes[section].push(entry)
  }

  notes.extra = extra.join('\n').trim()
  return notes
}

const escapeTitle = (title: string): string => title.replace(/[[\]\\]/g, (char) => `\\${char}`)

export const entryLine = (entry: Entry): string => {
  const head = entry.url === undefined ? entry.title : `[${escapeTitle(entry.title)}](${entry.url})`
  const note = entry.note === undefined ? '' : ` — ${entry.note}`
  const pairs = Object.entries(entry.meta)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${value.replace(/\s+/g, '_')}`)
  const meta = pairs.length === 0 ? '' : ` <!-- ${pairs.join(' ')} -->`
  return `- ${head}${note}${meta}`
}

export const serializeNotes = (notes: Notes): string => {
  const parts = [
    '# Notes',
    '',
    '<!-- Kept by the session-notes plugin. Servers and Recent fill themselves; Pinned is yours. -->',
  ]
  for (const { id, heading } of SECTIONS) {
    parts.push('', `## ${heading}`)
    for (const entry of notes[id]) parts.push(entryLine(entry))
  }
  if (notes.extra !== '') parts.push('', notes.extra)
  return `${parts.join('\n')}\n`
}

/** Two entries are the same when their links are, or, without links, their titles. */
export const sameEntry = (a: Entry, b: Entry): boolean =>
  a.url !== undefined || b.url !== undefined ? a.url === b.url : a.title === b.title

/** Adds or refreshes a server, matched by port. */
export const upsertServer = (notes: Notes, server: Entry): Notes => {
  const port = server.meta.port
  const servers = notes.servers.filter((one) => one.meta.port !== port)
  return { ...notes, servers: [server, ...servers] }
}

/** Puts an entry on top of Recent, unless it's already pinned. */
export const pushRecent = (notes: Notes, entry: Entry, limit = RECENT_LIMIT): Notes => {
  if (notes.pinned.some((one) => sameEntry(one, entry))) return notes
  const recent = [entry, ...notes.recent.filter((one) => !sameEntry(one, entry))].slice(0, limit)
  return { ...notes, recent }
}

/** Moves an entry from wherever it is to Pinned (servers keep their row too). */
export const pin = (notes: Notes, entry: Entry): Notes => {
  const pinned = notes.pinned.some((one) => sameEntry(one, entry)) ? notes.pinned : [...notes.pinned, entry]
  return {
    ...notes,
    pinned,
    recent: notes.recent.filter((one) => !sameEntry(one, entry)),
  }
}

/** Removes an entry from one section, or from all of them. */
export const remove = (notes: Notes, entry: Entry, section?: SectionId): Notes => {
  const next = { ...notes }
  for (const { id } of SECTIONS) {
    if (section === undefined || section === id) next[id] = notes[id].filter((one) => !sameEntry(one, entry))
  }
  return next
}

/** Finds an entry by link, exact title, or a piece of the title. */
export const findEntry = (notes: Notes, query: string): { entry: Entry; section: SectionId } | null => {
  const wanted = query.trim().toLowerCase()
  if (wanted === '') return null
  const all = SECTIONS.flatMap(({ id }) => notes[id].map((entry) => ({ entry, section: id })))
  return (
    all.find(({ entry }) => entry.url?.toLowerCase() === wanted) ??
    all.find(({ entry }) => entry.title.toLowerCase() === wanted) ??
    all.find(({ entry }) => entry.title.toLowerCase().includes(wanted)) ??
    null
  )
}

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g
const URL_ON_PORT =
  /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})(\/[^\s'"<>)\]]*)?/gi
const PORT_PHRASE = /\b(?:listening|running|started|serving|available)\b[^\n]{0,40}?\bport\s*:?\s*(\d{2,5})\b/gi

export type FoundServer = { port: string; path: string }

/** Servers a command printed: URLs on a local port, or "listening on port N". */
export const findServers = (output: string): FoundServer[] => {
  const text = output.replace(ANSI, '')
  const found = new Map<string, FoundServer>()
  for (const match of text.matchAll(URL_ON_PORT)) {
    const path = (match[2] ?? '/').replace(/[.,;:]+$/, '')
    if (!found.has(match[1])) found.set(match[1], { port: match[1], path })
  }
  for (const match of text.matchAll(PORT_PHRASE)) {
    if (!found.has(match[1])) found.set(match[1], { port: match[1], path: '/' })
  }
  return [...found.values()]
}

/** Commands that show what is already there: their output is never a new server. */
const READS_ONLY =
  /^\s*(?:cat|type|Get-Content|gc|tail|head|less|more|grep|rg|sed|awk|echo|Write-Output|curl|wget|Invoke-WebRequest|iwr|git|ls|dir|Get-ChildItem|find|jq|Select-String)\b/i

/**
 * Whether a command only reads: some command in it starts with a reader. What
 * a pipeline prints comes from its first command, so `npm run dev | grep
 * Local` still starts a server and `cat log | grep url` doesn't.
 */
export const readsOnly = (command: string): boolean =>
  command
    .split(/&&|\|\||[;\n]/)
    .map((part) => part.split('|')[0])
    .some((head) => READS_ONLY.test(head))

/** A short title for a server from the command that started it. */
export const serverTitle = (command: string): string => {
  const line = command.split(/\r?\n/).find((one) => one.trim() !== '') ?? command
  const words = line
    .trim()
    .replace(/^(?:cd\s+\S+\s*(?:&&|;)\s*)+/, '')
    .replace(/\s*(?:&|2>&1|>\s*\S+)\s*$/g, '')
  return words.length > 48 ? `${words.slice(0, 47)}…` : words
}

const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/

export const findArtifactUrl = (text: string): string | null => ARTIFACT_URL.exec(text)?.[0] ?? null

/** The page title of an HTML file, or null. */
export const htmlTitle = (html: string): string | null => {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
  const title = match?.[1].replace(/\s+/g, ' ').trim()
  return title === undefined || title === '' ? null : title
}

/** The output file a background command writes to, from the tool's answer. */
export const backgroundOutputFile = (text: string): string | null =>
  /Output is being written to:?\s*(\S+)/i.exec(text)?.[1].replace(/[.,;]+$/, '') ?? null
