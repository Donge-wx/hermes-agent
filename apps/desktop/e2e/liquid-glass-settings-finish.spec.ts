import type { Page } from '@playwright/test'

import { type MockBackendFixture, setupMockBackend, waitForAppReady, waitForDesktopApis } from './fixtures'
import { expect, test } from './test'

const DESKTOP_VIEWPORT = { height: 768, width: 1280 } as const

async function prepareSettingsSurface(fixture: MockBackendFixture, page: Page): Promise<void> {
  await waitForAppReady(fixture, 120_000)
  await fixture.app.evaluate(({ BrowserWindow: ElectronBrowserWindow }, size) => {
    const window = ElectronBrowserWindow.getAllWindows().at(0)

    window?.unmaximize()
    window?.setContentSize(size.width, size.height, false)
    window?.show()
    window?.focus()
  }, DESKTOP_VIEWPORT)
  await page.evaluate(() => {
    localStorage.setItem('hermes-desktop-theme-v2', 'liquid-glass')
    localStorage.setItem('hermes-desktop-mode-v1', 'light')
    document.documentElement.setAttribute('data-hermes-theme', 'liquid-glass')
    document.documentElement.setAttribute('data-hermes-mode', 'light')
  })
}

async function waitForBackendApi(page: Page, path: string): Promise<void> {
  const deadline = Date.now() + 60_000

  for (;;) {
    try {
      await page.evaluate(apiPath => window.hermesDesktop.api({ method: 'GET', path: apiPath }), path)
      return
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await page.waitForTimeout(500)
    }
  }
}

test('Liquid Glass credentials read as one continuous settings list', async ({}, testInfo) => {
  test.setTimeout(180_000)
  const fixture = await setupMockBackend({ extraDisplayConfig: '  language: zh' })

  try {
    await prepareSettingsSurface(fixture, fixture.page)
    await waitForBackendApi(fixture.page, '/api/env')
    await fixture.page.evaluate(() => {
      window.location.hash = '/settings?tab=keys'
    })

    const list = fixture.page.locator('[data-slot="credential-list"]')
    const rows = list.locator('[data-slot="credential-row"]')
    const activeParentNav = fixture.page.locator('[data-tour="nav-keys"]')
    const activeNestedNav = fixture.page.locator('[data-tour="nav-kview:tools"]')

    await expect(list).toBeVisible({ timeout: 60_000 })
    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-settings-credentials-route.png')
    })
    await expect(activeParentNav).toHaveAttribute('data-expanded', 'true')
    await expect(activeNestedNav).toHaveAttribute('data-nested', 'true')
    expect(await rows.count()).toBeGreaterThanOrEqual(6)

    const firstRow = rows.first()
    const firstField = firstRow.locator('[data-slot="input"]').first()
    const firstLabel = firstRow.locator('[data-slot="credential-display-name"]')
    const firstTechnicalId = firstRow.locator('[data-slot="credential-technical-id"]')

    await expect(firstLabel).toBeVisible()
    await expect(firstTechnicalId).toBeVisible()
    expect((await firstLabel.textContent())?.trim()).not.toBe((await firstTechnicalId.textContent())?.trim())
    const [listBox, rowBox, labelBox, fieldBox, fieldMaterial, parentNavMaterial, nestedNavMaterial] =
      await Promise.all([
        list.boundingBox(),
        firstRow.boundingBox(),
        firstRow.locator('span').filter({ hasText: /\S/ }).first().boundingBox(),
        firstField.boundingBox(),
        firstField.evaluate(element => {
          const style = getComputedStyle(element)

          return {
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            borderStyle: style.borderStyle,
            fontSize: Number.parseFloat(style.fontSize)
          }
        }),
        activeParentNav.evaluate(element => ({ boxShadow: getComputedStyle(element).boxShadow })),
        activeNestedNav.evaluate(element => ({ boxShadow: getComputedStyle(element).boxShadow }))
      ])

    if (!listBox || !rowBox || !labelBox || !fieldBox) {
      throw new Error('Credential settings geometry is not measurable')
    }

    expect(listBox.width).toBeLessThanOrEqual(880)
    expect(fieldBox.height).toBeGreaterThanOrEqual(38)
    expect(fieldBox.width / rowBox.width).toBeGreaterThanOrEqual(0.38)
    expect(fieldBox.width / rowBox.width).toBeLessThanOrEqual(0.68)
    expect(fieldBox.x - (labelBox.x + labelBox.width)).toBeLessThanOrEqual(128)
    expect(fieldMaterial.fontSize).toBeGreaterThanOrEqual(14)
    expect(fieldMaterial.borderStyle).toBe('solid')
    expect(fieldMaterial.backgroundColor === 'rgba(0, 0, 0, 0)' && fieldMaterial.backgroundImage === 'none').toBe(false)
    expect(parentNavMaterial.boxShadow).toBe('none')
    expect(nestedNavMaterial.boxShadow).toBe('none')

    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-settings-credentials-rest.png')
    })

    await firstRow.click()
    await expect(firstRow).toHaveAttribute('data-expanded', 'true')
    expect((await firstRow.boundingBox())?.height).toBeGreaterThan(rowBox.height)
    await firstField.focus()
    const focusMaterial = await firstField.evaluate(element => {
      const style = getComputedStyle(element)
      const shadowLayers: string[] = []
      let depth = 0
      let start = 0

      for (let index = 0; index < style.boxShadow.length; index += 1) {
        const character = style.boxShadow[index]

        if (character === '(') depth += 1
        if (character === ')') depth -= 1
        if (character === ',' && depth === 0) {
          shadowLayers.push(style.boxShadow.slice(start, index))
          start = index + 1
        }
      }
      shadowLayers.push(style.boxShadow.slice(start))

      return {
        borderColor: style.borderColor,
        outerShadowCount: shadowLayers.filter(layer => !layer.includes('inset')).length,
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth)
      }
    })
    expect(focusMaterial.outerShadowCount).toBe(0)
    expect(focusMaterial.borderColor).not.toBe(focusMaterial.outlineColor)
    expect(focusMaterial.outlineStyle).toBe('solid')
    expect(focusMaterial.outlineWidth).toBeGreaterThanOrEqual(2)
    const expandedMaterial = await firstRow.locator('> :first-child').evaluate(element => {
      const style = getComputedStyle(element)

      return {
        borderRadius: Number.parseFloat(style.borderRadius),
        boxShadow: style.boxShadow
      }
    })
    expect(expandedMaterial.borderRadius).toBe(0)
    expect(expandedMaterial.boxShadow).toContain('inset')

    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-settings-credentials-expanded.png')
    })
  } finally {
    await fixture.cleanup()
  }
})

test('Liquid Glass gateway modes form one unified two-by-two choice surface', async ({}, testInfo) => {
  test.setTimeout(180_000)
  const fixture = await setupMockBackend({ extraDisplayConfig: '  language: zh' })

  try {
    await prepareSettingsSurface(fixture, fixture.page)
    await fixture.page.evaluate(() => {
      window.location.hash = '/settings?tab=gateway'
    })

    const choices = fixture.page.locator('[data-slot="settings-content"] .auto-rows-fr > .selectable-card')
    const surface = choices.locator('..')

    await expect(choices.first()).toBeVisible({ timeout: 30_000 })
    await expect(choices).toHaveCount(4)

    const [surfaceMaterial, firstBox, secondBox, thirdBox, activeMaterial] = await Promise.all([
      surface.evaluate(element => {
        const style = getComputedStyle(element)

        return {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          borderRadius: Number.parseFloat(style.borderRadius),
          boxShadow: style.boxShadow,
          gap: Number.parseFloat(style.gap)
        }
      }),
      choices.nth(0).boundingBox(),
      choices.nth(1).boundingBox(),
      choices.nth(2).boundingBox(),
      choices
        .filter({ has: fixture.page.locator('.text-primary') })
        .first()
        .evaluate(element => {
          const style = getComputedStyle(element)

          return {
            backgroundImage: style.backgroundImage,
            borderStyle: style.borderStyle,
            boxShadow: style.boxShadow
          }
        })
    ])

    if (!firstBox || !secondBox || !thirdBox) {
      throw new Error('Gateway choice geometry is not measurable')
    }

    expect(surfaceMaterial.borderRadius).toBeGreaterThanOrEqual(16)
    expect(surfaceMaterial.gap).toBeGreaterThan(0)
    expect(surfaceMaterial.gap).toBeLessThanOrEqual(2)
    expect(surfaceMaterial.backgroundColor === 'rgba(0, 0, 0, 0)' && surfaceMaterial.backgroundImage === 'none').toBe(
      false
    )
    expect(surfaceMaterial.boxShadow).not.toBe('none')
    expect(Math.abs(firstBox.y - secondBox.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(firstBox.x - thirdBox.x)).toBeLessThanOrEqual(1)
    expect(firstBox.height).toBeGreaterThanOrEqual(96)
    expect(activeMaterial.borderStyle).toBe('none')
    expect(activeMaterial.backgroundImage).not.toBe('none')
    expect(activeMaterial.boxShadow).toBe('none')

    const viewportWidth = await fixture.page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    }))
    expect(viewportWidth.scroll).toBe(viewportWidth.client)

    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-settings-gateway-rest.png')
    })

    await choices.nth(2).click()
    await expect(choices.nth(2)).toHaveClass(/selectable-card-active/)
  } finally {
    await fixture.cleanup()
  }
})

test('Liquid Glass provider accounts form one continuous disclosure list', async ({}, testInfo) => {
  test.setTimeout(180_000)
  const fixture = await setupMockBackend({ extraDisplayConfig: '  language: zh' })

  try {
    await prepareSettingsSurface(fixture, fixture.page)
    await waitForBackendApi(fixture.page, '/api/providers/oauth')
    await fixture.page.evaluate(() => {
      window.location.hash = '/settings?tab=providers'
    })

    const list = fixture.page.locator('[data-slot="provider-account-list"]')
    const rows = list.locator('[data-slot="provider-account-row"]')
    const disclosure = list.locator('[data-slot="provider-account-disclosure"]')

    await expect(list).toBeVisible({ timeout: 30_000 })
    await expect(disclosure).toBeVisible()
    expect(await rows.count()).toBeGreaterThanOrEqual(2)

    const [listBox, firstBox, secondBox, disclosureBox, material] = await Promise.all([
      list.boundingBox(),
      rows.nth(0).boundingBox(),
      rows.nth(1).boundingBox(),
      disclosure.boundingBox(),
      list.evaluate(element => {
        const style = getComputedStyle(element)

        return {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          borderRadius: Number.parseFloat(style.borderRadius),
          boxShadow: style.boxShadow
        }
      })
    ])

    if (!listBox || !firstBox || !secondBox || !disclosureBox) {
      throw new Error('Provider account list geometry is not measurable')
    }

    expect(listBox.width).toBeLessThanOrEqual(880)
    expect(firstBox.height).toBeGreaterThanOrEqual(56)
    expect(secondBox.y - (firstBox.y + firstBox.height)).toBeLessThanOrEqual(2)
    expect(disclosureBox.y - (secondBox.y + secondBox.height)).toBeLessThanOrEqual(2)
    expect(disclosureBox.width).toBeGreaterThanOrEqual(listBox.width - 4)
    expect(material.borderRadius).toBeGreaterThanOrEqual(16)
    expect(material.backgroundColor === 'rgba(0, 0, 0, 0)' && material.backgroundImage === 'none').toBe(false)
    expect(material.boxShadow).not.toBe('none')

    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-settings-providers-collapsed.png')
    })

    await disclosure.click()
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(await rows.count()).toBeGreaterThan(2)

    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-settings-providers-expanded.png')
    })
  } finally {
    await fixture.cleanup()
  }
})

test('Liquid Glass MCP keeps its empty guidance compact at desktop width', async ({}, testInfo) => {
  test.setTimeout(180_000)
  const fixture = await setupMockBackend({ extraDisplayConfig: '  language: zh' })

  try {
    await prepareSettingsSurface(fixture, fixture.page)
    await waitForDesktopApis(fixture.page, ['/api/config', '/api/mcp/catalog'])
    await fixture.page.evaluate(() => {
      window.location.hash = '/skills?tab=mcp'
    })

    const workspace = fixture.page.locator('[data-slot="mcp-workspace"]')
    const master = workspace.locator('> aside')
    const empty = master.locator('[data-slot="panel-empty"]')
    const rows = master.locator('[data-slot="mcp-catalog-row"]')
    const editorHeader = workspace.locator('[data-slot="json-document-editor-header"]')

    await expect(empty).toBeVisible({ timeout: 30_000 })
    await expect(rows.nth(2)).toBeVisible({ timeout: 30_000 })
    await expect(editorHeader).toBeVisible()

    const [masterBox, emptyBox, firstRowBox, thirdRowBox, editorHeaderBox] = await Promise.all([
      master.boundingBox(),
      empty.boundingBox(),
      rows.nth(0).boundingBox(),
      rows.nth(2).boundingBox(),
      editorHeader.boundingBox()
    ])

    if (!masterBox || !emptyBox || !firstRowBox || !thirdRowBox || !editorHeaderBox) {
      throw new Error('MCP desktop geometry is not measurable')
    }

    expect(emptyBox.height).toBeLessThanOrEqual(152)
    expect(firstRowBox.height).toBeGreaterThanOrEqual(72)
    expect(editorHeaderBox.height).toBeGreaterThanOrEqual(40)
    expect(firstRowBox.y).toBeLessThanOrEqual(masterBox.y + 260)
    expect(thirdRowBox.y + thirdRowBox.height).toBeLessThanOrEqual(masterBox.y + masterBox.height)

    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-mcp-desktop-rest.png')
    })
  } finally {
    await fixture.cleanup()
  }
})

test('Liquid Glass toolset detail separates summary from usable tool chips', async ({}, testInfo) => {
  test.setTimeout(180_000)
  const fixture = await setupMockBackend({ extraDisplayConfig: '  language: zh' })

  try {
    await prepareSettingsSurface(fixture, fixture.page)
    await waitForDesktopApis(fixture.page, ['/api/skills', '/api/tools/toolsets'])
    await fixture.page.evaluate(() => {
      window.location.hash = '/skills?tab=toolsets'
    })

    const detail = fixture.page.locator('[data-slot="toolset-detail"]')
    const summary = detail.locator('[data-slot="capability-detail-description"]')
    const tools = detail.locator('[data-slot="toolset-tools"]')
    const selectedRow = fixture.page.locator('[data-slot="cap-row"][data-selected="true"]')

    await expect(detail).toBeVisible({ timeout: 30_000 })
    await expect(summary).toBeVisible()
    await expect(tools).toBeVisible()
    await expect(selectedRow).toHaveCount(1)
    await expect(selectedRow.locator('[data-slot="cap-row-meta"]')).not.toContainText(/\btools?\b/i)

    const selectedRowOuterShadows = await selectedRow.evaluate(element => {
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
    expect(selectedRowOuterShadows).toBe(0)

    const [summaryBox, summaryStyle, firstChipBox] = await Promise.all([
      summary.boundingBox(),
      summary.evaluate(element => {
        const style = getComputedStyle(element)

        return {
          lineClamp: style.webkitLineClamp,
          lineHeight: Number.parseFloat(style.lineHeight),
          overflow: style.overflow
        }
      }),
      tools.locator('> span').first().boundingBox()
    ])

    if (!summaryBox || !firstChipBox) {
      throw new Error('Toolset detail geometry is not measurable')
    }

    expect(summaryStyle.lineClamp).not.toBe('none')
    expect(summaryStyle.overflow).toBe('hidden')
    expect(summaryBox.height).toBeLessThanOrEqual(summaryStyle.lineHeight * 6 + 2)
    expect(firstChipBox.height).toBeGreaterThanOrEqual(28)

    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-toolset-detail-rest.png')
    })
  } finally {
    await fixture.cleanup()
  }
})
