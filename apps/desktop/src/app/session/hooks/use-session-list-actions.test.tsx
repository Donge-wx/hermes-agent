// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listAllProfileSessions } from '@/hermes'
import { $messagingSessions, $sessions, setMessagingSessions, setSessions } from '@/store/session'

import { useSessionListActions } from './use-session-list-actions'

vi.mock('@/hermes', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCronJobs: vi.fn().mockResolvedValue([]),
  listAllProfileSessions: vi.fn().mockResolvedValue({
    errors: [],
    limit: 100,
    offset: 0,
    profile_totals: {},
    sessions: [],
    total: 0
  })
}))

describe('useSessionListActions messaging profile isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setMessagingSessions([])
    setSessions([])
  })

  afterEach(() => {
    cleanup()
    setMessagingSessions([])
    setSessions([])
  })

  it('pins messaging refreshes to the isolated default profile', async () => {
    const { result } = renderHook(() => useSessionListActions({ profileScope: 'wangxudong' }))

    await act(async () => {
      await result.current.refreshMessagingSessions()
    })

    expect(vi.mocked(listAllProfileSessions)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(listAllProfileSessions).mock.calls[0]?.[4]).toBe('default')
  })

  it('keeps per-platform pagination inside the isolated default profile', async () => {
    const { result } = renderHook(() => useSessionListActions({ profileScope: 'weijia' }))

    await act(async () => {
      await result.current.loadMoreMessagingForPlatform('feishu')
    })

    expect(vi.mocked(listAllProfileSessions)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(listAllProfileSessions).mock.calls[0]?.[4]).toBe('default')
  })

  it('drops cross-profile messaging rows before they reach the selected employee view', async () => {
    vi.mocked(listAllProfileSessions).mockResolvedValueOnce({
      errors: [],
      limit: 100,
      offset: 0,
      profile_totals: { default: 1, weijia: 1 },
      sessions: [
        { id: 'employee-feishu', profile: 'default', source: 'feishu' },
        { id: 'weijia-feishu', profile: 'weijia', source: 'feishu' }
      ],
      total: 2
    } as never)
    const { result } = renderHook(() => useSessionListActions({ profileScope: 'weijia' }))

    await act(async () => {
      await result.current.refreshMessagingSessions()
    })

    expect($messagingSessions.get().map(session => session.id)).toEqual(['employee-feishu'])
  })

  it('drops cross-profile rows returned during per-platform pagination', async () => {
    vi.mocked(listAllProfileSessions).mockResolvedValueOnce({
      errors: [],
      limit: 40,
      offset: 0,
      profile_totals: { default: 1, weijia: 1 },
      sessions: [
        { id: 'employee-feishu-more', profile: 'default', source: 'feishu' },
        { id: 'weijia-feishu-more', profile: 'weijia', source: 'feishu' }
      ],
      total: 2
    } as never)
    const { result } = renderHook(() => useSessionListActions({ profileScope: 'weijia' }))

    await act(async () => {
      await result.current.loadMoreMessagingForPlatform('feishu')
    })

    expect($messagingSessions.get().map(session => session.id)).toEqual(['employee-feishu-more'])
  })

  it('loads history from default and drops a cross-profile aggregate row', async () => {
    vi.mocked(listAllProfileSessions).mockResolvedValue({
      errors: [],
      limit: 40,
      offset: 0,
      profile_totals: { default: 1, wangxudong: 1 },
      sessions: [
        { id: 'employee-history', profile: 'default', source: 'desktop' },
        { id: 'foreign-history', profile: 'wangxudong', source: 'desktop' }
      ],
      total: 2
    } as never)
    const { result } = renderHook(() => useSessionListActions({ profileScope: '__all__' }))

    await act(async () => {
      await result.current.refreshSessions()
    })

    expect(vi.mocked(listAllProfileSessions).mock.calls[0]?.[4]).toBe('default')
    expect($sessions.get().map(session => session.id)).toEqual(['employee-history'])
  })
})
