/* @jsx h */
import type { Register } from 'claude-code'

// One command, /dino. It opens the board above the prompt, where it stays until /dino stop or the
// close button. This module keeps the best score in $.store, pauses the run when Claude finishes a
// turn, and hands the board its props; the board in ./boards/dino.tsx is a surface module that runs
// on the drawing thread with its own frame clock, keys and mouse.

let open = false
// bumped at each finished turn; the board pauses when it sees a new value
let turnsDone = 0
let best = 0

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // a store that cannot be read costs the best score, never the game: an unhandled rejection here
    // would unmount the whole module
    const saved = await $.store
      .get('best')
      .catch(err => {
        $.ui.log(`cc-dino: store read failed: ${err}`)
        return undefined
      })
    if (typeof saved === 'number') best = saved
    await $.command
      .register({
        name: 'dino',
        description: 'The offline dinosaur above the prompt: jump the cacti while Claude works (cc-dino)',
        argumentHint: '[stop | reset]',
        immediate: true,
      })
      .catch(err => $.ui.log(`cc-dino: /dino not registered: ${err}`))
    return r
  })

  on('command.run', { command: 'dino' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'stop') {
      open = false
      $.ui.invalidate('ui.render')
      return { text: 'dino closed' }
    }
    if (arg === 'reset') {
      best = 0
      await $.store.set('best', 0).catch(err => $.ui.log(`cc-dino: store write failed: ${err}`))
      $.ui.invalidate('ui.render')
      return { text: 'dino: best score cleared' }
    }
    if (arg !== '') return { text: `dino: no such argument "${arg}" · /dino, /dino stop, /dino reset` }
    open = true
    $.ui.invalidate('ui.render')
    return {
      text: `dino · click the board, then space to jump and ↓ to duck · Esc returns to the prompt · best ${best}`,
    }
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (open) {
      turnsDone++
      $.ui.invalidate('ui.render')
    }
    return r
  })

  // a finished run, posted by the board: keep the best score and hand it back with the next props
  on('ui.message', async ($, e, next) => {
    const data = e.data as { game?: unknown; score?: unknown } | null
    if (data?.game !== 'dino' || typeof data.score !== 'number') return next(e)
    if (data.score > best) {
      best = data.score
      await $.store.set('best', best).catch(err => $.ui.log(`cc-dino: store write failed: ${err}`))
      $.ui.toast(`dino: new best ${best}`)
    }
    return { props: { best, done: turnsDone } }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // the board needs a terminal's keys and mouse; the desktop and mobile surfaces draw their own band
    if (!open || e.props.hasSurvey || e.surface !== 'terminal') return next(e)
    const { Box, Button, Client, Text } = await $.ui.resolve(e)
    const close = () => {
      open = false
      $.ui.invalidate('ui.render')
    }
    // one row for the close button, one for whatever else draws in the band. The board fits itself
    // to what it is given (two border rows, the sky, the ground and its status line), so this is a
    // ceiling on how tall it grows, not a floor it has to meet.
    const rows = Math.max(7, e.props.maxRows - 2)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Button key="dino:close" label="close" onPress={close} />
          <Text dimColor>{'/dino stop closes it too'}</Text>
        </Box>
        {/* the module path must be a string literal: the engine reads it off this source */}
        <Client
          key="board:dino"
          module="./boards/dino.tsx"
          width={e.viewport?.columns ?? 80}
          height={Math.min(rows, 14)}
          props={{ best, done: turnsDone }}
        />
        {await next(e)}
      </Box>
    )
  })
}
