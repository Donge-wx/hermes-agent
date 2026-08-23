/**
 * Stable local macOS signing for a packaged My King app.
 *
 * electron-builder applies the hardened-runtime entitlements when a Developer
 * ID certificate is available. Local builds made with certificate discovery
 * disabled are unsigned, so a plain `codesign --deep` is insufficient:
 * it drops the main process's disable-library-validation entitlement and dyld
 * refuses Electron Framework before the renderer can paint. Use osx-sign's
 * inside-out walker so every nested executable is signed and the correct main
 * versus inherited entitlement set is preserved.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { signAsync } from '@electron/osx-sign'

export const DEFAULT_LOCAL_SIGNING_IDENTITY = 'Hermes Local Code Signing'

export function createLocalSignOptions(
  app,
  desktopRoot = path.resolve(import.meta.dirname, '..'),
  identity = DEFAULT_LOCAL_SIGNING_IDENTITY,
) {
  const resolvedApp = path.resolve(app)
  const mainEntitlements = path.join(desktopRoot, 'electron', 'entitlements.mac.plist')
  const inheritedEntitlements = path.join(desktopRoot, 'electron', 'entitlements.mac.inherit.plist')

  return {
    app: resolvedApp,
    identity,
    identityValidation: true,
    platform: 'darwin',
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    optionsForFile(file) {
      return {
        entitlements: path.resolve(file) === resolvedApp ? mainEntitlements : inheritedEntitlements,
        hardenedRuntime: true,
        timestamp: 'none'
      }
    }
  }
}

export async function signMacosLocal(app, desktopRoot, identity = DEFAULT_LOCAL_SIGNING_IDENTITY) {
  const resolvedApp = path.resolve(app)

  if (process.platform !== 'darwin') {
    throw new Error('Local My King signing is available only on macOS.')
  }

  if (!resolvedApp.endsWith('.app') || !existsSync(resolvedApp)) {
    throw new Error(`Packaged app not found: ${resolvedApp}`)
  }

  await signAsync(createLocalSignOptions(resolvedApp, desktopRoot, identity))
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const app = process.argv[2]

  if (!app) {
    console.error('Usage: node scripts/sign-macos-adhoc.mjs <path-to-My King.app>')
    process.exitCode = 2
  } else {
    const identity = process.env.MY_KING_SIGN_IDENTITY || DEFAULT_LOCAL_SIGNING_IDENTITY
    await signMacosLocal(app, undefined, identity)
    console.log(`[sign-macos-local] signed ${path.resolve(app)} with ${identity} and hardened runtime entitlements`)
  }
}
