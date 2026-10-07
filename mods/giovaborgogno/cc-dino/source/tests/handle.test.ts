import { expect, test } from 'bun:test'
import { HANDLE, HANDLE_MAX, editHandle } from '../hooks/game/handle.ts'

test('the editor takes handle characters and nothing else', () => {
  let draft = ''
  for (const key of ['g', 'I', 'o', '_', '7', '@', '-', ' ', 'space', 'up', 'return']) draft = editHandle(draft, key)
  expect(draft).toBe('gIo_7')
})

test('backspace takes the last character off, and an empty draft stays empty', () => {
  expect(editHandle('gio', 'backspace')).toBe('gi')
  expect(editHandle('gio', 'delete')).toBe('gi')
  expect(editHandle('', 'backspace')).toBe('')
})

test('the editor stops at an X handle length', () => {
  const full = 'a'.repeat(HANDLE_MAX)
  expect(editHandle(full, 'b')).toBe(full)
})

test('whatever the editor builds is a handle', () => {
  expect(HANDLE.exec('gIo_7')?.[1]).toBe('gIo_7')
  expect(HANDLE.exec('@gio')?.[1]).toBe('gio')
  expect(HANDLE.test('a'.repeat(HANDLE_MAX + 1))).toBe(false)
})
