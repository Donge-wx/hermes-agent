import { setupMockBackend, waitForAppReady } from './fixtures'
import { expect, test } from './test'

interface ManagedUpdateActionResult {
  readonly error: string
  readonly message: string
  readonly ok: false
}

interface ManagedUpdateCheckResult {
  readonly error: string
  readonly message: string
  readonly supported: false
}

interface ManagedDesktopVersion {
  readonly appVersion: string
  readonly desktopPackageVersion: string
}

interface ManagedEmployeeBridge {
  readonly api: (request: { readonly method: string; readonly path: unknown }) => Promise<ManagedUpdateActionResult>
  readonly connections: {
    readonly updateAll: () => Promise<ManagedUpdateActionResult & { readonly results: readonly [] }>
  }
  readonly getVersion: () => Promise<ManagedDesktopVersion>
  readonly updates: {
    readonly apply: () => Promise<ManagedUpdateActionResult>
    readonly check: () => Promise<ManagedUpdateCheckResult>
    readonly setBranch: (name: string) => Promise<ManagedUpdateActionResult>
  }
}

declare global {
  interface Window {
    hermesDesktop: ManagedEmployeeBridge
  }
}

test.describe('My King managed employee update policy', () => {
  test('keeps the real Electron bridge read-only for employee update actions while version lookup works', async () => {
    test.setTimeout(180_000)
    const fixture = await setupMockBackend()

    try {
      await waitForAppReady(fixture, 120_000)

      const result = await fixture.page.evaluate(async () => {
        const bridge = window.hermesDesktop
        const [check, apply, setBranch, updateAll, version, genericApi, boxedPathApi, arrayPathApi] = await Promise.all(
          [
            bridge.updates.check(),
            bridge.updates.apply(),
            bridge.updates.setBranch('main'),
            bridge.connections.updateAll?.(),
            bridge.getVersion(),
            bridge.api({ method: 'POST', path: '/api/hermes/update' }),
            bridge.api({ method: 'POST', path: new String('/api/hermes/update') }),
            bridge.api({ method: 'POST', path: ['/api/hermes/update/check'] })
          ]
        )

        return { apply, arrayPathApi, boxedPathApi, check, genericApi, setBranch, updateAll, version }
      })

      expect(result.check).toMatchObject({ error: 'updates-disabled', supported: false })
      expect(result.apply).toMatchObject({ error: 'updates-disabled', ok: false })
      expect(result.setBranch).toMatchObject({ error: 'updates-disabled', ok: false })
      expect(result.updateAll).toMatchObject({ error: 'updates-disabled', ok: false, results: [] })
      expect(result.genericApi).toMatchObject({ error: 'updates-disabled', ok: false })
      expect(result.boxedPathApi).toMatchObject({ error: 'updates-disabled', ok: false })
      expect(result.arrayPathApi).toMatchObject({ error: 'updates-disabled', ok: false })
      expect(result.version.desktopPackageVersion).toBeTruthy()
      expect(result.version.appVersion).toBeTruthy()
    } finally {
      await fixture.cleanup()
    }
  })
})
