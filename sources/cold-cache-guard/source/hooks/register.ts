import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptOrigin, Register } from 'claude-code'

const lastAnswerAtMs = atom({ plugin: 'cold-cache-guard', key: 'lastAnswerAtMs' } as const, null)
const resumedTokens = atom({ plugin: 'cold-cache-guard', key: 'resumedTokens' } as const, null)
const isSettled = atom({ plugin: 'cold-cache-guard', key: 'isSettled' } as const, false)

type Cold = { idleMs: number; tokens: number; usd?: number }

const TEXTS = {
  en: {
    question: (cold: Cold) =>
      `Cold prompt cache: last answer ${durationOf(cold.idleMs)} ago, ` +
      `~${Math.round(cold.tokens / 1000)}k tokens to cache again` +
      (cold.usd === undefined ? '' : ` (~$${cold.usd.toFixed(2)})`) +
      '. What now?',
    keep: 'Keep the session as is',
    compactNow: 'Compact now',
    send: 'Send as is',
    compactFirst: 'Compact first',
    clear: 'Start over (/clear)',
    cancel: 'Cancel',
    compacting: 'Compacting; your prompt will be back in the box.',
    cleared: 'Session cleared; your prompt is back in the box.',
    cancelled: 'Not sent; your prompt is back in the box.',
  },
  fr: {
    question: (cold: Cold) =>
      `Cache froid : dernière réponse il y a ${durationOf(cold.idleMs)}, ` +
      `~${Math.round(cold.tokens / 1000)}k tokens à remettre en cache` +
      (cold.usd === undefined ? '' : ` (~${cold.usd.toFixed(2)} $)`) +
      '. Que faire ?',
    keep: 'Garder la session telle quelle',
    compactNow: 'Compacter maintenant',
    send: 'Envoyer tel quel',
    compactFirst: "Compacter d'abord",
    clear: 'Repartir à vide (/clear)',
    cancel: 'Annuler',
    compacting: 'Compaction en cours, le prompt reviendra dans le champ.',
    cleared: 'Session vidée, prompt remis dans le champ.',
    cancelled: 'Envoi annulé, prompt remis dans le champ.',
  },
}

type Texts = (typeof TEXTS)['en']

function durationOf(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

function isPerson(origin: PromptOrigin): boolean {
  return origin.kind === 'composer' || origin.kind === 'bridge'
}

async function textsOf($: EngineInterface): Promise<Texts> {
  const { language } = await $.settings.read()
  return typeof language === 'string' && /^(fr|french|fran[cç]ais)/i.test(language)
    ? TEXTS.fr
    : TEXTS.en
}

/**
 * The dialog of a cold resume, before anything is typed.
 */
async function askAtResume($: EngineInterface, cold: Cold): Promise<void> {
  const texts = await textsOf($)
  const choice = await $.ui
    .ask(texts.question(cold), {
      header: 'Cache',
      options: [texts.keep, texts.compactNow, texts.clear],
    })
    .catch(() => undefined)
  if (choice === undefined) {
    return
  }
  await update($, isSettled, () => true)
  if (choice === texts.compactNow) {
    await $.session.compact()
  } else if (choice === texts.clear) {
    await $.command.run({ command: 'clear' })
  }
}

// A prompt.submit hook cannot compact or run a command itself: both would wait
// on the turn it holds. These run once its dispatch has ended.

async function compactThenRefill($: EngineInterface, text: string): Promise<void> {
  await $.session.compact()
  // Refilled rather than resubmitted: the model would read a plugin's prompt
  // as the plugin's message, not the person's.
  await $.prompt.fill({ text })
}

async function clearThenRefill($: EngineInterface, text: string): Promise<void> {
  await $.command.run({ command: 'clear' })
  await $.prompt.fill({ text })
}

export const register: Register = (on, options) => {
  const ttlMs = Number(options.ttlMinutes ?? 60) * 60_000
  const minTokens = Number(options.minTokens ?? 30_000)

  // Claude Code measures a resumed transcript itself, with the session's real
  // cache lifetime; that estimate beats the configured one.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const seconds = e.seconds_since_last_response
    if (seconds === undefined) {
      return result
    }
    const now = await $.clock.now()
    await update($, lastAnswerAtMs, () => now - seconds * 1000)
    await update($, resumedTokens, () => e.context_tokens ?? null)
    await update($, isSettled, () => false)
    const tokens = e.context_tokens ?? 0
    if (e.prompt_cache_likely_expired && tokens >= minTokens) {
      // Not awaited: the session goes on loading while the dialog waits.
      void askAtResume($, {
        idleMs: seconds * 1000,
        tokens,
        usd: e.estimated_cache_write_usd,
      }).catch(error => $.ui.log(`resume question failed: ${error}`, { to: 'debug' }))
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const now = await $.clock.now()
    await update($, lastAnswerAtMs, () => now)
    await update($, resumedTokens, () => null)
    await update($, isSettled, () => false)
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    if (!isPerson(e.origin) || e.turnId !== undefined || (await read($, isSettled))) {
      return next(e)
    }
    const last = await read($, lastAnswerAtMs)
    if (last === null) {
      return next(e)
    }
    const idleMs = (await $.clock.now()) - last
    const tokens =
      (await $.session.usage()).context.tokens ?? (await read($, resumedTokens)) ?? 0
    if (idleMs < ttlMs || tokens < minTokens) {
      return next(e)
    }

    const texts = await textsOf($)
    const choice = await $.ui
      .ask(texts.question({ idleMs, tokens }), {
        header: 'Cache',
        options: [texts.send, texts.compactFirst, texts.clear, texts.cancel],
      })
      .catch(() => texts.cancel)

    if (choice === texts.send) {
      await update($, isSettled, () => true)
      return next(e)
    }
    if (choice === texts.compactFirst) {
      await update($, isSettled, () => true)
      $.clock.after(0, () => void compactThenRefill($, e.text).catch(() => {}))
      return { drop: texts.compacting }
    }
    if (choice === texts.clear) {
      $.clock.after(0, () => void clearThenRefill($, e.text).catch(() => {}))
      return { drop: texts.cleared }
    }
    await $.prompt.fill({ text: e.text })
    return { drop: texts.cancelled }
  })
}
