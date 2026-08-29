import fs from 'node:fs'
import path from 'node:path'

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

const DISCONNECTED_STATUS = {
  ...CONNECTED_STATUS,
  connectorReady: false,
  error: 'secure-connection-failed',
  stage: 'error'
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
    await expect
      .poll(() => fixture.page.evaluate(() => [window.innerWidth, window.innerHeight]))
      .toEqual([width, height])
  }

  const capture = async (name: string) => {
    const surface = fixture.page.locator('[data-slot="employee-enrollment"]').last()

    await expect(surface).toBeVisible()
    await expect.poll(() => surface.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath(`${name}.png`)
    })
  }

  try {
    await expect(fixture.page.locator('[data-slot="employee-enrollment-gate"]')).toBeVisible({ timeout: 30_000 })
    await expect(fixture.page.getByText('连接 AI Work OS', { exact: true })).toBeVisible()
    await expect(fixture.page.getByPlaceholder('员工账号')).toBeVisible()
    await expect(fixture.page.getByPlaceholder('密码')).toBeVisible()
    await expect(fixture.page.getByRole('button', { name: '登录并连接', exact: true })).toBeVisible()

    for (const width of [640, 900, 1280]) {
      await resize(width)
      await capture(`employee-enrollment-idle-${width}`)
    }

    await fixture.page.getByPlaceholder('员工账号').fill('employee@wysd.com')
    await fixture.page.getByPlaceholder('密码').fill('correct-password')
    await fixture.page.getByRole('button', { name: '登录并连接', exact: true }).click()
    await expect(fixture.page.getByPlaceholder('密码')).toHaveValue('')
    await expect(
      fixture.page.getByText(/^(员工账号或密码不正确。|公司服务器暂时不可用，请稍后重试。)$/)
    ).toBeVisible({ timeout: 20_000 })
    const userDataPath = await fixture.app.evaluate(({ app }) => app.getPath('userData'))
    const persistedPasswordFiles: string[] = []
    const visit = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name)

        if (entry.isDirectory()) {
          visit(target)
        } else if (entry.isFile()) {
          if (fs.readFileSync(target).includes(Buffer.from('correct-password'))) {
            persistedPasswordFiles.push(path.relative(userDataPath, target))
          }
        }
      }
    }
    visit(userDataPath)
    expect(persistedPasswordFiles).toEqual([])
    await capture('employee-enrollment-real-login-error')

    await sendStatus({ ...IDLE_STATUS, stage: 'connecting-remote-gateway' })
    await expect(fixture.page.getByText('正在连接 My King 远程网关', { exact: true }).first()).toBeVisible()
    for (const width of [640, 900, 1280]) {
      await resize(width)
      await capture(`employee-enrollment-progress-${width}`)
    }

    await sendStatus({ ...IDLE_STATUS, error: 'company-unavailable', stage: 'error' })
    await expect(fixture.page.getByText('公司服务器暂时不可用，请稍后重试。', { exact: true })).toBeVisible()
    await capture('employee-enrollment-error')

    await sendStatus(DISCONNECTED_STATUS)
    await expect(fixture.page.getByText('安全连接启动失败，请重新连接。', { exact: true })).toBeVisible()
    await expect(fixture.page.getByPlaceholder('员工账号')).toBeVisible()
    await expect(fixture.page.getByPlaceholder('密码')).toBeVisible()
    await expect(fixture.page.getByRole('button', { name: '登录并连接', exact: true })).toBeVisible()
    await expect(fixture.page.getByRole('button', { name: '断开本机', exact: true })).toBeVisible()

    const recoveryGate = fixture.page.locator('[data-slot="employee-enrollment-gate"]')

    await recoveryGate.getByRole('button', { name: '查看诊断信息', exact: true }).click()
    await expect(recoveryGate.getByRole('dialog')).toBeVisible()
    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('employee-enrollment-recovery-diagnostics.png')
    })
    await recoveryGate.getByRole('button', { name: '关闭', exact: true }).last().click()

    await recoveryGate.getByRole('button', { name: '断开本机', exact: true }).click()
    await expect(recoveryGate.getByRole('dialog')).toBeVisible()
    await recoveryGate.getByRole('button', { name: '取消', exact: true }).click()

    for (const width of [640, 900, 1280]) {
      await resize(width)
      await capture(`employee-enrollment-recovery-${width}`)
    }

    for (const width of [640, 900, 1280]) {
      await sendStatus({ ...IDLE_STATUS, stage: 'verifying-isolation' })
      await sendStatus(CONNECTED_STATUS)
      await expect(fixture.page.getByText('My King 已连接', { exact: true })).toBeVisible()
      await resize(width)
      await capture(`employee-enrollment-connected-${width}`)
    }
    await expect(fixture.page.locator('[data-slot="employee-enrollment-gate"]')).toHaveCount(0, { timeout: 5_000 })

    await fixture.page.evaluate(() => {
      window.location.hash = '/settings?tab=gateway'
      const style = document.createElement('style')

      style.textContent = `
        [data-slot='onboarding-overlay'],
        [data-slot='gateway-boot-overlay'],
        [data-slot='boot-failure-overlay'] { display: none !important; }
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
    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('employee-enrollment-diagnostics.png')
    })
    await fixture.page.getByRole('button', { name: '关闭' }).last().click()

    await fixture.page.getByRole('button', { name: '断开本机' }).last().click()
    await expect(fixture.page.getByText('从这台电脑退出 My King？', { exact: true })).toBeVisible()
    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('employee-enrollment-unbind.png')
    })
  } finally {
    await fixture.cleanup()
  }
})
