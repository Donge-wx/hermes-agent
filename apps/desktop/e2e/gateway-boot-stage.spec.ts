import { type ElectronApplication, type Page } from '@playwright/test'

import { type MockBackendFixture, setupMockBackend } from './fixtures'
import { expect, test } from './test'

const BRAND_ACCESSIBLE_NAME = 'My King — AI WROK OS'

interface BootSurface {
  fixture: MockBackendFixture
  overlay: ReturnType<Page['locator']>
  progress: ReturnType<Page['locator']>
  stage: ReturnType<Page['locator']>
}

interface BootSurfaceOptions {
  readonly height: number
  readonly reducedMotion?: 'no-preference' | 'reduce'
  readonly width: number
}

test.describe.configure({ mode: 'serial', timeout: 180_000 })

async function resizeWindow(app: ElectronApplication, page: Page, width: number, height: number) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height, false)
    },
    { height, width }
  )

  await page.evaluate(
    () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve())
        })
      )
  )
}

async function openIsolatedBootSurface(options: BootSurfaceOptions): Promise<BootSurface> {
  const fixture = await setupMockBackend({ bootFakeStepMs: 5000 })
  const { app, page } = fixture

  // The onboarding store intentionally mounts a preparing surface on frame 1
  // while it resolves provider readiness. These visual tests exercise the
  // independent cold-boot surface, so seed the returning-user cache and reload
  // only the renderer while the deliberately slowed real boot lifecycle is
  // still in progress. Product z-indexes and gateway timing stay untouched.
  await page.evaluate(() => window.localStorage.setItem('hermes-desktop-onboarded-v1', '1'))
  await page.emulateMedia({ reducedMotion: options.reducedMotion ?? 'no-preference' })
  await page.reload()
  await resizeWindow(app, page, options.width, options.height)

  const stage = page.locator('[data-slot="gateway-boot-stage"]')
  const overlay = page.locator('[data-slot="gateway-boot-overlay"]')
  const progress = stage.getByRole('progressbar')

  await expect(stage).toBeVisible({ timeout: 30_000 })
  await expect(overlay).toBeVisible()
  const lockup = page.getByRole('img', { name: BRAND_ACCESSIBLE_NAME })

  await expect(lockup).toBeVisible()
  await expect
    .poll(() =>
      lockup.evaluate(image => (image instanceof HTMLImageElement ? image.complete && image.naturalWidth > 0 : false))
    )
    .toBe(true)

  const criticalImagePreload = await page.evaluate(() => {
    const preload = document.querySelector<HTMLLinkElement>('link[rel="preload"][as="image"]')

    return preload?.href.endsWith('/brand/my-king-lockup.png') ?? false
  })

  expect(criticalImagePreload).toBe(true)
  await expect(page.getByText("Let's get you setup with My King Agent")).toHaveCount(0)

  const centerIsBootOverlay = await page.evaluate(() => {
    const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)

    return Boolean(center?.closest('[data-slot="gateway-boot-overlay"]'))
  })

  expect(centerIsBootOverlay).toBe(true)

  return { fixture, overlay, progress, stage }
}

async function expectContained(stage: ReturnType<Page['locator']>, page: Page) {
  const geometry = await stage.boundingBox()

  expect(geometry).not.toBeNull()

  if (!geometry) {
    return
  }

  const viewport = await page.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth }))

  expect(geometry.x).toBeGreaterThanOrEqual(0)
  expect(geometry.y).toBeGreaterThanOrEqual(0)
  expect(geometry.x + geometry.width).toBeLessThanOrEqual(viewport.width)
  expect(geometry.y + geometry.height).toBeLessThanOrEqual(viewport.height)
}

test('cold start presents My King animation frames with real boot progress', async () => {
  const surface = await openIsolatedBootSurface({ height: 800, width: 1280 })
  const { fixture, progress, stage } = surface
  const { page } = fixture

  try {
    const earlyProgress = Number(await progress.getAttribute('aria-valuenow'))

    expect(earlyProgress).toBeGreaterThanOrEqual(0)
    expect(earlyProgress).toBeLessThanOrEqual(100)
    expect((await stage.textContent()) ?? '').not.toContain('CONNECTING')
    await expectContained(stage, page)

    await page.screenshot({
      animations: 'allow',
      caret: 'hide',
      path: test.info().outputPath('my-king-boot-start.png')
    })

    await page.waitForTimeout(240)
    await expect(stage).toBeVisible()
    await page.screenshot({
      animations: 'allow',
      caret: 'hide',
      path: test.info().outputPath('my-king-boot-mid.png')
    })

    await page.waitForTimeout(240)
    await expect(stage).toBeVisible()
    await page.screenshot({
      animations: 'allow',
      caret: 'hide',
      path: test.info().outputPath('my-king-boot-end.png')
    })
  } finally {
    await fixture.cleanup()
  }
})

test('cold start presents a calm reduced-motion indicator', async () => {
  const surface = await openIsolatedBootSurface({ height: 800, reducedMotion: 'reduce', width: 1280 })
  const { fixture, stage } = surface
  const { page } = fixture

  try {
    await expect(stage).toBeVisible()

    const reducedMotion = await page.locator('.gateway-boot__loader').evaluate(loader => {
      const indicator = getComputedStyle(loader, '::after')
      const svg = loader.querySelector('svg')

      return {
        animationName: indicator.animationName,
        svgDisplay: svg ? getComputedStyle(svg).display : null
      }
    })

    expect(reducedMotion.svgDisplay).toBe('none')
    expect(reducedMotion.animationName).toContain('gateway-boot-calm-pulse')
    await page.screenshot({
      animations: 'allow',
      caret: 'hide',
      path: test.info().outputPath('my-king-boot-reduced-motion.png')
    })
  } finally {
    await fixture.cleanup()
  }
})

for (const viewport of [
  { name: 'tablet', width: 768, height: 720 },
  { name: 'compact', width: 640, height: 640 }
]) {
  test(`cold start keeps the My King stage contained at ${viewport.name} size`, async () => {
    const surface = await openIsolatedBootSurface({ height: viewport.height, width: viewport.width })
    const { fixture, stage } = surface
    const { page } = fixture

    try {
      await expectContained(stage, page)
      await expect(stage).toBeVisible()

      const statusGeometry = await page.locator('.gateway-boot__status-row').evaluate(row => {
        const message = row.querySelector('.gateway-boot__message')?.getBoundingClientRect()
        const percentage = row.querySelector('.gateway-boot__percentage')?.getBoundingClientRect()
        const rowRect = row.getBoundingClientRect()

        return {
          messageRight: message?.right ?? Number.POSITIVE_INFINITY,
          percentageLeft: percentage?.left ?? Number.NEGATIVE_INFINITY,
          percentageRight: percentage?.right ?? Number.POSITIVE_INFINITY,
          rowRight: rowRect.right
        }
      })

      expect(statusGeometry.messageRight).toBeLessThanOrEqual(statusGeometry.percentageLeft)
      expect(statusGeometry.percentageRight).toBeLessThanOrEqual(statusGeometry.rowRight)
      await page.screenshot({
        animations: 'allow',
        caret: 'hide',
        path: test.info().outputPath(`my-king-boot-${viewport.name}.png`)
      })
    } finally {
      await fixture.cleanup()
    }
  })
}
