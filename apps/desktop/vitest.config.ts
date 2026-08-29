import type { TestProjectConfiguration } from 'vitest/config'
import { defineConfig } from 'vitest/config'

const reactUi: TestProjectConfiguration = {
  extends: './vite.config.ts',
  test: {
    name: 'ui',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    // The first test in each file pays jsdom env init + full module transform,
    // which can exceed vitest's 5000ms default under CI/load. 15s gives the
    // cold start headroom without masking genuinely hung tests.
    testTimeout: 15_000
  }
}

const electronNative: TestProjectConfiguration = {
  test: {
    name: 'electron',
    environment: 'node',
    include: ['electron/**/*.test.ts', 'scripts/**.test.{ts,mjs}'],
    exclude: [
      'scripts/electron-builder-target.test.mjs',
      'scripts/managed-dashboard-assets.test.mjs',
      'scripts/pre-react-boot-brand.test.mjs',
      'scripts/run-short-session-hang-repro.test.mjs',
      'scripts/set-exe-identity.test.mjs'
    ]
  }
}

export default defineConfig({
  test: {
    projects: [reactUi, electronNative]
  }
})
