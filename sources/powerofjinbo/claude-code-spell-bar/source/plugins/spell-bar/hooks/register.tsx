import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface, Register, TextProps } from 'claude-code'

import type { Cast } from '../types'
import { frame, RASTER_ROWS } from './pixels.ts'
import { scene, sceneBox } from './scene.ts'
import { levelOf, pickerEffort, spellAt, SPELLS, tierNamed, tierOf } from './spells.ts'

const cast = atom({ plugin: 'spell-bar', key: 'cast' } as const, null)
const preview = atom({ plugin: 'spell-bar', key: 'preview' } as const, null)
const isHidden = atom({ plugin: 'spell-bar', key: 'isHidden' } as const, false)

const BOOK = 'spellbook'
const FPS = 12
// The desktop measures the band in cells of its code font, about 7.9 CSS pixels
// each; a little under keeps the banner inside the band. An Svg given no size
// draws in a 300x150 frame there, so the banner always says its size.
const PIXELS_PER_COLUMN = 7.8
// A blit is refused until the engine commits the tree a render hook returned
// (a Raster drawn for the first time or at a new size), so one refusal does not
// drop a mount; two seconds of nothing but refusals (a closed pane) does.
const MISSES = FPS * 2

type Mount = { requestId: string; key: string; tier: number; columns: number; rows: number; misses: number }

function describe(seen: Cast | null): string {
  if (seen === null) {
    return 'effort not seen yet'
  }

  const level =
    seen.effort === null ? 'no effort setting' : seen.effort === 'ultracode' ? 'ultracode' : `effort ${seen.effort}`

  return `${level} · ${seen.model}`
}

async function settled<T>(work: Promise<T>): Promise<T | undefined> {
  try {
    return await work
  } catch {
    return undefined
  }
}

// The flag settings, where the desktop's effort picker lands as it moves;
// undefined when they cannot be read, which says nothing about the picker
// (`{}` can be a max pick, a refused read is not).
async function readFlag($: EngineInterface): Promise<Readonly<Record<string, unknown>> | undefined> {
  return settled($.settings.read({ source: 'flag' }))
}

async function setEffort($: EngineInterface, effort: string) {
  const seen = await read($, cast)

  if (seen?.effort === effort) {
    return
  }

  const model = await $.session.model()
  await update($, cast, () => ({ effort, model, source: 'live' }))
}

async function status($: EngineInterface): Promise<string> {
  const seen = await read($, cast)
  const pinned = await read($, preview)
  const tier = pinned ?? tierOf(seen?.effort ?? null)
  const rows = SPELLS.map(
    (spell, i) => `${i === tier ? '›' : ' '} ${spell.rank.padEnd(3)} ${spell.name} ${levelOf(spell)}`,
  )

  return [
    "Avada Kedavra ranks, by the main loop's effort:",
    ...rows,
    pinned === null ? `Now: ${describe(seen)}.` : `Pinned to rank ${spellAt(pinned).rank}.`,
    '/spell <1-6|I-VI|low…ultracode> pins a rank · /spell auto follows effort · /spell off hides · /spellbook shows all six',
  ].join('\n')
}

function pips(Text: ElementConstructor<TextProps>, tier: number) {
  return SPELLS.map((spell, i) => (
    <Text color={i <= tier ? spell.hex : '#4a4a4a'}>{i <= tier ? '✦' : '✧'}</Text>
  ))
}

export const register: Register = on => {
  // The terminal's Rasters on screen, repainted by the clock between redraws.
  const mounts = new Map<string, Mount>()
  let ticks = 0

  const remount = (requestId: string, next: Array<Omit<Mount, 'misses'>>) => {
    for (const [id, mount] of mounts) {
      if (mount.requestId === requestId) {
        mounts.delete(id)
      }
    }

    for (const mount of next) {
      mounts.set(`${mount.requestId}/${mount.key}`, { ...mount, misses: 0 })
    }
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'spell',
      description: 'Spell bar: list the ranks, pin one, follow the effort again, or hide it',
      argumentHint: '[1-6 | I-VI | low…ultracode | auto | on | off]',
    })
    await $.command.register({
      name: 'spellbook',
      description: 'Open all six ranks of the curse in a pane',
    })

    // The picker moves the flag settings at once; a request says the effort
    // only when it is sent. Poll the flags and act on a change. `wasSet` says
    // the flags last showed a level the picker set, so that a level vanishing
    // from them (max, which the schema drops) can be read as max. Every pick
    // also carries the ultracode key, so `ultracode: false` first showing up
    // with no level is a max pick too, the first pick of a session included.
    // A refused read at start leaves no starting point; the first read that
    // succeeds becomes it, so unchanged startup flags are never taken for a pick.
    const flag = await readFlag($)
    const first = flag === undefined ? undefined : pickerEffort(flag, false)
    let lastFlag = flag === undefined ? undefined : JSON.stringify(flag)
    let lastUltracode = flag?.['ultracode']
    let wasSet = first !== undefined

    if (first !== undefined) {
      await setEffort($, first)
    }

    $.clock.every(1500, () => {
      void readFlag($).then(async now => {
        if (now === undefined) {
          return
        }

        const json = JSON.stringify(now)

        if (json === lastFlag) {
          return
        }

        if (lastFlag === undefined) {
          lastFlag = json
          lastUltracode = now['ultracode']
          const start = pickerEffort(now, false)
          wasSet = start !== undefined

          if (start !== undefined) {
            await setEffort($, start)
          }

          return
        }

        lastFlag = json
        const isPick = now['ultracode'] === false && lastUltracode !== false
        lastUltracode = now['ultracode']
        const effort = pickerEffort(now, wasSet || isPick)

        if (effort !== undefined) {
          wasSet = effort !== 'max'
          await setEffort($, effort)
        }
      })
    })

    if ((await $.session.surfaces()).includes('terminal')) {
      $.clock.every(Math.round(1000 / FPS), () => {
        ticks += 1

        for (const [id, mount] of mounts) {
          const cells = frame(mount.tier, mount.columns, mount.rows, ticks / FPS)
          void $.ui.blit({ requestId: mount.requestId, key: mount.key, cells }).then(result => {
            if (mounts.get(id) !== mount) {
              return
            }

            if (result.deny === undefined) {
              mount.misses = 0
            } else if (++mount.misses > MISSES) {
              mounts.delete(id)
            }
          })
        }
      })
    }

    return next(e)
  })

  // Every model request of the main loop says which effort it asks for.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      // The request says what was sent: none for a model that takes no effort
      // setting, and a level after the engine's own downgrades. The picker only
      // tells ultracode apart, which goes out as a request at xhigh or max.
      // A refused read keeps what is already shown.
      const step = e.effort === undefined ? null : String(e.effort)
      const seen = await read($, cast)
      const isHigh = step === 'xhigh' || step === 'max'
      const flags = isHigh ? await readFlag($) : {}
      const isUltra = isHigh && (flags === undefined ? seen?.effort === 'ultracode' : pickerEffort(flags, false) === 'ultracode')
      const effort = isUltra ? 'ultracode' : step

      if (seen === null || seen.effort !== effort || seen.model !== e.model || seen.source !== 'turn') {
        await update($, cast, () => ({ effort, model: e.model, source: 'turn' }))
      }
    }

    return yield* next(e)
  })

  on('command.run', { command: 'spell' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === '') {
      return { text: await status($) }
    }

    if (arg === 'off' || arg === 'hide') {
      await update($, isHidden, () => true)

      return { text: 'Spell bar hidden; /spell on brings it back.' }
    }

    if (arg === 'on' || arg === 'show') {
      await update($, isHidden, () => false)

      return { text: 'Spell bar shown.' }
    }

    if (arg === 'auto') {
      await update($, preview, () => null)
      await update($, isHidden, () => false)

      return { text: 'Spell bar follows the effort again.' }
    }

    const tier = tierNamed(arg)

    if (tier === null) {
      return { text: `No rank "${arg}". Try 1-6, I-VI, an effort level, auto, on or off.` }
    }

    await update($, preview, () => tier)
    await update($, isHidden, () => false)

    return { text: `Pinned rank ${spellAt(tier).rank}; /spell auto follows the effort again.` }
  })

  on('command.run', { command: 'spellbook' }, async $ => {
    const opened = await $.ui.open({ id: BOOK, title: 'Spellbook' })

    return { text: opened.isPlaced ? 'Spellbook open.' : `The spellbook waits for room: ${opened.reason}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      remount(e.requestId, [])

      return next(e)
    }

    const seen = await read($, cast)
    const pinned = await read($, preview)
    const tier = pinned ?? tierOf(seen?.effort ?? null)
    const spell = spellAt(tier)
    const detail = pinned === null ? describe(seen) : 'pinned · /spell auto follows effort'

    if (e.surface === 'terminal') {
      const { Box, Text, Raster } = $.ui.resolve(e)
      const isWide = e.props.bodyColumns >= 72
      const columns = isWide
        ? Math.min(56, e.props.bodyColumns - 38)
        : Math.max(16, Math.min(56, e.props.bodyColumns - 2))
      remount(e.requestId, [{ requestId: e.requestId, key: 'spell', tier, columns, rows: RASTER_ROWS }])

      return (
        <Box flexDirection={isWide ? 'row' : 'column'} gap={isWide ? 2 : 0}>
          <Raster key="spell" columns={columns} rows={RASTER_ROWS} cells={frame(tier, columns, RASTER_ROWS, ticks / FPS)} />
          <Box flexDirection="column">
            <Text color={spell.hex} bold>
              {spell.name} {spell.rank}
            </Text>
            <Text dimColor wrap="truncate-end">
              {detail}
            </Text>
            <Text>{pips(Text, tier)}</Text>
          </Box>
        </Box>
      )
    }

    const { Box, Svg } = $.ui.resolve(e)
    const room = e.props.bodyColumns * PIXELS_PER_COLUMN
    const box = sceneBox(room)

    return (
      <Box>
        <Svg
          source={scene(tier, { width: room, detail })}
          alt={`Clawd casts ${spell.name} ${spell.rank} (${detail})`}
          width={box.width}
          height={box.height}
          isInteractive
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: BOOK }, async ($, e) => {
    const seen = await read($, cast)
    const pinned = await read($, preview)
    const current = pinned ?? tierOf(seen?.effort ?? null)
    const caption = (tier: number) => `${levelOf(spellAt(tier))}${tier === current ? ' · now' : ''}`

    if (e.surface === 'terminal') {
      const { Box, Text, Raster } = $.ui.resolve(e)
      const columns = Math.max(16, Math.min(60, e.props.bodyColumns - 2))
      remount(
        e.requestId,
        SPELLS.map((_, tier) => ({ requestId: e.requestId, key: `tier-${tier}`, tier, columns, rows: RASTER_ROWS })),
      )

      return (
        <Box flexDirection="column" gap={1}>
          {SPELLS.map((spell, tier) => (
            <Box flexDirection="column">
              <Text color={spell.hex} bold={tier === current}>
                {spell.name} {spell.rank} <Text dimColor>· {caption(tier)}</Text>
              </Text>
              <Raster
                key={`tier-${tier}`}
                columns={columns}
                rows={RASTER_ROWS}
                cells={frame(tier, columns, RASTER_ROWS, ticks / FPS)}
              />
            </Box>
          ))}
        </Box>
      )
    }

    const { Box, Svg } = $.ui.resolve(e)
    const room = e.props.bodyColumns * PIXELS_PER_COLUMN
    const box = sceneBox(room)

    return (
      <Box flexDirection="column" gap={1}>
        {SPELLS.map((spell, tier) => (
          <Svg
            source={scene(tier, { width: room, detail: caption(tier) })}
            alt={`Clawd casts ${spell.name} ${spell.rank} (${caption(tier)})`}
            width={box.width}
            height={box.height}
            isInteractive
          />
        ))}
      </Box>
    )
  })
}
