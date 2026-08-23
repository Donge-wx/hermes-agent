import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

import { AboutSettings } from './about-settings'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AboutSettings version identity', () => {
  it('shows the desktop package separately from the backend runtime', async () => {
    // Given: Electron reports different package and runtime versions.
    vi.stubGlobal('hermesDesktop', {
      getVersion: vi.fn().mockResolvedValue({
        appVersion: '0.20.5',
        desktopPackageVersion: '0.17.0',
        electronVersion: '40.10.2',
        nodeVersion: '22.22.0',
        platform: 'darwin',
        hermesRoot: '/Users/example/.myking/hermes-agent'
      })
    })

    // When: the About settings surface loads the running version information.
    render(
      <I18nProvider configClient={null} initialLocale="zh">
        <AboutSettings />
      </I18nProvider>
    )

    // Then: both independently named version values are visible.
    expect(await screen.findByText('桌面界面 0.17.0')).toBeTruthy()
    expect(await screen.findByText('后端 0.20.5')).toBeTruthy()
  })
})
