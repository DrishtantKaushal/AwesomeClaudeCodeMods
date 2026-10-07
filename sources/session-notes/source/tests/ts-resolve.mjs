// Test setup: runs the mod's modules under Node the way Claude Code runs them.
import { register } from 'node:module'

// Relative imports without an extension (`./format`) resolve to `.ts` files.
register('./ts-resolve-hooks.mjs', import.meta.url)

// Claude Code's runtime (Bun) has Uint8Array.prototype.toBase64; Node 22 doesn't yet.
if (typeof Uint8Array.prototype.toBase64 !== 'function') {
  Object.defineProperty(Uint8Array.prototype, 'toBase64', {
    value() {
      return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString('base64')
    },
  })
}
