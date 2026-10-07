import type { PluginOptions } from 'claude-code'

import type { LeftoverKind } from '../types'

export type Lang = 'en' | 'zh-TW' | 'zh-CN'

const LANGS: readonly Lang[] = ['en', 'zh-TW', 'zh-CN']

export const langOf = (options: PluginOptions): Lang => LANGS.find(lang => lang === options.language) ?? 'en'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

type Counts = { services: number; backups: number; repos: number; dirty: number }

const en = {
  kind: {
    launchd: 'launchd',
    systemd: 'systemd',
    cron: 'cron',
    docker: 'docker',
    background: 'background',
    repo: 'repo',
    backup: 'backup',
  } as Record<LeftoverKind, string>,
  local: 'local',
  unnamed: 'unnamed container',
  left: (n: number) => plural(n, 'leftover'),
  undo: 'Clean up',
  done: 'Done',
  review: 'See changes',
  ignore: 'Ignore',
  uncommitted: (files: number) => `${plural(files, 'file')} uncommitted`,
  files: (files: number) => plural(files, 'file'),
  uncommittedHeading: 'Uncommitted',
  nothingLeft: 'Nothing left behind.',
  description: 'List what Claude left running or lying around',
  argumentHint: '[drop <n>|clear]',
  cleared: 'ledger cleared.',
  summary: (total: number, { services, backups, repos, dirty }: Counts) =>
    `${plural(total, 'leftover')}: ${[
      services > 0 ? plural(services, 'service') : '',
      backups > 0 ? plural(backups, 'backup') : '',
      repos > 0 ? plural(repos, 'new repo') : '',
      dirty > 0 ? `${plural(dirty, 'repo')} uncommitted` : '',
    ]
      .filter(part => part !== '')
      .join(' · ')}`,
  emptyList: 'nothing left behind.',
  undoLine: (undo: string) => `   clean up: ${undo}`,
  repoLine: (label: string, files: number) => `- ${label} ${plural(files, 'file')} uncommitted`,
  footer: '/leftovers drop <n> removes one from the ledger, /leftovers clear empties it',
  askToUndo: (what: string, host: string, day: string, undo: string) =>
    `Clean up this item from leftovers: ${what} (${host}, created ${day}). Check that it still exists first, then remove it. This command should do it: ${undo}`,
  askToReview: (label: string) => `Show me the uncommitted changes in ${label}. Just list them, don't commit.`,
}

export type Strings = typeof en

const zhTW: Strings = {
  kind: {
    launchd: 'launchd',
    systemd: 'systemd',
    cron: 'cron',
    docker: 'docker',
    background: '背景程序',
    repo: 'repo',
    backup: '備份',
  },
  local: '本機',
  unnamed: '未命名 container',
  left: n => `留著 ${n} 項`,
  undo: '收掉',
  done: '完成',
  review: '看改了什麼',
  ignore: '忽略',
  uncommitted: files => `${files} 檔未 commit`,
  files: files => `${files} 檔`,
  uncommittedHeading: '未 commit',
  nothingLeft: '沒有留下的東西。',
  description: '列出 Claude 留下還沒收掉的東西',
  argumentHint: '[drop <編號>|clear]',
  cleared: '帳本清空了。',
  summary: (total, { services, backups, repos, dirty }) =>
    `留著 ${total} 項：${[
      services > 0 ? `${services} 服務` : '',
      backups > 0 ? `${backups} 備份` : '',
      repos > 0 ? `${repos} 新 repo` : '',
      dirty > 0 ? `${dirty} repo 未 commit` : '',
    ]
      .filter(part => part !== '')
      .join(' · ')}`,
  emptyList: '沒有留下的東西。',
  undoLine: undo => `   收掉：${undo}`,
  repoLine: (label, files) => `- ${label} ${files} 檔未 commit`,
  footer: '/leftovers drop <編號> 從帳本拿掉，/leftovers clear 全清',
  askToUndo: (what, host, day, undo) =>
    `收掉 leftovers 記的這一項：${what}（${host}，${day} 建的）。先確認它還在，再收掉，可以參考這個指令：${undo}`,
  askToReview: label => `看一下 ${label} 還沒 commit 的改動是什麼，先列給我，不要 commit。`,
}

const zhCN: Strings = {
  kind: {
    launchd: 'launchd',
    systemd: 'systemd',
    cron: 'cron',
    docker: 'docker',
    background: '后台进程',
    repo: '仓库',
    backup: '备份',
  },
  local: '本机',
  unnamed: '未命名容器',
  left: n => `遗留 ${n} 项`,
  undo: '清理',
  done: '完成',
  review: '查看改动',
  ignore: '忽略',
  uncommitted: files => `${files} 个文件未提交`,
  files: files => `${files} 个文件`,
  uncommittedHeading: '未提交',
  nothingLeft: '没有遗留的东西。',
  description: '列出 Claude 遗留、还没清理的东西',
  argumentHint: '[drop <编号>|clear]',
  cleared: '账本已清空。',
  summary: (total, { services, backups, repos, dirty }) =>
    `遗留 ${total} 项：${[
      services > 0 ? `${services} 个服务` : '',
      backups > 0 ? `${backups} 个备份` : '',
      repos > 0 ? `${repos} 个新仓库` : '',
      dirty > 0 ? `${dirty} 个仓库未提交` : '',
    ]
      .filter(part => part !== '')
      .join(' · ')}`,
  emptyList: '没有遗留的东西。',
  undoLine: undo => `   清理：${undo}`,
  repoLine: (label, files) => `- ${label} ${files} 个文件未提交`,
  footer: '/leftovers drop <编号> 从账本移除，/leftovers clear 全部清空',
  askToUndo: (what, host, day, undo) =>
    `清理 leftovers 记录的这一项：${what}（${host}，${day} 创建）。先确认它还在，再清理，可以参考这个命令：${undo}`,
  askToReview: label => `看一下 ${label} 还没提交的改动，先列给我，不要提交。`,
}

export const STRINGS: Record<Lang, Strings> = { en, 'zh-TW': zhTW, 'zh-CN': zhCN }
