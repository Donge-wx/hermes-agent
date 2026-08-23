import type { Locator } from '@playwright/test'

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { expect, test } from './test'

interface MaterialSnapshot {
  readonly backdropFilter: string
  readonly backgroundColor: string
  readonly backgroundImage: string
  readonly borderRadius: number
  readonly boxShadow: string
}

interface ViewportCase {
  readonly height: number
  readonly name: string
  readonly width: number
}

const VIEWPORTS: readonly ViewportCase[] = [
  { name: 'desktop-1280', width: 1280, height: 768 },
  { name: 'compact-768', width: 768, height: 720 },
  { name: 'narrow-640', width: 640, height: 720 }
]

async function resizeWindow(fixture: MockBackendFixture, viewport: ViewportCase): Promise<void> {
  await fixture.app.evaluate(({ BrowserWindow: ElectronBrowserWindow }, size) => {
    const window = ElectronBrowserWindow.getAllWindows().at(0)

    window?.unmaximize()
    window?.setContentSize(size.width, size.height, false)
    window?.show()
    window?.focus()
  }, viewport)
  await fixture.page.waitForTimeout(250)
}

async function materialOf(locator: Locator): Promise<MaterialSnapshot> {
  return locator.evaluate(element => {
    const style = getComputedStyle(element)

    return {
      backdropFilter: style.backdropFilter,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderRadius: Number.parseFloat(style.borderRadius),
      boxShadow: style.boxShadow
    }
  })
}

test.describe('My King Liquid Glass shell chrome', () => {
  test('renders navigation, tool, profile, gateway, and version islands without changing their controls', async ({}, testInfo) => {
    test.setTimeout(300_000)
    const fixture = await setupMockBackend({ extraDisplayConfig: '  language: zh' })

    try {
      await waitForAppReady(fixture, 120_000)
      await fixture.page.evaluate(() => {
        document.documentElement.setAttribute('data-hermes-theme', 'liquid-glass')
        document.documentElement.setAttribute('data-hermes-mode', 'light')
        window.location.hash = '/'
      })
      for (const viewport of VIEWPORTS) {
        await resizeWindow(fixture, viewport)

        const sessionsTab = fixture.page
          .locator('[data-tree-tab="sessions"], [data-narrow-overlay-tab="sessions"]')
          .first()
        const primaryNav = fixture.page.locator(
          '[data-slot="sidebar-content"] > [data-slot="sidebar-group"]:first-child > [data-slot="sidebar-group-content"]'
        )
        const firstNavItem = primaryNav.locator('[data-sidebar="menu-button"]').first()
        const profileDock = fixture.page.locator('[data-slot="profile-rail"]')
        const systemTools = fixture.page.locator('.titlebar-tool-island').last()
        const statusbar = fixture.page.locator('[data-slot="statusbar"]')
        const versionCapsule = statusbar.locator(':scope > div:last-child > :last-child')
        const gatewayCapsule = statusbar.locator(':scope > div:first-child')
        const introRegions = [
          fixture.page.locator('[data-slot="aui_intro-lockup"]'),
          fixture.page.locator('[data-slot="aui_intro-headline"]'),
          fixture.page.locator('[data-slot="aui_intro-body"]')
        ] as const

        if (viewport.name === 'narrow-640' && (await sessionsTab.isVisible())) {
          await fixture.page.keyboard.press('Escape')
          await expect(sessionsTab).not.toBeVisible()
        }

        if (!(await sessionsTab.isVisible())) {
          await fixture.page.screenshot({
            animations: 'disabled',
            caret: 'hide',
            path: testInfo.outputPath(`my-king-liquid-glass-shell-chrome-${viewport.name}-collapsed.png`)
          })
          await fixture.page.locator('.titlebar-tool-island').first().locator('.titlebar-icon-button').first().click()
        }

        await expect(sessionsTab).toBeVisible()
        const tabStrip = sessionsTab.locator('xpath=../..')
        await expect(tabStrip).toBeVisible()
        await expect(primaryNav).toBeVisible()
        await expect(firstNavItem).toBeVisible()
        await expect(profileDock).toBeVisible()
        await expect(systemTools).toBeVisible()
        await expect(versionCapsule).toBeVisible()
        await expect(gatewayCapsule).toBeVisible()

        const [tabBox, navBox, firstNavBox, profileBox, versionBox, viewportMetrics] = await Promise.all([
          tabStrip.boundingBox(),
          primaryNav.boundingBox(),
          firstNavItem.boundingBox(),
          profileDock.boundingBox(),
          versionCapsule.boundingBox(),
          fixture.page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth
          }))
        ])

        if (!tabBox || !navBox || !firstNavBox || !profileBox || !versionBox) {
          throw new Error(`Liquid Glass shell chrome geometry is not measurable at ${viewport.name}`)
        }

        expect(tabBox.height).toBeCloseTo(40, 0)

        const sessionTabLabel = sessionsTab.locator(':scope > :first-child > :first-child')
        const [sessionTabBox, sessionTabLabelBox, sessionTabTypography] = await Promise.all([
          sessionsTab.boundingBox(),
          sessionTabLabel.boundingBox(),
          sessionTabLabel.evaluate(element => ({
            clientWidth: element.clientWidth,
            fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
            scrollWidth: element.scrollWidth,
            text: element.textContent
          }))
        ])

        if (!sessionTabBox || !sessionTabLabelBox) {
          throw new Error(`Liquid Glass sessions tab geometry is not measurable at ${viewport.name}`)
        }

        expect(sessionTabTypography.fontSize).toBeGreaterThanOrEqual(13)
        expect(sessionTabTypography.text?.toUpperCase()).toBe('SESSIONS')
        expect(sessionTabTypography.scrollWidth, JSON.stringify(sessionTabTypography)).toBeLessThanOrEqual(
          sessionTabTypography.clientWidth
        )
        expect(sessionTabLabelBox.x + sessionTabLabelBox.width / 2).toBeCloseTo(
          sessionTabBox.x + sessionTabBox.width / 2,
          0
        )
        expect(firstNavBox.height).toBeCloseTo(40, 0)
        expect(navBox.width).toBeGreaterThan(200)
        expect(profileBox.width).toBeLessThanOrEqual(tabBox.width)
        expect(versionBox.height).toBeCloseTo(26, 0)
        expect(viewportMetrics.scrollWidth).toBe(viewportMetrics.clientWidth)
        const navigationRightEdge = Math.max(
          tabBox.x + tabBox.width,
          navBox.x + navBox.width,
          profileBox.x + profileBox.width
        )

        for (const region of introRegions) {
          await expect(region).toBeVisible()
          const box = await region.boundingBox()

          if (!box) {
            throw new Error(`My King intro region is not measurable at ${viewport.name}`)
          }

          expect(
            box.x,
            `${viewport.name}: viewport=${viewportMetrics.clientWidth}, navigationRight=${navigationRightEdge}, region=${JSON.stringify(box)}`
          ).toBeGreaterThanOrEqual(navigationRightEdge - 1)
          expect(box.x + box.width).toBeLessThanOrEqual(viewportMetrics.clientWidth + 1)
        }

        const [navMaterial, profileMaterial, toolMaterial, versionMaterial, gatewayMaterial] = await Promise.all([
          materialOf(primaryNav),
          materialOf(profileDock),
          materialOf(systemTools),
          materialOf(versionCapsule),
          materialOf(gatewayCapsule)
        ])

        for (const material of [navMaterial, profileMaterial, versionMaterial, gatewayMaterial]) {
          expect(material.backgroundImage).not.toBe('none')
          expect(material.borderRadius).toBeGreaterThanOrEqual(12)
          expect(material.boxShadow).not.toBe('none')
        }

        expect(toolMaterial.backdropFilter).toBe('none')
        expect(toolMaterial.backgroundColor).toBe('rgba(0, 0, 0, 0)')
        expect(toolMaterial.backgroundImage).toBe('none')
        expect(toolMaterial.boxShadow).toBe('none')

        expect(await systemTools.locator('.titlebar-icon-button').count()).toBe(5)
        expect(await primaryNav.locator('[data-sidebar="menu-button"]').count()).toBeGreaterThanOrEqual(5)

        await fixture.page.screenshot({
          animations: 'disabled',
          caret: 'hide',
          path: testInfo.outputPath(`my-king-liquid-glass-shell-chrome-${viewport.name}.png`)
        })

        if (viewport.name === 'desktop-1280') {
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
        }
      }
    } finally {
      await fixture.cleanup()
    }
  })
})
