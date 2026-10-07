import { expect, test } from 'claude-code/testing'

import { maskText } from '../hooks/mask'

const MARK = '…(masked)'
const GH = `ghp_${'a1B2'.repeat(9)}`
const JWT = `eyJ${'x'.repeat(12)}.${'y'.repeat(12)}.${'z'.repeat(12)}`
const TYPED = {
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

test('遮常見 token，留前 4 碼', () => {
  expect(maskText(`token ${GH} end`, MARK)).toEqual({ text: 'token ghp_…(masked) end', count: 1 })
  expect(maskText(`Authorization: Bearer ${JWT}`, MARK).text).toBe('Authorization: Bearer eyJx…(masked)')
  expect(maskText('CF_API_TOKEN=abcd1234efgh5678ijkl', MARK).text).toBe('CF_API_TOKEN=abcd…(masked)')
  expect(maskText('{"api_key": "abcd…(masked)"}', MARK).text).toBe('{"api_key": "abcd…(masked)"}')
})

test('程式碼和一般設定不誤遮', () => {
  for (const line of [
    'const API_KEY = process.env.API_KEY',
    'DATABASE_PASSWORD=${DB_PASS}',
    'TOKEN_ENDPOINT=https://example.com/oauth/token',
    'password: string;',
    'git commit -m "rotate token"',
  ]) {
    expect(maskText(line, MARK)).toEqual({ text: line, count: 0 })
  }
})

test('遮過的文字再遮一次不會變', () => {
  for (const mark of [MARK, '…(已遮)', '…(已脱敏)']) {
    const once = maskText(`export GITHUB_TOKEN=${GH}`, mark)

    expect(maskText(once.text, mark)).toEqual({ text: once.text, count: 0 })
  }
})

test('Bash 輸出在來源就換掉，/secret-mask 列得出來', async ($, on) => {
  const toasts: string[] = []
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: `GITHUB_TOKEN=${GH}\n`, stderr: '', interrupted: false },
  }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  const ran = await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'cat .env' })

  if (ran.deny !== undefined || ran.isError === true) {
    throw new Error('Bash call did not answer')
  }
  expect(ran.result.stdout).toBe('GITHUB_TOKEN=ghp_…(masked)\n')
  expect(toasts).toEqual(['Masked 1 possible token (Bash)'])

  const listed = await $.command.run({ command: 'secret-mask', ...TYPED })

  expect(listed.text).toBe('masking on, 1 masked\n- Bash ×1  cat .env')

  const off = await $.command.run({ command: 'secret-mask', ...TYPED, args: 'off' })

  expect(off.text).toBe('off for this session.')
})

test('繁體中文', { options: { language: 'zh-TW' } }, async ($, on) => {
  const toasts: string[] = []
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: `GITHUB_TOKEN=${GH}\n`, stderr: '', interrupted: false },
  }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  const ran = await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'cat .env' })

  if (ran.deny !== undefined || ran.isError === true) {
    throw new Error('Bash call did not answer')
  }
  expect(ran.result.stdout).toBe('GITHUB_TOKEN=ghp_…(已遮)\n')
  expect(toasts).toEqual(['遮了 1 個疑似 token（Bash）'])

  const listed = await $.command.run({ command: 'secret-mask', ...TYPED })

  expect(listed.text).toBe('目前開啟，共遮 1 處\n- Bash ×1  cat .env')
})

test('简体中文', { options: { language: 'zh-CN' } }, async $ => {
  const listed = await $.command.run({ command: 'secret-mask', ...TYPED })

  expect(listed.text).toBe('当前开启，本次会话还没有脱敏过内容。')
})

test('其他工具的結果在寫進對話時遮，Read 不動', async ($, on) => {
  // 測試環境底下沒有東西接 session.append，所以在最底層記下 mod 傳下來的內容
  const arrived: unknown[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('session.append', ($, e, next) => {
    arrived.push(e.message.content[0]?.content)

    return next(e)
  })

  const row = (tool: string) => ({
    door: 'tool-result' as const,
    origin: { kind: 'tool' as const, tool },
    uuid: `u-${tool}`,
    message: {
      type: 'user' as const,
      role: 'user' as const,
      content: [{ type: 'tool_result', tool_use_id: 'x1', content: `key ${GH}` }],
    },
  })

  await $.session.append(row('WebFetch')).catch(() => undefined)
  await $.session.append(row('Read')).catch(() => undefined)

  expect(arrived).toEqual(['key ghp_…(masked)', `key ${GH}`])
})
