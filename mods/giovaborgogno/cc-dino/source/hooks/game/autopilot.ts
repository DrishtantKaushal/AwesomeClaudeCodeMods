import { DINO_X, type DinoGame } from './dino.ts'

// A player that reads the next obstacle, for /dino demo: it jumps whatever is on the ground or low,
// ducks the bird at head height and lets the high one pass over. It reacts late at speed, so its
// runs end.

// on a 100 by 13 board, a run of about 27 seconds that meets two birds before it crashes
export const DEMO_SEED = 993

export function autopilot(g: DinoGame): 'jump' | 'duck' | undefined {
  const near = g.obstacles.find(o => o.x + 5 > DINO_X && o.x - DINO_X < 3 + g.speed * 3)
  if (!near) return undefined
  if (near.kind === 'bird') return near.lift === 2 ? 'duck' : near.lift === 3 ? undefined : 'jump'
  return 'jump'
}
