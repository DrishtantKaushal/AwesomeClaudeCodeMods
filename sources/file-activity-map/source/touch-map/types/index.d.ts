// 0: listed（名前だけ） 1: partial（grep の一致行や Read の行範囲だけ見た） 2: read 3: edited 4: created
export type Level = 0 | 1 | 2 | 3 | 4

// ファイルごとの記録。s はいちばん深い状態、c は状態ごとの回数（ツール呼び出し1回につき1）
// r は部分読取で読んだ行の範囲（重なりはまとめる）、n はファイルの行数。合わせて全体になったら読み取りに上げる
// d は rm・mv で消したファイル。作り直したら外す
export type Touch = { s: Level; c: number[]; r?: [number, number][]; n?: number; d?: true }

// 自動で読み込まれた指示ファイル。キーはリポジトリからの相対パス（外のファイルは ~ 始まり）、値は読み込まれた理由
export type Loaded = Record<string, string>

// 今の区間。startedAt はミリ秒、note は最後の操作の結果
export type Segment = { label: string; startedAt: number; note: string }

// 直近に触ったファイル
export type Now = { path: string; level: Level }

declare module 'claude-code' {
  interface PluginState {
    'touch-map': {
      touches: Record<string, Touch>
      segment: Segment
      minimized: boolean
      loaded: Loaded
      // 開閉を人が切り替えたところだけ持つ。キーはディレクトリ、または「ディレクトリ#more」「ディレクトリ#quiet」
      folds: Record<string, boolean>
      now: Now | null
      // ペイン上部のアクティビティマップを出すか
      map: boolean
    }
  }
}
