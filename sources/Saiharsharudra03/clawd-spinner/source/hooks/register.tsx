import type { EngineInterface, Register } from 'claude-code'

import * as A from './acts'

const FRAME_MS = 83  // ~12 frames a second
const EDGE = 4  // columns kept clear at the right edge

type $ = EngineInterface

/** The spinner row while a turn runs. Module state: a reload starts the act over, which is fine. */
const spin = {
  turnAt: 0, word: '', working: false, last: '', blit: true,
  mount: null as { requestId: string; columns: number } | null,
}

async function paint($: $) {
  const m = spin.mount
  if (!m || !spin.working) return
  const now = await $.clock.now()
  const cells = A.encode(A.frame({ word: spin.word, t: now - spin.turnAt }, m.columns))
  if (cells === spin.last) return
  spin.last = cells
  if (!spin.blit) {
    // This row refused blits: redraw it instead (the engine folds these to its own rate).
    $.ui.invalidate('ui.render')
    return
  }
  const r = await $.ui.blit({ requestId: m.requestId, key: 'act', cells })
  if ('deny' in r && r.deny) {
    spin.blit = false
    $.ui.invalidate('ui.render')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (e.isInteractive) $.clock.every(FRAME_MS, () => void paint($))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    spin.turnAt = await $.clock.now()
    spin.working = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId) [spin.working, spin.mount] = [false, null]
    return done
  })

  // Clawd acts out the word, and under him the spinner's line: the word and the turn's time.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const columns = (e.viewport?.columns ?? 0) - EDGE
    if (e.surface !== 'terminal' || columns < 50) {
      spin.mount = null
      return next(e)
    }
    const { Raster, Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    if (!spin.working) [spin.working, spin.turnAt] = [true, now]  // a reload mid-turn
    if (spin.mount?.requestId !== e.requestId) spin.blit = true
    spin.word = e.props.word
    spin.mount = { requestId: e.requestId, columns }
    const cells = A.encode(A.frame({ word: spin.word, t: now - spin.turnAt }, columns))
    spin.last = cells
    return (
      <Box flexDirection="column">
        <Raster key="act" columns={columns} rows={A.ROWS} cells={cells} />
        <Text><Text color="#d97757">✻ {e.props.message ?? e.props.word}{e.props.suffix}</Text><Text dimColor> ({A.elapsed(now - spin.turnAt)})</Text></Text>
      </Box>
    )
  })
}
