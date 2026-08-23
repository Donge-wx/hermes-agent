/**
 * E2E boot-failure tests — verify the app shows an error overlay when the
 * backend can't start.
 *
 * Injects a fake boot error (HERMES_DESKTOP_BOOT_FAKE_ERROR) so the backend
 * resolution fails with a controlled error message. The app should show the
 * BootFailureOverlay with retry/repair actions.
 *
 * Prerequisite: `npm run build` must have been run so dist/ exists.
 */

import { setupDeadBackend, waitForBootFailure } from './fixtures'
import { allowErrorBanners, expect, test } from './test'

const FAILURE_VIEWPORTS = [
  { name: 'desktop-1280', width: 1280, height: 768 },
  { name: 'compact-768', width: 768, height: 720 },
  { name: 'narrow-640', width: 640, height: 720 }
] as const

test.describe('boot failure with dead backend', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })

  test.beforeEach(() => {
    // These tests deliberately trigger boot errors — error banners
    // (notifyError → [role="alert"]) are expected, not failures.
    allowErrorBanners()
  })

  for (const viewport of FAILURE_VIEWPORTS) {
    test(`app shows a Liquid Glass recovery state at ${viewport.name}`, async () => {
      // Given: a fresh app instance owns one stable terminal boot failure at
      // the target size. One fixture per viewport prevents unrelated async
      // boot work from invalidating later resize evidence.
      const fixture = await setupDeadBackend({ fakeError: true })

      try {
        await fixture.app.evaluate(({ BrowserWindow }, size) => {
          const window = BrowserWindow.getAllWindows()[0]

          window?.unmaximize()
          window?.setMinimumSize(1, 1)
          window?.setContentSize(size.width, size.height, false)
          window?.show()
        }, viewport)
        await waitForBootFailure(fixture.page, 90_000)
        await fixture.page.waitForFunction(
          size => window.innerWidth === size.width && window.innerHeight === size.height,
          viewport
        )
        await fixture.page.evaluate(() => {
          document.documentElement.setAttribute('data-hermes-theme', 'liquid-glass')
          document.documentElement.setAttribute('data-hermes-mode', 'light')
        })

        const overlay = fixture.page.locator('[data-slot="boot-failure-overlay"]')

        // When: the terminal recovery surface is inspected.
        await expect(overlay).toBeVisible({ timeout: 90_000 })

        await fixture.page.screenshot({
          animations: 'disabled',
          caret: 'hide',
          path: test.info().outputPath(`boot-failure-${viewport.name}.png`)
        })

        const snapshot = await overlay.evaluate(element => {
          const surface = element.querySelector<HTMLElement>('[data-slot="boot-failure-surface"]')
          const error = element.querySelector<HTMLElement>('[data-slot="boot-failure-error"]')
          const rect = surface?.getBoundingClientRect()

          return {
            errorText: error?.textContent ?? '',
            surface: rect
              ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              : null
          }
        })

        if (!snapshot.surface) {
          throw new Error(`Boot-failure surface geometry is not measurable at ${viewport.name}`)
        }

        // Then: visible brand copy is transformed and the live recovery
        // controls remain fully contained in the target viewport.
        expect(snapshot.errorText).toContain('My King backend')
        expect(snapshot.errorText).toContain('My King connection')
        expect(snapshot.errorText).not.toContain('hermes:connection')
        expect(snapshot.errorText).not.toContain('Hermes backend')
        expect(snapshot.surface.x).toBeGreaterThanOrEqual(0)
        expect(snapshot.surface.x + snapshot.surface.width).toBeLessThanOrEqual(viewport.width)
        expect(snapshot.surface.y + snapshot.surface.height).toBeLessThanOrEqual(viewport.height)
      } finally {
        await fixture.cleanup()
      }
    })
  }
})
