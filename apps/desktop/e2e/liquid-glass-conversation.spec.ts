import type { Locator } from '@playwright/test'

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { expect, test } from './test'

const PROMPT = '你好'
const SHORT_PROMPT = '您好'

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

test('My King Liquid Glass conversation hierarchy stays functional and responsive', async ({ page: _page }, testInfo) => {
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
    const cognitionPulse = activeCognition.locator('[data-slot="aui_cognition-pulse"]')
    await expect(cognitionPulse).toBeVisible()

    const [cognitionMaterial, pulseMaterial] = await Promise.all([material(activeCognition), material(cognitionPulse)])
    expect(cognitionMaterial.backgroundImage).toBe('none')
    expect(cognitionMaterial.borderRadius).toBe(0)
    expect(cognitionMaterial.boxShadow).toBe('none')
    expect(pulseMaterial.backgroundImage, JSON.stringify(pulseMaterial)).toContain('conic-gradient')
    expect(pulseMaterial.boxShadow).toBe('none')
    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-conversation-active-thinking.png')
    })

    await userBubble.focus()
    const runningMessageRoot = userBubble.locator('xpath=ancestor::*[@data-slot="aui_user-message-root"][1]')
    const stopAction = runningMessageRoot.locator('[data-slot="aui_user-message-primary-action"] button')

    await expect(stopAction).toBeVisible()
    const runningBubbleBox = await userBubble.boundingBox()
    const stopActionBox = await stopAction.boundingBox()

    expect(runningBubbleBox).not.toBeNull()
    expect(stopActionBox).not.toBeNull()
    expect(stopActionBox?.width).toBe(32)
    expect(stopActionBox?.height).toBe(32)
    const stopActionMaterial = await stopAction.evaluate(element => {
      const style = getComputedStyle(element)

      return {
        backgroundImage: style.backgroundImage,
        borderRadius: Number.parseFloat(style.borderRadius),
        boxShadow: style.boxShadow
      }
    })
    expect(stopActionMaterial.backgroundImage).not.toBe('none')
    expect(stopActionMaterial.borderRadius).toBeGreaterThanOrEqual(16)
    expect(stopActionMaterial.boxShadow).not.toBe('none')
    expect(
      (stopActionBox?.x ?? 0) + (stopActionBox?.width ?? 0),
      JSON.stringify({ action: stopActionBox, bubble: runningBubbleBox })
    ).toBeLessThanOrEqual((runningBubbleBox?.x ?? 0) - 4)
    const runningBubbleCenterY = (runningBubbleBox?.y ?? 0) + (runningBubbleBox?.height ?? 0) / 2
    const stopActionCenterY = (stopActionBox?.y ?? 0) + (stopActionBox?.height ?? 0) / 2

    expect(
      Math.abs(runningBubbleCenterY - stopActionCenterY),
      JSON.stringify({ action: stopActionBox, bubble: runningBubbleBox })
    ).toBeLessThanOrEqual(1)
    const stopClipLeft = Math.min(stopActionBox?.x ?? 0, runningBubbleBox?.x ?? 0)
    const stopClipTop = Math.min(stopActionBox?.y ?? 0, runningBubbleBox?.y ?? 0)

    const stopClipRight = Math.max(
      (stopActionBox?.x ?? 0) + (stopActionBox?.width ?? 0),
      (runningBubbleBox?.x ?? 0) + (runningBubbleBox?.width ?? 0)
    )

    const stopClipBottom = Math.max(
      (stopActionBox?.y ?? 0) + (stopActionBox?.height ?? 0),
      (runningBubbleBox?.y ?? 0) + (runningBubbleBox?.height ?? 0)
    )

    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      clip: {
        height: stopClipBottom - stopClipTop + 16,
        width: stopClipRight - stopClipLeft + 16,
        x: stopClipLeft - 8,
        y: stopClipTop - 8
      },
      path: testInfo.outputPath('my-king-short-user-message-stop-outside.png')
    })
    await userBubble.blur()
    await fixture.page.mouse.move(0, 0)

    fixture.mock.releaseHeldStream()
    const assistantSheet = fixture.page.locator('[data-slot="aui_assistant-message-content"]').last()
    await expect(assistantSheet).toContainText('mock inference server', { timeout: 60_000 })

    const userMaterial = await material(userBubble)
    const assistantMaterial = await material(assistantSheet)

    expect(userMaterial.backgroundImage).not.toBe('none')
    expect(userMaterial.borderRadius).toBeGreaterThanOrEqual(16)
    expect(userMaterial.boxShadow).not.toBe('none')

    expect(assistantMaterial.backgroundImage).not.toBe('none')
    expect(assistantMaterial.borderRadius).toBe(0)
    expect(assistantMaterial.boxShadow).toBe('none')

    const userOuterShadow = await userBubble.evaluate(element => {
      const shadow = getComputedStyle(element).boxShadow.split(',').at(-1)?.trim() ?? ''
      const lengths = Array.from(shadow.matchAll(/(-?\d+(?:\.\d+)?)px/g), match => Number.parseFloat(match[1] ?? '0'))
      const alpha = Number.parseFloat(shadow.match(/\/\s*(\d+(?:\.\d+)?)\)/)?.[1] ?? '1')

      return {
        alpha,
        blur: lengths[2] ?? 0,
        offsetY: lengths[1] ?? 0,
        shadow,
        spread: lengths[3] ?? 0
      }
    })

    expect(userOuterShadow.offsetY, JSON.stringify(userOuterShadow)).toBeLessThanOrEqual(6)
    expect(userOuterShadow.blur, JSON.stringify(userOuterShadow)).toBeLessThanOrEqual(16)
    expect(userOuterShadow.spread, JSON.stringify(userOuterShadow)).toBeLessThanOrEqual(-10)
    expect(userOuterShadow.alpha, JSON.stringify(userOuterShadow)).toBeLessThanOrEqual(0.36)

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
    const selectedSessionShadow = await sessionRow.evaluate(element => {
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
    expect(selectedSessionShadow).toBe(0)

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

    await composer.click()
    await composer.pressSequentially(SHORT_PROMPT)
    await expect(composer).toHaveText(SHORT_PROMPT)
    await fixture.page.keyboard.press('Enter')
    const assistantSheets = fixture.page.locator('[data-slot="aui_assistant-message-content"]')

    await expect(assistantSheets).toHaveCount(2, { timeout: 60_000 })
    await expect(assistantSheets.last()).toContainText('mock inference server', { timeout: 60_000 })

    const shortBubble = fixture.page
      .locator('[data-slot="aui_user-message-root"] .composer-human-message')
      .filter({ hasText: SHORT_PROMPT })
      .last()

    await expect(shortBubble).toBeVisible()
    const shortText = shortBubble.locator('[data-slot="aui_user-inline-text"]')
    await expect(shortText).toHaveText(SHORT_PROMPT)
    await shortBubble.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-short-user-message-rest.png')
    })
    await shortBubble.hover()
    await shortBubble.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-short-user-message-hover.png')
    })
    await shortBubble.focus()
    const shortMessageRoot = shortBubble.locator('xpath=ancestor::*[@data-slot="aui_user-message-root"][1]')
    const shortAction = shortMessageRoot.locator('[data-slot="aui_user-message-primary-action"] button')
    await expect(shortAction).toBeVisible()
    const shortBubbleBox = await shortBubble.boundingBox()
    const shortTextBox = await shortText.boundingBox()
    const shortActionBox = await shortAction.boundingBox()
    expect(shortBubbleBox).not.toBeNull()
    expect(shortTextBox).not.toBeNull()
    expect(shortActionBox).not.toBeNull()
    expect(
      (shortActionBox?.x ?? 0) + (shortActionBox?.width ?? 0),
      JSON.stringify({ action: shortActionBox, bubble: shortBubbleBox })
    ).toBeLessThanOrEqual((shortBubbleBox?.x ?? 0) - 4)
    const shortTextLeftInset = (shortTextBox?.x ?? 0) - (shortBubbleBox?.x ?? 0)

    const shortTextRightInset =
      (shortBubbleBox?.x ?? 0) + (shortBubbleBox?.width ?? 0) -
      ((shortTextBox?.x ?? 0) + (shortTextBox?.width ?? 0))

    expect(
      Math.abs(shortTextLeftInset - shortTextRightInset),
      JSON.stringify({ bubble: shortBubbleBox, text: shortTextBox })
    ).toBeLessThanOrEqual(1)
    const focusedClipLeft = Math.min(shortActionBox?.x ?? 0, shortBubbleBox?.x ?? 0)
    const focusedClipTop = Math.min(shortActionBox?.y ?? 0, shortBubbleBox?.y ?? 0)

    const focusedClipRight = Math.max(
      (shortActionBox?.x ?? 0) + (shortActionBox?.width ?? 0),
      (shortBubbleBox?.x ?? 0) + (shortBubbleBox?.width ?? 0)
    )

    const focusedClipBottom = Math.max(
      (shortActionBox?.y ?? 0) + (shortActionBox?.height ?? 0),
      (shortBubbleBox?.y ?? 0) + (shortBubbleBox?.height ?? 0)
    )

    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      clip: {
        height: focusedClipBottom - focusedClipTop + 16,
        width: focusedClipRight - focusedClipLeft + 16,
        x: focusedClipLeft - 8,
        y: focusedClipTop - 8
      },
      path: testInfo.outputPath('my-king-short-user-message-action-outside.png')
    })
    await shortBubble.blur()
    await fixture.page.mouse.move(0, 0)

    for (const viewport of VIEWPORTS.slice(1)) {
      await resizeWindow(fixture, viewport.width, viewport.height)
      await shortBubble.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: testInfo.outputPath(`my-king-short-user-message-${viewport.width}.png`)
      })
    }
  } finally {
    await fixture.cleanup()
  }
})
