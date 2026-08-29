import assert from 'node:assert/strict'

import { test } from 'vitest'

import { MANAGED_UPDATE_ERROR } from './managed-update-ipc'
import { type ManagedUpdateIpcHandler, registerManagedUpdateIpc } from './register-managed-update-ipc'

type RegisteredHandlers = Map<string, ManagedUpdateIpcHandler>

function registeredHandlers(): {
  readonly handlers: RegisteredHandlers
  readonly ipcMain: {
    readonly handle: (channel: string, handler: ManagedUpdateIpcHandler) => void
  }
} {
  const handlers: RegisteredHandlers = new Map()

  return {
    handlers,
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler)
      }
    }
  }
}

function invoke(handlers: RegisteredHandlers, channel: string, ...args: readonly unknown[]): unknown {
  const handler = handlers.get(channel)
  assert.ok(handler, `missing ${channel} handler`)

  return handler({}, ...args)
}

test('registers every managed update channel when the desktop build starts', () => {
  // Given: an employee build with a deterministic IPC registrar.
  const { handlers, ipcMain } = registeredHandlers()
  registerManagedUpdateIpc({
    ipcMain,
    readConfig: () => ({ branch: 'managed-release' }),
    now: () => 0
  })

  // When: Electron registers the managed-update IPC policy.
  const channels = [...handlers.keys()]

  // Then: every renderer-facing update channel is governed by that policy.
  assert.deepEqual(channels, [
    'hermes:updates:check',
    'hermes:updates:apply',
    'hermes:updates:branch:get',
    'hermes:updates:branch:set'
  ])
})

test('denies update checks with the injected clock when a stale renderer checks for updates', () => {
  // Given: an employee build with a deterministic configuration reader and clock.
  const { handlers, ipcMain } = registeredHandlers()
  registerManagedUpdateIpc({
    ipcMain,
    now: () => 4_321,
    readConfig: () => ({ branch: 'managed-release' })
  })

  // When: a stale renderer checks for updates.
  const check = invoke(handlers, 'hermes:updates:check')

  // Then: the check stays fail-closed with the stable managed-build shape.
  assert.deepEqual(check, {
    branch: 'managed-release',
    error: MANAGED_UPDATE_ERROR,
    fetchedAt: 4_321,
    message: 'Updates are managed by your organization.',
    reason: MANAGED_UPDATE_ERROR,
    supported: false
  })
})

test('denies update application when a stale renderer starts an update', () => {
  // Given: an employee build registered at the IPC trust boundary.
  const { handlers, ipcMain } = registeredHandlers()
  registerManagedUpdateIpc({
    ipcMain,
    now: () => 0,
    readConfig: () => ({ branch: 'managed-release' })
  })

  // When: a stale renderer asks Electron to apply an update.
  const apply = invoke(handlers, 'hermes:updates:apply', { stopSafeBlockers: true })

  // Then: application is denied without invoking an updater.
  assert.deepEqual(apply, {
    error: MANAGED_UPDATE_ERROR,
    message: 'Updates are managed by your organization.',
    ok: false
  })
})

test('denies branch changes when a stale renderer selects another branch', () => {
  // Given: an employee build with an administrator-owned update branch.
  const { handlers, ipcMain } = registeredHandlers()
  registerManagedUpdateIpc({
    ipcMain,
    now: () => 0,
    readConfig: () => ({ branch: 'managed-release' })
  })

  // When: a stale renderer asks to switch to another branch.
  const branchSet = invoke(handlers, 'hermes:updates:branch:set', 'main')

  // Then: the configured branch remains the only visible branch.
  assert.deepEqual(branchSet, {
    branch: 'managed-release',
    error: MANAGED_UPDATE_ERROR,
    message: 'Updates are managed by your organization.',
    ok: false
  })
})

test('registers a read-only managed branch lookup when the renderer reads update settings', () => {
  // Given: a managed build whose update branch is supplied by Electron-owned config.
  const { handlers, ipcMain } = registeredHandlers()
  let reads = 0
  registerManagedUpdateIpc({
    ipcMain,
    now: () => 0,
    readConfig: () => {
      reads += 1

      return { branch: 'approved-release' }
    }
  })

  // When: the renderer reads the current update branch.
  const branch = invoke(handlers, 'hermes:updates:branch:get')

  // Then: the read exposes only the configured branch and performs no write.
  assert.deepEqual(branch, { branch: 'approved-release' })
  assert.equal(reads, 1)
})
