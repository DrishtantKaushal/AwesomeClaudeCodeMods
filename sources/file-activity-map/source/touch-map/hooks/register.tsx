import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Level, Loaded, Now, Segment, Touch } from '../types'

const PANE = 'touch-map'
const LOG_DIR = '.claude/touch-map-logs'
const DEBUG_DIR = `${LOG_DIR}/debug`

const touches = atom({ plugin: 'touch-map', key: 'touches' } as const, {})
const segment = atom({ plugin: 'touch-map', key: 'segment' } as const, { label: '', startedAt: 0, note: '' })
const minimized = atom({ plugin: 'touch-map', key: 'minimized' } as const, false)
const loadedAtom = atom({ plugin: 'touch-map', key: 'loaded' } as const, {})
const folds = atom({ plugin: 'touch-map', key: 'folds' } as const, {})
const nowAtom = atom({ plugin: 'touch-map', key: 'now' } as const, null)
const mapAtom = atom({ plugin: 'touch-map', key: 'map' } as const, true)

const LEVELS = ['listed', 'partial', 'read', 'edited', 'created'] as const
const COLORS = ['#c084fc', '#818cf8', '#60a5fa', '#fb923c', '#4ade80'] as const
// 深い順。凡例・帯・並び順はこの順
const DEEP_FIRST = [4, 3, 2, 1, 0] as const
// バーの触っていない部分
const TRACK = '#3f4654'
const AUTO = '#7dd3fc'
const GONE = '#f87171'
// 直近に触ったファイルの行の背景
const NOW_BG = '#1d2029'
// ファイル行・ディレクトリ行のバーの幅
const BAR = 10
// 区切りをまたいでも残す読み込み理由（/clear や compact のあとにも読み込み直されるもの）
const EAGER = new Set(['session_start', 'compact', 'include'])

// 名前を出力するコマンド。この出力に出てきたファイルを「名前だけ」とみなす
const LISTERS = /(^|[\s|;&(])(rg|grep|egrep|fgrep|find|fd|ls|tree|git\s+(ls-files|grep|status|diff|log|show))\b/
// 一致した行の中身を出すコマンド。-l や -c のように名前や件数だけ出すときは除く
const GREPS = /(^|[\s|;&(])(rg|grep|egrep|fgrep|git\s+grep)\b/
const NAMES_ONLY = (t: string) => /^-[a-zA-Z]*[lLc][a-zA-Z]*$/.test(t) || ['--files', '--files-with-matches', '--files-without-match', '--count'].includes(t)
// ファイルの中身を出すコマンド。引数のファイルを「読み取り」とみなす
const READERS = new Set(['cat', 'head', 'tail', 'less', 'more', 'bat', 'nl', 'sed', 'awk', 'jq', 'diff', 'cut', 'sort', 'uniq', 'tac', 'xxd', 'od'])
// ファイルを名指しするが中身は出さないコマンド（行数・属性・種類だけ）。引数のファイルを「名前だけ」とみなす
const NAMERS = new Set(['wc', 'ls', 'stat', 'file', 'du'])
// これだけでできたコマンドは何も書き換えないので、git status で調べない
const READ_ONLY = new Set([
  ...READERS, ...NAMERS, 'grep', 'egrep', 'fgrep', 'rg', 'find', 'fd', 'tree', 'echo', 'printf', 'pwd', 'which', 'type',
  'cd', 'true', 'false', 'test', '[', 'date', 'basename', 'dirname', 'realpath', 'tr', 'column', 'sleep', 'pgrep', 'ps',
])
const GIT_READ = new Set(['status', 'log', 'diff', 'show', 'ls-files', 'grep', 'branch', 'rev-parse', 'blame', 'remote', 'describe', 'shortlog'])

// セッションごとに作り直す。モジュールの変数は reload で消えるので session.start で埋め直す
let root = ''
let home = ''
let files = new Set<string>()
// files が変わるたびに増やす。ツリーの骨組みを作り直すかどうかの目印
let filesVersion = 0
const addFile = (rel: string) => {
  if (files.has(rel)) return
  files.add(rel)
  // 骨組みと名前順の一覧が今の一覧のものなら、作り直さずに1件だけ足す
  const fresh = skeleton?.version === filesVersion ? skeleton : undefined
  const sortedFresh = sortedFiles?.version === filesVersion ? sortedFiles : undefined
  filesVersion += 1
  if (fresh) {
    addToSkeleton(fresh.value, rel)
    fresh.version = filesVersion
  }
  if (sortedFresh) {
    insertSorted(sortedFresh.list, rel)
    sortedFresh.version = filesVersion
  }
}
// Bash の作業ディレクトリ。リポジトリの中なら次の呼び出しにも持ち越される
let shellCwd = ''
let fileNote = ''
// session.start より先に届いた読み込みは、ファイル一覧ができてから記録する
let pending: { path: string; reason: string }[] = []
// デバッグ出力（/touch-map debug で on にしたときだけ。$.store に残してセッションをまたぐ）。追記の API がないので、溜めた行を毎回まとめて書き直す
let debug = false
let sessionId = ''
let debugLines: string[] = []
let writing: Promise<void> = Promise.resolve()
// まだ書いていない最新のペインの中身。書いている間に何度呼ばれても、次に書くのは最後のものだけ
let queuedView: { base: string; view: string } | undefined
// 最後に書き出したペインの中身。同じなら書き直さない
let writtenView = ''
// ペインに入る行数。最後に描いたときの値をデバッグ出力の区切り線に使う
let paneRows = 0
// 最後にペインを描いたときにかかった時間（ミリ秒）。デバッグ出力で重さを見る
let renderMs = 0

// 正規表現は遅いので、よく通る道では文字を比べて済ませる。結果は正規表現で書いたときと同じ

// 前後の引用符を外す（/^['"]+|['"]+$/g を空にするのと同じ）
const isQuote = (s: string, i: number) => s[i] === "'" || s[i] === '"'
const unquote = (s: string): string => {
  let a = 0
  let b = s.length
  while (a < b && isQuote(s, a)) a++
  while (b > a && isQuote(s, b - 1)) b--
  return a === 0 && b === s.length ? s : s.slice(a, b)
}

// 空の区切り・「.」「..」・末尾の / を含むか（/\/\/|\/\.\.?(?:\/|$)|\/$/ と同じ）
const notPlain = (p: string): boolean =>
  p.includes('//') || p.includes('/./') || p.includes('/../') || p.endsWith('/') || p.endsWith('/.') || p.endsWith('/..')

// JS の正規表現の \s にあたる文字
const isSpace = (c: number): boolean =>
  (c >= 9 && c <= 13) || c === 32 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff

// 空白で区切った語。split(/\s+/) から空の語を除いたものと同じ
const wordsOf = (line: string): string[] => {
  const out: string[] = []
  let start = -1
  for (let i = 0; i < line.length; i++) {
    if (isSpace(line.charCodeAt(i))) {
      if (start >= 0) out.push(line.slice(start, i))
      start = -1
    } else if (start < 0) start = i
  }
  if (start >= 0) out.push(start === 0 ? line : line.slice(start))
  return out
}

// base から見たパスを絶対パスにそろえる。base が分からない（cd 先が変数など）ときの相対パスは undefined
const toAbs = (raw: string, base: string | undefined): string | undefined => {
  const p = unquote(raw.trim())
  if (p === '' || p === '/dev/null') return undefined
  const joined = p.startsWith('/') ? p : p === '~' || p.startsWith('~/') ? home + p.slice(1) : base === undefined ? undefined : `${base}/${p}`
  if (joined === undefined) return undefined
  // 空の区切り・「.」「..」・末尾の / がない絶対パスは、たどっても同じなのでそのまま返す
  if (joined.startsWith('/') && !notPlain(joined)) return joined
  const parts: string[] = []
  for (const part of joined.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return '/' + parts.join('/')
}

// リポジトリからの相対パス。リポジトリの外なら undefined
// base は省略させない（undefined を渡すと既定値が使われ、「分からない」が「リポジトリ直下」になるため）
// 同じリポジトリの別の作業場所（git worktree）。中のファイルはリポジトリの同じパスとして数える。長い順
let worktrees: string[] = []

// 絶対パスが属する作業場所（リポジトリ本体かワークツリー）。どちらでもなければ undefined
const treeOf = (abs: string): string | undefined =>
  worktrees.find(w => abs === w || abs.startsWith(w + '/')) ?? (abs === root || abs.startsWith(root + '/') ? root : undefined)

const toRel = (raw: string, base: string | undefined): string | undefined => {
  const abs = toAbs(raw, base)
  const tree = abs === undefined ? undefined : treeOf(abs)
  return abs !== undefined && tree !== undefined && abs !== tree ? abs.slice(tree.length + 1) : undefined
}

// 最後に一覧を取った時刻。リポジトリの外を読むたびに取り直さないよう、force でなければ 30 秒に 1 回まで
let worktreesAt = 0

async function loadWorktrees($: any, force = true): Promise<void> {
  const now = await $.clock.now()
  if (!force && now - worktreesAt < 30_000) return
  worktreesAt = now
  const ran = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: root, timeoutMs: 10_000 })
  if (ran.exitCode !== 0) return
  const found: string[] = ran.stdout
    .split('\n')
    .filter((l: string) => l.startsWith('worktree '))
    .map((l: string) => l.slice('worktree '.length))
    .filter((w: string) => w !== root)
    .sort((a: string, b: string) => b.length - a.length)
  // ワークツリーにしかないファイル（そこで新しく作ったもの）も一覧に入れる。force のときは作り直す
  for (const w of found) {
    if (!force && worktrees.includes(w)) continue
    const listed = await $.process.run(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], { cwd: w, timeoutMs: 60_000 })
    if (listed.exitCode !== 0) continue
    for (const rel of listed.stdout.split('\n')) if (rel !== '') addFile(rel)
    await snapshotDeleted($, w)
    // 本体と同じく、対になる .meta は外す（ディレクトリの .meta も）
    if (dropMeta(files) > 0) filesVersion += 1
  }
  worktrees = found
}

const isOk = (ran: { deny?: string; isError?: boolean }) => ran.deny === undefined && ran.isError !== true

async function recordLoad($: any, path: string, reason: string): Promise<void> {
  const rel = toRel(path, root)
  const key = rel ?? (home !== '' && path.startsWith(home + '/') ? '~' + path.slice(home.length) : path)
  if (rel) addFile(rel)
  await update($, loadedAtom, (all: Loaded) => (all[key] === reason ? all : { ...all, [key]: reason }))
}

// 3つめは Read で読んだ行の範囲と、ファイルの行数
type Lines = { from: number; to: number; total: number }
type Hit = [string, Level, Lines?]

// 範囲を並べて、重なりと隣り合いをまとめる
const mergeRanges = (ranges: [number, number][]): [number, number][] => {
  const out: [number, number][] = []
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1]
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

// 末尾の空行は数え方で1行ずれるので、1行足りないだけなら全体とみなす
const coversAll = (r: [number, number][], total: number) => r.length === 1 && (r[0]?.[0] ?? 2) <= 1 && (r[0]?.[1] ?? 0) >= total - 1

// gone は消したファイル（rm・mv の元）。消すのも書き換えなので「更新」として数え、削除の印を付ける
// agent はサブエージェントの id（本体なら undefined）。光る色を変えるのに使う
const mark = async ($: any, hits: Hit[], gone: string[] = [], agent?: string) => {
  if (hits.length === 0 && gone.length === 0) return
  // .gitignore されたファイルを読んだときなど、一覧に無いものもツリーに出す
  for (const [path] of hits) addFile(path)
  for (const path of gone) addFile(path)
  // 直近の1件。消したものがあればそれ、なければいちばん深く触ったもの（同じなら後のもの）
  let latest: Now | null = null
  for (const [path, level] of hits) if (!latest || level >= latest.level) latest = { path, level }
  const lastGone = gone[gone.length - 1]
  if (lastGone !== undefined) latest = { path: lastGone, level: 3 }
  await update($, touches, (all: Record<string, Touch>) => {
    const next = { ...all }
    for (const [path, level, lines] of hits) {
      const prev = next[path]
      const c: Touch['c'] = prev ? [...prev.c] : [0, 0, 0, 0, 0]
      c[level] = (c[level] ?? 0) + 1
      let s = (prev && prev.s > level ? prev.s : level) as Level
      let r = prev?.r
      let n = prev?.n
      if (lines) {
        r = mergeRanges([...(r ?? []), [lines.from, lines.to]])
        n = lines.total
        // 部分読取を重ねて全体を読み終えたら、読み取りに上げる
        if (s < 2 && coversAll(r, n)) s = 2
      }
      // 書き込んだら（作り直したら）削除の印は外す
      const d = prev?.d === true && level < 3 ? true : undefined
      next[path] = { s, c, ...(r ? { r, n } : {}), ...(d ? { d } : {}) }
    }
    for (const path of gone) {
      const prev = next[path]
      const c: Touch['c'] = prev ? [...prev.c] : [0, 0, 0, 0, 0]
      c[3] = (c[3] ?? 0) + 1
      next[path] = { ...prev, s: (prev && prev.s > 3 ? prev.s : 3) as Level, c, d: true }
    }
    return next
  })
  touchesGen += 1
  if (latest) await update($, nowAtom, () => latest)
  // 消すメモがあるときだけ書く（書くと描き直しになるため）
  if ((await read($, segment)).note !== '') await update($, segment, (seg: Segment) => (seg.note === '' ? seg : { ...seg, note: '' }))
  await flash($, [...hits.map(([path]) => path), ...gone], agent !== undefined)
}

// ヒアドキュメントの本文はコマンドではないので外す（本文の > をリダイレクトと誤認しないため）
const stripHeredocs = (command: string): string => {
  const out: string[] = []
  let end: string | undefined
  for (const line of command.split('\n')) {
    if (end !== undefined) {
      if (line.trim() === end) end = undefined
      continue
    }
    out.push(line)
    const m = line.match(/<<-?\s*['"]?([A-Za-z_]\w*)['"]?/)
    if (m) end = m[1]
  }
  return out.join('\n')
}

// 引用符の中身はコードや文字列なので、> や | を拾わないよう伏せる
const maskQuotes = (command: string): string => command.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, ' _ ')

// 書き込み先として信じてよい文字列か。展開前の変数や記号だけのものは除く
const isPathLike = (s: string): boolean => !s.includes('$') && /^[\w@%+=:,./~-]+$/.test(s) && /[\w]/.test(s)

// Bash のコマンドと出力から、読んだファイル・書いたファイル・名前を見たファイルを拾う
// cd も追い、相対パスは cd 先から解決する
// cwd はコマンドを実行する時点のシェルの場所。Claude Code が cd を覚えているので、それをそのまま使う
const fromBash = (command: string, stdout: string, cwd: string): { hits: Hit[]; gone: string[] } => {
  const hits: Hit[] = []
  const gone: string[] = []
  let base: string | undefined = cwd || shellCwd || root
  // 名前を出すコマンドがリポジトリの中を見ていたときだけ、出力から名前を拾う
  let scan = false
  // 一致した行の中身まで出す grep があったか。あれば出力の「ファイル:行」は部分読取
  let showsLines = false
  for (const seg of maskQuotes(stripHeredocs(command)).split(/\|\||&&|;|\||\n/)) {
    const tokens = seg.trim().split(/\s+/).filter(t => t !== '')
    if (tokens.length === 0) continue
    const cmd = (tokens[0] ?? '').split('/').pop() ?? ''
    if (cmd === 'cd') {
      const to = (tokens[1] ?? '~').replace(/^\$HOME(?=\/|$)/, '~')
      // 変数・cd -・引用符で伏せた先は追えないので、以降の相対パスは拾わない
      base = to.includes('$') || to === '-' || to === '_' ? undefined : toAbs(to, base)
      continue
    }
    // rm・git rm は消す。mv・git mv は元を消して先に作る（引数が2つの素直な形だけ）
    const sub = cmd === 'git' ? tokens[1] ?? '' : ''
    const args = tokens.slice(sub === '' ? 1 : 2).filter(t => !t.startsWith('-') && !t.includes('*'))
    if (cmd === 'rm' || cmd === 'unlink' || sub === 'rm') {
      for (const t of args) {
        const rel = toRel(t, base)
        if (rel && files.has(rel)) gone.push(rel)
      }
      continue
    }
    if ((cmd === 'mv' || sub === 'mv') && args.length === 2) {
      const from = toRel(args[0] ?? '', base)
      let to = toRel(args[1] ?? '', base)
      if (from && to && files.has(from)) {
        // 先が既存のディレクトリなら、その中へ同じ名前で移る
        if (!files.has(to) && [...files].some(f => f.startsWith(to + '/'))) to = `${to}/${from.split('/').pop()}`
        gone.push(from)
        hits.push([to, files.has(to) ? 3 : 4])
      }
      continue
    }
    if (LISTERS.test(seg)) {
      const inRepo = base !== undefined && treeOf(base) !== undefined
      const outside = tokens.some(t => /^[~/]|^\$HOME/.test(t) && t !== '/dev/null' && toRel(t.replace(/^\$HOME/, '~'), base) === undefined)
      if (inRepo && !outside) scan = true
      // grep はパターンだけ（ファイルの指定も -r もない）なら、パイプの前の出力を絞っているだけでファイルは読んでいない
      const operands = tokens.slice(1).filter(t => !t.startsWith('-'))
      const readsFiles = !/^[ef]?grep$/.test(cmd) || operands.length >= 2 || tokens.some(t => /^-[a-zA-Z]*[rR]/.test(t))
      if (GREPS.test(seg) && readsFiles && !tokens.some(NAMES_ONLY)) {
        showsLines = true
        // ファイルを名指しした grep は、出力にファイル名が出なくても一致した行を見ている
        for (const t of tokens.slice(1)) {
          const rel = t.startsWith('-') ? undefined : toRel(t, base)
          if (rel && files.has(rel)) hits.push([rel, 1])
        }
      }
    }
    const inPlace = (cmd === 'sed' || cmd === 'perl') && tokens.some(t => /^-[a-zA-Z]*i/.test(t))
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i] ?? ''
      const redirect = t === '>' || t === '>>' ? tokens[i + 1] : /^>>?[^>&]/.test(t) ? t.replace(/^>>?/, '') : undefined
      if (redirect !== undefined || (cmd === 'tee' && i > 0 && !t.startsWith('-'))) {
        const target = redirect ?? t
        const rel = isPathLike(target) ? toRel(target, base) : undefined
        // 新しく作ったとみなすのは、パスか拡張子のある名前だけ
        if (rel && (files.has(rel) || /[./]/.test(rel))) {
          hits.push([rel, files.has(rel) ? 3 : 4])
          addFile(rel)
        }
        continue
      }
      if (i === 0 || t.startsWith('-')) continue
      const rel = toRel(t, base)
      // head・tail・sed -n は一部の行しか出さないので部分読取
      const partial = cmd === 'head' || cmd === 'tail' || (cmd === 'sed' && tokens.some(x => /^-[a-zA-Z]*n/.test(x)))
      if (rel && files.has(rel) && (inPlace || READERS.has(cmd))) hits.push([rel, inPlace ? 3 : partial ? 1 : 2])
      else if (rel && files.has(rel) && NAMERS.has(cmd)) hits.push([rel, 0])
    }
  }
  // 次の呼び出しに持ち越すのはリポジトリの中だけ（外に出るとシェルが戻すため）
  shellCwd = base !== undefined && treeOf(base) !== undefined ? base : root
  if (scan && base !== undefined) {
    const lines = stdout.slice(0, 300_000).split('\n').slice(0, 20_000)
    // grep の出力では同じ名前が何行も続くので、名前ごとの解決結果を使い回す
    const known = new Map<string, string | undefined>()
    for (const line of lines) {
      for (const word of wordsOf(line)) {
        const colon = word.indexOf(':')
        const name = colon < 0 ? word : word.slice(0, colon)
        let rel = known.get(name)
        if (rel === undefined && !known.has(name)) known.set(name, (rel = toRel(name, base)))
        // 「ファイル:行番号:中身」の形なら、その行の中身を見ている
        if (rel && files.has(rel)) hits.push([rel, showsLines && colon >= 0 ? 1 : 0])
      }
    }
  }
  // 1回の呼び出しでは、同じファイルをいちばん深い状態で1回だけ数える
  const once = new Map<string, Level>()
  for (const [path, level] of hits) once.set(path, Math.max(once.get(path) ?? 0, level) as Level)
  return { hits: [...once], gone: [...new Set(gone)] }
}

// 読むだけのコマンドか。ヒアドキュメント（スクリプトのことが多い）やファイルへのリダイレクトがあれば違う
const readOnlyBash = (command: string): boolean => {
  if (/<</.test(command)) return false
  for (const seg of maskQuotes(command).split(/\|\||&&|;|\||\n/)) {
    const tokens = seg.trim().split(/\s+/).filter(t => t !== '')
    if (tokens.length === 0) continue
    const cmd = (tokens[0] ?? '').split('/').pop() ?? ''
    if (cmd === 'git' ? !GIT_READ.has(tokens[1] ?? '') : !READ_ONLY.has(cmd)) return false
    if ((cmd === 'sed' || cmd === 'perl') && tokens.some(t => /^-[a-zA-Z]*i/.test(t))) return false
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i] ?? ''
      const target = t === '>' || t === '>>' ? tokens[i + 1] ?? '' : /^\d?>>?[^>&]/.test(t) ? t.replace(/^\d?>>?/, '') : undefined
      if (target !== undefined && target !== '/dev/null') return false
    }
  }
  return true
}

type StatusEntry = { code: string; path: string; from?: string }

// git status --porcelain -z を読む。名前の変更（R）とコピー（C）は、次の欄が元の名前
const parseStatus = (out: string): StatusEntry[] => {
  const parts = out.split('\0')
  const entries: StatusEntry[] = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i] ?? ''
    if (!/^[ MADRCTU?!]{2} ./.test(p)) continue
    const code = p.slice(0, 2)
    if (/[RC]/.test(code)) {
      entries.push({ code, path: p.slice(3), from: parts[i + 1] ?? '' })
      i++
    } else entries.push({ code, path: p.slice(3) })
  }
  return entries
}

// 作業場所ごとの、すでに消えているファイル。消えたかどうかはこれとの差で決める
const deletedBefore = new Map<string, Set<string>>()

async function gitStatus($: any, tree: string): Promise<StatusEntry[] | undefined> {
  const ran = await $.process.run(['git', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: tree, timeoutMs: 30_000 })
  return ran.exitCode === 0 ? parseStatus(ran.stdout) : undefined
}

async function snapshotDeleted($: any, tree: string): Promise<void> {
  const entries = await gitStatus($, tree)
  if (entries) deletedBefore.set(tree, new Set(entries.filter(e => e.code.includes('D')).map(e => e.path)))
}

// スクリプトなど、コマンドの文字列からは分からない書き換えを拾う。
// git status で変更のあるファイルのうち、更新時刻がコマンドの実行中（since 以降）のものだけを、そのコマンドが書いたとみなす
async function changedSince($: any, tree: string, since: number): Promise<{ hits: Hit[]; gone: string[] }> {
  const entries = await gitStatus($, tree)
  if (!entries) return { hits: [], gone: [] }
  const alive = entries.filter(e => !e.code.includes('D') && !(e.path.endsWith('.meta') && files.has(e.path.slice(0, -5)))).slice(0, 300)
  const stats = await Promise.all(alive.map(e => $.fs.stat(`${tree}/${e.path}`, { resolve: false }).catch(() => undefined)))
  const hits: Hit[] = []
  const gone: string[] = []
  alive.forEach((e, i) => {
    const mtime: number | undefined = stats[i]?.mtimeMs
    if (mtime === undefined || mtime < since || stats[i]?.kind !== 'file') return
    hits.push([e.path, files.has(e.path) ? 3 : 4])
    if (e.from) gone.push(e.from)
  })
  const before = deletedBefore.get(tree)
  const deleted = entries.filter(e => e.code.includes('D')).map(e => e.path)
  if (before) for (const p of deleted) if (!before.has(p)) gone.push(p)
  deletedBefore.set(tree, new Set(deleted))
  return { hits, gone }
}

// Unity の .meta のように、本体と対になるだけのファイルは一覧から外す
const dropMeta = (all: Set<string>): number => {
  let any = false
  for (const path of all) {
    if (path.endsWith('.meta')) {
      any = true
      break
    }
  }
  if (!any) return 0
  // ディレクトリは下から上へたどり、すでに入っている所で止める（その上はもう入っている）
  const dirs = new Set<string>()
  for (const path of all) {
    for (let i = path.lastIndexOf('/'); i >= 0; i = i === 0 ? -1 : path.lastIndexOf('/', i - 1)) {
      const dir = path.slice(0, i)
      if (dirs.has(dir)) break
      dirs.add(dir)
    }
  }
  let dropped = 0
  for (const path of [...all]) {
    if (path.endsWith('.meta') && (all.has(path.slice(0, -5)) || dirs.has(path.slice(0, -5)))) {
      all.delete(path)
      dropped += 1
    }
  }
  return dropped
}

const loadFiles = async ($: any) => {
  root = await $.session.root()
  shellCwd = root
  const env = await $.process.run(['printenv', 'HOME'])
  home = env.stdout.trim()
  const git = await $.process.run(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, timeoutMs: 60_000 })
  if (git.exitCode === 0) {
    files = new Set(git.stdout.split('\n').filter((l: string) => l !== ''))
    filesVersion += 1
    const dropped = dropMeta(files)
    fileNote = [git.isStdoutTruncated ? '(list cut at 4 MiB)' : '', dropped > 0 ? `(${dropped} .meta hidden)` : ''].filter(s => s !== '').join(' ')
    return
  }
  // git 管理外: 浅い階層だけたどる
  files = new Set()
  filesVersion += 1
  const walk = async (dir: string, level: number) => {
    if (level > 3 || files.size > 5000) return
    const entries = await $.fs.list(dir === '' ? root : `${root}/${dir}`)
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`
      if (entry.kind === 'directory') await walk(path, level + 1)
      else files.add(path)
    }
  }
  await walk('', 1)
  dropMeta(files)
  filesVersion += 1
  fileNote = '(not a git repo: 3 levels only)'
}

// ---- ツリー。骨組みはファイル一覧が変わったときだけ作り、描画では触ったファイルの分だけ上乗せする ----

type Stat = { touched: number; c: number[]; s: number }
// 骨組み: ディレクトリの親子、ディレクトリごとのファイル数、ディレクトリ直下のファイル。ファイル一覧だけで決まる
// dirs と leaves は一覧に出てきた順。sorted は名前順に並べたもので、描画で要るディレクトリの分だけ作って持っておく
type Skeleton = {
  totals: Map<string, number>
  dirs: Map<string, string[]>
  leaves: Map<string, string[]>
  // ファイルの、一覧での順番
  order: Map<string, number>
  sorted: { dirs: Map<string, string[]>; leaves: Map<string, string[]> }
}

// path が属するディレクトリを上から順に返す
const dirsOf = (path: string): string[] => {
  const out: string[] = []
  for (let i = path.indexOf('/'); i >= 0; i = path.indexOf('/', i + 1)) out.push(path.slice(0, i))
  return out
}

let skeleton: { version: number; value: Skeleton } | undefined

const skeletonOf = (): Skeleton => {
  if (skeleton && skeleton.version === filesVersion) return skeleton.value
  const totals = new Map<string, number>()
  const dirSets = new Map<string, Set<string>>()
  const leaves = new Map<string, string[]>()
  const order = new Map<string, number>()
  for (const path of files) {
    order.set(path, order.size)
    let parent = ''
    for (const dir of dirsOf(path)) {
      let set = dirSets.get(parent)
      if (!set) dirSets.set(parent, (set = new Set()))
      set.add(dir)
      totals.set(dir, (totals.get(dir) ?? 0) + 1)
      parent = dir
    }
    let list = leaves.get(parent)
    if (!list) leaves.set(parent, (list = []))
    list.push(path)
  }
  const dirs = new Map<string, string[]>()
  for (const [parent, set] of dirSets) dirs.set(parent, [...set])
  const value = { totals, dirs, leaves, order, sorted: { dirs: new Map(), leaves: new Map() } }
  skeleton = { version: filesVersion, value }
  return value
}

// 一覧の最後に足したファイルを骨組みに入れる。作り直したときと同じ形になる（新しいディレクトリは親の子の最後に付く）
const addToSkeleton = (sk: Skeleton, path: string) => {
  sk.order.set(path, sk.order.size)
  let parent = ''
  for (const dir of dirsOf(path)) {
    if (!sk.totals.has(dir)) {
      let kids = sk.dirs.get(parent)
      if (!kids) sk.dirs.set(parent, (kids = []))
      kids.push(dir)
      sk.sorted.dirs.delete(parent)
    }
    sk.totals.set(dir, (sk.totals.get(dir) ?? 0) + 1)
    parent = dir
  }
  let list = sk.leaves.get(parent)
  if (!list) sk.leaves.set(parent, (list = []))
  list.push(path)
  sk.sorted.leaves.delete(parent)
}

// 骨組みの一覧を名前順に並べたもの。並べるのはディレクトリごとに最初の1回だけ
const sortedOf = (from: Map<string, string[]>, cache: Map<string, string[]>, dir: string): string[] => {
  let list = cache.get(dir)
  if (!list) cache.set(dir, (list = [...(from.get(dir) ?? [])].sort()))
  return list
}

let statCache: { key: unknown; version: number; stats: Map<string, Stat> } | undefined
// 触ったファイルの dirsOf。パスごとに決まるので、描画をまたいで使い回す
const dirsMemo = new Map<string, string[]>()

// 描画のたびに回すのは、触ったファイルだけ
const statsOf = (all: Record<string, Touch>): Map<string, Stat> => {
  if (statCache && statCache.key === all && statCache.version === filesVersion) return statCache.stats
  const stats = new Map<string, Stat>()
  for (const [path, touch] of Object.entries(all)) {
    let dirs = dirsMemo.get(path)
    if (!dirs) dirsMemo.set(path, (dirs = dirsOf(path)))
    for (const dir of dirs) {
      let stat = stats.get(dir)
      if (!stat) stats.set(dir, (stat = { touched: 0, c: [0, 0, 0, 0, 0], s: -1 }))
      stat.touched += 1
      stat.c[touch.s] = (stat.c[touch.s] ?? 0) + 1
      stat.s = Math.max(stat.s, touch.s)
    }
  }
  statCache = { key: all, version: filesVersion, stats }
  return stats
}

// 表示用の行。dir と file の key はパス、more と quiet は「ディレクトリ#more」「ディレクトリ#quiet」
type Row =
  | { kind: 'dir'; key: string; indent: number; name: string; open: boolean; total: number; stat?: Stat }
  | { kind: 'file'; key: string; indent: number; name: string; touch?: Touch; now: boolean }
  | { kind: 'more' | 'quiet'; key: string; indent: number; text: string; open: boolean }

// ファイル行の上限。読んだ・書いたものと直近のものは必ず出し、残りの枠を部分読取と名前だけで埋める
const MAX_FILES = 8

const base = (path: string) => path.split('/').pop() ?? path
const sum = (c: number[]) => c.reduce((n, x) => n + x, 0)

const toRows = (all: Record<string, Touch>, openState: Record<string, boolean>, now: Now | null): Row[] => {
  const sk = skeletonOf()
  const stats = statsOf(all)
  const hot = (d: string) => (stats.get(d)?.s ?? -1) >= 0
  const byDepth = (a: string, b: string) => {
    const sa = stats.get(a)!
    const sb = stats.get(b)!
    return sb.s - sa.s || sb.touched - sa.touched || a.localeCompare(b)
  }
  // 触ったファイルを直下のディレクトリごとに、一覧の順で。ディレクトリ直下の全ファイルを見て回らずに済ませる
  const touchedIn = new Map<string, string[]>()
  for (const path in all) {
    if (!all[path] || !sk.order.has(path)) continue
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    let list = touchedIn.get(parent)
    if (!list) touchedIn.set(parent, (list = []))
    list.push(path)
  }
  for (const list of touchedIn.values()) list.sort((a, b) => sk.order.get(a)! - sk.order.get(b)!)
  const rows: Row[] = []
  const dirRow = (key: string, indent: number, name: string, fallback: boolean): Row => {
    const stat = stats.get(key)
    return { kind: 'dir', key, indent, name, open: openState[key] ?? fallback, total: sk.totals.get(key) ?? 0, ...(stat ? { stat } : {}) }
  }

  // extra は、つなげて1行にした上の階層の未接触。名前は from からの相対で出す
  const visit = (dir: string, indent: number, extra: string[] = [], from = dir) => {
    const childDirs = sk.dirs.get(dir) ?? []
    for (const first of childDirs.filter(hot).sort(byDepth)) {
      // 触った子ディレクトリが1つだけで、直下に触ったファイルがない間はつなげて1行にする
      let end = first
      let name = base(first) + '/'
      const cold: string[] = []
      for (;;) {
        const kids = sk.dirs.get(end) ?? []
        const hotKids = kids.filter(hot)
        const leaves = sk.leaves.get(end) ?? []
        const only = hotKids[0]
        if (hotKids.length !== 1 || only === undefined || touchedIn.has(end)) break
        for (const k of kids) if (!hot(k)) cold.push(k)
        for (const f of leaves) cold.push(f)
        end = only
        name += base(only) + '/'
      }
      const row = dirRow(end, indent, name, true)
      rows.push(row)
      if (row.kind === 'dir' && row.open) visit(end, indent + 1, cold, first.includes('/') ? first.slice(0, first.lastIndexOf('/')) : '')
    }

    const leaves = sk.leaves.get(dir) ?? []
    const touched = [...(touchedIn.get(dir) ?? [])]
      .sort((a, b) => all[b]!.s - all[a]!.s || sum(all[b]!.c) - sum(all[a]!.c) || a.localeCompare(b))
    const showAll = openState[`${dir}#more`] === true
    const must = new Set(touched.filter(f => all[f]!.s >= 2 || all[f]!.d === true || now?.path === f))
    let room = Math.max(0, MAX_FILES - must.size)
    const shown = touched.filter(f => showAll || must.has(f) || room-- > 0)
    for (const f of shown) rows.push({ kind: 'file', key: f, indent, name: base(f), touch: all[f]!, now: now?.path === f })
    const shownSet = new Set(shown)
    const hidden = touched.filter(f => !shownSet.has(f))
    if (hidden.length > 0) {
      const c = [0, 0, 0, 0, 0]
      for (const f of hidden) c[all[f]!.s] = (c[all[f]!.s] ?? 0) + 1
      const text = DEEP_FIRST.filter(i => (c[i] ?? 0) > 0).map(i => `${fmt(c[i] ?? 0)} ${LEVELS[i]}`).join(' · ')
      rows.push({ kind: 'more', key: `${dir}#more`, indent, text, open: false })
    } else if (showAll && touched.length > MAX_FILES) {
      rows.push({ kind: 'more', key: `${dir}#more`, indent, text: 'show fewer', open: true })
    }

    // 触っていないディレクトリとファイルは、1行に名前だけ並べる（名前順のディレクトリ、名前順のファイル、上の階層の分）
    // 畳んでいる間は件数と先頭 12 件しか使わないので、全部は並べない
    const open = openState[`${dir}#quiet`] === true
    const hotDirs = childDirs.reduce((n, d) => (hot(d) ? n + 1 : n), 0)
    const count = childDirs.length - hotDirs + leaves.length - touched.length + extra.length
    if (count === 0) return
    const quiet: string[] = []
    const take = open ? Infinity : 12
    for (const d of hotDirs === childDirs.length ? [] : sortedOf(sk.dirs, sk.sorted.dirs, dir)) {
      if (quiet.length >= take) break
      if (!hot(d)) quiet.push(d)
    }
    const touchedSet = new Set(touched)
    for (const f of touched.length === leaves.length ? [] : sortedOf(sk.leaves, sk.sorted.leaves, dir)) {
      if (quiet.length >= take) break
      if (!touchedSet.has(f)) quiet.push(f)
    }
    for (const p of extra) {
      if (quiet.length >= take) break
      quiet.push(p)
    }
    const fromExtra = new Set(extra)
    const label = (p: string) => {
      const rel = fromExtra.has(p) && from !== '' ? p.slice(from.length + 1) : fromExtra.has(p) ? p : base(p)
      return sk.totals.has(p) ? rel + '/' : rel
    }
    rows.push({ kind: 'quiet', key: `${dir}#quiet`, indent, text: `${fmt(count)} untouched: ${quiet.slice(0, 12).map(label).join(' ')}`, open })
    if (!open) return
    for (const p of quiet) {
      if (sk.totals.has(p)) {
        const row = dirRow(p, indent + 1, label(p), false)
        rows.push(row)
        if (row.kind === 'dir' && row.open) visit(p, indent + 2)
      } else {
        rows.push({ kind: 'file', key: p, indent: indent + 1, name: label(p), now: false })
      }
    }
  }
  visit('', 0)
  return rows
}

// ---- 見た目の部品 ----

type Seg = { text: string; color: string }

// 1.8k、50k、1.2M のように縮める
const fmt = (n: number): string =>
  n < 1000 ? String(n)
    : n < 10_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
      : n < 1_000_000 ? `${Math.round(n / 1000)}k`
        : `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`

const elapsed = (from: number, now: number): string => {
  if (from <= 0) return ''
  const m = Math.max(0, Math.round((now - from) / 60_000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// 帯の「触っていない部分」。■ はマップのマスと同じ暗さ、━ の残りは ─ で描く
const SQ_TRACK = '#3a3e48'
const LINE_TRACK = '#3f4654'

// 状態ごとの件数を width マスの ■ に割り振る。1件でもあれば1マスは取る。残りは触っていない部分。
// █ だと上下の行の帯とつながって塊に見えるので、マスの間に隙間ができる ■ を使う
const shareBar = (c: number[], total: number, width: number): Seg[] => {
  const parts = DEEP_FIRST.filter(i => (c[i] ?? 0) > 0).map(i => ({ i, n: Math.max(1, Math.round(((c[i] ?? 0) / Math.max(1, total)) * width)) }))
  let used = parts.reduce((n, p) => n + p.n, 0)
  while (used > width) {
    const big = parts.reduce((a, b) => (b.n > a.n ? b : a))
    big.n -= 1
    used -= 1
  }
  const segs = parts.map(p => ({ text: '■'.repeat(p.n), color: COLORS[p.i] as string }))
  if (used < width) segs.push({ text: '■'.repeat(width - used), color: SQ_TRACK })
  return segs
}

// ファイル行の帯は「全部は読んでいない」ときだけ出す（全部読んだ・書いたことは名前の色が言っている）。
// 行範囲が分かる部分読取は読んだところを ━、残りを ─。grep の一致行だけなら点線
const fileBar = (t: Touch): Seg[] => {
  if (t.d === true || t.s !== 1) return []
  if (!t.r || !t.n) return [{ text: '┄'.repeat(BAR), color: COLORS[1] }]
  const cells = Array.from({ length: BAR }, () => false)
  for (const [a, b] of t.r) {
    for (let k = Math.floor(((a - 1) / t.n) * BAR); k < Math.min(BAR, Math.ceil((b / t.n) * BAR)); k++) cells[k] = true
  }
  const segs: Seg[] = []
  for (const on of cells) {
    const last = segs[segs.length - 1]
    const color = on ? COLORS[1] : LINE_TRACK
    if (last && last.color === color) last.text += on ? '━' : '─'
    else segs.push({ text: on ? '━' : '─', color })
  }
  return segs
}

const rangeOf = (t: Touch): string => {
  const first = t.r?.[0]
  if (t.s !== 1 || !first) return ''
  return `${first[0]}–${first[1]}${t.r!.length > 1 ? ` +${t.r!.length - 1}` : ''}`
}

const counts = (all: Record<string, Touch>) => {
  const c = [0, 0, 0, 0, 0]
  for (const touch of Object.values(all)) c[touch.s] = (c[touch.s] ?? 0) + 1
  return c
}

const goneCount = (all: Record<string, Touch>) => Object.values(all).filter(t => t.d === true).length

const glyphOf = (row: Row) => (row.kind === 'file' ? ' ' : row.open ? '▾' : '▸')

// ---- 操作 ----

async function save($: any, keep: boolean, reason = '', keepLabel = false): Promise<string> {
  const all: Record<string, Touch> = await read($, touches)
  const seg: Segment = await read($, segment)
  let note = 'discarded'
  if (keep && Object.keys(all).length > 0) {
    const now = await $.clock.now()
    const stamp = new Date(now).toISOString().replace(/[:.]/g, '-')
    const path = `${home}/${LOG_DIR}/${stamp}.json`
    const instructions: Loaded = await read($, loadedAtom)
    const body = { levels: LEVELS, label: seg.label, root, startedAt: new Date(seg.startedAt).toISOString(), endedAt: new Date(now).toISOString(), files: all, instructions }
    await $.fs.write(path, JSON.stringify(body, null, 2))
    note = `${reason}saved ~/${LOG_DIR}/${stamp}.json`
  } else if (keep) {
    note = reason === '' ? 'nothing to save' : ''
  }
  await update($, touches, () => ({}))
  touchesGen += 1
  await update($, nowAtom, () => null)
  const startedAt = await $.clock.now()
  await update($, segment, () => ({ label: keepLabel ? seg.label : '', startedAt, note }))
  await trace($, keep ? 'save' : 'discard', { label: seg.label, files: Object.keys(all).length, note })
  return note
}

// 最小化は好みなので $.store にも残す。/clear で $.state ごと消えても戻せるように
async function setMinimized($: any, value: boolean): Promise<void> {
  await update($, minimized, () => value)
  await $.store.set('pref.minimized', value)
}

async function loadPrefs($: any): Promise<void> {
  const min = await $.store.get('pref.minimized')
  if (typeof min === 'boolean') await update($, minimized, () => min)
  const map = await $.store.get('pref.map')
  if (typeof map === 'boolean') await update($, mapAtom, () => map)
}

// /clear のあと、$.state が作り直された後で好みと区間の開始時刻を戻す。
// 作り直しと SessionStart の順は決まっていないので、/clear 後の最初のツール呼び出しや読み込みでも戻す
let afterClear = false

async function restoreAfterClear($: any, done: boolean): Promise<void> {
  if (!afterClear) return
  await loadPrefs($)
  const now = await $.clock.now()
  await update($, segment, (seg: Segment) => (seg.startedAt > 0 ? seg : { ...seg, startedAt: now }))
  if (done) afterClear = false
}

async function minimize($: any): Promise<void> {
  await setMinimized($, true)
  await $.ui.close({ id: PANE })
  await trace($, 'minimize')
}

// 先に開いてみて、描かれたときだけ最小化を解く。描かれずに保留されたら（人の操作でなく開いたとき、狭い端末では保留される）
// 帯を残したまま知らせる。帯もペインも消えて何も見えなくなるのを防ぐ
async function restore($: any): Promise<void> {
  const opened = await $.ui.open({ id: PANE, title: 'Touch map' })
  if (opened?.isPlaced === false) {
    $.ui.toast('Touch map: the terminal is too narrow to open the pane here. Run /touch-map to open it.')
    await trace($, 'restore', { placed: false, reason: opened.reason })
    return
  }
  await setMinimized($, false)
  await trace($, 'restore', { placed: true })
}

async function setLabel($: any, value: string): Promise<void> {
  await update($, segment, (s: Segment) => ({ ...s, label: value.trim() }))
  await trace($, 'label', { label: value.trim() })
}

async function toggle($: any, key: string, open: boolean): Promise<void> {
  await update($, folds, (all: Record<string, boolean>) => ({ ...all, [key]: !open }))
  await trace($, 'fold', { key, open: !open })
}

// ---- アクティビティマップ ----
// リポジトリ全体を草のようなマス目に並べ、触ったマスを光らせてからゆっくり状態の色に戻す。
// 位置を読ませるためではなく、作業のリズムが見えて楽しいためのもの

// 長方形のマス目を、近いものが近くに集まる順（一般化ヒルベルト曲線 gilbert2d）でたどる
const gilbert = (width: number, height: number): [number, number][] => {
  const out: [number, number][] = []
  const walk = (x: number, y: number, ax: number, ay: number, bx: number, by: number): void => {
    const w = Math.abs(ax + ay)
    const h = Math.abs(bx + by)
    const dax = Math.sign(ax), day = Math.sign(ay), dbx = Math.sign(bx), dby = Math.sign(by)
    if (h === 1) {
      for (let i = 0; i < w; i++, x += dax, y += day) out.push([x, y])
      return
    }
    if (w === 1) {
      for (let i = 0; i < h; i++, x += dbx, y += dby) out.push([x, y])
      return
    }
    let ax2 = Math.floor(ax / 2), ay2 = Math.floor(ay / 2)
    let bx2 = Math.floor(bx / 2), by2 = Math.floor(by / 2)
    const w2 = Math.abs(ax2 + ay2)
    const h2 = Math.abs(bx2 + by2)
    if (2 * w > 3 * h) {
      if (w2 % 2 && w > 2) {
        ax2 += dax
        ay2 += day
      }
      walk(x, y, ax2, ay2, bx, by)
      walk(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by)
    } else {
      if (h2 % 2 && h > 2) {
        bx2 += dbx
        by2 += dby
      }
      walk(x, y, bx2, by2, ax2, ay2)
      walk(x + bx2, y + by2, ax, ay, bx - bx2, by - by2)
      walk(x + (ax - dax) + (bx2 - dbx), y + (ay - day) + (by2 - dby), -bx2, -by2, -(ax - ax2), -(ay - ay2))
    }
  }
  if (width >= height) walk(0, 0, width, 0, 0, height)
  else walk(0, 0, 0, height, width, 0)
  return out
}

const MAP_ROWS = 6
// 光ってから状態の色に戻るまで。最初の POP_MS は真っ白に光り、上下左右にも RIPPLE_MS だけ波紋が広がる
const FADE_MS = 4000
const POP_MS = 350
const RIPPLE_MS = 800
const MAP_EMPTY = '#2b303a'

// マス目の配置。ファイル一覧と幅が変わったときだけ作り直す。パス順に並べて曲線に沿って詰める
// asked は求められた幅、width は実際に使う幅（ファイルが少なければ縮む）
type MapLayout = { asked: number; width: number; cells: string[][]; pos: [number, number][]; cellOf: Map<string, number>; version: number }
let mapLayout: MapLayout | undefined

// 全ファイルを名前順に並べたもの。ファイルが1件増えただけなら、並べ直さずに差し込む
let sortedFiles: { version: number; list: string[] } | undefined

const insertSorted = (list: string[], path: string) => {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((list[mid] ?? '') < path) lo = mid + 1
    else hi = mid
  }
  list.splice(lo, 0, path)
}

const sortedFilesOf = (): string[] => {
  if (!sortedFiles || sortedFiles.version !== filesVersion) sortedFiles = { version: filesVersion, list: [...files].sort() }
  return sortedFiles.list
}

const layoutOf = (width: number): MapLayout => {
  if (mapLayout && mapLayout.version === filesVersion && mapLayout.asked === width) return mapLayout
  const sorted = sortedFilesOf()
  // ファイルがマスより少なければ幅を縮める。多ければ全マスに均等に配り、空きマスを作らない
  const w = Math.max(1, Math.min(width, Math.ceil(sorted.length / MAP_ROWS)))
  const slots = Math.min(w * MAP_ROWS, sorted.length)
  const cells: string[][] = []
  const cellOf = new Map<string, number>()
  sorted.forEach((path, i) => {
    const k = Math.floor((i * slots) / sorted.length)
    ;(cells[k] ??= []).push(path)
    cellOf.set(path, k)
  })
  mapLayout = { asked: width, width: w, cells, pos: gilbert(w, MAP_ROWS), cellOf, version: filesVersion }
  return mapLayout
}

// 光っているマスと、光った時刻
const flashes = new Map<number, { at: number; color: number }>()
// 光る色。本体の操作は白、サブエージェントの操作は黄色
const FLASH_MAIN = 0xffffff
const FLASH_SUB = 0xfde047
let ticking: { cancel: () => void } | undefined
// 1 秒に 10 回の塗り直しで毎回 touches を読まないよう、マスごとの状態を持っておく。
// touches を書き終えるたびに touchesGen を進め、読んだときの世代と違えば読み直す
let touchesGen = 0
let tickStates: { gen: number; layout: MapLayout; states: CellStates } | undefined

const hex = (c: string) => parseInt(c.slice(1), 16)
const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s
  return ch(16) | ch(8) | ch(0)
}

// マスごとのいちばん深い状態（触っていなければ -1）と削除の印。全ファイルではなく、触ったファイルからマスを引く
type CellStates = { levels: Int8Array; gone: Uint8Array }
const cellStatesOf = (all: Record<string, Touch>, layout: MapLayout): CellStates => {
  const levels = new Int8Array(layout.cells.length).fill(-1)
  const gone = new Uint8Array(layout.cells.length)
  for (const p in all) {
    const k = layout.cellOf.get(p)
    const t = all[p]
    if (k === undefined || !t) continue
    if (t.s > (levels[k] ?? -1)) levels[k] = t.s
    if (t.d === true) gone[k] = 1
  }
  return { levels, gone }
}

// Raster の cells（[文字, 前景, 背景] の u32 を base64 にしたもの）を作る。マスは「■」と空白1つ
const mapCells = (all: Record<string, Touch>, layout: MapLayout, now: number): string => paintCells(cellStatesOf(all, layout), layout, now)

const paintCells = (states: CellStates, layout: MapLayout, now: number): string => {
  const columns = layout.width * 2 - 1
  const words = new Uint32Array(columns * MAP_ROWS * 3)
  const DEFAULT = 0x01000000
  for (let i = 0; i < words.length; i += 3) {
    words[i] = 0x20
    words[i + 1] = DEFAULT
    words[i + 2] = DEFAULT
  }
  // 波紋: 光ったマスの上下左右を、少しのあいだ弱く光らせる。キーは上下左右に1マスはみ出す分も入る (x+1, y+1) の通し番号
  const span = layout.width + 2
  const ripple = new Map<number, { strength: number; color: number }>()
  for (const [k, lit] of flashes) {
    const at = layout.pos[k]
    const age = now - lit.at
    if (!at || age >= RIPPLE_MS) continue
    const strength = 0.45 * (1 - age / RIPPLE_MS)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = (at[1] + dy + 1) * span + at[0] + dx + 1
      if (strength > (ripple.get(key)?.strength ?? 0)) ripple.set(key, { strength, color: lit.color })
    }
  }
  layout.cells.forEach((_paths, k) => {
    const at = layout.pos[k]
    if (!at) return
    const level = states.levels[k] ?? -1
    const gone = states.gone[k] === 1
    const base = hex(gone ? GONE : level >= 0 ? COLORS[level] ?? MAP_EMPTY : MAP_EMPTY)
    let fg = base
    const lit = flashes.get(k)
    const age = lit === undefined ? FADE_MS : now - lit.at
    if (lit && age < POP_MS) {
      // 光った瞬間: 本体なら白、サブエージェントなら黄色
      fg = lit.color
    } else if (lit && age < FADE_MS) {
      const left = 1 - (age - POP_MS) / (FADE_MS - POP_MS)
      fg = mix(base, lit.color, 0.9 * left)
    } else {
      const glow = ripple.get((at[1] + 1) * span + at[0] + 1)
      if (glow) fg = mix(base, glow.color, glow.strength)
    }
    const i = (at[1] * columns + at[0] * 2) * 3
    words[i] = 0x25a0
    words[i + 1] = fg
    words[i + 2] = DEFAULT
  })
  return (new Uint8Array(words.buffer) as unknown as { toBase64: () => string }).toBase64()
}

// 触ったマスを光らせ、光っている間だけ 1 秒に 10 回塗り直す
async function flash($: any, paths: string[], sub = false): Promise<void> {
  // 新しいファイルを記録した直後は配置が古い（そのファイルのマスが無く、ほかのマスもずれうる）ので、ここで作り直す
  const layout = mapLayout && layoutOf(mapLayout.asked)
  if (!layout || paths.length === 0) return
  const now = await $.clock.now()
  for (const p of paths) {
    const k = layout.cellOf.get(p)
    if (k !== undefined) flashes.set(k, { at: now, color: sub ? FLASH_SUB : FLASH_MAIN })
  }
  if (ticking) return
  ticking = $.clock.every(100, () => void tick($))
}

async function tick($: any): Promise<void> {
  const now = await $.clock.now()
  for (const [k, lit] of flashes) if (now - lit.at >= FADE_MS) flashes.delete(k)
  const layout = mapLayout
  if (layout && (await read($, mapAtom))) {
    try {
      if (!tickStates || tickStates.gen !== touchesGen || tickStates.layout !== layout) {
        const gen = touchesGen
        tickStates = { gen, layout, states: cellStatesOf(await read($, touches), layout) }
      }
      await $.ui.blit({ requestId: PANE, key: 'map', cells: paintCells(tickStates.states, layout, now) })
    } catch {
      // ペインを閉じている間は塗るものがない
    }
  }
  if (flashes.size === 0) {
    ticking?.cancel()
    ticking = undefined
  }
}

// ---- デバッグ出力 ----

// ペインに出ているはずの中身を、色の代わりに [状態] を付けたテキストにする
async function viewText($: any): Promise<string> {
  const all: Record<string, Touch> = await read($, touches)
  const seg: Segment = await read($, segment)
  const loaded: Loaded = await read($, loadedAtom)
  const isMin: boolean = await read($, minimized)
  const now: Now | null = await read($, nowAtom)
  const rows = toRows(all, await read($, folds), now)
  const c = counts(all)
  const lines = [
    `# Touch map${isMin ? ' (minimized)' : ''}`,
    `task: ${seg.label === '' ? '-' : seg.label}  ${elapsed(seg.startedAt, await $.clock.now())} · touched ${fmt(Object.keys(all).length)}/${fmt(files.size)} ${fileNote}`.trimEnd(),
    `legend: ${DEEP_FIRST.map(i => `${LEVELS[i]} ${c[i]}`).join(' · ')} · deleted ${goneCount(all)} · auto ${Object.keys(loaded).length}`,
  ]
  if (now) lines.push(`now: ${now.path}`)
  if (seg.note !== '') lines.push(`note: ${seg.note}`)
  lines.push('')
  rows.forEach((row, i) => {
    if (paneRows > 0 && i === paneRows) lines.push(`---- below here does not fit in the pane (${paneRows} rows) ----`)
    const pad = '  '.repeat(row.indent)
    if (row.kind === 'dir') lines.push(`${pad}${glyphOf(row)} ${row.name}  ${fmt(row.stat?.touched ?? 0)}/${fmt(row.total)}`)
    else if (row.kind === 'file') {
      const tag = row.touch?.d ? 'deleted' : row.touch ? LEVELS[row.touch.s] : '----'
      const range = row.touch ? rangeOf(row.touch) : ''
      lines.push(`${pad}${row.now ? '>' : ' '} [${tag}] ${row.name}${range === '' ? '' : `  ${range}`}`)
    } else lines.push(`${pad}${glyphOf(row)} ${row.text}`)
  })
  const auto = Object.keys(loaded)
  if (auto.length > 0) lines.push('', `◆ ${auto.join('  ')}`)
  return lines.join('\n') + '\n'
}

// 受け取ったイベントと判定結果を残し、ペインの中身と一緒に書き出す
async function trace($: any, ev: string, data: Record<string, unknown> = {}): Promise<void> {
  if (!debug) return
  debugLines.push(JSON.stringify({ t: new Date(await $.clock.now()).toISOString(), ev, ...data, renderMs }))
  if (debugLines.length > 2000) debugLines = debugLines.slice(-2000)
  if (home === '' || sessionId === '') return
  const base = `${home}/${DEBUG_DIR}/${sessionId}`
  queuedView = { base, view: await viewText($) }
  // 書き込みは順番に。後から呼ばれたほうが必ず新しい中身で上書きする
  writing = writing.then(() => writeDebug($)).then(() => undefined, () => undefined)
  await writing
}

// 溜まっている最新の中身を書く。前の呼び出しが先に書いていれば、何もしない
async function writeDebug($: any): Promise<void> {
  const next = queuedView
  if (!next) return
  queuedView = undefined
  const key = `${next.base}\n${next.view}`
  await Promise.all([
    $.fs.write(`${next.base}.events.jsonl`, debugLines.join('\n') + '\n'),
    ...(key === writtenView ? [] : [$.fs.write(`${next.base}.view.txt`, next.view)]),
  ])
  writtenView = key
}

// reload でモジュールの変数は消えるので、同じセッションの出力があれば続きから書く
async function resumeTrace($: any): Promise<void> {
  if (!debug) return
  sessionId = await $.session.id()
  const path = `${home}/${DEBUG_DIR}/${sessionId}.events.jsonl`
  if (!(await $.fs.exists(path))) return
  const text: string = await $.fs.read(path, { as: 'text' })
  debugLines = [...text.split('\n').filter(l => l !== ''), ...debugLines]
}

const hitText = (hits: Hit[]) => hits.map(([path, level, lines]) => `${LEVELS[level]}:${path}${lines ? `#${lines.from}-${lines.to}/${lines.total}` : ''}`)

// Read の結果から、読んだ範囲が全体かどうかを決める。自動で途中までに切られたときも部分とみなす
const readLevel = (result: unknown): { level: Level; lines?: Lines } => {
  const file = (result as { type?: string; file?: { startLine?: number; numLines?: number; totalLines?: number; truncatedByTokenCap?: boolean } } | undefined)?.file
  const from = file?.startLine
  const count = file?.numLines
  const total = file?.totalLines
  if ((result as { type?: string } | undefined)?.type !== 'text' || from === undefined || count === undefined || total === undefined) return { level: 2 }
  const lines = { from, to: from + count - 1, total }
  return { level: file?.truncatedByTokenCap !== true && coversAll([[lines.from, lines.to]], total) ? 2 : 1, lines }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const t0 = await $.clock.now()
    await loadFiles($)
    await loadWorktrees($)
    await snapshotDeleted($, root)
    // reload の前に触ったファイルは、消したものでもツリーに残す
    for (const path of Object.keys(await read($, touches))) addFile(path)
    const loadMs = (await $.clock.now()) - t0
    await loadPrefs($)
    debug = (await $.store.get('debug')) === true
    await resumeTrace($)
    const waiting = pending
    pending = []
    // 起動時の読み込みは debug の設定を読む前に届くので、ここで残す
    for (const one of waiting) {
      await recordLoad($, one.path, one.reason)
      await trace($, 'InstructionsLoaded', { path: one.path, reason: one.reason, beforeStart: true })
    }
    const now = await $.clock.now()
    await update($, segment, (seg: Segment) => (seg.startedAt > 0 ? seg : { ...seg, startedAt: now }))
    await $.command.register({
      name: 'touch-map',
      description: 'Which files Claude touched. Args: clear (save and restart) / discard / min (minimize) / map [on|off] / debug [on|off]',
    })
    const isMin: boolean = await read($, minimized)
    await trace($, 'session.start', { root, files: files.size, fileNote, surface: e.surface, minimized: isMin, loadMs })
    if (!isMin) void $.ui.open({ id: PANE, title: 'Touch map' })
    return next(e)
  })

  // /clear は $.state ごと作り直し、終了や再開ではプロセスごと消えるので、どちらも session.end で記録する
  on('session.end', async ($, e, next) => {
    const note = await save($, true, e.reason === 'clear' ? '/clear: ' : `exit (${e.reason}): `)
    if (e.reason === 'clear') {
      if (note !== '') $.ui.toast(`Touch map: ${note}`)
      afterClear = true
    }
    await trace($, 'session.end', { reason: e.reason, note })
    return next(e)
  })

  // compact（自動の compact も）で区切る。同じ作業が続くので作業名を残す
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'compact') await save($, true, 'compact: ', true)
    if (e.source === 'clear') await restoreAfterClear($, false)
    if (e.source === 'clear' || e.source === 'compact') {
      // 遅れて読み込まれた指示ファイルは文脈から外れるので消す。起動時のものは読み込み直されるので残す
      await update($, loadedAtom, (all: Loaded) => Object.fromEntries(Object.entries(all).filter(([, why]) => EAGER.has(why))))
    }
    await trace($, 'SessionStart', { source: e.source })
    return next(e)
  })

  // CLAUDE.md や .claude/rules が文脈に読み込まれたとき。ツールを通らないので tool.call では拾えない
  on('classic.InstructionsLoaded', async ($, e, next) => {
    await restoreAfterClear($, true)
    if (root === '') pending.push({ path: e.file_path, reason: e.load_reason })
    else await recordLoad($, e.file_path, e.load_reason)
    await trace($, 'InstructionsLoaded', { path: e.file_path, reason: e.load_reason, beforeStart: root === '' })
    return next(e)
  })

  // プロンプトで @ファイル と書くと、ツールを通らずに中身が添付として文脈に入る
  on('session.append', { door: 'attachment' }, async ($, e, next) => {
    const kept = await next(e)
    if (root === '' || e.message.name !== 'file') return kept
    const text = e.message.content.map(b => (b.type === 'text' ? b.text : '')).join('\n')
    const path = text.match(/"file_path":\s*"((?:[^"\\]|\\.)*)"/)?.[1]
    const rel = path === undefined ? undefined : toRel(path, root)
    const hits: Hit[] = rel ? [[rel, 2]] : []
    await mark($, hits, [], e.agentId)
    await trace($, 'attachment', { name: e.message.name, agent: e.agentId, path, hits: hitText(hits), head: text.slice(0, 200) })
    return kept
  })

  // 右上の × で閉じたときも最小化として扱い、プロンプトの上に1行だけ残す
  // 帯の [ open ]。押した操作の中で開くので、端末の幅に関係なくペインが置かれる
  on('ui.press', { element: 'open' }, async ($, e, next) => {
    if (e.plugin === 'touch-map' && e.component === 'AbovePrompt') await restore($)
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') {
      await setMinimized($, true)
      await trace($, 'ui.close', { by: 'person' })
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, minimized))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const all: Record<string, Touch> = await read($, touches)
    const touched = Object.keys(all).length
    return (
      <Box flexDirection="row" gap={1}>
        <Text dimColor>Touch map</Text>
        <Text>
          {shareBar(counts(all), files.size, BAR).map(s => (
            <Text color={s.color}>{s.text}</Text>
          ))}
        </Text>
        <Text>
          <Text bold>{fmt(touched)}</Text>
          <Text dimColor>{`/${fmt(files.size)}`}</Text>
        </Text>
        {/* 開く処理は下の ui.press のフックで行う。ここで描いたときの $ で開くと、人の操作として扱われない */}
        <Button key="open" label="open" onPress={() => undefined} />
      </Box>
    )
  })

  on('command.run', { command: 'touch-map' }, async ($, e) => {
    await trace($, 'command', { args: e.args })
    const [sub, value] = e.args.trim().split(/\s+/)
    if (sub === 'clear') return { text: await save($, true) }
    if (sub === 'discard') return { text: await save($, false) }
    if (sub === 'debug') {
      const enable = value === 'on' ? true : value === 'off' ? false : !debug
      await $.store.set('debug', enable)
      if (enable && !debug) {
        debug = true
        writtenView = ''
        await resumeTrace($)
        await trace($, 'debug', { on: true })
      } else debug = enable
      return { text: enable ? `debug output on: ~/${DEBUG_DIR}/${sessionId}.*` : 'debug output off' }
    }
    if (sub === 'map') {
      const show = value === 'on' ? true : value === 'off' ? false : !(await read($, mapAtom))
      await update($, mapAtom, () => show)
      await $.store.set('pref.map', show)
      return { text: show ? 'activity map on' : 'activity map off' }
    }
    if (sub === 'min') {
      await minimize($)
      return { text: 'Touch map minimized' }
    }
    await restore($)
    return { text: 'Touch map opened' }
  })

  on('tool.call', async ($, e, next) => {
    if (root === '') return next(e)
    await restoreAfterClear($, true)
    if (e.tool === 'Read' || e.tool === 'Edit' || e.tool === 'NotebookEdit') {
      const path = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
      const ran = await next(e)
      if (toRel(path, root) === undefined) await loadWorktrees($, false)
      const rel = toRel(path, root)
      const read = e.tool === 'Read' ? readLevel(ran.result) : { level: 3 as Level }
      const hits: Hit[] = rel && isOk(ran) ? [read.lines ? [rel, read.level, read.lines] : [rel, read.level]] : []
      await mark($, hits, [], e.agentId)
      await trace($, 'tool', { tool: e.tool, agent: e.agentId, path, ok: isOk(ran), hits: hitText(hits), skip: rel ? undefined : 'outside the repo' })
      return ran
    }
    if (e.tool === 'Write') {
      const rel = toRel(e.file_path, root)
      const existed = rel === undefined || files.has(rel) || (await $.fs.exists(e.file_path))
      const ran = await next(e)
      const hits: Hit[] = rel && isOk(ran) ? [[rel, existed ? 3 : 4]] : []
      if (hits.length > 0) addFile(rel!)
      await mark($, hits, [], e.agentId)
      await trace($, 'tool', { tool: e.tool, agent: e.agentId, path: e.file_path, ok: isOk(ran), hits: hitText(hits), skip: rel ? undefined : 'outside the repo' })
      return ran
    }
    if (e.tool === 'Bash') {
      const cwd: string = await $.session.cwd()
      const started = await $.clock.now()
      const ran = await next(e)
      if (/\bworktree\b/.test(e.command)) await loadWorktrees($)
      else if (cwd !== '' && treeOf(cwd) === undefined) await loadWorktrees($, false)
      const stdout = ran.text ?? ''
      const parsed = ran.deny === undefined ? fromBash(e.command, stdout, cwd) : { hits: [], gone: [] }
      // 書き換えたかもしれないコマンドなら、実行した場所（とコマンドに出てくるワークツリー）の git status も見る
      const written: { hits: Hit[]; gone: string[] } = { hits: [], gone: [] }
      const checked = ran.deny === undefined && !readOnlyBash(e.command)
      if (checked) {
        const trees = new Set([treeOf(cwd) ?? root, ...worktrees.filter(w => e.command.includes(w))])
        for (const tree of trees) {
          const found = await changedSince($, tree, started - 100)
          written.hits.push(...found.hits)
          written.gone.push(...found.gone)
        }
      }
      const once = new Map<string, Level>()
      for (const [path, level] of [...parsed.hits, ...written.hits]) once.set(path, Math.max(once.get(path) ?? 0, level) as Level)
      const hits: Hit[] = [...once]
      const gone = [...new Set([...parsed.gone, ...written.gone])]
      await mark($, hits, gone, e.agentId)
      await trace($, 'tool', { tool: e.tool, agent: e.agentId, cwd, command: e.command.slice(0, 500), denied: ran.deny !== undefined, stdoutChars: stdout.length, hits: hitText(hits), gone, status: checked ? hitText(written.hits) : 'skipped' })
      return ran
    }
    // Claude Code のワークツリー機能で作った作業場所も、すぐ一覧に入れる
    if (String(e.tool) === 'EnterWorktree') {
      const ran = await next(e)
      await loadWorktrees($)
      await trace($, 'tool', { tool: 'EnterWorktree', agent: e.agentId, worktrees })
      return ran
    }
    await trace($, 'tool', { tool: String(e.tool), agent: e.agentId, ignored: true })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const started = await $.clock.now()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Input = 'Input' in ui ? ui.Input : undefined
    const Raster = 'Raster' in ui ? ui.Raster : undefined
    const all: Record<string, Touch> = await read($, touches)
    const seg: Segment = await read($, segment)
    const showMap: boolean = await read($, mapAtom)
    const loaded: Loaded = await read($, loadedAtom)
    const now: Now | null = await read($, nowAtom)
    const rows = toRows(all, await read($, folds), now)
    const c = counts(all)
    const gone = goneCount(all)
    const auto = Object.keys(loaded)
    const cols = e.props.bodyColumns ?? e.viewport?.columns ?? 60
    // ペインの本体は高さを超えると Claude Code がスクロールさせるので、行は全部渡す（重くならないよう上限だけ置く）
    const shown = rows.slice(0, 400)
    const header = 3 + (now ? 1 : 0) + (seg.note !== '' ? 1 : 0) + (Object.keys(all).length === 0 ? 1 : 0)
    paneRows = Math.max(0, (e.props.scroll?.bodyRows ?? 0) - header)
    const legend = [
      ...DEEP_FIRST.filter(i => (c[i] ?? 0) > 0).map(i => ({ text: `■${LEVELS[i]} ${fmt(c[i] ?? 0)}`, color: COLORS[i] as string })),
      ...(gone > 0 ? [{ text: `✕deleted ${fmt(gone)}`, color: GONE }] : []),
      ...(auto.length > 0 ? [{ text: `◆auto ${auto.length}`, color: AUTO }] : []),
    ]
    const tree = (
      <Box flexDirection="column">
        {shown.map(row => {
          const nameColor =
            row.kind === 'dir' ? (row.stat ? undefined : TRACK)
              : row.kind === 'file' ? (row.touch?.d ? GONE : row.touch ? COLORS[row.touch.s] : TRACK)
                : TRACK
          const bar =
            row.kind === 'dir' ? shareBar(row.stat?.c ?? [], row.total, BAR)
              : row.kind === 'file' && row.touch ? fileBar(row.touch) : []
          const count =
            row.kind === 'dir' ? `${fmt(row.stat?.touched ?? 0)}/${fmt(row.total)}`
              : row.kind === 'file' && row.touch ? rangeOf(row.touch) : ''
          return (
            <Box key={`row:${row.kind}:${row.key}`} flexDirection="row" backgroundColor={row.kind === 'file' && row.now ? NOW_BG : undefined}>
              {/* 字下げと行頭の記号は、幅が足りなくても縮めない */}
              <Box flexShrink={0} flexDirection="row">
                <Text>{'  '.repeat(row.indent)}</Text>
                {row.kind === 'file' ? (
                  <Text> </Text>
                ) : (
                  <Button key={`go:${row.kind}:${row.key}`} plain dimColor label={glyphOf(row)} onPress={() => void toggle($, row.key, row.open)} />
                )}
                <Text> </Text>
              </Box>
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text
                  wrap="truncate-end"
                  color={nameColor}
                  bold={row.kind === 'dir' && row.stat !== undefined || (row.kind === 'file' && row.now)}
                  strikethrough={row.kind === 'file' && row.touch?.d === true}
                >
                  {'text' in row ? row.text : row.name}
                </Text>
              </Box>
              {(row.kind === 'dir' || row.kind === 'file') && (
                <Box width={BAR + 1} flexShrink={0} justifyContent="flex-end">
                  <Text>
                    {bar.map(s => (
                      <Text color={s.color}>{s.text}</Text>
                    ))}
                  </Text>
                </Box>
              )}
              {(row.kind === 'dir' || row.kind === 'file') && (
                <Box width={10} flexShrink={0} justifyContent="flex-end">
                  <Text dimColor>{count}</Text>
                </Box>
              )}
            </Box>
          )
        })}
        {rows.length > shown.length && <Text dimColor>{`  … ${fmt(rows.length - shown.length)} more rows`}</Text>}
      </Box>
    )
    renderMs = (await $.clock.now()) - started

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1} paddingRight={2}>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            {Input ? (
              <Input key="label" placeholder="task name" value={seg.label} submitLabel="set" onSubmit={(value: string) => void setLabel($, value)} />
            ) : (
              <Text bold wrap="truncate-end">{seg.label}</Text>
            )}
          </Box>
          <Text dimColor>{elapsed(seg.startedAt, await $.clock.now())}</Text>
          <Button key="save" variant="primary" label="save" onPress={() => void save($, true)} />
          {/* 最小化はペイン右上の × でできるので、ボタンは置かない */}
          <Button key="discard" label="discard" onPress={() => void save($, false)} />
        </Box>
        {/* 狭いペインでは、項目の途中で切らずに項目の切れ目で折り返す */}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text>
            <Text bold>{fmt(Object.keys(all).length)}</Text>
            <Text dimColor>{`/${fmt(files.size)}`}</Text>
          </Text>
          {legend.map(l => (
            <Text color={l.color}>{l.text}</Text>
          ))}
          {fileNote.includes('cut') && <Text color={GONE}>{fileNote}</Text>}
        </Box>
        {now && (
          <Box flexDirection="row" gap={1}>
            <Text dimColor>now</Text>
            <Box flexShrink={1} minWidth={0}>
              <Text wrap="truncate-start" color={COLORS[now.level]}>{now.path}</Text>
            </Box>
          </Box>
        )}
        {seg.note !== '' && <Text dimColor wrap="truncate-end">{seg.note}</Text>}
        {Raster && showMap && files.size > 0 && (() => {
          // ペインの幅いっぱいまでマスを並べる（Raster の上限 512 桁まで）。ファイルが少なくて余るときは中央に寄せる
          const layout = layoutOf(Math.max(8, Math.min(256, Math.floor((cols + 1) / 2))))
          return (
            <Box flexDirection="row" justifyContent="center">
              <Raster key="map" columns={layout.width * 2 - 1} rows={MAP_ROWS} cells={mapCells(all, layout, started)} />
            </Box>
          )
        })()}
        <Text color={TRACK}>{'─'.repeat(Math.max(10, cols))}</Text>
        {Object.keys(all).length === 0 && <Text dimColor>nothing touched yet</Text>}
        {tree}
        {auto.length > 0 && <Text color={AUTO} wrap="truncate-end">{`◆ ${auto.join('  ')}`}</Text>}
      </Box>
    )
  })
}
