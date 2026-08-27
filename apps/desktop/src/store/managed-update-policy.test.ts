import { afterEach, describe, expect, it, vi } from 'vitest'

import { $notifications } from './notifications'
import {
  $backendUpdateStatus,
  $updateStatus,
  applyBackendUpdate,
  applyEverythingUpdate,
  applyUpdates,
  checkBackendUpdates,
  checkUpdates,
  reportInstallMethodWarning,
  startUpdatePoller,
  stopUpdatePoller
} from './updates'

afterEach(() => {
  stopUpdatePoller()
  $backendUpdateStatus.set(null)
  $updateStatus.set(null)
  $notifications.set([])
  vi.unstubAllGlobals()
})

describe('managed update policy', () => {
  it('keeps versions refreshable while refusing every renderer update execution path', async () => {
    // Given an employee renderer with updater bridge methods still present.
    const check = vi.fn()
    const apply = vi.fn()
    const updateAll = vi.fn()

    const getVersion = vi.fn().mockResolvedValue({
      appVersion: '2.0.0',
      desktopPackageVersion: '1.0.0',
      electronVersion: '40.0.0',
      nodeVersion: '22.0.0',
      platform: 'darwin'
    })

    vi.stubGlobal('hermesDesktop', {
      connections: { updateAll },
      getVersion,
      updates: { apply, check, onProgress: vi.fn() }
    })

    // When legacy renderer functions and the boot poller are invoked directly.
    const clientCheck = await checkUpdates()
    const backendCheck = await checkBackendUpdates()
    const clientApply = await applyUpdates()
    const backendApply = await applyBackendUpdate()
    await applyEverythingUpdate()
    reportInstallMethodWarning('Run the compatibility updater from a terminal.')
    startUpdatePoller()
    await Promise.resolve()

    // Then no update bridge, backend API, or fan-out call is reachable, but version refresh remains live.
    expect(clientCheck).toBeNull()
    expect(backendCheck).toBeNull()
    expect(clientApply).toMatchObject({ error: 'updates-disabled', ok: false })
    expect(backendApply).toMatchObject({ error: 'updates-disabled', ok: false })
    expect(check).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    expect(updateAll).not.toHaveBeenCalled()
    expect(getVersion).toHaveBeenCalledTimes(1)
    expect($notifications.get()).toEqual([])
  })
})
