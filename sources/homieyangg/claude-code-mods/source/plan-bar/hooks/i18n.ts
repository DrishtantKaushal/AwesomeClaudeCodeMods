import type { PluginOptions } from 'claude-code'

import type { Stage } from '../types'

export type Lang = 'en' | 'zh-TW' | 'zh-CN'

export const langOf = (options: PluginOptions): Lang =>
  options.language === 'zh-TW' || options.language === 'zh-CN' ? options.language : 'en'

const RELEASE_STAGES: Stage[] = [
  { name: 'Build', tasks: ['install', 'compile', 'bundle'] },
  { name: 'Test', tasks: ['unit', 'e2e'] },
  { name: 'Deploy', tasks: ['STG', 'PROD'] },
  { name: 'Verify', tasks: ['smoke', 'metrics'] },
]

const en = {
  done: 'Done',
  noPlans: 'no plans right now. Try /plans demo',
  current: (task: string) => `, now: ${task}`,
  listHint: '/plans clear removes all, /plans sound off|on toggles sound, /plans demo shows a demo',
  commandDescription: 'List the plans on the progress bar, or run a demo',
  cleared: 'cleared.',
  soundOff: 'sound off.',
  soundOn: 'sound on.',
  demoStarted: 'demo running for about 20 seconds, watch above the prompt.',
  demo: {
    refactor: 'Refactor auth module',
    release: 'Release v2.4',
    steps: { name: 'Tasks', tasks: ['read', 'split', 'rewrite', 'test', 'clean up'] },
    stages: [
      { name: 'Build', tasks: ['install', 'compile', 'bundle'] },
      { name: 'Test', tasks: ['unit', 'e2e'] },
      { name: 'Deploy', tasks: ['staging', 'production'] },
      { name: 'Verify', tasks: ['smoke', 'metrics'] },
    ],
  },
}

export type Strings = typeof en

export const STRINGS: Record<Lang, Strings> = {
  en,
  'zh-TW': {
    done: '完成',
    noPlans: '目前沒有 plan。/plans demo 看示範',
    current: task => `，進行中：${task}`,
    listHint: '/plans clear 清掉全部，/plans sound off|on 開關音效，/plans demo 看示範',
    commandDescription: '列出進度條上的 plan，或看示範',
    cleared: '清掉了。',
    soundOff: '音效關了。',
    soundOn: '音效開了。',
    demoStarted: '示範開始，大約 20 秒，看 prompt 上方。',
    demo: {
      refactor: '示範：重構',
      release: '示範：Release',
      steps: { name: 'Tasks', tasks: ['讀', '拆', '改', '測', '收'] },
      stages: RELEASE_STAGES,
    },
  },
  'zh-CN': {
    done: '完成',
    noPlans: '当前没有 plan。可以用 /plans demo 看演示',
    current: task => `，进行中：${task}`,
    listHint: '/plans clear 清空全部，/plans sound off|on 开关音效，/plans demo 看演示',
    commandDescription: '列出进度条上的 plan，或看演示',
    cleared: '已清空。',
    soundOff: '音效已关闭。',
    soundOn: '音效已开启。',
    demoStarted: '演示开始，大约 20 秒，留意输入框上方。',
    demo: {
      refactor: '演示：重构',
      release: '演示：发版',
      steps: { name: '任务', tasks: ['读', '拆', '改', '测', '收'] },
      stages: RELEASE_STAGES,
    },
  },
}
