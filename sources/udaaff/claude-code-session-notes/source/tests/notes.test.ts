import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  backgroundOutputFile,
  emptyNotes,
  findArtifactUrl,
  findEntry,
  findServers,
  htmlTitle,
  parseNotes,
  pin,
  pushRecent,
  readsOnly,
  remove,
  serializeNotes,
  serverTitle,
  upsertServer,
} from '../hooks/notes'
import type { Entry, Notes } from '../hooks/notes'

const server: Entry = { title: 'npm run dev', url: 'http://192.168.1.5:5173/', meta: { port: '5173', session: 'abc' } }
const doc: Entry = { title: 'Design [doc]', url: 'https://claude.ai/code/artifact/x', meta: { kind: 'doc' } }
const text: Entry = { title: 'Test user: a@b', meta: {} }

test('a file goes through serialize and parse unchanged', () => {
  const notes: Notes = { ...emptyNotes(), servers: [server], pinned: [text], recent: [doc] }
  assert.deepEqual(parseNotes(serializeNotes(notes)), notes)
})

test('a hand-edited file keeps what the plugin does not know', () => {
  const source = '# Notes\n\n## Pinned\n* [A](https://a.example) — why it matters\n\n## Ideas\n- something else\n'
  const notes = parseNotes(source)
  assert.deepEqual(notes.pinned, [{ title: 'A', url: 'https://a.example', note: 'why it matters', meta: {} }])
  assert.match(serializeNotes(notes), /## Ideas\n- something else/)
})

test('servers are found in dev-server output', () => {
  const vite = '\x1b[32m  ➜  Local:   http://localhost:5173/\x1b[0m\n  ➜  Network: use --host to expose'
  assert.deepEqual(findServers(vite), [{ port: '5173', path: '/' }])
  assert.deepEqual(findServers('Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...'), [{ port: '8000', path: '/' }])
  assert.deepEqual(findServers('Server listening on port 3000.'), [{ port: '3000', path: '/' }])
  assert.deepEqual(findServers('see https://example.com/docs'), [])
})

test('commands that only read are told apart from ones that start a server', () => {
  assert.equal(readsOnly('cat /tmp/server.log'), true)
  assert.equal(readsOnly('Start-Sleep -Seconds 3; Get-Content .claude/notes.md'), true)
  assert.equal(readsOnly('cd app && tail -f out.log'), true)
  assert.equal(readsOnly('npm run dev'), false)
  assert.equal(readsOnly('npm run dev 2>&1 | grep Local'), false)
  assert.equal(readsOnly('cd app && python -m http.server 8765'), false)
})

test('a server title is the command, without the cd in front', () => {
  assert.equal(serverTitle('cd app && npm run dev -- --host 2>&1'), 'npm run dev -- --host')
  assert.equal(serverTitle('x'.repeat(60)).length, 48)
})

test('a server on a known port replaces the old one', () => {
  const restarted = { ...server, title: 'vite' }
  const notes = upsertServer(upsertServer(emptyNotes(), server), restarted)
  assert.deepEqual(notes.servers, [restarted])
})

test('Recent keeps the newest few and skips what is pinned', () => {
  let notes = emptyNotes()
  for (let i = 0; i < 7; i++) notes = pushRecent(notes, { title: `a${i}`, url: `https://claude.ai/artifact/${i}`, meta: {} })
  assert.deepEqual(notes.recent.map((entry) => entry.title), ['a6', 'a5', 'a4', 'a3', 'a2'])

  notes = pin(notes, notes.recent[0])
  assert.deepEqual(notes.pinned.map((entry) => entry.title), ['a6'])
  assert.equal(notes.recent.length, 4)
  assert.equal(pushRecent(notes, notes.pinned[0]).recent.length, 4)
})

test('entries are found by link, title, or a piece of it, and removed', () => {
  const notes: Notes = { ...emptyNotes(), servers: [server], recent: [doc] }
  assert.equal(findEntry(notes, 'http://192.168.1.5:5173/')?.section, 'servers')
  assert.equal(findEntry(notes, 'design')?.entry, doc)
  assert.equal(findEntry(notes, 'nothing'), null)
  assert.deepEqual(remove(notes, doc).recent, [])
})

test('tool answers yield their links and titles', () => {
  assert.equal(findArtifactUrl('Published x at https://claude.ai/artifact/AbCdEfGhIjKlMnOpQrStUv (Version 1'), 'https://claude.ai/artifact/AbCdEfGhIjKlMnOpQrStUv')
  assert.equal(htmlTitle('<head><title> Notes  Test </title></head>'), 'Notes Test')
  assert.equal(
    backgroundOutputFile('Output is being written to: C:\\Temp\\tasks\\b1.output. You will be notified'),
    'C:\\Temp\\tasks\\b1.output',
  )
})
