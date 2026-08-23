/**
 * after-pack.mjs — electron-builder afterPack hook.
 *
 * Keeps platform packaging aligned with the public My King brand while the
 * compatibility executable remains Hermes:
 *
 * - macOS: electron-builder first creates My King.app and My King Helper apps.
 *   Before signing, rename only Contents/MacOS/My King to Hermes and update
 *   CFBundleExecutable. Copy the approved icon to a brand-unique filename so
 *   LaunchServices cannot reuse an old Hermes icon cached under `icon.icns`.
 *   The outer bundle and helpers stay natively My King.
 * - Windows: stamp the packed Hermes.exe icon + visible identity via rcedit.
 *
 * The macOS conversion is load-bearing and fails the build if it cannot be
 * completed; shipping a mismatched bundle/executable would make the app fail
 * at launch. The Windows resource stamp remains best-effort because its worst
 * failure mode is cosmetic, not an unlaunchable app.
 *
 * electron-builder passes a context with:
 *   - electronPlatformName: 'win32' | 'darwin' | 'linux'
 *   - appOutDir:            the unpacked app directory for this target
 *   - packager.appInfo.productFilename: the exe basename (e.g. 'Hermes')
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { stampExeIdentity } from './set-exe-identity.mjs'

const execFileAsync = promisify(execFile)
const INTERNAL_EXECUTABLE_NAME = 'Hermes'
const MAC_ICON_FILENAME = 'my-king.icns'
const PUBLIC_COPYRIGHT = 'Copyright © 2026 My King'

async function configureMacExecutable(context) {
  const productFilename = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${productFilename}.app`)
  const macosPath = path.join(appPath, 'Contents', 'MacOS')
  const infoPath = path.join(appPath, 'Contents', 'Info.plist')
  const resourcesPath = path.join(appPath, 'Contents', 'Resources')
  const internalExecutablePath = path.join(macosPath, INTERNAL_EXECUTABLE_NAME)

  if (!existsSync(internalExecutablePath)) {
    await fs.rename(path.join(macosPath, productFilename), internalExecutablePath)
  }
  await execFileAsync('/usr/bin/plutil', [
    '-replace',
    'CFBundleExecutable',
    '-string',
    INTERNAL_EXECUTABLE_NAME,
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
    `[after-pack] kept ${productFilename}.app with internal ${INTERNAL_EXECUTABLE_NAME} executable and ${MAC_ICON_FILENAME}`,
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

  const productName = context.packager?.appInfo?.productFilename || 'Hermes'
  const exe = path.join(context.appOutDir, `${productName}.exe`)
  const desktopRoot = path.resolve(import.meta.dirname, '..')

  try {
    await stampExeIdentity(exe, desktopRoot)
  } catch (err) {
    // Never fail the build over a cosmetic stamp.
    console.warn(`[after-pack] exe identity stamp failed (${err.message}); Hermes.exe keeps the stock Electron icon`)
  }
}
