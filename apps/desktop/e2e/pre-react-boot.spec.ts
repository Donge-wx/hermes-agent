import * as fs from 'node:fs'
import * as path from 'node:path'

import { expect, test } from '@playwright/test'

const DIST_ROOT = path.resolve(import.meta.dirname, '..', 'dist')
const BUILT_INDEX_PATH = path.join(DIST_ROOT, 'index.html')
const BRAND_LOCKUP_PATH = path.join(DIST_ROOT, 'brand', 'my-king-lockup.png')
const EVIDENCE_ROOT = path.resolve(DIST_ROOT, '..', '..', '..', '.omo', 'evidence', 'my-king-pre-react-boot-v1')
const PREBOOT_VIEWPORTS = [
  { height: 720, name: 'compact-375', width: 375 },
  { height: 720, name: 'tablet-768', width: 768 },
  { height: 800, name: 'desktop-1280', width: 1280 }
] as const
const AUXILIARY_WINDOWS = ['hud', 'overlay', 'quick', 'secondary', 'wake'] as const
const BUILT_PREBOOT_HTML = fs
  .readFileSync(BUILT_INDEX_PATH, 'utf8')
  .replace(/<link\b[^>]*>/g, '')
  .replace(/<script\b[^>]*\btype="module"[^>]*><\/script>/g, '')
  .replaceAll(
    './brand/my-king-lockup.png',
    `data:image/png;base64,${fs.readFileSync(BRAND_LOCKUP_PATH).toString('base64')}`
  )

test.use({ screenshot: 'off', trace: 'off' })

for (const viewport of PREBOOT_VIEWPORTS) {
  test(`shows the approved My King lockup before mount at ${viewport.name}`, async ({ page }) => {
    // Given: the production build document is held at its pre-React paint by
    // removing only external resources; the shipped inline shell stays intact.
    await page.setViewportSize(viewport)

    // When: a real browser renders that exact built first frame.
    await page.setContent(BUILT_PREBOOT_HTML, { waitUntil: 'load' })

    // Then: the first visible frame is a centered branded glass stage, not an
    // empty themed background.
    const stage = page.locator('[data-slot="pre-react-boot"]')
    const lockup = stage.locator('img')

    await expect(stage).toBeVisible()
    await expect(lockup).toBeVisible()
    await expect
      .poll(() => lockup.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
      .toBe(true)

    const stageBox = await stage.boundingBox()

    if (!stageBox) {
      throw new Error('Pre-React boot stage has no rendered bounds')
    }

    expect(Math.abs(stageBox.x + stageBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(stageBox.y + stageBox.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1)

    fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, `${viewport.name}.png`) })
  })
}

for (const auxiliaryWindow of AUXILIARY_WINDOWS) {
  test(`skips the main boot shell for the ${auxiliaryWindow} auxiliary window`, async ({ page }) => {
    // Given: every auxiliary renderer uses the same production document with
    // a query-before-hash `win` discriminator.
    await page.goto(`about:blank?win=${auxiliaryWindow}`)

    // When: the built document reaches its pre-React paint.
    await page.setContent(BUILT_PREBOOT_HTML, { waitUntil: 'load' })

    // Then: the main-window shell is removed synchronously before the
    // auxiliary renderer mounts its own first frame.
    await expect(page.locator('[data-slot="pre-react-boot-frame"]')).toHaveCount(0)
    await expect(page.locator('#root')).toBeEmpty()
  })
}
