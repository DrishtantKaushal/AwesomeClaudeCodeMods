/**
 * Mist as the old arts draw it: not a haze but banks with a shape. Each bank is
 * a long low cloud with a scalloped top (a run of rounded lobes, larger toward
 * its middle), rounded ends and a nearly flat underside. Banks lie in two
 * staggered rows across the band they fill, with gaps between them, so the
 * scene shows through as it does between kasumi in a print.
 */
import { t1 as n } from './ink'

export type Bank = {
  /** The whole bank, closed. */
  d: string
  /** A line echoing its top a little inside, for a style that draws a second contour. */
  echo: string
  /** Its underside, left to right, for shading or hatching under it. */
  under: string
}

/** The banks for a band of mist from `y` to `y + h`, across `w` units. */
export function mistBanks(o: { w: number; y: number; h: number; seed: number; rows?: number; lean?: boolean }): Bank[] {
  let seed = Math.round(o.seed * 7919 + o.y * 131) % 233280
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  const banks: Bank[] = []
  const thick = Math.max(3.2, Math.min(9, o.h * 0.42))
  // A lean scene, drawn small for the band's size limit, lays one row of fewer banks.
  for (let row = 0; row < (o.lean ? 1 : (o.rows ?? 2)); row++) {
    const base = o.y + o.h * (row ? 0.82 : 0.5)
    const lobeH = thick * (row ? 0.85 : 1)
    for (let x = -30 + rnd() * 40 + row * 55; x < o.w + 30; ) {
      const len = 70 + rnd() * 110
      // Lobes about a bank's height across or wider, so even a thin band keeps a few large ones.
      const lobes = Math.max(3, Math.round(len / Math.max(16, lobeH * 2.6)))
      const step = len / lobes
      const bottom = base + (rnd() - 0.5) * 2
      // The top: a run of lobes, each one arc, rising toward the middle of the bank.
      const r0 = lobeH * 0.5
      let top = `M${n(x)} ${n(bottom)}a${n(r0)} ${n(r0)} 0 0 1 ${n(r0)} ${n(-r0)}`
      let echo = ''
      let px = x + r0
      let py = bottom - r0
      for (let k = 0; k < lobes; k++) {
        const mid = 1 - Math.abs((k + 0.5) / lobes - 0.5) * 1.4
        const rise = lobeH * (0.45 + mid * 0.55) * (0.85 + rnd() * 0.3)
        const span = k === lobes - 1 ? x + len - r0 - px : step * (0.85 + rnd() * 0.3)
        const ny = k === lobes - 1 ? bottom - r0 : bottom - lobeH * (0.3 + rnd() * 0.25)
        top += `a${n(span / 2)} ${n(rise)} 0 0 1 ${n(span)} ${n(ny - py)}`
        // The echo: a smaller arc inside each lobe, as a second cut line.
        echo += `M${n(px + span * 0.22)} ${n(py + (ny - py) * 0.2 + rise * 0.15)}a${n(span * 0.3)} ${n(rise * 0.55)} 0 0 1 ${n(span * 0.56)} ${n((ny - py) * 0.56)}`
        px += span
        py = ny
      }
      const end = x + len
      top += `a${n(r0)} ${n(r0)} 0 0 1 ${n(r0)} ${n(bottom - py)}`
      // The underside: nearly flat, a slight swell.
      const d = `${top}Q${n((x + end) / 2)} ${n(bottom + 1.4)} ${n(x)} ${n(bottom)}z`
      banks.push({ d, echo, under: `M${n(x + r0)} ${n(bottom + 0.6)}Q${n((x + end) / 2)} ${n(bottom + 1.9)} ${n(end - r0)} ${n(bottom + 0.6)}` })
      x = end + (o.lean ? 70 : 25) + rnd() * 80
    }
  }
  return banks
}

/** How wide a run of mist is drawn before it repeats. */
export const MIST_TILE = 640

/**
 * Mist drawn once for one tile and repeated across a wider stage, every other
 * copy shifted by half a bank, so the repeat never lines up; `id` names the band.
 */
export function tiled(id: string, svg: string, sw: number): string {
  let uses = ''
  for (let k = 1; k * MIST_TILE < sw + 30; k++) uses += `<use href="#${id}" transform="translate(${k * MIST_TILE} ${k % 2 ? 1.5 : 0})"/>`
  return `<g id="${id}">${svg}</g>${uses}`
}
