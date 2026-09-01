import { setupMockBackend, waitForAppReady, waitForDesktopApis } from './fixtures'
import { expect, test } from './test'

test.describe('My King managed employee feature policy', () => {
  test('keeps approved operations visible while restricting administration and themes', async ({
    browserName: _browserName
  }, testInfo) => {
    test.setTimeout(240_000)
    const fixture = await setupMockBackend()

    try {
      await waitForAppReady(fixture, 120_000)
      await waitForDesktopApis(fixture.page, [
        '/api/messaging/platforms',
        '/api/skills',
        '/api/tools/toolsets',
        '/api/config',
        '/api/mcp/catalog'
      ])

      await fixture.page.evaluate(() => {
        window.localStorage.setItem(
          'hermes.desktop.layoutTree.v2',
          JSON.stringify({ type: 'group', id: 'managed-stale-terminal', panes: ['workspace', 'terminal'], active: 'terminal' })
        )
        window.localStorage.setItem('hermes.desktop.terminalTakeover', 'true')
      })
      await fixture.page.reload()
      await waitForAppReady(fixture, 120_000)

      await expect(fixture.page.locator('[data-tree-tab="terminal"], [data-narrow-overlay-tab="terminal"]')).toHaveCount(0)
      await expect(fixture.page.locator('[data-terminal-slot], [data-terminal]')).toHaveCount(0)
      await expect
        .poll(() =>
          fixture.page.evaluate(() => {
            const raw = window.localStorage.getItem('hermes.desktop.layoutTree.v2')

            return raw ? (JSON.parse(raw).panes as string[]) : []
          })
        )
        .not.toContain('terminal')
      await expect
        .poll(() => fixture.page.evaluate(() => window.localStorage.getItem('hermes.desktop.terminalTakeover')))
        .toBe('false')

      const captureResponsive = async (surface: string) => {
        for (const width of [1280, 768, 640]) {
          const pageUrl = fixture.page.url()

          await fixture.app.evaluate(
            ({ BrowserWindow: ElectronBrowserWindow }, target) => {
              const window = ElectronBrowserWindow.getAllWindows().find(
                candidate => candidate.webContents.getURL() === target.pageUrl
              )

              window?.unmaximize()
              window?.setContentSize(target.width, 800, false)
              window?.show()
              window?.focus()
            },
            { pageUrl, width }
          )
          await expect
            .poll(() => fixture.page.evaluate(() => window.innerWidth), { message: `${surface} viewport` })
            .toBe(width)

          if (surface === 'settings') {
            const [contentBox, actionsBox] = await Promise.all([
              fixture.page.locator('[data-slot="settings-content"]').boundingBox(),
              fixture.page.locator('[data-slot="gateway-actions"]').boundingBox()
            ])

            expect(contentBox).not.toBeNull()
            expect(actionsBox).not.toBeNull()

            if (contentBox && actionsBox) {
              expect(actionsBox.y + actionsBox.height, `${width}px gateway actions`).toBeLessThanOrEqual(
                contentBox.y + contentBox.height
              )
            }
          }

          await fixture.page.screenshot({
            animations: 'disabled',
            caret: 'hide',
            path: testInfo.outputPath(`my-king-managed-${surface}-${width}.png`)
          })
        }

        const pageUrl = fixture.page.url()

        await fixture.app.evaluate(({ BrowserWindow: ElectronBrowserWindow }, targetUrl) => {
          const window = ElectronBrowserWindow.getAllWindows().find(
            candidate => candidate.webContents.getURL() === targetUrl
          )

          window?.setContentSize(1280, 800, false)
        }, pageUrl)
      }

      await fixture.page.evaluate(() => {
        window.location.hash = '/settings?tab=gateway'
      })

      await expect.poll(() => fixture.page.evaluate(() => window.location.hash)).toContain('/settings?tab=gateway')
      await expect(fixture.page.getByText('网关', { exact: true }).first()).toBeVisible()

      for (const retainedLabel of ['网关', '提供方', '工具与密钥']) {
        await expect(fixture.page.getByText(retainedLabel, { exact: true }).first()).toBeVisible()
      }

      for (const restrictedLabel of ['插件', '账单', '工作区', '安全']) {
        await expect(fixture.page.getByText(restrictedLabel, { exact: true })).toHaveCount(0)
      }

      await expect(fixture.page.locator('[data-slot="settings-config-admin-actions"]')).toHaveCount(0)
      await expect(fixture.page.getByText('诊断', { exact: true })).toHaveCount(0)
      await expect(fixture.page.getByText('打开日志', { exact: true })).toHaveCount(0)

      await captureResponsive('settings')

      await fixture.page.evaluate(() => {
        window.location.hash = '/settings?tab=config:appearance'
      })
      const appearanceContent = fixture.page.locator('[data-slot="settings-content"]')

      for (const retainedAppearance of ['语言', '界面缩放', '消息回应', '默认折叠推理过程', '内嵌预览', '宠物']) {
        await expect(appearanceContent.getByText(retainedAppearance, { exact: true }).first()).toBeVisible()
      }

      for (const managedAppearance of [
        '主题',
        '会话列表密度',
        '标签栏',
        '窗口透明',
        '聊天背景',
        '开场标识',
        '悬浮输入框',
        '工具调用显示'
      ]) {
        await expect(appearanceContent.getByText(managedAppearance, { exact: true })).toHaveCount(0)
      }

      await expect(fixture.page.locator('[data-slot="theme-card"]')).toHaveCount(0)
      await expect(fixture.page.locator('[data-slot="appearance-theme-search"]')).toHaveCount(0)
      await expect
        .poll(() => fixture.page.evaluate(() => document.documentElement.dataset.hermesTheme))
        .toBe('liquid-glass')
      await expect(fixture.page.getByText('终端字体', { exact: true })).toHaveCount(0)
      await fixture.app.evaluate(({ BrowserWindow: ElectronBrowserWindow }) => {
        const window = ElectronBrowserWindow.getAllWindows().at(0)

        window?.setContentSize(768, 800, false)
      })
      await expect(fixture.page.locator('[data-slot="settings-intro"]')).toBeVisible()
      await captureResponsive('appearance')

      await fixture.page.evaluate(() => {
        window.location.hash = '/settings?tab=keybinds'
      })
      const keybindContent = fixture.page.locator('[data-slot="settings-content"]')

      await expect(keybindContent.getByText('键盘快捷键', { exact: true })).toBeVisible()
      await expect(keybindContent.getByText('发送消息', { exact: true })).toBeVisible()

      for (const restrictedKeybind of [
        '配置',
        '打开定时任务',
        '打开智能体',
        '显示终端',
        '切换布局编辑模式',
        '切换浅色/深色',
        '切换标签'
      ]) {
        await expect(keybindContent.getByText(restrictedKeybind, { exact: true })).toHaveCount(0)
      }

      await fixture.page.evaluate(() => {
        window.location.hash = '/skills'
      })
      await expect.poll(() => fixture.page.evaluate(() => window.location.hash)).toContain('/skills')
      await expect(fixture.page.getByText('技能', { exact: true }).first()).toBeVisible()
      await expect(fixture.page.getByText('工具集', { exact: true }).first()).toBeVisible()
      await expect(fixture.page.getByText('MCP', { exact: true }).first()).toBeVisible()
      await expect(fixture.page.getByText('airtable', { exact: true }).first()).toBeVisible({ timeout: 30_000 })

      await expect(fixture.page.locator('iframe')).toHaveCount(0)
      await expect(fixture.page.getByText('技能中心', { exact: true })).toHaveCount(0)
      await expect(fixture.page.locator('[data-slot="skill-metadata"]')).not.toContainText(/hermes/i)

      await fixture.app.evaluate(({ BrowserWindow: ElectronBrowserWindow }) => {
        const window = ElectronBrowserWindow.getAllWindows().at(0)

        window?.setContentSize(640, 800, false)
      })
      const skillsMaster = fixture.page.locator('[data-slot="master-list-column"]')
      const fourthSkillRow = fixture.page.locator('[data-slot="cap-row"]').nth(3)
      await expect(skillsMaster).toBeVisible()
      await expect(fourthSkillRow).toBeVisible()
      const [masterBox, fourthRowBox] = await Promise.all([skillsMaster.boundingBox(), fourthSkillRow.boundingBox()])

      expect(masterBox).not.toBeNull()
      expect(fourthRowBox).not.toBeNull()

      if (masterBox && fourthRowBox) {
        expect(fourthRowBox.y + fourthRowBox.height).toBeLessThanOrEqual(masterBox.y + masterBox.height)
      }

      await captureResponsive('skills')

      await fixture.page.evaluate(() => {
        window.location.hash = '/messaging'
      })
      await expect.poll(() => fixture.page.evaluate(() => window.location.hash)).toContain('/messaging')
      await expect(fixture.page.getByText('钉钉', { exact: true }).first()).toBeVisible({ timeout: 30_000 })

      for (const retainedPlatform of ['钉钉', '飞书', '企业微信', '微信']) {
        await expect(fixture.page.getByText(retainedPlatform, { exact: true }).first()).toBeVisible()
      }

      for (const restrictedPlatform of ['Telegram', 'Slack', 'Discord', 'WhatsApp']) {
        await expect(fixture.page.getByText(restrictedPlatform, { exact: true })).toHaveCount(0)
      }

      for (const width of [1280, 768]) {
        await fixture.app.evaluate(({ BrowserWindow: ElectronBrowserWindow }, nextWidth) => {
          const window = ElectronBrowserWindow.getAllWindows().at(0)

          window?.setContentSize(nextWidth, 800, false)
        }, width)
        await expect(fixture.page.locator('[data-slot="messaging-platform-name"]')).toHaveCount(4)
        await expect
          .poll(() =>
            fixture.page
              .locator('[data-slot="messaging-platform-name"]')
              .evaluateAll(labels =>
                labels.every(
                  label => label.scrollWidth <= label.clientWidth && label.scrollHeight <= label.clientHeight
                )
              )
          )
          .toBe(true)
      }

      await fixture.page.getByText('微信', { exact: true }).first().click()
      await expect(fixture.page.locator('[data-slot="platform-intro"]')).not.toContainText(/hermes/i)
      await expect(fixture.page.locator('[data-slot="detail-column"]')).not.toContainText(/hermes/i)

      await captureResponsive('messaging')

      await fixture.page.evaluate(() => {
        window.location.hash = '/command-center?section=system'
      })
      await expect
        .poll(() => fixture.page.evaluate(() => window.location.hash))
        .toContain('/command-center?section=sessions')
      await expect(fixture.page.getByText('会话', { exact: true }).first()).toBeVisible()
      const commandCenterNav = fixture.page.locator('[data-slot="overlay-sidebar"]')
      await expect(commandCenterNav.getByText('系统', { exact: true })).toHaveCount(0)
      await expect(commandCenterNav.getByText('维护', { exact: true })).toHaveCount(0)

      const committedTheme = await fixture.page.evaluate(() => document.documentElement.dataset.hermesTheme)

      await fixture.page.keyboard.press('Meta+K')
      const palette = fixture.page.getByRole('dialog').last()
      await expect(palette).toBeVisible()

      for (const restrictedCommand of [
        'Reload desktop plugins',
        'Export profile…',
        'Import profile…',
        'New Agent…',
        'Toggle yolo off',
        'Toggle yolo on'
      ]) {
        await expect(palette.getByText(restrictedCommand, { exact: true })).toHaveCount(0)
      }

      await palette.getByRole('combobox').fill('terminal')
      await expect(palette.getByText('Toggle terminal', { exact: true })).toHaveCount(0)
      await expect
        .poll(() => fixture.page.evaluate(() => document.documentElement.dataset.hermesTheme))
        .toBe(committedTheme)

      await captureResponsive('command-palette')
    } finally {
      await fixture.cleanup()
    }
  })
})
