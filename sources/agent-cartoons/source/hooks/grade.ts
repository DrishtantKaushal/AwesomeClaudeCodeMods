/**
 * The medium a style is made on (looks.ts): a filter over the drawn stage, so
 * every element and Claude are set into it together. A style laid in
 * tesserae or woven on a loom samples the stage on
 * its grid; one daubed on rock wavers the edges of its pigment.
 */

const f = (v: number) => (Math.round(v * 1000) / 1000).toString()

/**
 * The image sampled at the middle of every `size` square and spread over the
 * square, from the stage's corner: tesserae, the picks of a weave.
 */
export function cells(from: string, size: number, result: string): string {
  const dot = Math.min(0.4, size / 4)
  return (
    `<feFlood x="${f((size - dot) / 2)}" y="${f((size - dot) / 2)}" width="${f(dot)}" height="${f(dot)}" flood-color="black"/>` +
    `<feComposite x="0" y="0" width="${f(size)}" height="${f(size)}"/><feTile result="${result}-grid"/>` +
    `<feComposite in="${from}" in2="${result}-grid" operator="in"/><feMorphology operator="dilate" radius="${f((size - dot) / 2)}" result="${result}"/>`
  )
}

/** The filter itself, over the whole stage and in sRGB, so the medium keeps the colors it is given. */
export const gradeFilter = (id: string, sw: number, h: number, body: string) =>
  `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="${sw}" height="${h}" color-interpolation-filters="sRGB">${body}</filter>`
