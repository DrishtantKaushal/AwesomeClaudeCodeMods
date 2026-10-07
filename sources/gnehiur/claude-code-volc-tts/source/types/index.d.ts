// tts 这个 mod 在 $.state 里存的值（会话级）
export type TtsNow = {
  /** 正在念的那段回复的指纹（文本哈希），按钮靠它认出“是不是我这一段” */
  key: string
  status: 'loading' | 'playing' | 'paused'
  /** stream：Python + mpv 流式；buffered：后备的整段合成 */
  mode: 'stream' | 'buffered'
}

declare module 'claude-code' {
  interface PluginState {
    /** finals：本会话每轮的最终回复（去掉多余空白后的全文），只有它们下面才画 🔊 */
    tts: { now: TtsNow | null; speed: number; finals: string[] }
  }
}
