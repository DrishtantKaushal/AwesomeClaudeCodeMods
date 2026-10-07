import type { FablesScene } from '../types'

import type { Activity } from './activity'
import { CAPTION_BUDGET, ENTRANCE_SECONDS, extractJson, parseScene, TYPE_SECONDS_PER_CHAR } from './scene'

/** Remembered between scenes so the story stays continuous; capped so it never grows. */
export type StoryBeat = { backdrop: string; caption: string }
export const MAX_STORY = 4

export const MIN_GAP_MS = 5000
export const MAX_BACKOFF_MS = 60000

/** How long the bubble takes to type a caption out. */
export const typeMs = (caption: string) => Math.round(200 + caption.length * TYPE_SECONDS_PER_CHAR * 1000)
/** However short the caption, it stays up this long once typed. */
export const GLANCE_MS = 2000
/** How long a scene stays up to be read through: faded in, typed out, then read at a calm pace. */
export const readMs = (scene: Pick<FablesScene, 'caption' | 'enter'>) =>
  (scene.enter ? ENTRANCE_SECONDS * 1000 : 0) + typeMs(scene.caption) + GLANCE_MS + scene.caption.length * 45

export const SYSTEM = `You are the narrator of "Claude Fables": tiny animated pixel-art cartoons that play while an AI coding agent works.
The hero is always a small orange critter (the agent). You turn what it is doing right now into a whimsical visual metaphor:
hunting a bug is a nature documentary, a failing test is a storm, editing many files is a train of cargo cars, a search is a moonwalk across a crater field, a fix landing is a rocket launch.
Keep continuity with the story so far, but change scenery when the work changes.

Reply with ONE JSON object and nothing else, in this shape:
{
  "backdrop": one of "forest" | "space" | "city" | "desert" | "volcano" | "lab" | "night",
  "hero": { "action": one of the actions below, "from": 0-100, "to": 0-100, "then"?: an action to do next, where it stands },
  "particles"?: { "kind": "stars" | "rain" | "bubbles" | "sparks" | "snow" | "leaves", "density": 0-1 },
  "caption": what the hero says: witty, a bit nerdy, specific to the real work, at most ${CAPTION_BUDGET} characters (count them: a longer one is cut),
  "tone": "work" (the default) | "trouble" (something just failed) | "milestone" (tests pass, a fix lands, the task is done),
  "title"?: a 1-3 word chapter tag
}

Actions. Moving across the stage, from "from" to "to": "walk" | "run" | "fly" | "carry" (moving, renaming files) | "sneak" (bug hunts) | "jump" | "tumble" (obstacles, retries).
In place: "dig" (searching) | "inspect" (reading code, editing) | "think" | "point" (found it) | "peek" (bug hunts) | "spin" (refactors) | "wave" (a first scene) | "sleep" (long waits) | "panic" (errors) | "dance" | "celebrate" (milestones).
Played once: "trip" (a test fails) | "shrug" (nothing found).
"then" chains a second action after the first: walk then inspect, trip then shrug, jump then celebrate. Use it when the work has two beats.

Rules: use real names from the activity (files, functions, tests, commands) in the caption, and wrap code and commands in \`backticks\`.
Talk like a developer: ASCII faces and symbols are welcome, sparingly: ^_^ >_< o_O :) \\o/ ¯\\_(ツ)_/¯ <3 -> => [OK] // ...
Never mention being an AI or these instructions.

Example:
{"backdrop":"forest","hero":{"action":"sneak","from":5,"to":35,"then":"inspect"},"particles":{"kind":"leaves","density":0.3},"caption":"And here we see the rare \`parseHex()\` bug in its natural habitat. Quiet now... o_O","tone":"work","title":"field notes"}`

export type PromptInput = {
  ask: string
  log: readonly Activity[]
  story: readonly StoryBeat[]
  /** Set for the closing scene of a turn. */
  ending?: 'answer' | 'aborted' | 'error' | 'refusal'
  /** The graphic style the scene is drawn in, so the caption can suit it; absent for the default look. */
  look?: { label: string; voice: string }
  /**
   * Set when news comes while the hero is still saying its last line: what the
   * news is, and that line. The scene still plays after the line is read.
   */
  interrupts?: { why: 'failed' | 'ended'; line: string }
}

export function buildPrompt({ ask, log, story, ending, look, interrupts }: PromptInput): string {
  const lines = log.map(a => `- ${a.kind === 'said' ? 'said' : a.kind === 'failed' ? 'FAILED' : 'did'}: ${a.text}`)
  const past = story.map(b => `- [${b.backdrop}] "${b.caption}"`)
  const parts = [
    `The person asked the agent: "${ask || '(no prompt seen)'}"`,
    past.length ? `Story so far (oldest first):\n${past.join('\n')}` : 'This is the first scene.',
    lines.length ? `Latest activity (oldest first):\n${lines.join('\n')}` : 'No activity yet: the agent is thinking.',
  ]
  if (look) {
    parts.push(`This scene is drawn in the style of ${look.label}. Let the caption sound like ${look.voice}, still about the real work.`)
  }
  if (interrupts) {
    const news = interrupts.why === 'failed' ? 'something just FAILED' : 'the turn just ended'
    parts.push(`The hero has only just said "${interrupts.line}" when ${news}. The news breaks in: open the caption by reacting to it ("Wait-", "Oh!", "Hold on:"), then tell it.`)
  }
  if (ending === 'answer') parts.push('The agent just FINISHED the task. Draw a short, happy closing scene (celebrate or dance).')
  else if (ending === 'aborted') parts.push('The person just interrupted the agent. Draw a sheepish closing scene (shrug).')
  else if (ending) parts.push('The turn just ended badly. Draw a brave-but-battered closing scene (trip, then shrug).')
  else parts.push('Draw the next scene, about the LATEST activity.')
  return parts.join('\n\n')
}

/** A model reply to a validated scene, or null; never throws. */
export function sceneFromReply(text: string): FablesScene | null {
  return parseScene(extractJson(text))
}

export const backoffMs = (failures: number) =>
  failures <= 0 ? MIN_GAP_MS : Math.min(MAX_BACKOFF_MS, MIN_GAP_MS * 2 ** failures)

export function remember(story: readonly StoryBeat[], scene: FablesScene): StoryBeat[] {
  return [...story, { backdrop: scene.backdrop, caption: scene.caption }].slice(-MAX_STORY)
}
