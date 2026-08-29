import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  isManagedUpdateApiRequest,
  MANAGED_UPDATE_ACCESS,
  MANAGED_UPDATE_ERROR,
  managedUpdateAllDenied,
  managedUpdateBranch,
  managedUpdateBranchChangeDenied,
  managedUpdateCheckDenied,
  managedUpdateDenied
} from './managed-update-ipc'

test('managed employee build returns stable fail-closed responses without an updater or backend client', () => {
  const config = { branch: 'managed-release' }

  assert.equal(MANAGED_UPDATE_ACCESS, 'administrator-only')
  assert.deepEqual(managedUpdateCheckDenied(config, 1_234), {
    branch: 'managed-release',
    error: MANAGED_UPDATE_ERROR,
    fetchedAt: 1_234,
    message: 'Updates are managed by your organization.',
    reason: MANAGED_UPDATE_ERROR,
    supported: false
  })
  assert.deepEqual(managedUpdateDenied(), {
    error: MANAGED_UPDATE_ERROR,
    message: 'Updates are managed by your organization.',
    ok: false
  })
  assert.deepEqual(managedUpdateBranchChangeDenied(config), {
    branch: 'managed-release',
    error: MANAGED_UPDATE_ERROR,
    message: 'Updates are managed by your organization.',
    ok: false
  })
  assert.deepEqual(managedUpdateAllDenied(), {
    error: MANAGED_UPDATE_ERROR,
    message: 'Updates are managed by your organization.',
    ok: false,
    results: []
  })
  assert.deepEqual(managedUpdateBranch(config), { branch: 'managed-release' })
})

test('the generic API bridge cannot forward either backend update endpoint', () => {
  for (const path of [
    '/api/hermes/update',
    '/api/hermes/update/',
    '/api/hermes/update?force=true',
    '/api/hermes/update/check',
    '/%61pi/hermes/%75pdate/check',
    'https://gateway.example/api/hermes/update/check?force=true',
    new String('/api/hermes/update'),
    ['/api/hermes/update/check']
  ]) {
    assert.equal(isManagedUpdateApiRequest({ path }), true, String(path))
  }

  for (const path of ['/api/status', '/api/hermes/update-history', '/api/hermes/updates/check', '', null]) {
    assert.equal(isManagedUpdateApiRequest({ path }), false, String(path))
  }
})
