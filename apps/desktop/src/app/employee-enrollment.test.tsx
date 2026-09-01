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
    login: vi.fn().mockResolvedValue(status),
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

  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)

  const view = render(
    <I18nProvider configClient={null} initialLocale="zh">
      <MyKingEmployeeEnrollmentAssistant placement={placement} />
    </I18nProvider>,
    { container }
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
  it('keeps keyboard and assistive-technology focus inside the blocking login dialog', async () => {
    const previousFocus = document.createElement('button')
    previousFocus.textContent = 'Background action'
    document.body.append(previousFocus)
    previousFocus.focus()

    const view = renderAssistant(IDLE_STATUS)
    const dialog = await screen.findByRole('dialog', { name: '连接 AI Work OS' })
    const email = screen.getByPlaceholderText('员工账号')
    const appRoot = document.getElementById('root') as HTMLElement

    await waitFor(() => expect(document.activeElement).toBe(email))
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(appRoot.inert).toBe(true)
    expect(appRoot.getAttribute('aria-hidden')).toBe('true')

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, input'))
    const last = focusable.at(-1) as HTMLElement

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(email)

    email.focus()
    fireEvent.keyDown(email, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    act(() =>
      view.emit({
        ...IDLE_STATUS,
        binding: {
          deviceId: 'device-1',
          employeeId: 'employee-1',
          employeeName: '测试员工',
          enrollmentId: 'enrollment-1',
          enrolledAt: '2026-08-27T01:00:00.000Z',
          lastCheckAt: '2026-08-27T01:30:00.000Z',
          remoteGatewayUrl: 'https://gateway.myking.test',
          version: 1
        },
        connectorReady: true,
        stage: 'connected'
      })
    )

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '连接 AI Work OS' })).toBeNull(), {
      timeout: 3_000
    })
    expect(appRoot.inert).toBe(false)
    expect(document.activeElement).toBe(previousFocus)
  })

  it('stays absent for ordinary and preassigned managed-gateway builds', async () => {
    const ordinary = renderAssistant({ ...IDLE_STATUS, configured: false })

    await waitFor(() => expect(ordinary.employeeEnrollment.getStatus).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('连接 AI Work OS')).toBeNull()
    ordinary.unmount()

    const managed = renderAssistant({ ...IDLE_STATUS, managedGateway: true })

    await waitFor(() => expect(managed.employeeEnrollment.getStatus).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('连接 AI Work OS')).toBeNull()
  })

  it('submits an employee account, immediately clears the password, and shows the real stage', async () => {
    let finishEnrollment: ((status: MyKingEmployeeEnrollmentStatus) => void) | null = null

    const login = vi.fn(
      () =>
        new Promise<MyKingEmployeeEnrollmentStatus>(resolve => {
          finishEnrollment = resolve
        })
    )

    const view = renderAssistant(IDLE_STATUS, { login })
    const email = (await screen.findByPlaceholderText('员工账号')) as HTMLInputElement
    const password = screen.getByPlaceholderText('密码') as HTMLInputElement

    fireEvent.change(email, { target: { value: 'employee@wysd.com' } })
    fireEvent.change(password, { target: { value: 'correct-password' } })
    fireEvent.click(screen.getByRole('button', { name: '登录并连接' }))

    expect(login).toHaveBeenCalledWith({ email: 'employee@wysd.com', password: 'correct-password' })
    expect(email.value).toBe('employee@wysd.com')
    expect(password.value).toBe('')
    expect(screen.queryByPlaceholderText('一次性绑定码')).toBeNull()

    act(() => {
      view.emit({ ...IDLE_STATUS, stage: 'configuring-secure-connection' })
    })
    expect(screen.getAllByText('正在配置本机安全连接')).toHaveLength(2)
    expect(screen.getByText('员工账号验证完成')).toBeTruthy()
    expect(screen.getByText('员工身份已确认')).toBeTruthy()
    expect(screen.queryByText('正在验证员工账号')).toBeNull()
    expect(screen.getByText('验证设备隔离')).toBeTruthy()
    expect(screen.queryByText('正在验证设备隔离')).toBeNull()
    expect(screen.queryByText(/%/)).toBeNull()

    await act(async () => {
      finishEnrollment?.({ ...IDLE_STATUS, stage: 'error', error: 'company-unavailable' })
    })
  })

  it('shows a real interface failure and never presents a false success state', async () => {
    const failedStatus = { ...IDLE_STATUS, error: 'company-unavailable', stage: 'error' as const }
    const getStatus = vi.fn().mockResolvedValueOnce(IDLE_STATUS).mockResolvedValue(failedStatus)
    const view = renderAssistant(IDLE_STATUS, {
      login: vi.fn().mockRejectedValue(new Error('request failed')),
      getStatus
    })

    fireEvent.change((await screen.findByPlaceholderText('员工账号')) as HTMLInputElement, {
      target: { value: 'employee@wysd.com' }
    })
    fireEvent.change(screen.getByPlaceholderText('密码'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: '登录并连接' }))

    expect(await screen.findByText('公司服务器暂时不可用，请稍后重试。')).toBeTruthy()
    expect(getStatus).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('My King 已连接')).toBeNull()
    expect(view.employeeEnrollment.check).not.toHaveBeenCalled()
  })

  it('repairs an existing employee binding by signing in again with the employee account', async () => {
    const disconnected: MyKingEmployeeEnrollmentStatus = {
      ...IDLE_STATUS,
      binding: {
        deviceId: 'random-device-id',
        employeeId: 'employee-1',
        employeeName: '测试员工',
        enrollmentId: 'enrollment-1',
        enrolledAt: '2026-08-28T08:29:29.000Z',
        lastCheckAt: null,
        remoteGatewayUrl: 'https://gateway.myking.test',
        version: 1
      },
      error: 'secure-connection-failed',
      stage: 'error'
    }
    const login = vi.fn().mockResolvedValue({ ...disconnected, error: null, stage: 'configuring-secure-connection' })

    renderAssistant(disconnected, { login })

    expect(await screen.findByText('安全连接启动失败，请重新连接。')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('员工账号'), { target: { value: 'employee@wysd.com' } })
    fireEvent.change(screen.getByPlaceholderText('密码'), { target: { value: 'correct-password' } })
    expect(screen.getByRole('button', { name: '断开本机' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '登录并连接' }))
    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({ email: 'employee@wysd.com', password: 'correct-password' })
    )
  })

  it('keeps diagnostics above the blocking enrollment gate', async () => {
    const disconnected: MyKingEmployeeEnrollmentStatus = {
      ...IDLE_STATUS,
      binding: {
        deviceId: 'random-device-id',
        employeeId: 'employee-1',
        employeeName: '测试员工',
        enrollmentId: 'enrollment-1',
        enrolledAt: '2026-08-28T08:29:29.000Z',
        lastCheckAt: null,
        remoteGatewayUrl: 'https://gateway.myking.test',
        version: 1
      },
      error: 'secure-connection-failed',
      stage: 'error'
    }
    const diagnostics = vi.fn().mockResolvedValue({
      lines: ['connector failed before authentication'],
      path: '/private/connector.log'
    })

    renderAssistant(disconnected, { diagnostics })

    const gate = (await screen.findByText('安全连接启动失败，请重新连接。')).closest(
      '[data-slot="employee-enrollment-gate"]'
    )

    fireEvent.click(screen.getByRole('button', { name: '查看诊断信息' }))

    const dialog = await screen.findByRole('dialog', { name: 'My King 连接诊断' })

    expect(diagnostics).toHaveBeenCalledTimes(1)
    expect(gate?.contains(dialog)).toBe(true)
    expect(screen.getByText('connector failed before authentication')).toBeTruthy()
  })

  it('retries a pending system authorization without asking for the code again', async () => {
    const enroll = vi.fn().mockResolvedValue({ ...IDLE_STATUS, stage: 'configuring-secure-connection' })
    renderAssistant({ ...IDLE_STATUS, error: 'permission-required', stage: 'error' }, { enroll })

    fireEvent.click(await screen.findByRole('button', { name: '重新授权' }))

    expect(enroll).toHaveBeenCalledWith('')
    await screen.findAllByText('正在配置本机安全连接')
    expect((screen.getByPlaceholderText('员工账号') as HTMLInputElement).disabled).toBe(true)
  })

  it('renders verified employee facts and supports diagnostics plus confirmed unbind', async () => {
    const connected: MyKingEmployeeEnrollmentStatus = {
      binding: {
        deviceId: 'random-device-id',
        employeeId: 'employee-1',
        employeeName: '测试员工',
        enrollmentId: 'enrollment-1',
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
    fireEvent.click(screen.getByRole('button', { name: '断开本机' }))
    expect(await screen.findByText('从这台电脑退出 My King？')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '断开本机' }))

    await waitFor(() => expect(unbind).toHaveBeenCalledTimes(1))
  })

  it('shows a newly completed connection briefly, then releases the first-run gate', async () => {
    const connected: MyKingEmployeeEnrollmentStatus = {
      binding: {
        deviceId: 'random-device-id',
        employeeId: 'employee-1',
        employeeName: '测试员工',
        enrollmentId: 'enrollment-1',
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

    await screen.findByText('连接 AI Work OS')
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
        enrollmentId: 'enrollment-1',
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
