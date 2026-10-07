export type AsciiTheme = {
  fg: string
  border: string
  line: string
  arrow: string
  accent?: string
  bg?: string
  corner?: string
  junction?: string
}
export type AsciiRenderOptions = {
  useAscii?: boolean
  paddingX?: number
  paddingY?: number
  boxBorderPadding?: number
  colorMode?: 'none' | 'auto' | 'ansi16' | 'ansi256' | 'truecolor' | 'html'
  theme?: Partial<AsciiTheme>
}
export function renderMermaidAscii(text: string, options?: AsciiRenderOptions): string
