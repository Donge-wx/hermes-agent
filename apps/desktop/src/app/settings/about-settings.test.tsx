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
        electronVersion: '41.10.3',
        nodeVersion: '22.22.0',
        platform: 'darwin',
        hermesRoot: '/Users/example/.myking/hermes-agent'
      })
    })

    // When: the About settings surface loads the running version information.
    const { container } = render(
      <I18nProvider configClient={null} initialLocale="zh">
        <AboutSettings />
      </I18nProvider>
    )

    // Then: both independently named version values are visible.
    expect(await screen.findByText('桌面界面 0.17.0')).toBeTruthy()
    expect(await screen.findByText('My King backend v0.20.5')).toBeTruthy()
    expect(screen.getByText('AI WROK OS')).toBeTruthy()
    expect(container.querySelector('[data-slot="about-brand-stage"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="about-version-stack"]')).toBeTruthy()
  })

  it('keeps employee-facing About read-only when an updater bridge is present', async () => {
    // Given an installed desktop app that still exposes legacy update and
    // uninstall capabilities.
    vi.stubGlobal('hermesDesktop', {
      getVersion: vi.fn().mockResolvedValue({
        appVersion: '0.20.5',
        desktopPackageVersion: '0.17.0',
        electronVersion: '41.10.3',
        nodeVersion: '22.22.0',
        platform: 'darwin'
      }),
      uninstall: {
        run: vi.fn(),
        summary: vi.fn().mockResolvedValue({ agent_installed: true, running_app_path: '/Applications/My King.app' })
      },
      updates: { apply: vi.fn(), check: vi.fn() }
    })

    // When the About settings surface loads.
    render(
      <I18nProvider configClient={null} initialLocale="zh">
        <AboutSettings />
      </I18nProvider>
    )

    // Then only the two version identities are presented; no employee-facing
    // maintenance or removal action is available.
    await screen.findByText('桌面界面 0.17.0')
    expect(screen.queryByRole('button', { name: /检查更新|立即更新|查看更新内容|发行说明/ })).toBeNull()
    expect(screen.queryByText('危险操作')).toBeNull()
    expect(screen.queryByText('正在检查已安装内容…')).toBeNull()
  })
})
