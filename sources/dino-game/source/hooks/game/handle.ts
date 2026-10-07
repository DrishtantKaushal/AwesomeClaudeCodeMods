// The player's X handle, shared by the hooks module and the board's handle editor.

// letters, digits and underscores, up to 15, with or without the @
export const HANDLE = /^@?([A-Za-z0-9_]{1,15})$/
export const HANDLE_MAX = 15

// one key in the board's editor: a handle character goes on while there is room, backspace takes
// the last one off, and anything else leaves the draft as it was
export function editHandle(draft: string, key: string): string {
  if (key === 'backspace' || key === 'delete') return draft.slice(0, -1)
  if (/^[A-Za-z0-9_]$/.test(key) && draft.length < HANDLE_MAX) return draft + key
  return draft
}
