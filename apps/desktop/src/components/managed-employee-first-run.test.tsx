import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'

import type { DesktopConnectionConfig } from '@/global'

import { ManagedEmployeeFirstRun } from './managed-employee-first-run'

function connection(remoteUrl: string): DesktopConnectionConfig {
  return {
    cloudOrg: '',
    envOverride: false,
    mode: remoteUrl ? 'remote' : 'local',
    profile: null,
    remoteAuthMode: 'oauth',
    remoteOauthConnected: false,
    remoteTokenPreview: null,
    remoteTokenSet: false,
    remoteUrl
  }
}

function LocationProbe() {
  const location = useLocation()

  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderFirstRun(remoteUrl: string) {
  vi.stubGlobal('hermesDesktop', {
    getConnectionConfig: vi.fn(async () => connection(remoteUrl))
  } as unknown as typeof window.hermesDesktop)

  render(
    <MemoryRouter initialEntries={['/']}>
      <ManagedEmployeeFirstRun />
      <LocationProbe />
    </MemoryRouter>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('managed employee first run', () => {
  it('opens the in-app employee-ID form when no managed gateway is configured', async () => {
    renderFirstRun('')

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/settings?tab=gateway'))
  })

  it('keeps an existing employee connection on its current route', async () => {
    renderFirstRun('https://wangxudong.wanyushudong.xyz')

    await waitFor(() => expect(window.hermesDesktop?.getConnectionConfig).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('location').textContent).toBe('/')
  })
})
