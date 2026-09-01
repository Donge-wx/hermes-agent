import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

const getCustomEndpoints = vi.fn()
const saveCustomEndpoint = vi.fn()
const validateCustomEndpoint = vi.fn()
const activateCustomEndpoint = vi.fn()
const deleteCustomEndpoint = vi.fn()
const notify = vi.fn()

vi.mock('@/hermes', () => ({
  activateCustomEndpoint: (id: string) => activateCustomEndpoint(id),
  deleteCustomEndpoint: (id: string) => deleteCustomEndpoint(id),
  getCustomEndpoints: () => getCustomEndpoints(),
  saveCustomEndpoint: (endpoint: unknown) => saveCustomEndpoint(endpoint),
  validateCustomEndpoint: (endpoint: unknown) => validateCustomEndpoint(endpoint)
}))

vi.mock('@/store/notifications', () => ({
  notify: (input: unknown) => notify(input)
}))

beforeEach(() => {
  getCustomEndpoints.mockResolvedValue({
    current: { base_url: '', model: '', provider: '' },
    endpoints: []
  })
  validateCustomEndpoint.mockResolvedValue({
    message: 'The upstream returned an English error',
    models: [],
    ok: false,
    reachable: true
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function renderCustomEndpointsSettings() {
  const { CustomEndpointsSettings } = await import('./custom-endpoints-settings')

  render(
    <I18nProvider configClient={null} initialLocale="zh">
      <CustomEndpointsSettings />
    </I18nProvider>
  )
}

async function fillEndpointUrl() {
  await screen.findByText('自定义端点')
  fireEvent.change(screen.getByLabelText('端点 URL'), { target: { value: 'http://127.0.0.1:8081/v1' } })
}

describe('CustomEndpointsSettings error notifications', () => {
  it('uses Chinese copy instead of backend prose for a validation response', async () => {
    await renderCustomEndpointsSettings()
    await fillEndpointUrl()

    fireEvent.click(screen.getByRole('button', { name: '测试' }))

    await waitFor(() => expect(notify).toHaveBeenCalledWith({ kind: 'warning', message: '端点验证失败。' }))
    expect(notify.mock.calls.map(([input]) => input.message)).not.toContain('The upstream returned an English error')
  })

  it('uses Chinese copy instead of a short thrown backend error', async () => {
    validateCustomEndpoint.mockRejectedValueOnce(new Error('Short English backend failure'))

    await renderCustomEndpointsSettings()
    await fillEndpointUrl()

    fireEvent.click(screen.getByRole('button', { name: '测试' }))

    await waitFor(() => expect(notify).toHaveBeenCalledWith({ kind: 'error', message: '端点验证失败。' }))
    expect(notify.mock.calls.map(([input]) => input.message)).not.toContain('Short English backend failure')
  })
})
