import { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HermesConnection } from '@/global'
import type { ProfileInfo } from '@/types/hermes'

// Keep profile.ts's side-effecting imports inert: the gateway socket layer and
// the REST query client must not run for real in a unit test.
const ensureGatewayForProfile = vi.fn(async () => undefined)
const $gateway = atom<unknown>({ id: 'live-socket' })
const resetStarmapGraph = vi.fn()

vi.mock('@/store/gateway', () => ({ $gateway, ensureGatewayForProfile }))
vi.mock('@/hermes', () => ({
  getProfiles: vi.fn(async () => ({ profiles: [] })),
  setApiRequestProfile: vi.fn()
}))
vi.mock('@/lib/query-client', () => ({ queryClient: { invalidateQueries: vi.fn() } }))
vi.mock('@/store/starmap', () => ({ resetStarmapGraph }))

const {
  $activeProfile,
  $activeGatewayProfile,
  $profileScope,
  $profiles,
  $showAllProfiles,
  ensureGatewayProfile,
  refreshActiveProfile,
  refreshProfiles,
  setShowAllProfiles
} = await import('./profile')
const { $connection } = await import('./session')
const { queryClient } = await import('@/lib/query-client')
const { getProfiles } = await import('@/hermes')

const profile = (name: string, isDefault = false): ProfileInfo => ({
  has_env: false,
  is_default: isDefault,
  model: null,
  name,
  path: `/tmp/hermes/${name}`,
  provider: null,
  skill_count: 0
})

const remoteConn = (over: Partial<HermesConnection> = {}): HermesConnection =>
  ({ baseUrl: 'https://hermes-roy.tail.ts.net', mode: 'remote', profile: 'vps-remote', ...over }) as HermesConnection

const localConn = (over: Partial<HermesConnection> = {}): HermesConnection =>
  ({ baseUrl: '', mode: 'local', profile: 'default', ...over }) as HermesConnection

const getConnection = vi.fn<(profile?: string | null) => Promise<HermesConnection>>()
const api = vi.fn()

beforeEach(() => {
  getConnection.mockReset()
  api.mockReset()
  ensureGatewayForProfile.mockClear()
  $gateway.set({ id: 'live-socket' })
  $activeGatewayProfile.set('default')
  $showAllProfiles.set(false)
  $connection.set(localConn())
  $profiles.set([])
  vi.stubGlobal('window', { hermesDesktop: { api, getConnection } })
  vi.mocked(queryClient.invalidateQueries).mockClear()
  resetStarmapGraph.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  $connection.set(null)
})

describe('ensureGatewayProfile → $connection sync (#46651)', () => {
  it('keeps the managed employee on default when a stale remote profile is requested', async () => {
    getConnection.mockResolvedValue(remoteConn())

    await ensureGatewayProfile('vps-remote')

    expect(ensureGatewayForProfile).not.toHaveBeenCalled()
    expect(getConnection).not.toHaveBeenCalled()
    expect($connection.get()?.mode).toBe('local')
    expect($activeGatewayProfile.get()).toBe('default')
  })

  it('resyncs $connection back to local when returning to the default profile', async () => {
    $activeGatewayProfile.set('vps-remote')
    $connection.set(remoteConn())
    getConnection.mockResolvedValue(localConn())

    await ensureGatewayProfile('default')

    expect(getConnection).toHaveBeenCalledWith('default')
    expect($connection.get()?.mode).toBe('local')
  })

  it('leaves the prior connection intact when the descriptor fetch fails', async () => {
    getConnection.mockRejectedValue(new Error('backend unreachable'))

    await ensureGatewayProfile('vps-remote')

    // Best-effort: boot/reconnect resyncs later; we must not null it out here.
    expect($connection.get()?.mode).toBe('local')
  })

  it('recovers a stale non-default active gateway back to managed default', async () => {
    $activeGatewayProfile.set('vps-remote')
    $connection.set(remoteConn())
    getConnection.mockResolvedValue(localConn())

    await ensureGatewayProfile('vps-remote')

    expect(ensureGatewayForProfile).toHaveBeenCalledWith('default')
    expect(getConnection).toHaveBeenCalledWith('default')
    expect($connection.get()?.mode).toBe('local')
  })
})

describe('profile-scoped cache invalidation', () => {
  it('does not route or invalidate caches for a stale managed profile change', () => {
    $activeGatewayProfile.set('coder')

    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
    expect(resetStarmapGraph).not.toHaveBeenCalled()
  })
})

describe('managed active profile', () => {
  it('keeps the renderer on default even if a legacy gateway reports its employee slug', async () => {
    api.mockResolvedValueOnce({ active: 'wangxudong', current: 'wangxudong' })

    await refreshActiveProfile()

    expect($activeProfile.get()).toBe('default')
  })
})

describe('refreshProfiles shared rail list (#49289)', () => {
  it('removes a deleted profile from the shared $profiles cache after Manage Profiles refreshes', async () => {
    $profiles.set([profile('default', true), profile('test1')])
    vi.mocked(getProfiles).mockResolvedValueOnce({ profiles: [profile('default', true)] })

    await refreshProfiles()

    expect($profiles.get().map(profile => profile.name)).toEqual(['default'])
  })

  it('leaves the shared $profiles cache intact when the refresh fails', async () => {
    $profiles.set([profile('default', true), profile('test1')])
    vi.mocked(getProfiles).mockRejectedValueOnce(new Error('backend unavailable'))

    await expect(refreshProfiles()).rejects.toThrow('backend unavailable')

    expect($profiles.get().map(profile => profile.name)).toEqual(['default', 'test1'])
  })
})

describe('single-employee sidebar scope', () => {
  it('keeps the managed Hermes profile on default even if a server returns an employee slug', () => {
    $activeGatewayProfile.set('default')
    $profiles.set([profile('wangxudong', true)])

    expect($profileScope.get()).toBe('default')
  })

  it('ignores a persisted all-profiles preference on a single-employee gateway', () => {
    setShowAllProfiles(true)
    $profiles.set([profile('wangxudong', true)])

    expect($profileScope.get()).toBe('default')
    expect($showAllProfiles.get()).toBe(false)
  })

  it('ignores malicious or stale multi-profile state', () => {
    $activeGatewayProfile.set('weijia')
    $profiles.set([profile('wangxudong', true), profile('weijia')])

    expect($profileScope.get()).toBe('default')
  })

  it('does not replace an explicit gateway with an unrelated lone named profile', () => {
    $activeGatewayProfile.set('weijia')
    $profiles.set([profile('wangxudong')])

    expect($profileScope.get()).toBe('default')
  })

  it('never enables all-profiles even when multiple profiles are visible', () => {
    setShowAllProfiles(true)
    $profiles.set([profile('wangxudong', true), profile('weijia')])

    expect($profileScope.get()).toBe('default')
    expect($showAllProfiles.get()).toBe(false)
  })
})
