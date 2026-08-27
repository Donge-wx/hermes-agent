import type { Locator } from '@playwright/test'

import { type MockBackendFixture, setupMockBackend, waitForAppReady, waitForDesktopApis } from './fixtures'
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
  test('keeps the Command Center hit target at 28px, paints a 22px glyph, and opens its overlay', async ({}, testInfo) => {
    test.setTimeout(180_000)
    const fixture = await setupMockBackend({ extraDisplayConfig: '  language: zh' })

    try {
      await waitForAppReady(fixture, 120_000)
      await fixture.page.evaluate(() => {
        document.documentElement.setAttribute('data-hermes-theme', 'liquid-glass')
        document.documentElement.setAttribute('data-hermes-mode', 'light')
      })

      const commandCenterGlyph = fixture.page.locator('[data-slot="statusbar"] .lg-statusbar-command-glyph')
      const commandCenterButton = commandCenterGlyph.locator('xpath=ancestor::button[1]')
      await expect(commandCenterButton).toBeVisible()

      const [buttonBox, glyphBox] = await Promise.all([
        commandCenterButton.boundingBox(),
        commandCenterGlyph.boundingBox()
      ])

      if (!buttonBox || !glyphBox) {
        throw new Error('Command Center geometry is not measurable')
      }

      expect(buttonBox.width).toBe(28)
      // The vertical hit target follows the statusbar's platform-specific
      // rendered height (26px in the real Electron window), so only bound it
      // to the accepted compact bar range. Width is the fixed affordance.
      expect(buttonBox.height).toBeGreaterThanOrEqual(24)
      expect(buttonBox.height).toBeLessThanOrEqual(28)
      expect(glyphBox.width).toBe(22)
      expect(glyphBox.height).toBe(22)

      await commandCenterButton.click()
      await expect(fixture.page.locator('[data-overlay-surface]')).toBeVisible()
      await expect(fixture.page.locator('[data-slot="overlay-split-layout"]')).toBeVisible()
      await fixture.page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: testInfo.outputPath('my-king-command-center-open.png')
      })
    } finally {
      await fixture.cleanup()
    }
  })

  test('keeps the Command Center glyph at the baseline size outside Liquid Glass light mode', async () => {
    test.setTimeout(180_000)
    const fixture = await setupMockBackend({ extraDisplayConfig: '  language: zh' })

    try {
      await waitForAppReady(fixture, 120_000)
      const commandCenterGlyph = fixture.page.locator('[data-slot="statusbar"] .lg-statusbar-command-glyph')

      for (const theme of [
        { mode: 'light', name: 'nous' },
        { mode: 'dark', name: 'liquid-glass' }
      ] as const) {
        await fixture.page.evaluate(nextTheme => {
          document.documentElement.setAttribute('data-hermes-theme', nextTheme.name)
          document.documentElement.setAttribute('data-hermes-mode', nextTheme.mode)
        }, theme)
        await expect(commandCenterGlyph).toBeVisible()

        const size = await commandCenterGlyph.evaluate(element => {
          const style = getComputedStyle(element)

          return {
            height: Number.parseFloat(style.height),
            width: Number.parseFloat(style.width)
          }
        })

        expect(size.width, `${theme.name}/${theme.mode}`).toBeCloseTo(14, 0)
        expect(size.height, `${theme.name}/${theme.mode}`).toBeCloseTo(14, 0)
      }
    } finally {
      await fixture.cleanup()
    }
  })

  test('renders navigation, tool, gateway, and version islands without changing their controls', async ({
    browserName: _browserName
  }, testInfo) => {
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
        const commandCenterGlyph = statusbar.locator('.lg-statusbar-command-glyph')
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
        // Profile management is intentionally unavailable in the managed
        // employee shell. Keep the implementation intact, but do not leave an
        // empty or misleading rail in the branded navigation.
        await expect(profileDock).toHaveCount(0)
        await expect(systemTools).toBeVisible()
        await expect(versionCapsule).toBeVisible()
        await expect(gatewayCapsule).toBeVisible()
        await expect(commandCenterGlyph).toBeVisible()

        const commandCenterGlyphSize = await commandCenterGlyph.evaluate(element => {
          const style = getComputedStyle(element)

          return {
            height: Number.parseFloat(style.height),
            width: Number.parseFloat(style.width)
          }
        })

        // Liquid Glass uses the named 22px glyph token while its parent keeps
        // the pre-existing statusbar hit area and command-center behavior.
        expect(commandCenterGlyphSize.width).toBeCloseTo(22, 0)
        expect(commandCenterGlyphSize.height).toBeCloseTo(22, 0)

        const [tabBox, navBox, firstNavBox, versionBox, viewportMetrics] = await Promise.all([
          tabStrip.boundingBox(),
          primaryNav.boundingBox(),
          firstNavItem.boundingBox(),
          versionCapsule.boundingBox(),
          fixture.page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth
          }))
        ])

        if (!tabBox || !navBox || !firstNavBox || !versionBox) {
          throw new Error(`Liquid Glass shell chrome geometry is not measurable at ${viewport.name}`)
        }

        expect(tabBox.height).toBeCloseTo(44, 0)

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
        expect(sessionTabTypography.text).toBe('会话')
        expect(sessionTabTypography.scrollWidth, JSON.stringify(sessionTabTypography)).toBeLessThanOrEqual(
          sessionTabTypography.clientWidth
        )
        expect(sessionTabLabelBox.x + sessionTabLabelBox.width / 2).toBeCloseTo(
          sessionTabBox.x + sessionTabBox.width / 2,
          0
        )
        expect(firstNavBox.height).toBeCloseTo(44, 0)
        expect(navBox.width).toBeGreaterThan(200)
        expect(versionBox.height).toBeCloseTo(26, 0)
        expect(viewportMetrics.scrollWidth).toBe(viewportMetrics.clientWidth)
        const navigationRightEdge = Math.max(tabBox.x + tabBox.width, navBox.x + navBox.width)
        const composerInput = fixture.page.locator('[data-slot="composer-rich-input"]').first()
        const composerInputBox = await composerInput.boundingBox()

        if (!composerInputBox) {
          throw new Error(`Composer input geometry is not measurable at ${viewport.name}`)
        }

        expect(composerInputBox.x, `${viewport.name}: ${JSON.stringify(composerInputBox)}`).toBeGreaterThanOrEqual(
          navigationRightEdge - 1
        )
        expect(composerInputBox.width, `${viewport.name}: ${JSON.stringify(composerInputBox)}`).toBeGreaterThanOrEqual(
          96
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

        const [navMaterial, toolMaterial, versionMaterial, gatewayMaterial] = await Promise.all([
          materialOf(primaryNav),
          materialOf(systemTools),
          materialOf(versionCapsule),
          materialOf(gatewayCapsule)
        ])

        expect(navMaterial.backgroundImage).toBe('none')
        expect(navMaterial.borderRadius).toBe(0)
        expect(navMaterial.boxShadow).toBe('none')

        for (const material of [versionMaterial, gatewayMaterial]) {
          expect(material.backgroundImage).not.toBe('none')
          expect(material.borderRadius).toBeGreaterThanOrEqual(12)
          expect(material.boxShadow).not.toBe('none')
        }

        expect(toolMaterial.backdropFilter).toBe('none')
        expect(toolMaterial.backgroundColor).toBe('rgba(0, 0, 0, 0)')
        expect(toolMaterial.backgroundImage).toBe('none')
        expect(toolMaterial.boxShadow).toBe('none')

        expect(await systemTools.locator('.titlebar-icon-button').count()).toBe(5)
        expect(await primaryNav.locator('[data-sidebar="menu-button"]').count()).toBe(4)

        await fixture.page.screenshot({
          animations: 'disabled',
          caret: 'hide',
          path: testInfo.outputPath(`my-king-liquid-glass-shell-chrome-${viewport.name}.png`)
        })
      }
    } finally {
      await fixture.cleanup()
    }
  })

  test('keeps every managed workspace surface on the same readable visual scale', async ({}, testInfo) => {
    test.setTimeout(300_000)
    const fixture = await setupMockBackend({ extraDisplayConfig: '  language: zh' })

    try {
      await waitForAppReady(fixture, 120_000)
      await waitForDesktopApis(fixture.page, [
        '/api/config',
        '/api/messaging/platforms',
        '/api/skills',
        '/api/tools/toolsets',
        '/api/mcp/catalog'
      ])
      await resizeWindow(fixture, { name: 'desktop-1280', width: 1280, height: 768 })
      await fixture.page.evaluate(() => {
        document.documentElement.setAttribute('data-hermes-theme', 'liquid-glass')
        document.documentElement.setAttribute('data-hermes-mode', 'light')
      })

      const surfaces = [
        { name: 'settings-appearance', route: '/settings?tab=config%3Aappearance', ready: '[data-slot="theme-card"]' },
        { name: 'settings-about', route: '/settings?tab=about', ready: '[data-slot="about-brand-stage"]' },
        { name: 'settings-gateway', route: '/settings?tab=gateway', ready: '[data-overlay-surface]' },
        {
          name: 'settings-providers',
          route: '/settings?tab=providers',
          ready: '[data-slot="settings-content"]:not([data-loading="true"])'
        },
        {
          name: 'settings-keys',
          route: '/settings?tab=keys',
          ready: '[data-slot="settings-content"]:not([data-loading="true"])'
        },
        { name: 'messaging', route: '/messaging', ready: '[data-slot="master-detail"]' },
        { name: 'skills', route: '/skills?tab=skills', ready: '[data-slot="master-detail"]' },
        { name: 'tools', route: '/skills?tab=toolsets', ready: '[data-slot="master-detail"]' },
        { name: 'mcp', route: '/skills?tab=mcp', ready: '[data-slot="mcp-workspace"]' },
        { name: 'artifacts', route: '/artifacts', ready: '[data-slot="panel-empty"]' }
      ] as const

      for (const surface of surfaces) {
        await fixture.page.evaluate(route => {
          window.location.hash = route
        }, surface.route)
        await expect(fixture.page.locator(surface.ready).first()).toBeVisible({ timeout: 30_000 })
        await fixture.page.waitForTimeout(300)

        const viewportMetrics = await fixture.page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth
        }))
        const visibleText = await fixture.page.locator('body').innerText()

        expect(viewportMetrics.scrollWidth, surface.name).toBe(viewportMetrics.clientWidth)
        expect(visibleText, surface.name).not.toMatch(/\bHermes\b/i)

        const activeNavigationItems = fixture.page.locator(
          '[data-sidebar="menu-button"][data-active="true"], [data-slot="overlay-nav-item"][aria-current="page"]'
        )
        const navigationOuterShadowCounts = await activeNavigationItems.evaluateAll(elements =>
          elements.map(element => {
            const shadow = getComputedStyle(element).boxShadow
            if (shadow === 'none') return 0

            const layers: string[] = []
            let depth = 0
            let start = 0

            for (let index = 0; index < shadow.length; index += 1) {
              const character = shadow[index]

              if (character === '(') depth += 1
              if (character === ')') depth -= 1
              if (character === ',' && depth === 0) {
                layers.push(shadow.slice(start, index))
                start = index + 1
              }
            }
            layers.push(shadow.slice(start))

            return layers.filter(layer => !layer.includes('inset')).length
          })
        )
        expect(navigationOuterShadowCounts.length, surface.name).toBeGreaterThan(0)
        expect(navigationOuterShadowCounts, surface.name).toEqual(navigationOuterShadowCounts.map(() => 0))

        if (surface.name === 'artifacts') {
          const [contentBox, emptyStateBox] = await Promise.all([
            fixture.page.locator('[data-slot="page-shell-content"]').boundingBox(),
            fixture.page.locator('[data-slot="panel-empty"] > div').boundingBox()
          ])

          if (!contentBox || !emptyStateBox) {
            throw new Error('Artifacts empty-state geometry is not measurable')
          }

          const centerDelta = Math.abs(
            emptyStateBox.y + emptyStateBox.height / 2 - (contentBox.y + contentBox.height / 2)
          )

          expect(centerDelta).toBeLessThanOrEqual(24)
        }

        await fixture.page.screenshot({
          animations: 'disabled',
          caret: 'hide',
          path: testInfo.outputPath(`my-king-surface-${surface.name}.png`)
        })
      }
    } finally {
      await fixture.cleanup()
    }
  })
})
