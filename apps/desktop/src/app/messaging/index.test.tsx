// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import type { MessagingPlatformInfo } from '@/types/hermes'

const getMessagingPlatforms = vi.fn()
const updateMessagingPlatform = vi.fn()
const getPairing = vi.fn()
const approvePairing = vi.fn()
const revokePairing = vi.fn()
const openExternalLink = vi.fn()

vi.mock('@/hermes', () => ({
  approvePairing: (platformId: string, requestId: string, profile?: null | string) =>
    approvePairing(platformId, requestId, profile),
  getMessagingPlatforms: (profile?: null | string) => getMessagingPlatforms(profile),
  getPairing: (profile?: null | string) => getPairing(profile),
  getProfiles: vi.fn(async () => ({ profiles: [] })),
  revokePairing: (platformId: string, userId: string, profile?: null | string) =>
    revokePairing(platformId, userId, profile),
  setApiRequestProfile: vi.fn(),
  updateMessagingPlatform: (id: string, body: unknown, profile?: null | string) =>
    updateMessagingPlatform(id, body, profile)
}))

// Keep store/profile's side-effecting imports inert (pulled in via the shared
// settings scope store) — same seam as store/profile.test.ts.
vi.mock('@/store/gateway', () => ({
  $gateway: { get: () => null, subscribe: () => () => {} },
  ensureGatewayForAgent: vi.fn(async () => undefined),
  ensureGatewayForProfile: vi.fn(async () => undefined),
  openGatewayForProfile: vi.fn(async () => undefined)
}))
vi.mock('@/lib/query-client', () => ({ invalidateProfileScopedQueries: vi.fn() }))
vi.mock('@/store/starmap', () => ({ resetStarmapGraph: vi.fn() }))

vi.mock('@/lib/external-link', () => ({
  openExternalLink: (href: string) => openExternalLink(href)
}))

vi.mock('@/store/notifications', () => ({
  notify: vi.fn(),
  notifyError: vi.fn()
}))

vi.mock('@/store/system-actions', () => ({
  runGatewayRestart: vi.fn()
}))

function platform(patch: Partial<MessagingPlatformInfo> = {}): MessagingPlatformInfo {
  return {
    configured: false,
    description: 'A platform.',
    docs_url: '',
    enabled: false,
    env_vars: [],
    gateway_running: true,
    id: 'feishu',
    name: 'Feishu',
    state: 'disabled',
    ...patch
  }
}

beforeEach(() => {
  updateMessagingPlatform.mockResolvedValue({ ok: true, platform: 'feishu' })
  getPairing.mockResolvedValue({ approved: [], pending: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function renderMessaging(initialLocale: 'en' | 'zh' = 'en') {
  const { MessagingView } = await import('./index')
  let result: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <I18nProvider configClient={null} initialLocale={initialLocale}>
        <MemoryRouter>
          <MessagingView />
        </MemoryRouter>
      </I18nProvider>
    )
  })

  return result!
}

describe('MessagingView profile scope', () => {
  it('follows the active profile instead of targeting primary when there is no override', async () => {
    const { $settingsScopeOverride } = await import('@/store/settings-scope')

    $settingsScopeOverride.set(null)
    getMessagingPlatforms.mockResolvedValue({ platforms: [platform()] })

    await renderMessaging()

    await waitFor(() => expect(getMessagingPlatforms).toHaveBeenCalledWith(undefined))
    expect(getPairing).toHaveBeenCalledWith(undefined)
  })
})

describe('MessagingView setup-guide link', () => {
  it('replaces a failed first load with a retryable composed state', async () => {
    getMessagingPlatforms.mockRejectedValue(new Error('gateway unavailable'))

    await renderMessaging()

    expect(await screen.findByText('Messaging platforms failed to load')).toBeTruthy()
    expect(screen.getByText('gateway unavailable')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('hides the setup-guide button for an approved platform with no docs URL', async () => {
    // A platform can ship an empty docs_url. Rendering an
    // anchor with href="" let Electron resolve it to the app's own packaged
    // index.html and fail with an OS "file not found" dialog. The button must
    // simply not appear when there is no guide to open.
    getMessagingPlatforms.mockResolvedValue({ platforms: [platform({ docs_url: '' })] })

    await renderMessaging()

    expect((await screen.findAllByText('飞书')).length).toBeGreaterThan(0)
    expect(screen.queryByText('Open setup guide')).toBeNull()
  })

  it('opens a real docs URL through the validated external opener', async () => {
    const docsUrl = 'https://open.feishu.cn/document/'
    getMessagingPlatforms.mockResolvedValue({ platforms: [platform({ docs_url: docsUrl })] })

    await renderMessaging()

    const link = await screen.findByText('Open setup guide')
    await act(async () => {
      fireEvent.click(link)
    })

    await waitFor(() => expect(openExternalLink).toHaveBeenCalledWith(docsUrl))
  })
})

describe('MessagingView pairing', () => {
  const pendingUser = {
    age_minutes: 3,
    platform: 'feishu',
    request_id: 'a1b2c3d4e5f60718',
    user_id: '7712345',
    user_name: 'Bee'
  }

  it('approves the listed request by its request id, never by a code', async () => {
    // The whole point of the request-id grant path: the UI can only ever send
    // the server-side row id, because the one-time code is never returned by
    // the API. Posting anything derived from the code could not be approved.
    getMessagingPlatforms.mockResolvedValue({ platforms: [platform()] })
    getPairing.mockResolvedValue({ approved: [], pending: [pendingUser] })
    approvePairing.mockResolvedValue({ ok: true, user: { user_id: '7712345', user_name: 'Bee' } })

    await renderMessaging()

    const approve = await screen.findByRole('button', { name: 'Approve' })
    await act(async () => {
      fireEvent.click(approve)
    })

    await waitFor(() => expect(approvePairing).toHaveBeenCalledWith('feishu', 'a1b2c3d4e5f60718', undefined))
  })

  it('restores the pending row when approval fails', async () => {
    // Optimistic removal must not silently swallow the request: a failed
    // approve has to leave the operator something to retry.
    getMessagingPlatforms.mockResolvedValue({ platforms: [platform()] })
    getPairing.mockResolvedValue({ approved: [], pending: [pendingUser] })
    approvePairing.mockRejectedValue(new Error('500 boom'))

    await renderMessaging()

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    })

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(screen.getByText('Bee')).toBeTruthy()
  })

  it('shows no pairing affordance when nobody is waiting', async () => {
    // Approvals are rare; an always-present empty state would be permanent
    // chrome on a page that is otherwise about credentials.
    getMessagingPlatforms.mockResolvedValue({ platforms: [platform()] })
    getPairing.mockResolvedValue({ approved: [], pending: [] })

    await renderMessaging()

    expect((await screen.findAllByText('飞书')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByText(/Pending requests/)).toBeNull()
  })

  it('still renders platforms when the pairing endpoint fails', async () => {
    // An older backend without the endpoint must not blank the page.
    getMessagingPlatforms.mockResolvedValue({ platforms: [platform()] })
    getPairing.mockRejectedValue(new Error('404 not found'))

    await renderMessaging()

    expect((await screen.findAllByText('飞书')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('refetches pending rows on pairing.changed, not on platforms.changed', async () => {
    // The two signals are not interchangeable: platforms.changed tracks
    // connect/disconnect health via gateway_state.json, which a new pairing
    // request never moves. Riding it would leave someone invisible in the
    // pending list until an unrelated reconnect happened to fire.
    const { $changeEventsAvailable, $pairingChangeTick, $platformsChangeTick } = await import('@/store/live-sync')

    getMessagingPlatforms.mockResolvedValue({ platforms: [platform()] })
    getPairing.mockResolvedValue({ approved: [], pending: [] })

    await renderMessaging()
    await act(async () => {
      $changeEventsAvailable.set(true)
    })
    getPairing.mockClear()

    // Someone DMs the bot: the store moves, the watcher ticks pairing.changed.
    getPairing.mockResolvedValue({ approved: [], pending: [pendingUser] })
    await act(async () => {
      $pairingChangeTick.set($pairingChangeTick.get() + 1)
    })

    await waitFor(() => expect(getPairing).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeTruthy()

    // A platform health tick alone must not be what fetches pairing.
    getPairing.mockClear()
    await act(async () => {
      $platformsChangeTick.set($platformsChangeTick.get() + 1)
    })
    expect(getPairing).not.toHaveBeenCalled()
  })
})

describe('MessagingView managed platform roster', () => {
  it('renders only DingTalk, WeChat, WeCom, and Feishu', async () => {
    getMessagingPlatforms.mockResolvedValue({
      platforms: [
        platform({ id: 'dingtalk', name: 'DingTalk' }),
        platform({ id: 'weixin', name: 'WeChat' }),
        platform({ id: 'wecom_callback', name: 'WeCom' }),
        platform({ id: 'feishu', name: 'Feishu' }),
        platform({ id: 'telegram', name: 'Telegram' }),
        platform({ id: 'slack', name: 'Slack' })
      ]
    })

    await renderMessaging()

    expect((await screen.findAllByText('钉钉')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('微信').length).toBeGreaterThan(0)
    expect(screen.getAllByText('企业微信').length).toBeGreaterThan(0)
    expect(screen.getAllByText('飞书').length).toBeGreaterThan(0)
    expect(screen.queryByText('Telegram')).toBeNull()
    expect(screen.queryByText('Slack')).toBeNull()
  })

  it('uses localized field labels for missing placeholders instead of backend English prompts', async () => {
    getMessagingPlatforms.mockResolvedValue({
      platforms: [
        platform({
          id: 'dingtalk',
          name: 'DingTalk',
          env_vars: [
            {
              advanced: false,
              description: 'The AppKey from DingTalk.',
              is_password: false,
              is_set: false,
              key: 'DINGTALK_CLIENT_ID',
              prompt: 'DingTalk Client ID (app key)',
              redacted_value: null,
              required: true,
              url: null
            }
          ]
        })
      ]
    })

    await renderMessaging('zh')

    expect(await screen.findByPlaceholderText('请输入应用 Client ID')).toBeTruthy()
    expect(screen.queryByPlaceholderText('DingTalk Client ID (app key)')).toBeNull()
  })
})
