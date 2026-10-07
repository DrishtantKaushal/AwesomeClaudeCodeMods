import type { Register } from 'claude-code'

import { buildMeters, modelLabel } from './format'

export const register: Register = on => {
  // the band reads usage on every draw; a new measurement asks for a redraw
  on('session.measure', ($, e, next) => {
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { context, rateLimits } = await $.session.usage()
    const model = modelLabel(await $.session.model())
    const meters = buildMeters({ contextPercent: context.percent, rateLimits }, await $.clock.now())

    const { Box, Text } = $.ui.resolve(e)
    // Other mods beneath draw in the same band: keep theirs, the meters closest to the prompt.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {below}
        <Box>
          <Text>{model}</Text>
          {meters.map(m => (
            <Text key={m.label}>
              <Text dimColor> │ {m.label} </Text>
              <Text color={m.color}>{m.bar}</Text>
              <Text> {m.percent}%</Text>
              {m.reset ? <Text dimColor> ↻ {m.reset}</Text> : null}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
