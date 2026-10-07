import type { EngineInterface, On, PluginOptions } from 'claude-code'

const HEAD_CHARS = 2000
const TAIL_CHARS = 4000
const MAX_NAME_CHARS = 40

function cleaned(raw: string): string {
  const firstLine = raw.split('\n').find(line => line.trim() !== '') ?? ''
  return firstLine.replace(/^["'「『\s]+|["'」』\s。]+$/g, '').slice(0, MAX_NAME_CHARS)
}

function excerpt(transcript: string): string {
  if (transcript.length <= HEAD_CHARS + TAIL_CHARS) return transcript
  return `${transcript.slice(0, HEAD_CHARS)}\n…\n${transcript.slice(-TAIL_CHARS)}`
}

async function generated($: EngineInterface, system: string): Promise<string> {
  const transcript = (await $.session.messages())
    .filter(message => message.text !== '')
    .map(message => `${message.role}: ${message.text}`)
    .join('\n')
  if (transcript === '') return ''

  const reply = await $.model.complete({
    model: 'haiku',
    system,
    prompt: excerpt(transcript),
    maxTokens: 64,
  })
  return reply.isAnswered ? cleaned(reply.text) : ''
}

export function register(on: On, options: PluginOptions): void {
  const system = String(options.prompt)

  on('command.run', { command: 'rename' }, async ($, e, next) => {
    if (e.args.trim() !== '') return next(e)
    const name = await generated($, system)
    return next(name === '' ? e : { ...e, args: name })
  })
}
