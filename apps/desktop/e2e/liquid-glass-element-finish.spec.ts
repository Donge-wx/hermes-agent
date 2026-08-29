import type { Page } from '@playwright/test'

import { setupMockBackend, waitForAppReady, waitForDesktopApis } from './fixtures'
import { expect, test } from './test'

const THINKING_PROMPT = '请继续思考'

async function applyLiquidGlass(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('hermes-desktop-theme-v2', 'liquid-glass')
    localStorage.setItem('hermes-desktop-mode-v1', 'light')
    document.documentElement.setAttribute('data-hermes-theme', 'liquid-glass')
    document.documentElement.setAttribute('data-hermes-mode', 'light')
  })
}

test('Liquid Glass removes nested-card chrome from shell and conversation states', async () => {
  test.setTimeout(180_000)
  const fixture = await setupMockBackend({
    extraDisplayConfig: '  language: zh',
    mockServer: { holdFirstStreamForPrompt: THINKING_PROMPT }
  })

  try {
    await waitForAppReady(fixture, 120_000)
    await applyLiquidGlass(fixture.page)

    const navigationWell = fixture.page
      .locator('[data-slot="sidebar-content"] > [data-slot="sidebar-group"]')
      .first()
      .locator('[data-slot="sidebar-group-content"]')
    const emptyStage = fixture.page.locator('[data-slot="sidebar-empty-stage"]')

    await expect(navigationWell).toBeVisible()
    await expect(emptyStage).toBeVisible()
    expect(await navigationWell.evaluate(element => getComputedStyle(element).boxShadow)).toBe('none')
    expect(await emptyStage.evaluate(element => getComputedStyle(element).boxShadow)).toBe('none')

    const composer = fixture.page.locator('[data-slot="composer-rich-input"]').first()
    await composer.click()
    await composer.pressSequentially(THINKING_PROMPT)
    await fixture.page.keyboard.press('Enter')
    await fixture.mock.waitForHeldStream()

    const cognition = fixture.page.locator('[data-slot="aui_response-loading"]').last()
    // Streaming status can remount while its hint changes; resolve the pulse
    // independently so the assertion follows the live node, not a stale parent.
    const cognitionGlyph = fixture.page.locator('[data-slot="aui_cognition-pulse"]').last()

    await expect(cognition).toBeVisible()
    await expect(cognitionGlyph).toBeVisible()
    await expect
      .poll(() =>
        cognitionGlyph.evaluate(element => {
          const row = element.closest(':is([data-slot="aui_response-loading"], [data-slot="aui_turn-activity"])')

          if (!row || !element.isConnected || !row.isConnected) {
            return null
          }

          return {
            glyphBorder: getComputedStyle(element).borderStyle,
            glyphShadow: getComputedStyle(element).boxShadow,
            rowBorder: getComputedStyle(row).borderStyle,
            rowShadow: getComputedStyle(row).boxShadow
          }
        })
      )
      .toEqual({
        glyphBorder: 'none',
        glyphShadow: 'none',
        rowBorder: 'none',
        rowShadow: 'none'
      })
  } finally {
    fixture.mock.releaseHeldStream()
    await fixture.cleanup()
  }
})

test('Liquid Glass finishes empty, brand, skill, and MCP information surfaces', async () => {
  test.setTimeout(180_000)
  const fixture = await setupMockBackend({ extraDisplayConfig: '  language: zh' })

  try {
    await waitForAppReady(fixture, 120_000)
    await waitForDesktopApis(fixture.page, [
      '/api/messaging/platforms',
      '/api/skills',
      '/api/tools/toolsets',
      '/api/config',
      '/api/mcp/catalog'
    ])
    await applyLiquidGlass(fixture.page)

    await fixture.page.evaluate(() => {
      window.location.hash = '/command-center?section=sessions'
    })
    const commandCenterEmpty = fixture.page.locator('[data-slot="panel-empty"]')
    await expect(commandCenterEmpty).toBeVisible()
    await expect(commandCenterEmpty).toContainText('还没有会话')
    await expect(commandCenterEmpty).toContainText('开始对话后，会话会显示在这里。')

    await fixture.page.evaluate(() => {
      window.location.hash = '/settings?tab=about'
    })
    await expect(fixture.page.getByText('AI WROK OS', { exact: true })).toBeVisible()
    const aboutMark = fixture.page.locator('[data-slot="about-brand-mark"]')
    expect((await aboutMark.boundingBox())?.width).toBeGreaterThanOrEqual(128)

    await fixture.page.evaluate(() => {
      window.location.hash = '/skills?tab=skills'
    })
    await fixture.page.getByText('airtable', { exact: true }).first().click({ timeout: 30_000 })
    const skillMetadata = fixture.page.locator('[data-slot="skill-metadata"]').first()
    const skillBody = fixture.page.locator('[data-slot="skill-body"]').first()
    await expect(skillMetadata).toBeVisible()
    await expect(skillBody).toBeVisible()
    await expect(skillMetadata).toContainText('版本')
    await expect(skillMetadata).toContainText('支持平台')
    await expect(skillMetadata).not.toContainText(/^version$/)
    expect(await skillMetadata.evaluate(element => getComputedStyle(element).boxShadow)).toBe('none')
    expect(await skillBody.evaluate(element => getComputedStyle(element).boxShadow)).toBe('none')
    expect(await skillBody.evaluate(element => element.tagName)).toBe('ARTICLE')
    expect(await skillBody.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(
      15
    )
    await expect(skillBody.locator('h1, h2, h3').first()).toBeVisible()

    await fixture.page.evaluate(() => {
      window.location.hash = '/skills?tab=mcp'
    })
    const mcpWorkspace = fixture.page.locator('[data-slot="mcp-workspace"]')
    const catalogDescription = mcpWorkspace.locator('aside p').filter({ hasText: /workspace|projects|images/i }).first()
    const catalogInstall = mcpWorkspace.locator('aside button').filter({ hasText: '安装' }).first()
    const logEmpty = mcpWorkspace.locator('[data-slot="log-tail-empty"]')

    await expect(catalogDescription).toBeVisible()
    await expect(catalogInstall).toBeVisible()
    await expect(logEmpty).toBeVisible()
    expect(
      await catalogDescription.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))
    ).toBeGreaterThanOrEqual(14)
    expect((await catalogInstall.boundingBox())?.height).toBeGreaterThanOrEqual(36)
    expect(await logEmpty.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(
      13
    )

    expect(
      await catalogDescription.evaluate(element => {
        const probe = document.createElement('span')
        probe.style.color = 'var(--lg-ink-secondary)'
        element.append(probe)
        const matches = getComputedStyle(element).color === getComputedStyle(probe).color
        probe.remove()
        return matches
      })
    ).toBe(true)
    expect(
      await catalogInstall.evaluate(element => {
        const probe = document.createElement('span')
        probe.style.color = 'var(--lg-blue-hover)'
        element.append(probe)
        const matches = getComputedStyle(element).color === getComputedStyle(probe).color
        probe.remove()
        return matches
      })
    ).toBe(true)

    await fixture.page.evaluate(() => {
      window.location.hash = '/messaging'
    })
    const messagingField = fixture.page.locator('[data-slot="messaging-field"]').first()
    await expect(messagingField).toBeVisible()
    await expect(messagingField.locator('input').first()).toHaveAttribute('placeholder', '请输入应用 Client ID')
    expect(
      await messagingField.evaluate(element => {
        const style = getComputedStyle(element)
        return { background: style.backgroundColor, radius: style.borderRadius }
      })
    ).toEqual({ background: 'rgba(0, 0, 0, 0)', radius: '0px' })
  } finally {
    await fixture.cleanup()
  }
})

test('Liquid Glass keeps critical information surfaces finished at narrow width', async ({}, testInfo) => {
  test.setTimeout(240_000)
  const fixture = await setupMockBackend({ extraDisplayConfig: '  language: zh' })

  try {
    await waitForAppReady(fixture, 120_000)
    await waitForDesktopApis(fixture.page, [
      '/api/messaging/platforms',
      '/api/skills',
      '/api/tools/toolsets',
      '/api/config',
      '/api/mcp/catalog'
    ])
    await applyLiquidGlass(fixture.page)
    await fixture.app.evaluate(({ BrowserWindow: ElectronBrowserWindow }) => {
      const window = ElectronBrowserWindow.getAllWindows().at(0)

      window?.unmaximize()
      window?.setContentSize(640, 720, false)
      window?.show()
      window?.focus()
    })
    await expect
      .poll(() => fixture.page.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })))
      .toEqual({ height: 720, width: 640 })
    await fixture.page.evaluate(async () => {
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
    })

    const surfaces = [
      { name: 'messaging', ready: '[data-slot="master-detail"]', route: '/messaging' },
      { name: 'skills', ready: '[data-slot="master-detail"]', route: '/skills?tab=skills' },
      { name: 'mcp', ready: '[data-slot="mcp-workspace"]', route: '/skills?tab=mcp' },
      // Route overlays intentionally return to their prior durable page when
      // they close, so inspect About last instead of navigating through it.
      { name: 'about', ready: '[data-slot="about-brand-stage"]', route: '/settings?tab=about' }
    ] as const

    for (const surface of surfaces) {
      await fixture.page.evaluate(route => {
        window.location.hash = route
      }, surface.route)
      await expect.poll(() => fixture.page.evaluate(() => window.location.hash), { message: surface.name }).toBe(`#${surface.route}`)
      await expect(fixture.page.locator(surface.ready).first()).toBeVisible({ timeout: 30_000 })
      await fixture.page.evaluate(async () => {
        await document.fonts.ready
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
      })

      if (surface.name === 'messaging') {
        const platformRows = fixture.page.locator('[data-slot="messaging-platform-row"]')
        const firstPlatform = await platformRows.nth(0).boundingBox()
        const secondPlatform = await platformRows.nth(1).boundingBox()
        const field = await fixture.page.locator('[data-slot="messaging-field"]').first().boundingBox()
        const actionBar = await fixture.page.locator('[data-slot="detail-column-action-bar"]').boundingBox()

        expect(firstPlatform).not.toBeNull()
        expect(secondPlatform).not.toBeNull()
        expect(field).not.toBeNull()
        expect(actionBar).not.toBeNull()

        if (firstPlatform && secondPlatform) {
          expect(Math.abs(firstPlatform.y - secondPlatform.y)).toBeLessThanOrEqual(1)
        }

        const selectedPlatformShadow = await fixture.page
          .locator('[data-slot="messaging-platform-row"][data-selected="true"]')
          .first()
          .evaluate(element => getComputedStyle(element).boxShadow)
          .catch(() => null)

        if (selectedPlatformShadow) {
          expect(selectedPlatformShadow).toContain('inset')
        }

        if (field && actionBar) {
          expect(field.y + field.height).toBeLessThanOrEqual(actionBar.y)
        }
      }

      if (surface.name === 'skills') {
        const list = await fixture.page.locator('[data-slot="master-list-column"]').boundingBox()
        const thirdRow = await fixture.page.locator('[data-slot="cap-row"]').nth(2).boundingBox()

        expect(list).not.toBeNull()
        expect(thirdRow).not.toBeNull()

        if (list && thirdRow) {
          expect(thirdRow.y + thirdRow.height).toBeLessThanOrEqual(list.y + list.height)
        }
      }

      if (surface.name === 'mcp') {
        const catalogPane = await fixture.page.locator('[data-slot="mcp-workspace"] > aside').boundingBox()
        const emptyState = await fixture.page
          .locator('[data-slot="mcp-workspace"] > aside [data-slot="panel-empty"]')
          .boundingBox()
        const catalogLoader = fixture.page.locator('[data-slot="mcp-workspace"] > aside [data-slot="page-loader"]')

        expect(catalogPane).not.toBeNull()
        expect(emptyState).not.toBeNull()

        if (emptyState) {
          expect(emptyState.height).toBeLessThanOrEqual(176)
        }

        if (catalogPane && (await catalogLoader.isVisible())) {
          const loader = await catalogLoader.boundingBox()

          expect(loader).not.toBeNull()

          if (loader) {
            expect(loader.y + loader.height).toBeLessThanOrEqual(catalogPane.y + catalogPane.height)
          }
        }
      }

      const width = await fixture.page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth
      }))
      expect(width.scroll, surface.name).toBe(width.client)
      await fixture.page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: testInfo.outputPath(`my-king-narrow-${surface.name}.png`)
      })
    }
  } finally {
    await fixture.cleanup()
  }
})
