// Pure helpers of the built-in renderer (headless Chrome screenshots drawn
// as an Image). Everything that calls `$` lives in register.tsx.

export const VIEW = { width: 1280, height: 800 }
// A terminal cell is about half as wide as it is tall.
export const CELL_RATIO = 0.5
// Viewport heights the pane may ask for, and the change worth a new render.
const MIN_HEIGHT = 400
const MAX_HEIGHT = 4000
export const FIT_SLACK = 50

/** The viewport height whose screenshot fills `columns` x `rows` cells. */
export function fitHeight(columns: number, rows: number): number {
  const height = (VIEW.width * rows) / (columns * CELL_RATIO)

  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(height / FIT_SLACK) * FIT_SLACK))
}

export const SCHEME = /^[a-z][a-z0-9+.-]*:/i

export const CHROMES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'microsoft-edge',
]

export function fileUrl(path: string): string {
  return 'file://' + path.split('/').map(encodeURIComponent).join('/')
}

// Relative links keep resolving against the original file through <base>;
// the scroll is a transform, since a headless screenshot ignores scrollTo.
export function wrap(html: string, path: string, scrollY: number): string {
  const dir = path.slice(0, path.lastIndexOf('/') + 1)
  const scroll = scrollY > 0 ? `<style>html{transform:translateY(-${scrollY}px)}</style>` : ''
  const inject = `<base href="${fileUrl(dir)}">${scroll}`
  const head = html.match(/<head[^>]*>/i)

  return head ? html.replace(head[0], head[0] + inject) : inject + html
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** The page as rough markdown: for surfaces without Image, or without Chrome. */
export function htmlToMarkdown(html: string): string {
  return html
    .replace(/<(script|style|head|svg|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, text: string) => `\n\n${'#'.repeat(Number(level))} ${text}\n\n`)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|tr|table|ul|ol|pre|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (m, name: string) =>
      name.startsWith('#') ? String.fromCodePoint(Number(name.slice(1))) : (ENTITIES[name.toLowerCase()] ?? m),
    )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
