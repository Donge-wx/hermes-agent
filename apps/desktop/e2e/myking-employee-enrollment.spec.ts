import { setupNoProvider } from './fixtures'
import { expect, test } from './test'

const IDLE_STATUS = {
  binding: null,
  configured: true,
  connectorReady: false,
  error: null,
  managedGateway: false,
  stage: 'idle'
} as const

const CONNECTED_STATUS = {
  binding: {
    deviceId: 'visual-qa-device',
    employeeId: 'employee-visual-qa',
    employeeName: '测试员工',
    enrollmentId: 'enrollment-visual-qa',
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
} as const

test('renders every My King employee enrollment state in the real Electron window', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(120_000)
  const fixture = await setupNoProvider()

  const sendStatus = async (status: Record<string, unknown>) => {
    await fixture.app.evaluate(({ BrowserWindow }, nextStatus) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('myking:employee-enrollment:status', nextStatus)
      }
    }, status)
  }

  const resize = async (width: number, height = 800) => {
    await fixture.app.evaluate(
      ({ BrowserWindow }, size) => {
        const window = BrowserWindow.getAllWindows().at(0)

        window?.unmaximize()
        window?.setContentSize(size.width, size.height, false)
        window?.show()
        window?.focus()
      },
      { height, width }
    )
    await expect.poll(() => fixture.page.evaluate(() => window.innerWidth)).toBe(width)
    await expect.poll(() => fixture.page.evaluate(() => window.innerHeight)).toBeGreaterThanOrEqual(height - 24)
  }

  const capture = async (name: string) => {
    const surface = fixture.page.locator('[data-slot="employee-enrollment"]').last()

    await expect(surface).toBeVisible()
    await expect.poll(() => surface.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await surface.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath(`${name}.png`)
    })
  }

  try {
    await expect(fixture.page.locator('[data-slot="employee-enrollment-gate"]')).toBeVisible({ timeout: 30_000 })
    await expect(fixture.page.getByText('连接 AI Work OS', { exact: true })).toBeVisible()
    await expect(fixture.page.getByRole('button', { name: '连接', exact: true })).toBeVisible()

    for (const width of [640, 900, 1280]) {
      await resize(width)
      await capture(`employee-enrollment-idle-${width}`)
    }

    await fixture.app.evaluate(({ BrowserWindow, ipcMain }) => {
      ;(globalThis as typeof globalThis & { __myKingEnrollmentCodes?: string[] }).__myKingEnrollmentCodes = []
      ipcMain.removeHandler('myking:employee-enrollment:enroll')
      ipcMain.handle('myking:employee-enrollment:enroll', async (_event, code) => {
        const idleStatus = {
          binding: null,
          configured: true,
          connectorReady: false,
          error: null,
          managedGateway: false,
          stage: 'idle'
        }

        ;(globalThis as typeof globalThis & { __myKingEnrollmentCodes?: string[] }).__myKingEnrollmentCodes?.push(
          String(code)
        )

        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send('myking:employee-enrollment:status', {
            ...idleStatus,
            stage: 'configuring-secure-connection'
          })
        }

        await new Promise(resolve => setTimeout(resolve, 500))

        return idleStatus
      })
    })

    const codeInput = fixture.page.getByPlaceholder('一次性绑定码')
    await codeInput.fill('ABCD-2345-EFGH')
    await fixture.page.getByRole('button', { name: '连接', exact: true }).click()
    await expect(codeInput).toHaveValue('')
    await expect(fixture.page.getByText('正在配置本机安全连接', { exact: true }).first()).toBeVisible()
    await expect
      .poll(() =>
        fixture.app.evaluate(
          () => (globalThis as typeof globalThis & { __myKingEnrollmentCodes?: string[] }).__myKingEnrollmentCodes
        )
      )
      .toEqual(['ABCD-2345-EFGH'])
    await expect(fixture.page.getByText('正在配置本机安全连接', { exact: true })).toHaveCount(0)

    await sendStatus({ ...IDLE_STATUS, stage: 'connecting-remote-gateway' })
    await expect(fixture.page.getByText('正在连接 My King 远程网关', { exact: true }).first()).toBeVisible()
    await capture('employee-enrollment-progress')

    await sendStatus({ ...IDLE_STATUS, error: 'company-unavailable', stage: 'error' })
    await expect(fixture.page.getByText('公司服务器暂时不可用，请稍后重试。', { exact: true })).toBeVisible()
    await capture('employee-enrollment-error')

    await sendStatus({ ...IDLE_STATUS, stage: 'verifying-isolation' })
    await sendStatus(CONNECTED_STATUS)
    await expect(fixture.page.getByText('My King 已连接', { exact: true })).toBeVisible()
    await capture('employee-enrollment-connected')
    await expect(fixture.page.locator('[data-slot="employee-enrollment-gate"]')).toHaveCount(0, { timeout: 5_000 })

    await fixture.page.evaluate(() => {
      window.location.hash = '/settings?tab=gateway'
      const style = document.createElement('style')

      style.textContent = `
        [data-slot='onboarding-overlay'],
        [data-slot='boot-failure-overlay'],
        [data-slot='gateway-boot-overlay'] { display: none !important; }
      `
      document.head.append(style)
    })
    await expect(fixture.page.locator('[data-slot="settings-content"]')).toBeVisible()
    await sendStatus(CONNECTED_STATUS)
    await expect(fixture.page.getByText('My King 已连接', { exact: true })).toBeVisible()

    for (const width of [640, 900, 1280]) {
      await resize(width)
      await capture(`employee-enrollment-settings-${width}`)
    }

    await fixture.page.getByRole('button', { name: '查看诊断信息' }).last().click()
    await expect(fixture.page.getByRole('dialog')).toBeVisible()
    await fixture.page.getByRole('dialog').screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('employee-enrollment-diagnostics.png')
    })
    await fixture.page.getByRole('button', { name: '关闭' }).last().click()

    await fixture.page.getByRole('button', { name: '解除绑定' }).last().click()
    await expect(fixture.page.getByText('解除这台员工电脑的绑定？', { exact: true })).toBeVisible()
    await fixture.page.getByRole('dialog').screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('employee-enrollment-unbind.png')
    })
    await fixture.page.getByRole('dialog').getByRole('button', { name: '解除绑定', exact: true }).click()
    await expect(fixture.page.getByRole('dialog')).toHaveCount(0)
    await expect(fixture.page.getByText('连接 AI Work OS', { exact: true })).toBeVisible()
  } finally {
    await fixture.cleanup()
  }
})
