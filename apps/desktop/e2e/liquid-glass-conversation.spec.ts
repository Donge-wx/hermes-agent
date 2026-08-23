import type { Locator } from '@playwright/test'

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { expect, test } from './test'

const PROMPT = '请检查这一版 My King 的会话视觉层级，并给出简短结论。'

const VIEWPORTS = [
  { name: 'desktop-1280', width: 1280, height: 768 },
  { name: 'compact-768', width: 768, height: 720 },
  { name: 'narrow-640', width: 640, height: 720 }
] as const

async function resizeWindow(fixture: MockBackendFixture, width: number, height: number): Promise<void> {
  await fixture.app.evaluate(
    ({ BrowserWindow: ElectronBrowserWindow }, size) => {
      const window = ElectronBrowserWindow.getAllWindows().at(0)

      window?.unmaximize()
      window?.setContentSize(size.width, size.height, false)
      window?.show()
      window?.focus()
    },
    { height, width }
  )
  await fixture.page.waitForTimeout(250)
}

async function applyLiquidGlass(fixture: MockBackendFixture): Promise<void> {
  await fixture.page.evaluate(() => {
    localStorage.setItem('hermes-desktop-theme-v2', 'liquid-glass')
    localStorage.setItem('hermes-desktop-mode-v1', 'light')
    localStorage.setItem('hermes-desktop-profile-themes-v1', JSON.stringify({ default: 'liquid-glass' }))
    localStorage.setItem('hermes-desktop-profile-modes-v1', JSON.stringify({ default: 'light' }))
    window.dispatchEvent(new StorageEvent('storage'))
  })
  await expect(fixture.page.locator('html')).toHaveAttribute('data-hermes-theme', 'liquid-glass')
  await expect(fixture.page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
}

async function material(locator: Locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element)

    return {
      backgroundImage: style.backgroundImage,
      borderRadius: Number.parseFloat(style.borderRadius),
      boxShadow: style.boxShadow,
      liquidSize: style.getPropertyValue('--lg-size-control-compact'),
      mode: document.documentElement.dataset.hermesMode,
      theme: document.documentElement.dataset.hermesTheme
    }
  })
}

test('My King Liquid Glass conversation hierarchy stays functional and responsive', async ({}, testInfo) => {
  test.setTimeout(300_000)
  const fixture = await setupMockBackend({
    extraDisplayConfig: '  language: zh',
    mockServer: { holdFirstStreamForPrompt: PROMPT }
  })

  try {
    await waitForAppReady(fixture, 120_000)
    await fixture.page.evaluate(() => {
      window.location.hash = '/'
    })
    await applyLiquidGlass(fixture)

    const composer = fixture.page.locator('[data-slot="composer-rich-input"]').first()
    await composer.click()
    await composer.pressSequentially(PROMPT)
    await fixture.page.keyboard.press('Enter')
    await fixture.mock.waitForHeldStream()
    // Session creation can finish the initial profile hydration and repaint
    // the stored default theme. Pin the visual fixture after that one-time
    // transition so this spec measures Liquid Glass rather than the sandbox's
    // deliberately empty appearance preference.
    await applyLiquidGlass(fixture)

    const userBubble = fixture.page.locator('[data-slot="aui_user-message-root"] .composer-human-message').last()
    await expect(userBubble).toBeVisible()

    const activeCognition = fixture.page
      .locator('[data-slot="aui_response-loading"], [data-slot="aui_turn-activity"]')
      .last()
    await expect(activeCognition).toBeVisible({ timeout: 15_000 })
    await expect(activeCognition.locator('[data-slot="aui_cognition-pulse"]')).toBeVisible()

    const cognitionMaterial = await material(activeCognition)
    expect(cognitionMaterial.backgroundImage, JSON.stringify(cognitionMaterial)).not.toBe('none')
    expect(cognitionMaterial.borderRadius).toBeGreaterThanOrEqual(18)
    expect(cognitionMaterial.boxShadow).not.toBe('none')
    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-conversation-active-thinking.png')
    })

    fixture.mock.releaseHeldStream()
    const assistantSheet = fixture.page.locator('[data-slot="aui_assistant-message-content"]').last()
    await expect(assistantSheet).toContainText('mock inference server', { timeout: 60_000 })

    const userMaterial = await material(userBubble)
    const assistantMaterial = await material(assistantSheet)
    for (const surface of [userMaterial, assistantMaterial]) {
      expect(surface.backgroundImage).not.toBe('none')
      expect(surface.borderRadius).toBeGreaterThanOrEqual(16)
      expect(surface.boxShadow).not.toBe('none')
    }

    for (const viewport of VIEWPORTS) {
      await resizeWindow(fixture, viewport.width, viewport.height)

      const metrics = await fixture.page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
      }))
      expect(metrics.scrollWidth).toBe(metrics.clientWidth)

      await expect(userBubble).toBeVisible()
      await expect(assistantSheet).toBeVisible()
      await fixture.page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: testInfo.outputPath(`my-king-conversation-${viewport.name}.png`)
      })
    }

    await resizeWindow(fixture, 1280, 768)
    const sessionRow = fixture.page.locator('[data-slot="session-row"]').first()
    await expect(sessionRow).toBeVisible()
    expect((await sessionRow.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    expect((await sessionRow.getAttribute('data-selected')) ?? '').toBe('true')

    const sessionSectionToggle = fixture.page.locator('[data-slot="sidebar-section-toggle"]').last()
    const sessionSectionLabel = sessionSectionToggle.locator('[data-slot="sidebar-panel-label"]')
    await expect(sessionSectionToggle.locator('.codicon-history')).toBeVisible()
    await expect(sessionSectionLabel).toBeVisible()
    expect(
      await sessionSectionLabel.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))
    ).toBeGreaterThanOrEqual(13)
    expect(await sessionSectionToggle.locator('.dither').count()).toBe(0)

    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-conversation-sidebar-section-labels.png')
    })
  } finally {
    await fixture.cleanup()
  }
})
