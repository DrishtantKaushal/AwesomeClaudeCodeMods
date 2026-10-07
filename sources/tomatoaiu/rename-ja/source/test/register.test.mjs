import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from '../hooks/register.ts'

function harness({ messages = [], reply = { isAnswered: true, text: '日本語名' } } = {}) {
  let handler
  let messageCalls = 0
  const requests = []
  const forwarded = []
  register((event, filter, callback) => {
    assert.equal(event, 'command.run')
    assert.deepEqual(filter, { command: 'rename' })
    assert.equal(handler, undefined)
    handler = callback
  }, { prompt: 'テスト用の指示' })

  return {
    requests,
    forwarded,
    get messageCalls() { return messageCalls },
    run(event) {
      return handler({
        session: { messages: async () => { messageCalls++; return messages } },
        model: { complete: async request => { requests.push(request); return reply } },
      }, event, async nextEvent => {
        forwarded.push(nextEvent)
        return 'next-result'
      })
    },
  }
}

test('explicit names pass through without reading messages or calling Haiku', async () => {
  const hook = harness()
  const event = { args: ' 好きな名前 ', command: 'rename' }
  assert.equal(await hook.run(event), 'next-result')
  assert.equal(hook.forwarded[0], event)
  assert.equal(hook.forwarded.length, 1)
  assert.equal(hook.messageCalls, 0)
  assert.equal(hook.requests.length, 0)
})

test('an empty conversation keeps the built-in rename behavior', async () => {
  const hook = harness({ messages: [{ role: 'user', text: '' }] })
  const event = { args: '' }
  await hook.run(event)
  assert.equal(hook.forwarded[0], event)
  assert.equal(hook.requests.length, 0)
})

test('a generated name is cleaned and forwarded with the original event fields', async () => {
  const hook = harness({
    messages: [
      { role: 'user', text: 'ログインが失敗します' },
      { role: 'assistant', text: '' },
      { role: 'assistant', text: '認証設定を確認します' },
    ],
    reply: { isAnswered: true, text: '\n「ログイン不具合の修正」。\n説明文' },
  })
  const event = { args: ' \t', command: 'rename', extra: 42 }
  assert.equal(await hook.run(event), 'next-result')
  assert.deepEqual(hook.forwarded, [{ ...event, args: 'ログイン不具合の修正' }])
  assert.equal(event.args, ' \t')
  assert.deepEqual(hook.requests, [{
    model: 'haiku',
    system: 'テスト用の指示',
    prompt: 'user: ログインが失敗します\nassistant: 認証設定を確認します',
    maxTokens: 64,
  }])
})

test('long conversations send only the head and tail', async () => {
  const text = '始'.repeat(3000) + '中'.repeat(3000) + '終'.repeat(5000)
  const hook = harness({ messages: [{ role: 'user', text }] })
  await hook.run({ args: '' })
  const transcript = `user: ${text}`
  assert.equal(hook.requests[0].prompt, `${transcript.slice(0, 2000)}\n…\n${transcript.slice(-4000)}`)
})

test('generated names are limited to 40 characters', async () => {
  const hook = harness({
    messages: [{ role: 'user', text: '会話' }],
    reply: { isAnswered: true, text: '名'.repeat(80) },
  })
  await hook.run({ args: '' })
  assert.equal(hook.forwarded[0].args, '名'.repeat(40))
})

for (const reply of [
  { isAnswered: false },
  { isAnswered: true, text: ' \n ' },
  { isAnswered: true, text: '「」。' },
]) {
  test(`an unusable reply preserves the built-in behavior: ${JSON.stringify(reply)}`, async () => {
    const hook = harness({ messages: [{ role: 'user', text: '会話' }], reply })
    const event = { args: '' }
    await hook.run(event)
    assert.equal(hook.forwarded[0], event)
    assert.equal(hook.forwarded.length, 1)
  })
}
