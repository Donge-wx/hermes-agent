import { describe, expect, it } from 'vitest'

import { MY_KING_APP_ID } from './application-menu-labels'
import {
  resolveMyKingHome,
  resolveMyKingRemoteHermesHome,
  resolveMyKingUserData,
  shouldMigrateLegacyHermesData,
  shouldUseExternalHermesRuntime
} from './my-king-paths'

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

  it('ignores an inherited HERMES_HOME for development launches', () => {
    expect(
      resolveMyKingHome({ platform: 'darwin', home: '/Users/alice', envOverride: '/Users/alice/.hermes' })
    ).toBe('/Users/alice/.myking')
  })

  it('accepts HERMES_HOME only when it is inside the explicit desktop test sandbox', () => {
    expect(
      resolveMyKingHome({
        platform: 'darwin',
        home: '/Users/alice',
        envOverride: '/tmp/e2e/runtime-home',
        userDataOverride: '/tmp/e2e'
      })
    ).toBe('/tmp/e2e/runtime-home')
  })

  it('derives a safe home when HERMES_HOME escapes the explicit desktop test sandbox', () => {
    expect(resolveMyKingHome({ platform: 'darwin', home: '/Users/alice', userDataOverride: '/tmp/e2e' })).toBe(
      '/tmp/e2e/hermes-home'
    )
    expect(
      resolveMyKingHome({
        platform: 'darwin',
        home: '/Users/alice',
        envOverride: '/Users/alice/.hermes',
        userDataOverride: '/tmp/e2e'
      })
    ).toBe('/tmp/e2e/hermes-home')
  })

  it('keeps packaged launches off inherited Hermes homes', () => {
    expect(
      resolveMyKingHome({
        platform: 'darwin',
        home: '/Users/alice',
        envOverride: '/Users/alice/.hermes',
        isPackaged: true
      })
    ).toBe('/Users/alice/.myking')
    expect(
      resolveMyKingHome({
        platform: 'win32',
        home: 'C:\\Users\\alice',
        localAppData: 'C:\\Users\\alice\\AppData\\Local',
        envOverride: 'C:\\Users\\alice\\AppData\\Local\\hermes',
        isPackaged: true
      })
    ).toBe('C:\\Users\\alice\\AppData\\Local\\myking')
    expect(
      resolveMyKingHome({
        platform: 'darwin',
        home: '/Users/alice',
        envOverride: '/Users/alice/.hermes',
        isPackaged: true,
        userDataOverride: '/tmp/packaged-e2e'
      })
    ).toBe('/tmp/packaged-e2e/hermes-home')
  })
})

describe('resolveMyKingUserData', () => {
  it('does not reuse the Hermes Electron userData directory', () => {
    expect(resolveMyKingUserData({ appData: '/Users/alice/Library/Application Support' })).toBe(
      '/Users/alice/Library/Application Support/My King'
    )
  })

  it('ignores a normalized override that resolves to ordinary Hermes user data on macOS and Linux', () => {
    expect(
      resolveMyKingUserData({
        appData: '/Users/alice/Library/Application Support',
        override: '/Users/alice/Library/Application Support/Other/../Hermes',
        platform: 'darwin'
      })
    ).toBe('/Users/alice/Library/Application Support/My King')
    expect(
      resolveMyKingUserData({
        appData: '/home/alice/.config',
        override: '/home/alice/.config/Hermes',
        platform: 'linux'
      })
    ).toBe('/home/alice/.config/My King')
  })

  it('ignores a case-insensitive ordinary Hermes user-data override on Windows', () => {
    expect(
      resolveMyKingUserData({
        appData: 'C:\\Users\\alice\\AppData\\Roaming',
        override: 'c:\\users\\alice\\appdata\\roaming\\HERMES',
        platform: 'win32'
      })
    ).toBe('C:\\Users\\alice\\AppData\\Roaming\\My King')
  })
})

describe('resolveMyKingRemoteHermesHome', () => {
  it('uses the isolated remote My King home for packaged automatic SSH discovery', () => {
    expect(resolveMyKingRemoteHermesHome({ isPackaged: true, remoteHermesPath: '' })).toBe('~/.myking')
    expect(resolveMyKingRemoteHermesHome({ isPackaged: true, remoteHermesPath: '   ' })).toBe('~/.myking')
  })

  it('preserves the upstream remote discovery ladder in development and for explicit executables', () => {
    expect(resolveMyKingRemoteHermesHome({ isPackaged: false, remoteHermesPath: '' })).toBe('')
    expect(resolveMyKingRemoteHermesHome({ isPackaged: true, remoteHermesPath: '~/.local/bin/hermes' })).toBe('')
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

describe('legacy Hermes migration policy', () => {
  it('skips legacy Hermes folders for the managed My King application identity', () => {
    expect(shouldMigrateLegacyHermesData({ buildAppId: MY_KING_APP_ID })).toBe(false)
  })

  it('preserves compatibility migration for the ordinary Hermes application identity', () => {
    expect(shouldMigrateLegacyHermesData({ buildAppId: 'com.nousresearch.hermes' })).toBe(true)
  })
})
