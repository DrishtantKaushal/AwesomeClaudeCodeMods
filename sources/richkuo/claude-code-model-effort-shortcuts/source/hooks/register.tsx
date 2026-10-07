import type { EngineInterface as Engine, PluginOptions, Register } from 'claude-code'

type Level = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
type Direction = 'up' | 'down'
type ModelEntry = { id: string; prefix: string; name: string; option: string; effort: boolean }

const ORDER: readonly Level[] = ['low', 'medium', 'high', 'xhigh', 'max']
const MODELS: readonly ModelEntry[] = [
  { id: 'claude-haiku-4-5-20251001', prefix: 'claude-haiku-4-5', name: 'Haiku 4.5', option: 'haiku', effort: false },
  { id: 'claude-sonnet-5-5', prefix: 'claude-sonnet-5-5', name: 'Sonnet 5.5', option: 'sonnet', effort: true },
  { id: 'claude-opus-5-5', prefix: 'claude-opus-5-5', name: 'Opus 5.5', option: 'opus', effort: true },
  { id: 'claude-fable-5-1', prefix: 'claude-fable-5-1', name: 'Fable 5.1', option: 'fable', effort: true },
]
const FALLBACK: Level = 'high'
const SAVED_LEVELS = 'savedPicks'
const SAVED_MODEL = 'savedModel'

const pickRef = { plugin: 'model-effort-shortcuts', key: 'pick' } as const
const engineRef = { plugin: 'model-effort-shortcuts', key: 'engine' } as const
const modelPickRef = { plugin: 'model-effort-shortcuts', key: 'modelPick' } as const
const engineModelRef = { plugin: 'model-effort-shortcuts', key: 'engineModel' } as const
const footerRef = { plugin: 'model-effort-shortcuts', key: 'footer' } as const

const isLevel = (value: unknown): value is Level => typeof value === 'string' && (ORDER as readonly string[]).includes(value)
const entryFor = (model: string) => MODELS.find(entry => model === entry.id || model.startsWith(entry.prefix))
const sameModel = (a: string, b: string) => a === b || (entryFor(a) !== undefined && entryFor(a) === entryFor(b))

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.state.set(pickRef, await loadSavedLevels($))
    await $.state.set(engineModelRef, await $.session.model())
    const saved = await $.store.get(SAVED_MODEL)
    if (typeof saved === 'string' && entryFor(saved) && allowedModels(options).some(entry => sameModel(entry.id, saved))) {
      await $.state.set(modelPickRef, saved)
    }
    await refreshFooter($)
    return result
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    await followEngineModel($)
    if (isLevel(e.effort)) await followEngineLevel($, e.model, e.effort)
    const target = (await $.state.get(modelPickRef)).value ?? e.model
    const supportsEffort = entryFor(target)?.effort ?? isLevel(e.effort)
    const level = supportsEffort ? await currentLevel($, target) : undefined
    await refreshFooter($)
    if (target === e.model && level === e.effort) return yield* next(e)
    const { effort: _engineEffort, ...rest } = e
    return yield* next(level === undefined ? { ...rest, model: target } : { ...rest, model: target, effort: level })
  })

  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    if (e.args.trim() !== '') {
      await clearLevelPick($, await activeModel($))
      await refreshFooter($)
    }
    return result
  })

  on('command.run', { command: 'model' }, async ($, e, next) => {
    const result = await next(e)
    if (e.args.trim() !== '') await clearModelPick($)
    await followEngineModel($)
    await refreshFooter($)
    return result
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e) => {
    const footer = (await $.state.get(footerRef)).value
    const parts = footer ? [...e.props.modes, footer] : [...e.props.modes]
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box marginRight={2}>
        <Text dimColor> {parts.join(' · ')}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const below = await next(e)
    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box>
        <Box display="none">
          <Button key="model-effort-shortcuts-up" label="raise effort" action="strip:jump9" onPress={() => shiftLevel($, options, 'up')} />
          <Button key="model-effort-shortcuts-down" label="lower effort" action="strip:jump8" onPress={() => shiftLevel($, options, 'down')} />
          <Button key="model-effort-shortcuts-model-up" label="next model" action="strip:jump7" onPress={() => shiftModel($, options, 'up')} />
          <Button key="model-effort-shortcuts-model-down" label="previous model" action="strip:jump6" onPress={() => shiftModel($, options, 'down')} />
        </Box>
        {below}
      </Box>
    )
  })
}

function levelRange(options: PluginOptions): Level[] {
  const lowest = isLevel(options.lowest) ? ORDER.indexOf(options.lowest) : 0
  const highest = isLevel(options.highest) ? ORDER.indexOf(options.highest) : ORDER.indexOf('xhigh')
  return ORDER.slice(Math.min(lowest, highest), Math.max(lowest, highest) + 1)
}

function allowedModels(options: PluginOptions): ModelEntry[] {
  return MODELS.filter(entry => options[entry.option] !== false)
}

function stepThrough<T>(all: readonly T[], allowed: readonly T[], rank: number, direction: Direction): T | undefined {
  if (allowed.length === 0) return undefined
  return direction === 'up'
    ? allowed.find(item => all.indexOf(item) > rank) ?? allowed[0]
    : [...allowed].reverse().find(item => all.indexOf(item) < rank) ?? allowed[allowed.length - 1]
}

async function shiftLevel($: Engine, options: PluginOptions, direction: Direction) {
  const model = await activeModel($)
  if (entryFor(model)?.effort === false) return
  const target = stepThrough(ORDER, levelRange(options), ORDER.indexOf(await currentLevel($, model)), direction)
  if (target === undefined) return
  const picks = (await $.state.get(pickRef)).value ?? {}
  await $.state.set(pickRef, { ...picks, [model]: target })
  await $.store.set(SAVED_LEVELS, { ...(await loadSavedLevels($)), [model]: target })
  $.ui.log(`Set to ${await refreshFooter($)}`)
}

async function shiftModel($: Engine, options: PluginOptions, direction: Direction) {
  const current = entryFor(await activeModel($))
  const target = stepThrough(MODELS, allowedModels(options), current ? MODELS.indexOf(current) : -1, direction)
  if (target === undefined) return
  const sessionModel = await $.session.model()
  if (sameModel(target.id, sessionModel)) {
    await clearModelPick($)
  } else {
    await $.state.set(modelPickRef, target.id)
    await $.store.set(SAVED_MODEL, target.id)
  }
  $.ui.log(`Set to ${await refreshFooter($)}`)
}

async function activeModel($: Engine): Promise<string> {
  return (await $.state.get(modelPickRef)).value ?? (await $.session.model())
}

async function currentLevel($: Engine, model: string): Promise<Level> {
  const pick = (await $.state.get(pickRef)).value?.[model]
  if (isLevel(pick)) return pick
  const engine = (await $.state.get(engineRef)).value?.[model]
  if (isLevel(engine)) return engine
  const settings = await $.settings.read()
  const perModel = settings.modelSettings as Record<string, { effortLevel?: unknown } | undefined> | undefined
  const configured = perModel?.[model]?.effortLevel ?? settings.effortLevel
  return isLevel(configured) ? configured : FALLBACK
}

async function followEngineModel($: Engine) {
  const sessionModel = await $.session.model()
  const seen = (await $.state.get(engineModelRef)).value ?? null
  if (seen === sessionModel) return
  await $.state.set(engineModelRef, sessionModel)
  if (seen !== null) await clearModelPick($)
}

async function followEngineLevel($: Engine, model: string, level: Level) {
  const engine = (await $.state.get(engineRef)).value ?? {}
  const previous = engine[model]
  if (previous === level) return
  await $.state.set(engineRef, { ...engine, [model]: level })
  if (previous !== undefined) await clearLevelPick($, model)
}

async function clearModelPick($: Engine) {
  await $.state.set(modelPickRef, null)
  await $.store.delete(SAVED_MODEL)
}

async function clearLevelPick($: Engine, model: string) {
  const { [model]: _live, ...picks } = (await $.state.get(pickRef)).value ?? {}
  await $.state.set(pickRef, picks)
  const { [model]: _saved, ...saved } = await loadSavedLevels($)
  await $.store.set(SAVED_LEVELS, saved)
}

async function loadSavedLevels($: Engine): Promise<Record<string, Level>> {
  const raw = await $.store.get(SAVED_LEVELS)
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, Level] => isLevel(entry[1])))
}

async function refreshFooter($: Engine) {
  const model = await activeModel($)
  const entry = entryFor(model)
  const name = entry?.name ?? model
  const text = entry?.effort === false ? name : `${name} · effort: ${await currentLevel($, model)}`
  if ((await $.state.get(footerRef)).value !== text) await $.state.set(footerRef, text)
  return text
}
