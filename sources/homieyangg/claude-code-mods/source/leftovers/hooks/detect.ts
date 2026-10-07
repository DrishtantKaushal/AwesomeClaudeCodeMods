import type { DirtyRepo, Leftover, LeftoverKind } from '../types'
import type { Strings } from './i18n'

export const LOCAL = 'local'
const GITHUB = 'GitHub'
const UNNAMED = '(unnamed)'

export type Found = Pick<Leftover, 'kind' | 'host' | 'label' | 'undo'>
export type Op = { add: Found } | { drop: string }
export type Detected = { ops: Op[]; dirs: string[] }
export type Place = { cwd: string; home: string }

type Context = { args: string[]; host: string; cwd: string; place: Place; out: Detected }

const SSH_TAKES_VALUE = new Set('-o -p -i -l -F -J -L -R -D -E -S -W -b -c -e -m -w -Q -B -I'.split(' '))
const COMPOSE_VERBS = new Set('up down run exec logs ps pull build restart stop start'.split(' '))
const BACKUP = /\.(bak|backup|orig|old)[-.\w]*$/

export const idOf = (kind: LeftoverKind, host: string, label: string) => `${kind}:${host}:${label}`

// 帳本存的是語言中立的代號，顯示時才換成當下語言
export const hostName = (t: Strings, host: string) => (host === LOCAL ? t.local : host)

export const labelName = (t: Strings, label: string) => (label === UNNAMED ? t.unnamed : label)

export const whatOf = (t: Strings, item: Leftover) => `${t.kind[item.kind]} ${labelName(t, item.label)}`

// 舊版帳本把本機和未命名 container 記成中文，讀進來時換成現在的代號
export const migrated = (item: Leftover): Leftover => {
  const host = item.host === '本機' ? LOCAL : item.host
  const label = item.label === '未命名 container' ? UNNAMED : item.label

  return host === item.host && label === item.label ? item : { ...item, host, label, id: idOf(item.kind, host, label) }
}

const base = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? path

const plain = (words: readonly string[]) => words.filter(word => !word.startsWith('-'))

const add = (ctx: Context, kind: LeftoverKind, label: string, undo: string, host = ctx.host) => {
  const where = host === LOCAL || host === GITHUB ? undo : `ssh ${host} '${undo}'`
  ctx.out.ops.push({ add: { kind, host, label, undo: where } })
}

const drop = (ctx: Context, kind: LeftoverKind, label: string, host = ctx.host) => {
  ctx.out.ops.push({ drop: idOf(kind, host, label) })
}

// 引號攤平再切段，ssh 帶的遠端指令就能跟本機指令用同一套規則看
const SHELLS = new Set(['ssh', 'bash', 'sh', 'zsh'])

// 餵給 cat、python 這類的 heredoc 是資料，裡面長得像指令的行不能記；餵給 shell 或 ssh 的才是指令
const withoutDataHeredocs = (command: string): string =>
  command.replace(
    /<<-?[ \t]*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g,
    (whole: string, _quote: string, _tag: string, rest: string, offset: number) => {
      const line = command.slice(command.lastIndexOf('\n', offset) + 1, offset)
      const head = line
        .split(/;|&&|\|\||\|/)
        .pop()
        ?.trim()
        .split(/\s+/)
        .find(word => word !== 'sudo')

      return SHELLS.has(head ?? '') ? whole : rest
    },
  )

const segmentsOf = (command: string): string[][] =>
  withoutDataHeredocs(command)
    .replace(/\$\([^)]*\)/g, 'X')
    .replace(/=(['"])([^'"\n]*)\1/g, '=$2')
    .replace(/['"]/g, ' ')
    .split(/;|&&|\|\||\||\n/)
    .map(part =>
      part
        .trim()
        .split(/\s+/)
        .filter(word => word !== '' && word !== 'sudo'),
    )
    .filter(words => words.length > 0)

const ASSIGNMENT = /^([A-Za-z_]\w*)=(.*)$/
const VARIABLE = /\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g

// 同一條指令前面設過的變數先代回去，P=x.plist; launchctl bootstrap gui/1 $P 才會記成 x 而不是 $P
const expanded = (words: readonly string[], vars: ReadonlyMap<string, string>): string[] =>
  words.map(word =>
    word.replace(VARIABLE, (whole: string, braced?: string, bare?: string) => vars.get(braced ?? bare ?? '') ?? whole),
  )

// 整段都是 NAME=value（可帶 export）才算設變數，回傳是否吃掉這段
const assignedInto = (vars: Map<string, string>, words: readonly string[]): boolean => {
  const pairs = words[0] === 'export' ? words.slice(1) : words

  if (pairs.length === 0 || !pairs.every(word => ASSIGNMENT.test(word))) {
    return false
  }
  pairs.forEach(word => {
    const [, name = '', value = ''] = ASSIGNMENT.exec(word) ?? []

    vars.set(name, value)
  })

  return true
}

const stripSsh = (words: readonly string[]): { host: string; rest: string[] } | undefined => {
  if (words[0] !== 'ssh') {
    return undefined
  }

  let at = 1

  while (words[at]?.startsWith('-')) {
    at += SSH_TAKES_VALUE.has(words[at] ?? '') ? 2 : 1
  }

  const host = words[at]

  return host === undefined ? undefined : { host, rest: words.slice(at + 1) }
}

const valueAfter = (args: readonly string[], flag: string): string | undefined => {
  const at = args.indexOf(flag)

  return at >= 0 ? args[at + 1] : args.find(word => word.startsWith(`${flag}=`))?.slice(flag.length + 1)
}

// 把路徑接上當時的工作目錄變成絕對路徑，家目錄縮成 ~。
// 帳本跨 session 共用，相對路徑事後查不到是哪個 repo 的
const anchored = (place: Place, parts: readonly string[]): string => {
  const joined = [place.cwd, ...parts].reduce((at, part) => {
    if (part === '') {
      return at
    }

    return at === '' || part.startsWith('/') || part.startsWith('~') ? part : `${at}/${part}`
  }, '')
  const full = joined.startsWith('~') && place.home !== '' ? `${place.home}${joined.slice(1)}` : joined

  if (!full.startsWith('/')) {
    return parts.at(-1) ?? ''
  }

  const kept: string[] = []

  for (const part of full.split('/')) {
    if (part === '..') {
      kept.pop()
    } else if (part !== '' && part !== '.') {
      kept.push(part)
    }
  }

  const path = `/${kept.join('/')}`

  return place.home !== '' && path.startsWith(`${place.home}/`) ? `~${path.slice(place.home.length)}` : path
}

// 本機的路徑才接得上工作目錄，遠端的照原樣記
const pathOn = (ctx: Context, ...parts: string[]): string =>
  ctx.host === LOCAL ? anchored(ctx.place, [ctx.cwd, ...parts]) : (parts.at(-1) ?? '')

const backupTo = (ctx: Context) => {
  const target = plain(ctx.args).at(-1)

  if (target !== undefined && BACKUP.test(target)) {
    const path = pathOn(ctx, target)
    add(ctx, 'backup', path, `rm ${path}`)
  }
}

const RULES: Record<string, (ctx: Context) => void> = {
  launchctl: ctx => {
    const [verb, ...rest] = ctx.args
    const labels = plain(rest).map(word => base(word).replace(/\.plist$/, ''))
    const last = labels.at(-1)

    if ((verb === 'bootstrap' || verb === 'load') && last !== undefined) {
      add(ctx, 'launchd', last, `launchctl bootout gui/$(id -u)/${last}`)
    }
    if (verb === 'bootout' || verb === 'unload' || verb === 'remove') {
      labels.forEach(label => drop(ctx, 'launchd', label))
    }
  },

  systemctl: ctx => {
    const scope = ctx.args.includes('--user') ? 'systemctl --user' : 'sudo systemctl'
    const [verb, ...names] = plain(ctx.args)
    const units = names.map(name => (name.includes('.') ? name : `${name}.service`))

    if (verb === 'enable' || verb === 'start') {
      units.forEach(unit => add(ctx, 'systemd', unit, `${scope} disable --now ${unit}`))
    }
    if (verb === 'disable' || verb === 'stop' || verb === 'mask') {
      units.forEach(unit => drop(ctx, 'systemd', unit))
    }
  },

  crontab: ctx => {
    if (ctx.args.includes('-l')) {
      return
    }
    if (ctx.args.includes('-r')) {
      drop(ctx, 'cron', 'crontab')

      return
    }
    add(ctx, 'cron', 'crontab', 'crontab -e')
  },

  docker: ctx => {
    const [verb, ...rest] = plain(ctx.args)

    if (verb === 'compose') {
      const sub = rest.find(word => COMPOSE_VERBS.has(word))
      const label = ctx.cwd === '' ? 'compose' : ctx.cwd
      const there = ctx.cwd === '' ? '' : `cd ${ctx.cwd} && `

      if (sub === 'up') {
        add(ctx, 'docker', label, `${there}docker compose down`)
      }
      if (sub === 'down') {
        drop(ctx, 'docker', label)
      }

      return
    }

    const isDetached = ctx.args.some(word => word === '--detach' || /^-[a-z]*d[a-z]*$/.test(word))

    if (verb === 'run' && isDetached && !ctx.args.includes('--rm')) {
      const name = valueAfter(ctx.args, '--name')

      add(ctx, 'docker', name ?? UNNAMED, name === undefined ? 'docker ps' : `docker rm -f ${name}`)
    }
    if (verb === 'rm' || verb === 'stop') {
      rest.forEach(name => drop(ctx, 'docker', name))
    }
  },

  nohup: ctx => {
    const label = base(plain(ctx.args)[0] ?? '')

    if (label !== '') {
      add(ctx, 'background', label, `pkill -f ${label}`)
    }
  },

  tmux: ctx => {
    const [verb] = ctx.args
    const session = valueAfter(ctx.args, verb === 'kill-session' ? '-t' : '-s')

    if (session === undefined) {
      return
    }
    if ((verb === 'new' || verb === 'new-session') && ctx.args.includes('-d')) {
      add(ctx, 'background', `tmux ${session}`, `tmux kill-session -t ${session}`)
    }
    if (verb === 'kill-session') {
      drop(ctx, 'background', `tmux ${session}`)
    }
  },

  gh: ctx => {
    const [noun, verb, name] = plain(ctx.args)

    if (noun !== 'repo' || name === undefined) {
      return
    }
    if (verb === 'create') {
      add(ctx, 'repo', base(name), `gh repo delete ${name} --yes`, GITHUB)
    }
    if (verb === 'delete') {
      drop(ctx, 'repo', base(name), GITHUB)
    }
  },

  git: ctx => {
    const at = ctx.args.indexOf('worktree')
    const verb = ctx.args[at + 1]

    if (at < 0 || verb === undefined) {
      return
    }

    // -b / -B 後面那個字是分支名，不是路徑
    const rest = ctx.args.slice(at + 2).filter((word, index, all) => {
      const before = all[index - 1]

      return !word.startsWith('-') && before !== '-b' && before !== '-B'
    })
    const raw = rest[0]

    if (raw === undefined) {
      return
    }

    const inside = valueAfter(ctx.args.slice(0, at), '-C') ?? ''
    const path = pathOn(ctx, inside, raw)

    if (verb === 'add') {
      add(ctx, 'repo', path, `git worktree remove ${path}`)
    }
    if (verb === 'remove') {
      drop(ctx, 'repo', path)
    }
  },

  cp: backupTo,
  mv: backupTo,

  rm: ctx => {
    plain(ctx.args).forEach(path => drop(ctx, 'backup', pathOn(ctx, path)))
  },
}

// 從一條 Bash 指令找出「留下了什麼」和「收掉了什麼」，照指令裡的順序排
export const detect = (command: string, place: Place = { cwd: '', home: '' }): Detected => {
  const out: Detected = { ops: [], dirs: [] }
  const vars = new Map<string, string>()
  let host = LOCAL
  let cwd = ''

  for (const words of segmentsOf(command)) {
    const segment = expanded(words, vars)
    const ssh = stripSsh(segment)

    if (ssh !== undefined) {
      host = ssh.host
      cwd = ''
    }

    const run = ssh?.rest ?? segment

    if (assignedInto(vars, run)) {
      continue
    }

    const [head, ...args] = run

    if (head === undefined) {
      continue
    }
    if (head === 'cd' && args[0] !== undefined) {
      cwd = args[0]
      if (host === LOCAL) {
        out.dirs.push(cwd)
      }
      continue
    }
    if (head === 'git' && host === LOCAL) {
      const dir = valueAfter(args, '-C')

      if (dir !== undefined) {
        out.dirs.push(dir)
      }
    }

    RULES[head]?.({ args, host, cwd, place, out })
  }

  return out
}

export const applyDetected = (
  items: readonly Leftover[],
  detected: Detected,
  meta: Pick<Leftover, 'day' | 'session'>,
): Leftover[] => {
  let list = [...items]

  for (const op of detected.ops) {
    if ('drop' in op) {
      list = list.filter(item => item.id !== op.drop)
      continue
    }

    const id = idOf(op.add.kind, op.add.host, op.add.label)

    if (!list.some(item => item.id === id)) {
      list.push({ ...op.add, id, ...meta })
    }
  }

  return list.slice(-200)
}

export const dayOf = (ms: number): string => {
  const date = new Date(ms)
  const pad = (part: number) => String(part).padStart(2, '0')

  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 本機排最前面，其餘照機器名，再照日期
export const ordered = (items: readonly Leftover[]): Leftover[] =>
  [...items].sort((a, b) => {
    const rank = (item: Leftover) => `${item.host === LOCAL ? '' : item.host}\u0000${item.day}`

    return rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0
  })

export const summary = (t: Strings, items: readonly Leftover[], dirty: readonly DirtyRepo[]): string | undefined => {
  const total = items.length + dirty.length

  if (total === 0) {
    return undefined
  }

  const backups = items.filter(item => item.kind === 'backup').length
  const repos = items.filter(item => item.kind === 'repo').length

  return t.summary(total, { services: items.length - backups - repos, backups, repos, dirty: dirty.length })
}

export const listText = (t: Strings, items: readonly Leftover[], dirty: readonly DirtyRepo[]): string => {
  if (items.length === 0 && dirty.length === 0) {
    return t.emptyList
  }

  const rows = items.map(
    (item, index) =>
      `${index + 1}. ${item.day} ${whatOf(t, item)} @ ${hostName(t, item.host)}\n${t.undoLine(item.undo)}`,
  )
  const repos = dirty.map(repo => t.repoLine(repo.label, repo.files))

  return [summary(t, items, dirty) ?? '', ...rows, ...repos, '', t.footer].join('\n')
}
