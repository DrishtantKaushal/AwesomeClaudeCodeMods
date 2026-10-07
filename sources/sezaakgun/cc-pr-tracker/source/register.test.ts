import { expect, test } from 'bun:test'
import { ONLY_URLS, linkable, prChanges, toCheck } from './hooks/register.tsx'

const check = (name: string, bucket: string) => ({ name, bucket, link: '' })

// a Link with any other href makes the engine refuse the whole drawing
test('linkable', () => {
  expect(linkable('https://github.com/org/repo/actions/runs/1/job/2')).toBe(true)
  expect(linkable('https://ci.example.com/home?region=eu#/builds/job:1/view')).toBe(true)
  expect(linkable('http://ci.example.test/app/job/1')).toBe(false)
  expect(linkable('http://localhost:3000/x')).toBe(true)
  expect(linkable('')).toBe(false)
})

test('prChanges', () => {
  const prev = new Map([['lint', 'pending'], ['tests', 'pass']])
  // first load: nothing to report
  expect(prChanges(undefined, new Map(), 'BLOCKED', [check('lint', 'pending')])).toEqual([])
  // no change
  expect(prChanges('BLOCKED', prev, 'BLOCKED', [check('lint', 'pending'), check('tests', 'pass')])).toEqual([])
  // a check flips, a new check appears, the merge state moves
  expect(prChanges('BLOCKED', prev, 'CLEAN', [check('lint', 'fail'), check('tests', 'pass'), check('e2e', 'pending')]))
    .toEqual(['merge: blocked → clean', 'lint: pending → fail', 'e2e: new → pending'])
  // GitHub's lazy UNKNOWN is not a change
  expect(prChanges('UNKNOWN', prev, 'BEHIND', [check('lint', 'pending'), check('tests', 'pass')])).toEqual([])
  // a check that disappears from the rollup is not reported
  expect(prChanges('BLOCKED', prev, 'BLOCKED', [check('lint', 'pending')])).toEqual([])
})

// the buckets gh pr checks would have given for the same rollup contexts
test('toCheck', () => {
  const run = (status: string, conclusion: string | null) =>
    toCheck({ __typename: 'CheckRun', isRequired: true, name: 'ci', status, conclusion: conclusion ?? undefined, detailsUrl: 'https://x/1' })
  expect(run('IN_PROGRESS', null).bucket).toBe('pending')
  expect(run('QUEUED', null).bucket).toBe('pending')
  expect(run('COMPLETED', 'SUCCESS').bucket).toBe('pass')
  expect(run('COMPLETED', 'NEUTRAL').bucket).toBe('pass')
  expect(run('COMPLETED', 'SKIPPED').bucket).toBe('skipping')
  expect(run('COMPLETED', 'CANCELLED').bucket).toBe('cancel')
  expect(run('COMPLETED', 'FAILURE').bucket).toBe('fail')
  expect(run('COMPLETED', 'TIMED_OUT').bucket).toBe('fail')
  expect(run('COMPLETED', 'SUCCESS')).toEqual({ name: 'ci', bucket: 'pass', link: 'https://x/1' })
  // no conclusion after completion is a failure, not a pass
  expect(run('COMPLETED', null).bucket).toBe('fail')
  // control characters from GitHub never reach the terminal
  expect(toCheck({ __typename: 'CheckRun', isRequired: true, name: 'ci\x1b[31m\n', status: 'COMPLETED', conclusion: 'SUCCESS' }).name).toBe('ci[31m')

  const status = (state: string) => toCheck({ __typename: 'StatusContext', isRequired: false, context: 'cov', state, targetUrl: 'https://y' })
  expect(status('SUCCESS')).toEqual({ name: 'cov', bucket: 'pass', link: 'https://y' })
  expect(status('PENDING').bucket).toBe('pending')
  expect(status('EXPECTED').bucket).toBe('pending')
  expect(status('FAILURE').bucket).toBe('fail')
  expect(status('ERROR').bucket).toBe('fail')
})

// a prompt that is nothing but PR URLs, in any whitespace, toggles them without a model turn
test('ONLY_URLS', () => {
  expect(ONLY_URLS.test('https://github.com/o/r/pull/1')).toBe(true)
  expect(ONLY_URLS.test('  https://github.com/o/r/pull/1/files\nhttps://github.com/o/r/pull/2 ')).toBe(true)
  expect(ONLY_URLS.test('review https://github.com/o/r/pull/1')).toBe(false)
  expect(ONLY_URLS.test('https://github.com/o/r/pull/1 please')).toBe(false)
  expect(ONLY_URLS.test('https://github.com/o/r/pull/1?diff=split')).toBe(true)
  expect(ONLY_URLS.test('github.com/o/r/pull/1')).toBe(false)
  expect(ONLY_URLS.test('https://github.com/o/r/pulls/1')).toBe(false)
})
