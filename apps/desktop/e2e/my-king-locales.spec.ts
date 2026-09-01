import fs from 'node:fs'
import path from 'node:path'

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { expect, test } from './test'

const NARROW_VIEWPORT = { width: 640, height: 720 } as const

async function resizeWindow(fixture: MockBackendFixture): Promise<void> {
  await fixture.app.evaluate(({ BrowserWindow: ElectronBrowserWindow }, size) => {
    const window = ElectronBrowserWindow.getAllWindows().at(0)

    window?.unmaximize()
    window?.setContentSize(size.width, size.height, false)
    window?.show()
    window?.focus()
  }, NARROW_VIEWPORT)
  await fixture.page.waitForFunction(
    size => window.innerWidth === size.width && window.innerHeight === size.height,
    NARROW_VIEWPORT
  )
}

function seedChineseBotProfiles(hermesHome: string): void {
  const profiles = [
    {
      directory: path.join(hermesHome, 'profiles', 'researcher'),
      title: '研究伙伴',
      description: '帮助整理研究资料和来源。',
      shape: 'circle',
      color: '#38bdf8'
    },
    {
      directory: path.join(hermesHome, 'profiles', 'writer'),
      title: '写作助手',
      description: '帮助起草、修改和润色文字。',
      shape: 'squircle',
      color: '#8b5cf6'
    }
  ] as const

  for (const profile of profiles) {
    fs.mkdirSync(profile.directory, { recursive: true })
    fs.writeFileSync(
      path.join(profile.directory, 'profile.yaml'),
      `description: ${profile.description}\nui_meta:\n  hermes-bots:\n    title: ${profile.title}\n    shape: ${profile.shape}\n    color: '${profile.color}'\n`,
      'utf8'
    )
  }
}

test.describe('My King narrow locale layouts', () => {
  test('keeps Japanese intro phrases intact at 640px', async ({ browserName: _browserName }, testInfo) => {
    test.setTimeout(300_000)
    const fixture = await setupMockBackend({ extraDisplayConfig: '  language: ja' })

    try {
      await waitForAppReady(fixture, 120_000)
      await resizeWindow(fixture)

      const headline = fixture.page.locator('[data-slot="aui_intro-headline"]')
      const phrases = headline.locator('[data-intro-phrase]')

      await expect(phrases).toHaveCount(2)
      await expect(phrases.nth(0)).toHaveText('あなたのワークスペースを、')
      await expect(phrases.nth(1)).toHaveText('一言で始めよう。')
      await expect(fixture.page.locator('html')).toHaveJSProperty('scrollWidth', 640)

      await fixture.page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: testInfo.outputPath('japanese-main-640.png')
      })
    } finally {
      await fixture.cleanup()
    }
  })

  test('localizes Arabic composer and gateway status at 640px', async ({ browserName: _browserName }, testInfo) => {
    test.setTimeout(300_000)
    const fixture = await setupMockBackend({ extraDisplayConfig: '  language: ar' })

    try {
      await waitForAppReady(fixture, 120_000)
      await resizeWindow(fixture)

      const page = fixture.page
      const composer = page.locator('[data-slot="composer-rich-input"]')
      const modelLabel = page.getByTestId('composer-model-label')
      const gateway = page.locator('[data-slot="statusbar"] button').filter({ hasText: 'البوابة' })

      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      await expect(composer).toHaveAttribute('data-placeholder', /[\u0600-\u06ff]/u)
      await expect(composer).not.toHaveAttribute('data-placeholder', /What are we building/u)
      await expect(modelLabel).toHaveAttribute('dir', 'ltr')
      await expect(modelLabel).toHaveCSS('direction', 'ltr')
      await expect(gateway).toHaveCount(1)

      const gatewayText = await gateway.textContent()

      expect(gatewayText?.match(/البوابة/gu)).toHaveLength(1)
      expect(gatewayText).toMatch(/(?:متصلة|جاهزة)/u)
      await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 640)

      await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: testInfo.outputPath('arabic-main-640.png')
      })
    } finally {
      await fixture.cleanup()
    }
  })

  test('localizes the Bot roster and new-agent dialog', async ({ browserName: _browserName }, testInfo) => {
    test.setTimeout(300_000)
    const fixture = await setupMockBackend({ extraDisplayConfig: '  language: en' })

    try {
      seedChineseBotProfiles(fixture.sandbox.hermesHome)
      await waitForAppReady(fixture, 120_000)

      const botPaneTab = fixture.page
        .locator('[data-tree-tab="hermes-bots:pane"]:visible, [data-narrow-overlay-tab="hermes-bots:pane"]:visible')
        .first()

      await expect(botPaneTab).toBeVisible({ timeout: 30_000 })
      await expect(botPaneTab).toContainText('Bots')

      await fixture.page.keyboard.press('Meta+K')
      const englishPalette = fixture.page.getByRole('dialog').last()
      await expect(englishPalette.getByText('Toggle Bots tab', { exact: true })).toBeVisible()
      await englishPalette.press('Escape')
      await expect(fixture.page.locator('[data-slot="command-palette"]')).toHaveCount(0)

      await botPaneTab.click({ button: 'right' })
      const englishZoneMenu = fixture.page.getByRole('menu').last()
      await expect(englishZoneMenu.getByText('Hide Bots', { exact: true })).toBeVisible()
      await fixture.page.keyboard.press('Escape')

      const botPaneTabBox = await botPaneTab.boundingBox()

      if (!botPaneTabBox) {
        throw new Error('Bots pane tab is not measurable')
      }

      await fixture.page.mouse.click(botPaneTabBox.x + botPaneTabBox.width / 2, botPaneTabBox.y + botPaneTabBox.height / 2)

      const routinesTab = fixture.page
        .locator('[data-tree-tab="hermes-bots:routines"]:visible, [data-narrow-overlay-tab="hermes-bots:routines"]:visible')
        .first()

      await expect(routinesTab).toContainText('Cronjobs', { timeout: 30_000 })

      await fixture.page.evaluate(() => {
        window.location.hash = '/settings?tab=config:appearance'
      })
      await fixture.page.getByRole('button', { name: 'Switch language' }).click()
      const languageSearch = fixture.page.getByPlaceholder('Search languages')
      await languageSearch.fill('Simplified Chinese')
      await languageSearch.press('Enter')

      await expect(fixture.page.locator('html')).toHaveAttribute('lang', 'zh')
      await expect(botPaneTab).toContainText('智能体')
      await expect(routinesTab).toContainText('定时任务')
      await fixture.page.evaluate(() => {
        window.location.hash = '/'
      })

      await fixture.page.keyboard.press('Meta+K')
      const chinesePalette = fixture.page.getByRole('dialog').last()
      await expect(chinesePalette.getByText('切换 智能体 标签', { exact: true })).toBeVisible()
      await chinesePalette.press('Escape')
      await expect(fixture.page.locator('[data-slot="command-palette"]')).toHaveCount(0)

      await botPaneTab.click({ button: 'right' })
      const chineseZoneMenu = fixture.page.getByRole('menu').last()
      await expect(chineseZoneMenu.getByText('隐藏 智能体', { exact: true })).toBeVisible()
      await fixture.page.keyboard.press('Escape')

      const roster = fixture.page.locator('.hermes-bots-roster')
      await expect(botPaneTab).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 })
      await expect(roster).toBeVisible({ timeout: 30_000 })
      await expect(roster.getByText('研究伙伴', { exact: true })).toBeVisible({ timeout: 20_000 })
      await expect(roster.getByText('写作助手', { exact: true })).toBeVisible({ timeout: 20_000 })
      await expect(fixture.page.getByRole('textbox', { name: '搜索智能体' })).toBeVisible({ timeout: 20_000 })

      await fixture.page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: testInfo.outputPath('bots-roster-zh.png')
      })

      await fixture.page.getByRole('button', { name: '新建智能体', exact: true }).click()
      const dialog = fixture.page.getByRole('dialog').last()
      await expect(dialog).toBeVisible({ timeout: 20_000 })
      await expect(dialog.getByText('新建智能体', { exact: true })).toBeVisible()
      await expect(dialog.getByText('名称', { exact: true })).toBeVisible()
      await expect(dialog.getByText('角色标题', { exact: true })).toBeVisible()
      await expect(dialog.getByText('说明', { exact: true })).toBeVisible()
      await expect(dialog.getByPlaceholder('例如 researcher')).toBeVisible()
      await expect(dialog.getByRole('button', { name: '创建智能体' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: '取消' })).toBeVisible()

      await fixture.page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: testInfo.outputPath('bots-new-agent-zh.png')
      })
    } finally {
      await fixture.cleanup()
    }
  })
})
