import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  FALLBACK_BRANCH,
  FALLBACK_COMMIT,
  fromCI,
  fromFallback,
  fromLocalGit,
  parseBuildHttpsUrl,
  resolveEmployeeDistributionFields,
  isFallbackCommit,
  resolveStamp
} from './write-build-stamp.mjs'

test('fromCI reads GITHUB_SHA / GITHUB_REF_NAME', () => {
  assert.deepEqual(
    fromCI({ GITHUB_SHA: 'a'.repeat(40), GITHUB_REF_NAME: 'release' }),
    { commit: 'a'.repeat(40), branch: 'release', dirty: false, source: 'ci' }
  )
  assert.equal(fromCI({}), null)
})

test('fromLocalGit returns null when git rev-parse fails', () => {
  const stamp = fromLocalGit('/tmp/not-a-repo', () => null)
  assert.equal(stamp, null)
})

test('fromLocalGit reads HEAD + branch + dirty status', () => {
  const calls = []
  const execFn = (cmd) => {
    calls.push(cmd)
    if (cmd === 'git rev-parse HEAD') return 'b'.repeat(40)
    if (cmd === 'git rev-parse --abbrev-ref HEAD') return 'main'
    if (cmd === 'git status --porcelain -uno') return ' M apps/desktop/package.json'
    return null
  }
  assert.deepEqual(fromLocalGit('/repo', execFn), {
    commit: 'b'.repeat(40),
    branch: 'main',
    dirty: true,
    source: 'local'
  })
  assert.ok(calls.includes('git rev-parse HEAD'))
})

test('fromFallback uses the all-zero placeholder commit', () => {
  assert.deepEqual(fromFallback(), {
    commit: FALLBACK_COMMIT,
    branch: FALLBACK_BRANCH,
    dirty: false,
    source: 'fallback'
  })
  assert.equal(isFallbackCommit(FALLBACK_COMMIT), true)
  assert.equal(isFallbackCommit('a'.repeat(40)), false)
})

test('resolveStamp prefers CI over local git over fallback', () => {
  const ci = resolveStamp({
    env: { GITHUB_SHA: 'c'.repeat(40), GITHUB_REF_NAME: 'main' },
    execFn: () => 'should-not-run'
  })
  assert.equal(ci.source, 'ci')
  assert.equal(ci.commit, 'c'.repeat(40))

  const local = resolveStamp({
    env: {},
    execFn: (cmd) => {
      if (cmd === 'git rev-parse HEAD') return 'd'.repeat(40)
      if (cmd === 'git rev-parse --abbrev-ref HEAD') return 'main'
      if (cmd === 'git status --porcelain -uno') return ''
      return null
    }
  })
  assert.equal(local.source, 'local')
  assert.equal(local.commit, 'd'.repeat(40))
  assert.equal(local.dirty, false)
})

test('resolveStamp falls back when neither CI nor git is available', () => {
  const stamp = resolveStamp({ env: {}, execFn: () => null })
  assert.deepEqual(stamp, {
    commit: FALLBACK_COMMIT,
    branch: FALLBACK_BRANCH,
    dirty: false,
    source: 'fallback'
  })
})

test('resolveEmployeeDistributionFields keeps the existing stamp shape when no employee URLs are configured', () => {
  assert.deepEqual(resolveEmployeeDistributionFields({}), {})
})

test('resolveEmployeeDistributionFields reads My King employee build URLs', () => {
  assert.deepEqual(
    resolveEmployeeDistributionFields({
      MYKING_EMPLOYEE_ENROLLMENT_BASE_URL: 'https://enroll.myking.test/',
      MYKING_MANAGED_EMPLOYEE_GATEWAY_URL: 'https://gateway.myking.test/'
    }),
    {
      employeeEnrollmentBaseUrl: 'https://enroll.myking.test',
      managedEmployeeGatewayUrl: 'https://gateway.myking.test'
    }
  )
})

test.each([
  'http://enroll.myking.test',
  'https://localhost',
  'https://127.0.0.1',
  'https://127.99.1.2',
  'https://0.0.0.0',
  'https://[::1]',
  'file:///tmp/enroll',
  'javascript:alert(1)',
  'data:text/plain,hello'
])('parseBuildHttpsUrl rejects an unsafe employee enrollment URL: %s', value => {
  assert.throws(() => parseBuildHttpsUrl(value, 'MYKING_EMPLOYEE_ENROLLMENT_BASE_URL'))
})

test('parseBuildHttpsUrl accepts a public HTTPS URL and removes trailing slashes', () => {
  assert.equal(
    parseBuildHttpsUrl('https://employee.myking.test/path///', 'MYKING_EMPLOYEE_ENROLLMENT_BASE_URL'),
    'https://employee.myking.test/path'
  )
})
