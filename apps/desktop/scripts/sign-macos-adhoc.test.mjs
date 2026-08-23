import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createLocalSignOptions } from './sign-macos-adhoc.mjs'

describe('local macOS signing', () => {
  it('keeps a stable identity, hardened runtime, and inherited entitlements', () => {
    const desktopRoot = path.resolve('/repo/apps/desktop')
    const app = path.join(desktopRoot, 'release/mac-arm64/My King.app')
    const options = createLocalSignOptions(app, desktopRoot)

    expect(options.identity).toBe('Hermes Local Code Signing')
    expect(options.identityValidation).toBe(true)
    expect(options.preAutoEntitlements).toBe(false)
    expect(options.preEmbedProvisioningProfile).toBe(false)
    expect(options.optionsForFile(app)).toEqual({
      entitlements: path.join(desktopRoot, 'electron/entitlements.mac.plist'),
      hardenedRuntime: true,
      timestamp: 'none'
    })
    expect(options.optionsForFile(path.join(app, 'Contents/Frameworks/My King Helper.app'))).toEqual({
      entitlements: path.join(desktopRoot, 'electron/entitlements.mac.inherit.plist'),
      hardenedRuntime: true,
      timestamp: 'none'
    })
  })
})
