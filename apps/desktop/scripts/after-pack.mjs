/**
 * after-pack.mjs — electron-builder afterPack hook.
 *
 * Keeps platform packaging aligned with the public My King brand:
 *
 * - macOS: keep My King.app, its Contents/MacOS/My King executable, and its
 *   My King Helper apps distinct from a parallel Hermes installation. Copy
 *   the approved icon to a brand-unique filename so LaunchServices cannot
 *   reuse an old Hermes icon cached under `icon.icns`.
 * - Windows: stamp the packed My-King.exe icon + visible identity via resedit.
 *
 * The macOS identity correction is load-bearing and fails the build if it
 * cannot be completed; shipping a mismatched bundle/executable would make the
 * app fail at launch. The Windows resource stamp remains best-effort because its worst
 * failure mode is cosmetic, not an unlaunchable app.
 *
 * electron-builder passes a context with:
 *   - electronPlatformName: 'win32' | 'darwin' | 'linux'
 *   - appOutDir:            the unpacked app directory for this target
 *   - packager.appInfo.productFilename: the public executable basename
 */

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { stampExeIdentity } from './set-exe-identity.mjs'

const execFileAsync = promisify(execFile)
const MAC_ICON_FILENAME = 'my-king.icns'
const PUBLIC_COPYRIGHT = 'Copyright © 2026 My King'

async function configureMacExecutable(context) {
  const productFilename = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${productFilename}.app`)
  const macosPath = path.join(appPath, 'Contents', 'MacOS')
  const infoPath = path.join(appPath, 'Contents', 'Info.plist')
  const resourcesPath = path.join(appPath, 'Contents', 'Resources')
  const publicExecutablePath = path.join(macosPath, productFilename)
  try {
    await fs.access(publicExecutablePath)
  } catch {
    throw new Error(`Expected macOS executable ${productFilename} is missing from ${macosPath}`)
  }
  await execFileAsync('/usr/bin/plutil', [
    '-replace',
    'CFBundleExecutable',
    '-string',
    productFilename,
    infoPath,
  ])
  await execFileAsync('/usr/bin/plutil', [
    '-replace',
    'NSHumanReadableCopyright',
    '-string',
    PUBLIC_COPYRIGHT,
    infoPath,
  ]).catch(async () => {
    await execFileAsync('/usr/bin/plutil', [
      '-insert',
      'NSHumanReadableCopyright',
      '-string',
      PUBLIC_COPYRIGHT,
      infoPath,
    ])
  })
  await fs.copyFile(path.join(resourcesPath, 'icon.icns'), path.join(resourcesPath, MAC_ICON_FILENAME))
  await execFileAsync('/usr/bin/plutil', [
    '-replace',
    'CFBundleIconFile',
    '-string',
    MAC_ICON_FILENAME,
    infoPath,
  ])
  console.log(
    `[after-pack] kept ${productFilename}.app with ${productFilename} executable and ${MAC_ICON_FILENAME}`,
  )
}

export default async function afterPack(context) {
  if (context.electronPlatformName === 'darwin') {
    await configureMacExecutable(context)
    return
  }

  if (context.electronPlatformName !== 'win32') {
    return
  }

  const productName = context.packager?.appInfo?.productFilename || 'My-King'
  const exe = path.join(context.appOutDir, `${productName}.exe`)
  const desktopRoot = path.resolve(import.meta.dirname, '..')

  try {
    await stampExeIdentity(exe, desktopRoot)
  } catch (err) {
    // Never fail the build over a cosmetic stamp.
    console.warn(`[after-pack] exe identity stamp failed (${err.message}); ${productName}.exe keeps the stock Electron icon`)
  }
}
