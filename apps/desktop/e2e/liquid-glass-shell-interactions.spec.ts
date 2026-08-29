import type { Locator } from '@playwright/test'

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { expect, test } from './test'

interface MaterialSnapshot {
  readonly backgroundColor: string
  readonly backgroundImage: string
  readonly boxShadow: string
}

const DESKTOP_VIEWPORT = { height: 768, width: 1280 } as const

async function resizeWindow(fixture: MockBackendFixture): Promise<void> {
  await fixture.app.evaluate(({ BrowserWindow: ElectronBrowserWindow }, size) => {
    const window = ElectronBrowserWindow.getAllWindows().at(0)

    window?.unmaximize()
    window?.setContentSize(size.width, size.height, false)
    window?.show()
    window?.focus()
  }, DESKTOP_VIEWPORT)
  await fixture.page.waitForTimeout(250)
}

async function materialOf(locator: Locator): Promise<MaterialSnapshot> {
  return locator.evaluate(element => {
    const style = getComputedStyle(element)

    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow
    }
  })
}

test.describe('My King Liquid Glass shell chrome interactions', () => {
  test('preserves sidebar resizing and titlebar interaction states', async ({ browserName: _browserName }, testInfo) => {
    test.setTimeout(300_000)
    const fixture = await setupMockBackend({ extraDisplayConfig: '  language: zh' })

    try {
      await waitForAppReady(fixture, 120_000)
      await fixture.page.evaluate(() => {
        document.documentElement.setAttribute('data-hermes-theme', 'liquid-glass')
        document.documentElement.setAttribute('data-hermes-mode', 'light')
        window.location.hash = '/'
      })
      await resizeWindow(fixture)

      const sessionsTab = fixture.page
        .locator('[data-tree-tab="sessions"], [data-narrow-overlay-tab="sessions"]')
        .first()
      const primaryNav = fixture.page.locator(
        '[data-slot="sidebar-content"] > [data-slot="sidebar-group"]:first-child > [data-slot="sidebar-group-content"]'
      )
      const firstNavItem = primaryNav.locator('[data-sidebar="menu-button"]').first()
      const systemTools = fixture.page.locator('.titlebar-tool-island').last()

      if (!(await sessionsTab.isVisible())) {
        await fixture.page.locator('.titlebar-tool-island').first().locator('.titlebar-icon-button').first().click()
      }

      await expect(sessionsTab).toBeVisible()
      await expect(firstNavItem).toBeVisible()
      await expect(systemTools).toBeVisible()

      const sessionsGroup = fixture.page.locator('[data-tree-group]:has([data-tree-tab="sessions"])').first()
      const sidebar = sessionsGroup.locator('[data-slot="sidebar"]').first()

      await sessionsGroup.evaluate(element => {
        const track = element.parentElement

        if (track) {
          track.style.flex = '0 0 420px'
          track.style.maxWidth = 'none'
        }
      })
      await fixture.page.waitForTimeout(100)

      const [sessionsGroupBox, sidebarBox] = await Promise.all([sessionsGroup.boundingBox(), sidebar.boundingBox()])

      if (!sessionsGroupBox || !sidebarBox) {
        throw new Error('Resized Liquid Glass sidebar geometry is not measurable')
      }

      expect(sidebarBox.width).toBeCloseTo(sessionsGroupBox.width, 0)

      await fixture.page.mouse.move(0, 0)
      await fixture.page.waitForTimeout(180)
      const systemToolButtons = systemTools.locator('.titlebar-icon-button')
      const restingSystemTools = await Promise.all(
        Array.from({ length: await systemToolButtons.count() }, (_, index) => materialOf(systemToolButtons.nth(index)))
      )

      for (const [index, material] of restingSystemTools.entries()) {
        expect(material.backgroundColor, `resting system tool ${index}`).toBe('rgba(0, 0, 0, 0)')
        expect(material.backgroundImage, `resting system tool ${index}`).toBe('none')
        expect(material.boxShadow, `resting system tool ${index}`).toBe('none')
      }

      const firstSystemTool = systemToolButtons.nth(2)
      const restMaterial = await materialOf(firstSystemTool)

      await firstSystemTool.hover()
      await fixture.page.waitForTimeout(60)
      await fixture.page.screenshot({
        caret: 'hide',
        path: testInfo.outputPath('my-king-liquid-glass-shell-chrome-tool-hover-mid.png')
      })
      await fixture.page.waitForTimeout(180)
      const hoverMaterial = await materialOf(firstSystemTool)
      expect(hoverMaterial).not.toEqual(restMaterial)
      await fixture.page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: testInfo.outputPath('my-king-liquid-glass-shell-chrome-tool-hover-settled.png')
      })

      await firstSystemTool.click()
      await fixture.page.mouse.move(0, 0)
      await expect(firstSystemTool).toHaveAttribute('aria-pressed', 'true')
      const pressedMaterial = await materialOf(firstSystemTool)
      expect(pressedMaterial).not.toEqual(hoverMaterial)
      await fixture.page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: testInfo.outputPath('my-king-liquid-glass-shell-chrome-tool-toggled.png')
      })
      await firstSystemTool.click()

      await fixture.page.keyboard.press('Tab')
      await firstNavItem.focus()
      await expect(firstNavItem).toBeFocused()
      expect(await firstNavItem.evaluate(element => element.matches(':focus-visible'))).toBe(true)
      await fixture.page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: testInfo.outputPath('my-king-liquid-glass-shell-chrome-nav-focus.png')
      })

      const toolBox = await firstSystemTool.boundingBox()

      if (!toolBox) {
        throw new Error('Liquid Glass titlebar tool is not measurable for pressed-state QA')
      }

      await fixture.page.mouse.move(toolBox.x + toolBox.width / 2, toolBox.y + toolBox.height / 2)
      await fixture.page.mouse.down()
      await fixture.page.waitForTimeout(60)
      await fixture.page.screenshot({
        caret: 'hide',
        path: testInfo.outputPath('my-king-liquid-glass-shell-chrome-tool-pressed.png')
      })
      await fixture.page.mouse.move(0, 0)
      await fixture.page.mouse.up()
    } finally {
      await fixture.cleanup()
    }
  })
})
