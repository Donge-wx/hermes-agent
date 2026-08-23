import type { BrowserWindow } from 'electron'

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { expect, test } from './test'

interface ViewportCase {
  readonly expectedLockupWidth: number
  readonly height: number
  readonly name: string
  readonly width: number
}

const NARROW_VIEWPORT: ViewportCase = {
  name: 'narrow-640',
  width: 640,
  height: 720,
  expectedLockupWidth: 272
}

const VIEWPORTS: readonly ViewportCase[] = [
  { name: 'desktop-1280', width: 1280, height: 768, expectedLockupWidth: 320 },
  { name: 'compact-768', width: 768, height: 720, expectedLockupWidth: 272 },
  NARROW_VIEWPORT
]

async function resizeWindow(fixture: MockBackendFixture, viewport: ViewportCase): Promise<void> {
  await fixture.app.evaluate(({ BrowserWindow: ElectronBrowserWindow }, size) => {
    const window = ElectronBrowserWindow.getAllWindows()[0] as BrowserWindow | undefined

    window?.unmaximize()
    window?.setContentSize(size.width, size.height, false)
    window?.show()
    window?.focus()
  }, viewport)
  await fixture.page.waitForFunction(
    size => window.innerWidth === size.width && window.innerHeight === size.height,
    viewport
  )
}

test.describe('My King intro', () => {
  test('starts a clean profile in the branded light Liquid Glass appearance', async () => {
    test.setTimeout(300_000)
    const fixture = await setupMockBackend()

    try {
      await waitForAppReady(fixture, 120_000)

      await expect(fixture.page.locator('html')).toHaveAttribute('data-hermes-theme', 'liquid-glass')
      await expect(fixture.page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
    } finally {
      await fixture.cleanup()
    }
  })

  test('keeps the approved lockup at narrow width before theme attributes settle', async ({ browserName: _browserName }, testInfo) => {
    test.setTimeout(300_000)
    const fixture = await setupMockBackend()

    try {
      await waitForAppReady(fixture, 120_000)
      await fixture.page.evaluate(() => {
        document.documentElement.removeAttribute('data-hermes-theme')
        document.documentElement.removeAttribute('data-hermes-mode')
      })
      await resizeWindow(fixture, NARROW_VIEWPORT)

      const lockup = fixture.page.locator('[data-slot="aui_intro-lockup"]')
      const legacyNodes = fixture.page.locator('[data-slot^="aui_intro-legacy-"]')
      const lockupBox = await lockup.boundingBox()

      await expect(lockup).toBeVisible()
      await expect(legacyNodes).toHaveCount(0)
      expect(lockupBox?.width).toBeCloseTo(NARROW_VIEWPORT.expectedLockupWidth, 0)

      await fixture.page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: testInfo.outputPath('my-king-intro-narrow-no-theme-attributes.png')
      })
    } finally {
      await fixture.cleanup()
    }
  })

  test('keeps the approved full-color lockup large and centered across desktop widths', async ({ browserName: _browserName }, testInfo) => {
    test.setTimeout(300_000)
    const fixture = await setupMockBackend()

    try {
      await waitForAppReady(fixture, 120_000)
      await fixture.page.evaluate(() => {
        document.documentElement.setAttribute('data-hermes-theme', 'liquid-glass')
        document.documentElement.setAttribute('data-hermes-mode', 'light')
      })

      for (const viewport of VIEWPORTS) {
        await resizeWindow(fixture, viewport)

        const { page } = fixture
        const lockup = page.locator('[data-slot="aui_intro-lockup"]')
        const threadViewport = page.locator('[data-slot="aui_thread-viewport"]')
        const legacyNodes = page.locator('[data-slot^="aui_intro-legacy-"]')

        await expect(lockup).toBeVisible()
        await expect(legacyNodes).toHaveCount(0)

        const [lockupBox, threadBox, material, layering] = await Promise.all([
          lockup.boundingBox(),
          threadViewport.boundingBox(),
          lockup.evaluate(element => {
            const style = getComputedStyle(element)

            return {
              filter: style.filter,
              mixBlendMode: style.mixBlendMode,
              opacity: style.opacity
            }
          }),
          page.evaluate(() => {
            const backdrop = document.querySelector<HTMLElement>('[data-slot="app-backdrop"]')
            const content = document.querySelector<HTMLElement>('[data-slot="composer-bounds"]')

            return {
              backdrop: backdrop ? getComputedStyle(backdrop).zIndex : null,
              content: content ? getComputedStyle(content).zIndex : null
            }
          })
        ])

        if (!lockupBox || !threadBox) {
          throw new Error(`My King intro geometry is not measurable at ${viewport.name}`)
        }

        expect(lockupBox.width).toBeCloseTo(viewport.expectedLockupWidth, 0)
        expect(Math.abs(lockupBox.x + lockupBox.width / 2 - (threadBox.x + threadBox.width / 2))).toBeLessThanOrEqual(1)
        expect(material).toEqual({ filter: 'none', mixBlendMode: 'normal', opacity: '1' })
        expect(layering).toEqual({ backdrop: '0', content: '1' })

        await page.screenshot({
          animations: 'disabled',
          caret: 'hide',
          path: testInfo.outputPath(`my-king-intro-${viewport.name}.png`)
        })
      }
    } finally {
      await fixture.cleanup()
    }
  })
})
