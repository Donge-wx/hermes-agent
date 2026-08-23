import { describe, expect, it } from 'vitest'

import { resolveMyKingHome, resolveMyKingUserData, shouldUseExternalHermesRuntime } from './my-king-paths'

describe('resolveMyKingHome', () => {
  it('uses a dedicated My King home on macOS and Linux', () => {
    expect(resolveMyKingHome({ platform: 'darwin', home: '/Users/alice' })).toBe('/Users/alice/.myking')
    expect(resolveMyKingHome({ platform: 'linux', home: '/home/alice' })).toBe('/home/alice/.myking')
  })

  it('uses a dedicated My King home under LOCALAPPDATA on Windows', () => {
    expect(
      resolveMyKingHome({ platform: 'win32', home: 'C:\\Users\\alice', localAppData: 'C:\\Users\\alice\\AppData\\Local' })
    ).toBe('C:\\Users\\alice\\AppData\\Local\\myking')
  })

  it('preserves explicit and isolated test overrides', () => {
    expect(resolveMyKingHome({ platform: 'darwin', home: '/Users/alice', envOverride: '/tmp/custom' })).toBe(
      '/tmp/custom'
    )
    expect(resolveMyKingHome({ platform: 'darwin', home: '/Users/alice', userDataOverride: '/tmp/e2e' })).toBe(
      '/tmp/e2e/hermes-home'
    )
  })
})

describe('resolveMyKingUserData', () => {
  it('does not reuse the Hermes Electron userData directory', () => {
    expect(resolveMyKingUserData({ appData: '/Users/alice/Library/Application Support' })).toBe(
      '/Users/alice/Library/Application Support/My King'
    )
  })
})

describe('shouldUseExternalHermesRuntime', () => {
  it('keeps packaged My King on its dedicated runtime unless explicitly overridden', () => {
    expect(shouldUseExternalHermesRuntime({ isPackaged: true, hasExplicitOverride: false })).toBe(false)
    expect(shouldUseExternalHermesRuntime({ isPackaged: true, hasExplicitOverride: true })).toBe(true)
  })

  it('preserves external runtime discovery for development builds', () => {
    expect(shouldUseExternalHermesRuntime({ isPackaged: false, hasExplicitOverride: false })).toBe(true)
  })
})
