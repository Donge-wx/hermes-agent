// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MyKingEmployeeEnrollmentStatus } from '@/global'
import { I18nProvider } from '@/i18n'

import { MyKingEmployeeEnrollmentAssistant } from './employee-enrollment'

const IDLE_STATUS: MyKingEmployeeEnrollmentStatus = {
  binding: null,
  configured: true,
  connectorReady: false,
  error: null,
  managedGateway: false,
  stage: 'idle'
}

function renderAssistant(
  status: MyKingEmployeeEnrollmentStatus,
  overrides: Partial<Window['hermesDesktop']['employeeEnrollment']> = {},
  placement: 'gate' | 'settings' = 'gate'
) {
  const listeners = new Set<(next: MyKingEmployeeEnrollmentStatus) => void>()

  const employeeEnrollment = {
    getStatus: vi.fn().mockResolvedValue(status),
    enroll: vi.fn().mockResolvedValue(status),
    check: vi.fn().mockResolvedValue(status),
    diagnostics: vi.fn().mockResolvedValue({ lines: [], path: '/private/connector.log' }),
    unbind: vi.fn().mockResolvedValue(IDLE_STATUS),
    onStatus: vi.fn((listener: (next: MyKingEmployeeEnrollmentStatus) => void) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    }),
    ...overrides
  }

  Object.defineProperty(window, 'hermesDesktop', {
    configurable: true,
    value: { employeeEnrollment }
  })

  const view = render(
    <I18nProvider configClient={null} initialLocale="zh">
      <MyKingEmployeeEnrollmentAssistant placement={placement} />
    </I18nProvider>
  )

  return {
    ...view,
    emit(next: MyKingEmployeeEnrollmentStatus) {
      for (const listener of listeners) {
        listener(next)
      }
    },
    employeeEnrollment
  }
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'hermesDesktop')
  vi.restoreAllMocks()
})

describe('My King employee enrollment assistant', () => {
  it('stays absent for ordinary and preassigned managed-gateway builds', async () => {
    const ordinary = renderAssistant({ ...IDLE_STATUS, configured: false })

    await waitFor(() => expect(ordinary.employeeEnrollment.getStatus).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('连接公司智能体')).toBeNull()
    ordinary.unmount()

    const managed = renderAssistant({ ...IDLE_STATUS, managedGateway: true })

    await waitFor(() => expect(managed.employeeEnrollment.getStatus).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('连接公司智能体')).toBeNull()
  })

  it('submits and immediately clears a one-time code while showing the real stage', async () => {
    let finishEnrollment: ((status: MyKingEmployeeEnrollmentStatus) => void) | null = null

    const enroll = vi.fn(
      () =>
        new Promise<MyKingEmployeeEnrollmentStatus>(resolve => {
          finishEnrollment = resolve
        })
    )

    const view = renderAssistant(IDLE_STATUS, { enroll })
    const input = (await screen.findByPlaceholderText('一次性绑定码')) as HTMLInputElement

    fireEvent.change(input, { target: { value: 'ABCD-2345-EFGH' } })
    fireEvent.click(screen.getByRole('button', { name: '连接公司' }))

    expect(enroll).toHaveBeenCalledWith('ABCD-2345-EFGH')
    expect(input.value).toBe('')

    act(() => {
      view.emit({ ...IDLE_STATUS, stage: 'configuring-secure-connection' })
    })
    expect(screen.getAllByText('正在配置本机安全连接')).toHaveLength(2)
    expect(screen.getByText('邀请验证完成')).toBeTruthy()
    expect(screen.getByText('员工身份已确认')).toBeTruthy()
    expect(screen.queryByText('正在验证邀请')).toBeNull()
    expect(screen.getByText('验证设备隔离')).toBeTruthy()
    expect(screen.queryByText('正在验证设备隔离')).toBeNull()
    expect(screen.queryByText(/%/)).toBeNull()

    await act(async () => {
      finishEnrollment?.({ ...IDLE_STATUS, stage: 'error', error: 'company-unavailable' })
    })
  })

  it('shows a real interface failure and never presents a false success state', async () => {
    const error = Object.assign(new Error('request failed'), { code: 'company-unavailable' })
    const view = renderAssistant(IDLE_STATUS, { enroll: vi.fn().mockRejectedValue(error) })

    fireEvent.change((await screen.findByPlaceholderText('一次性绑定码')) as HTMLInputElement, {
      target: { value: 'ABCD-2345-EFGH' }
    })
    fireEvent.click(screen.getByRole('button', { name: '连接公司' }))

    expect(await screen.findByText('公司服务器暂时不可用，请稍后重试。')).toBeTruthy()
    expect(screen.queryByText('My King 已连接')).toBeNull()
    expect(view.employeeEnrollment.check).not.toHaveBeenCalled()
  })

  it('retries a pending system authorization without asking for the code again', async () => {
    const enroll = vi.fn().mockResolvedValue({ ...IDLE_STATUS, stage: 'configuring-secure-connection' })
    renderAssistant({ ...IDLE_STATUS, error: 'permission-required', stage: 'error' }, { enroll })

    fireEvent.click(await screen.findByRole('button', { name: '重新授权' }))

    expect(enroll).toHaveBeenCalledWith('')
    await screen.findAllByText('正在配置本机安全连接')
    const input = screen.getByPlaceholderText('一次性绑定码') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.disabled).toBe(true)
  })

  it('renders verified employee facts and supports diagnostics plus confirmed unbind', async () => {
    const connected: MyKingEmployeeEnrollmentStatus = {
      binding: {
        deviceId: 'random-device-id',
        employeeId: 'employee-1',
        employeeName: '测试员工',
        enrolledAt: '2026-08-27T01:00:00.000Z',
        lastCheckAt: '2026-08-27T01:30:00.000Z',
        remoteGatewayUrl: 'https://gateway.myking.test',
        version: 1
      },
      configured: true,
      connectorReady: true,
      error: null,
      managedGateway: false,
      stage: 'connected'
    }

    const diagnostics = vi.fn().mockResolvedValue({
      lines: ['connector ready', 'token=[REDACTED]'],
      path: '/private/connector.log'
    })

    const unbind = vi.fn().mockResolvedValue(IDLE_STATUS)
    renderAssistant(connected, { diagnostics, unbind }, 'settings')

    expect(await screen.findByText('My King 已连接')).toBeTruthy()
    expect(screen.getByText('测试员工')).toBeTruthy()
    expect(screen.getAllByText('正常')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: '查看诊断信息' }))
    await waitFor(() => expect(diagnostics).toHaveBeenCalledTimes(1))
    const log = screen.getByText(/connector ready/).closest('[data-selectable-text="true"]')
    expect(log?.textContent).toContain('connector ready')
    expect(log?.textContent).toContain('token=[REDACTED]')
    expect(screen.queryByText('/private/connector.log')).toBeNull()

    const close = screen.getAllByRole('button', { name: '关闭' }).find(button => button.textContent === '关闭')
    expect(close).toBeTruthy()
    fireEvent.click(close as HTMLButtonElement)
    fireEvent.click(screen.getByRole('button', { name: '解除绑定' }))
    expect(await screen.findByText('解除这台员工电脑的绑定？')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '解除绑定' }))

    await waitFor(() => expect(unbind).toHaveBeenCalledTimes(1))
  })

  it('shows a newly completed connection briefly, then releases the first-run gate', async () => {
    const connected: MyKingEmployeeEnrollmentStatus = {
      binding: {
        deviceId: 'random-device-id',
        employeeId: 'employee-1',
        employeeName: '测试员工',
        enrolledAt: '2026-08-27T01:00:00.000Z',
        lastCheckAt: '2026-08-27T01:30:00.000Z',
        remoteGatewayUrl: 'https://gateway.myking.test',
        version: 1
      },
      configured: true,
      connectorReady: true,
      error: null,
      managedGateway: false,
      stage: 'connected'
    }

    const view = renderAssistant(IDLE_STATUS)

    await screen.findByText('连接公司智能体')
    act(() => view.emit({ ...IDLE_STATUS, stage: 'connecting-remote-gateway' }))
    act(() => view.emit(connected))
    expect(screen.getByText('My King 已连接')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('My King 已连接')).toBeNull(), { timeout: 3_000 })
  })

  it('does not block a returning employee whose connector is already ready', async () => {
    const connected: MyKingEmployeeEnrollmentStatus = {
      binding: {
        deviceId: 'random-device-id',
        employeeId: 'employee-1',
        employeeName: '测试员工',
        enrolledAt: '2026-08-27T01:00:00.000Z',
        lastCheckAt: '2026-08-27T01:30:00.000Z',
        remoteGatewayUrl: 'https://gateway.myking.test',
        version: 1
      },
      configured: true,
      connectorReady: true,
      error: null,
      managedGateway: false,
      stage: 'connected'
    }

    const view = renderAssistant(connected)

    await waitFor(() => expect(view.employeeEnrollment.getStatus).toHaveBeenCalledTimes(1))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByText('My King 已连接')).toBeNull()
  })
})
