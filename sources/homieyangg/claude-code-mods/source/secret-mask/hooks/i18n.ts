import type { PluginOptions } from 'claude-code'

export type Lang = 'en' | 'zh-TW' | 'zh-CN'

const LANGS: readonly Lang[] = ['en', 'zh-TW', 'zh-CN']

export const langOf = (options: PluginOptions): Lang => LANGS.find(lang => lang === options.language) ?? 'en'

const en = {
  mark: '…(masked)',
  toast: (count: number, tool: string) => `Masked ${count} possible token${count === 1 ? '' : 's'} (${tool})`,
  description: 'List possible tokens masked in this session; off / on to toggle',
  off: 'off for this session.',
  on: 'masking again.',
  state: (isOff: boolean): string => (isOff ? 'off' : 'on'),
  none: (state: string) => `masking ${state}, nothing masked in this session yet.`,
  total: (state: string, total: number) => `masking ${state}, ${total} masked`,
}

const zhTW: typeof en = {
  mark: '…(已遮)',
  toast: (count, tool) => `遮了 ${count} 個疑似 token（${tool}）`,
  description: '列出這個 session 遮過的疑似 token；off / on 切換',
  off: '這個 session 先不遮。',
  on: '恢復遮蔽。',
  state: isOff => (isOff ? '目前關閉' : '目前開啟'),
  none: state => `${state}，這個 session 還沒遮過東西。`,
  total: (state, total) => `${state}，共遮 ${total} 處`,
}

const zhCN: typeof en = {
  mark: '…(已脱敏)',
  toast: (count, tool) => `已脱敏 ${count} 个疑似 token（${tool}）`,
  description: '列出本次会话脱敏过的疑似 token；off / on 切换',
  off: '本次会话暂停脱敏。',
  on: '已恢复脱敏。',
  state: isOff => (isOff ? '当前关闭' : '当前开启'),
  none: state => `${state}，本次会话还没有脱敏过内容。`,
  total: (state, total) => `${state}，共脱敏 ${total} 处`,
}

export type Strings = typeof en

export const STRINGS: Record<Lang, Strings> = { en, 'zh-TW': zhTW, 'zh-CN': zhCN }
