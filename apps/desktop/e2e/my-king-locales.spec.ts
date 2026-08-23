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
})
