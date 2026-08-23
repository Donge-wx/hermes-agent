import type { Locator } from '@playwright/test'

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { expect, test } from './test'

async function expectLiquidGlassSwitchGeometry(track: Locator): Promise<void> {
  const thumb = track.locator('[data-slot="switch-thumb"]')
  const [trackBox, thumbBox] = await Promise.all([track.boundingBox(), thumb.boundingBox()])

  if (!trackBox || !thumbBox) {
    throw new Error('Liquid Glass Switch geometry is not measurable')
  }

  expect(trackBox.width).toBeCloseTo(48, 0)
  expect(trackBox.height).toBeCloseTo(28, 0)
  expect(thumbBox.width).toBeCloseTo(22, 0)
  expect(thumbBox.height).toBeCloseTo(22, 0)
  expect(thumbBox.x).toBeGreaterThanOrEqual(trackBox.x - 0.5)
  expect(thumbBox.x + thumbBox.width).toBeLessThanOrEqual(trackBox.x + trackBox.width + 0.5)
}

async function showCheckedLiquidGlassSwitch(fixture: MockBackendFixture): Promise<Locator> {
  const { page } = fixture

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-hermes-theme', 'liquid-glass')
    document.documentElement.setAttribute('data-hermes-mode', 'light')
    window.location.hash = '/settings?tab=config%3Amemory'
  })

  const track = page.locator('[data-slot="switch"]').first()
  await expect(track).toBeVisible({ timeout: 30_000 })

  if ((await track.getAttribute('data-state')) !== 'checked') {
    await track.click()
  }

  await expect(track).toHaveAttribute('data-state', 'checked')

  return track
}

interface SwitchMaterial {
  readonly backgroundColor: string
  readonly boxShadow: string
  readonly thumbScale: number
  readonly thumbTransform: string
}

async function readSwitchMaterial(track: Locator): Promise<SwitchMaterial> {
  return track.evaluate(element => {
    const thumb = element.querySelector<HTMLElement>('[data-slot="switch-thumb"]')

    if (!thumb) {
      throw new Error('Liquid Glass Switch is missing its thumb')
    }

    return {
      backgroundColor: getComputedStyle(element).backgroundColor,
      boxShadow: getComputedStyle(element).boxShadow,
      thumbScale: new DOMMatrixReadOnly(getComputedStyle(thumb).transform).a,
      thumbTransform: getComputedStyle(thumb).transform
    }
  })
}

test.describe('Liquid Glass Switch', () => {
  let fixture: MockBackendFixture | null = null

  test.beforeEach(async () => {
    fixture = await setupMockBackend()
    await waitForAppReady(fixture, 120_000)
  })

  test.afterEach(async () => {
    await fixture?.cleanup()
    fixture = null
  })

  test('keeps the thumb inside its 48 by 28 track while preserving toggle behavior', async ({}, testInfo) => {
    if (!fixture) {
      throw new Error('Mock backend fixture was not initialized')
    }

    const track = await showCheckedLiquidGlassSwitch(fixture)
    await expectLiquidGlassSwitchGeometry(track)
    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-liquid-glass-switch-checked.png')
    })

    await track.click()
    await expect(track).toHaveAttribute('data-state', 'unchecked')
    await expectLiquidGlassSwitchGeometry(track)
    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-liquid-glass-switch-unchecked.png')
    })

    await track.click()
    await expect(track).toHaveAttribute('data-state', 'checked')
  })

  test('gives hover its own internal material state', async ({}, testInfo) => {
    if (!fixture) {
      throw new Error('Mock backend fixture was not initialized')
    }

    const track = await showCheckedLiquidGlassSwitch(fixture)
    await fixture.page.mouse.move(0, 0)
    const rest = await readSwitchMaterial(track)
    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-liquid-glass-switch-hover-rest.png')
    })

    await track.hover()
    await fixture.page.waitForTimeout(60)
    await fixture.page.screenshot({
      caret: 'hide',
      path: testInfo.outputPath('my-king-liquid-glass-switch-hover-mid.png')
    })
    await fixture.page.waitForTimeout(180)
    const hover = await readSwitchMaterial(track)
    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-liquid-glass-switch-hover-settled.png')
    })

    expect(hover).not.toEqual(rest)
  })

  test('compresses the thumb and deepens the material while pressed', async ({}, testInfo) => {
    if (!fixture) {
      throw new Error('Mock backend fixture was not initialized')
    }

    const { page } = fixture
    const track = await showCheckedLiquidGlassSwitch(fixture)
    await track.hover()
    const hover = await readSwitchMaterial(track)
    const trackBox = await track.boundingBox()

    if (!trackBox) {
      throw new Error('Liquid Glass Switch is not measurable for pressed-state QA')
    }

    await page.mouse.move(trackBox.x + trackBox.width / 2, trackBox.y + trackBox.height / 2)
    await page.mouse.down()
    await page.waitForFunction(() => {
      const switchElement = document.querySelector('[data-slot="switch"]')
      const thumb = switchElement?.querySelector('[data-slot="switch-thumb"]')

      if (switchElement?.matches(':active') !== true || !(thumb instanceof HTMLElement)) {
        return false
      }

      return Math.abs(new DOMMatrixReadOnly(getComputedStyle(thumb).transform).a - 0.9) < 0.005
    })
    const pressed = await readSwitchMaterial(track)
    await page.screenshot({
      caret: 'hide',
      path: testInfo.outputPath('my-king-liquid-glass-switch-pressed.png')
    })
    await page.mouse.up()

    expect(pressed.boxShadow).not.toBe(hover.boxShadow)
    expect(pressed.thumbScale).toBeCloseTo(0.9, 2)
    expect(pressed.thumbTransform).not.toBe(hover.thumbTransform)
  })

  test('shows an external focus ring for keyboard focus', async ({}, testInfo) => {
    if (!fixture) {
      throw new Error('Mock backend fixture was not initialized')
    }

    const track = await showCheckedLiquidGlassSwitch(fixture)
    await fixture.page.keyboard.press('Tab')
    await track.focus()
    await expect(track).toBeFocused()
    expect(await track.evaluate(element => element.matches(':focus-visible'))).toBe(true)
    expect(await track.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
    expect(
      Number.parseFloat(await track.evaluate(element => getComputedStyle(element).outlineWidth))
    ).toBeGreaterThanOrEqual(2)
    await fixture.page.screenshot({
      animations: 'disabled',
      caret: 'hide',
      path: testInfo.outputPath('my-king-liquid-glass-switch-focus.png')
    })
  })
})
