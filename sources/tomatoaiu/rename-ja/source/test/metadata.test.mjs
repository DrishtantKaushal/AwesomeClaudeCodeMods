import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readJson = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))
const plugin = readJson('.claude-plugin/plugin.json')
const pkg = readJson('package.json')
const manifest = readJson('.release-please-manifest.json')
const config = readJson('release-please-config.json').packages['.']
const marketplace = readJson('.claude-plugin/marketplace.json')

test('plugin, development package and release manifest share a stable SemVer', () => {
  assert.match(plugin.version, /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/)
  assert.equal(pkg.version, plugin.version)
  assert.equal(manifest['.'], plugin.version)
  assert.equal(pkg.name, plugin.name)
  assert.equal(pkg.private, true)
})

test('Release Please updates the plugin version and leaves publication to the release workflow', () => {
  assert.equal(config['release-type'], 'node')
  assert.equal(config['include-component-in-tag'], false)
  assert.equal(config['include-v-in-tag'], true)
  assert.equal(config['skip-github-release'], true)
  assert.ok(config['extra-files'].some(file =>
    file.type === 'json' &&
    file.path === '.claude-plugin/plugin.json' &&
    file.jsonpath === '$.version',
  ))
})

test('the existing marketplace identity distributes only the stable branch', () => {
  assert.equal(marketplace.name, 'tomatoaiu-mods')
  const entries = marketplace.plugins.filter(entry => entry.name === plugin.name)
  assert.equal(entries.length, 1)
  assert.equal(Object.hasOwn(entries[0], 'version'), false)
  assert.deepEqual(entries[0].source, {
    source: 'github',
    repo: 'tomatoaiu/rename-ja',
    ref: 'stable',
  })
})

test('the function hook module exists and the prompt has a default', () => {
  const hooks = readJson('hooks/hooks.json')
  assert.deepEqual(hooks.modules, ['./register.ts'])
  assert.ok(readFileSync(new URL('../hooks/register.ts', import.meta.url), 'utf8').length > 0)
  assert.equal(plugin.userConfig.prompt.type, 'string')
  assert.equal(typeof plugin.userConfig.prompt.default, 'string')
  assert.ok(plugin.userConfig.prompt.default.length > 0)
})
