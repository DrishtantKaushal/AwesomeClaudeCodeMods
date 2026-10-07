import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { STRINGS, langOf } from './i18n'
import type { Strings } from './i18n'
import { maskText } from './mask'

const hits = atom({ plugin: 'secret-mask', key: 'hits' } as const, [])
const isOff = atom({ plugin: 'secret-mask', key: 'isOff' } as const, false)

// 這幾個工具的結果是 Claude 之後要拿來改檔的原文，遮了會讓 Edit 對不上或寫回壞掉的值
const EXEMPT = new Set(['Read', 'Edit', 'Write', 'NotebookEdit'])

type Block = { type: string; [field: string]: unknown }

// 記錄失敗也要讓遮蔽照常生效，所以錯誤吞掉只留 debug log
const record = async ($: EngineInterface, t: Strings, tool: string, where: string, count: number) => {
  const hit = { tool, where: maskText(where, t.mark).text.slice(0, 60), count }

  try {
    await update($, hits, list => [...list, hit].slice(-100))
    $.ui.toast(t.toast(count, tool))
  } catch {
    $.ui.log('secret-mask: could not record hit', { to: 'debug' })
  }
}

// 遮一個 tool_result block 的內容，回傳新 block 和遮了幾處
const maskResult = (block: Block, mark: string): { block: Block; count: number } => {
  const { content } = block

  if (typeof content === 'string') {
    const masked = maskText(content, mark)

    return { block: { ...block, content: masked.text }, count: masked.count }
  }
  if (!Array.isArray(content)) {
    return { block, count: 0 }
  }

  let count = 0
  const parts = (content as Block[]).map(part => {
    if (part.type !== 'text' || typeof part.text !== 'string') {
      return part
    }
    const masked = maskText(part.text, mark)
    count += masked.count

    return { ...part, text: masked.text }
  })

  return { block: { ...block, content: parts }, count }
}

export const register: Register = (on, options) => {
  const t = STRINGS[langOf(options)]
  const commands = new Map<string, string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'secret-mask',
      description: t.description,
      argumentHint: '[off|on]',
    })

    return next(e)
  })

  // Bash 的 stdout / stderr 在來源就換掉，畫面和對話紀錄都看不到原值
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    commands.set(e.tool_use_id, e.command)
    const ran = await next(e)

    if (ran.deny !== undefined || ran.isError === true || (await read($, isOff))) {
      return ran
    }

    const out = maskText(ran.result.stdout, t.mark)
    const err = maskText(ran.result.stderr, t.mark)
    const count = out.count + err.count

    if (count === 0) {
      return ran
    }
    await record($, t, 'Bash', e.command, count)

    return {
      result: { ...ran.result, stdout: out.text, stderr: err.text },
      ...(ran.context === undefined ? {} : { context: ran.context }),
    }
  })

  // 其他工具和 Bash 的錯誤輸出在寫進對話時遮，模型讀到的是遮過的
  on('session.append', { door: 'tool-result' }, async ($, e, next) => {
    const tool = e.origin.kind === 'tool' ? e.origin.tool : 'unknown'

    if (EXEMPT.has(tool) || (await read($, isOff))) {
      return next(e)
    }

    let total = 0
    let where = tool
    const content = e.message.content.map(block => {
      if (block.type !== 'tool_result') {
        return block
      }
      const masked = maskResult(block, t.mark)

      if (masked.count > 0 && typeof block.tool_use_id === 'string') {
        where = commands.get(block.tool_use_id) ?? tool
      }
      total += masked.count

      return masked.block
    })

    if (total === 0) {
      return next(e)
    }
    await record($, t, tool, where, total)

    return next({ ...e, message: { ...e.message, content } })
  })

  on('command.run', { command: 'secret-mask' }, async ($, e) => {
    const arg = e.args.trim()

    if (arg === 'off' || arg === 'on') {
      await update($, isOff, () => arg === 'off')

      return { text: arg === 'off' ? t.off : t.on }
    }

    const list = await read($, hits)
    const state = t.state(await read($, isOff))

    if (list.length === 0) {
      return { text: t.none(state) }
    }

    const total = list.reduce((sum, hit) => sum + hit.count, 0)
    const lines = list.map(hit => `- ${hit.tool} ×${hit.count}  ${hit.where}`)

    return { text: [t.total(state, total), ...lines].join('\n') }
  })
}
