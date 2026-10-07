export type FablesBackdrop =
  | 'forest'
  | 'space'
  | 'city'
  | 'desert'
  | 'volcano'
  | 'lab'
  | 'night'

export type FablesHeroAction =
  | 'walk'
  | 'run'
  | 'fly'
  | 'carry'
  | 'sneak'
  | 'jump'
  | 'tumble'
  | 'dig'
  | 'inspect'
  | 'celebrate'
  | 'think'
  | 'panic'
  | 'sleep'
  | 'dance'
  | 'spin'
  | 'wave'
  | 'point'
  | 'peek'
  | 'trip'
  | 'shrug'

export type FablesMotion = 'none' | 'bob' | 'drift' | 'shake' | 'fall' | 'spin' | 'blink' | 'scroll'

export type FablesParticles = 'stars' | 'rain' | 'bubbles' | 'sparks' | 'snow' | 'leaves'

export type FablesPixelArt = { pixels: string[]; colors: Record<string, string> }

export type FablesProp = {
  sprite: string | FablesPixelArt
  x: number
  y: 'ground' | 'air' | 'sky'
  label?: string
  motion: FablesMotion
  color?: string
}

export type FablesScene = {
  backdrop: FablesBackdrop
  palette: { sky?: string; ground?: string; accent?: string }
  /** What Claude does, crossing from `from` to `to` (percent of the stage); `then`, what it does next, in place. */
  hero: { action: FablesHeroAction; from: number; to: number; then?: FablesHeroAction }
  props: FablesProp[]
  particles?: { kind: FablesParticles; density: number }
  caption: string
  /** How the work is going, which the caption's paper shows. */
  tone?: 'work' | 'trouble' | 'milestone'
  title?: string
  /** Set by the narrator's loop, never the model: the scene fades in, as it opens on a new setting. */
  enter?: 'fade'
}

declare module 'claude-code' {
  interface PluginState {
    fables: {
      scene: FablesScene | null
      enabled: boolean
      /** The style scenes are drawn in (looks.ts): 'pixel' by default, 'original', or a gallery style. */
      style: string
    }
  }
}
