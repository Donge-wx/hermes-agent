#!/usr/bin/env node
// set-exe-identity.mjs — stamp the My King icon + version metadata onto the
// built My-King.exe using resedit, completely decoupled from electron-builder's
// signing path.
//
// WHY THIS EXISTS
// ---------------
// apps/desktop/package.json sets build.win.signAndEditExecutable=false. That
// flag is load-bearing: turning electron-builder's own exe-editing ON also
// re-enables its signtool step, which fetches winCodeSign-2.6.0.7z, whose
// macOS symlinks crash 7-Zip on non-admin Windows (no Developer Mode = no
// SeCreateSymbolicLinkPrivilege). That is an unfixable dead end — we do NOT
// try to extract winCodeSign.
//
// The cost of disabling signAndEditExecutable is that electron-builder also
// skips resource editing, so the unpacked My-King.exe keeps the stock Electron
// icon and "Electron" taskbar name. This script restores the icon + identity
// with the pure-JavaScript resedit library: no Wine, signing, certs,
// winCodeSign, or symlinks.
//
// HOW IT RUNS
// -----------
// Primarily as an electron-builder `afterPack` hook (scripts/after-pack.mjs),
// so EVERY packed build — first install, `hermes desktop`, the installer's
// --update rebuild, or a dev's manual `npm run pack` — gets a branded exe from
// one place. Previously this stamp lived only in install.ps1, so the update
// path (which rebuilds via `hermes desktop --build-only`, never install.ps1)
// shipped a stock "Electron" exe. Keeping it in afterPack closes that gap.
//
// Also runnable standalone for ad-hoc re-stamping:
//   node scripts/set-exe-identity.mjs <path-to-My-King.exe>
//
// Exits 0 on success, non-zero on failure when run as a CLI. As a hook,
// stampExeIdentity() resolves on success and rejects on failure; the caller
// (after-pack.mjs) swallows the rejection so a stamp failure never fails an
// otherwise-good build (worst case: stock icon, not a broken app).

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit'

import { isMain } from './utils.mjs'

// Stamp the My King icon + identity onto `exe`. Resolves on success, throws on
// failure. `desktopRoot` defaults to this script's package root so the icon and
// the rcedit dependency resolve regardless of cwd.
async function stampExeIdentity(exe, desktopRoot = resolve(import.meta.dirname, '..')) {
  if (!exe || !existsSync(exe)) {
    throw new Error(`target exe not found: ${exe}`)
  }

  // Icon lives at apps/desktop/assets/icon.ico
  const icon = join(desktopRoot, 'assets', 'icon.ico')
  if (!existsSync(icon)) {
    throw new Error(`icon not found: ${icon}`)
  }

  console.log(`[set-exe-identity] stamping ${exe}`)
  console.log(`[set-exe-identity] icon: ${icon}`)

  const executable = NtExecutable.from(await fs.readFile(exe), { ignoreCert: true })
  const resources = NtExecutableResource.from(executable)
  const icons = Data.IconFile.from(await fs.readFile(icon)).icons.map(item => item.data)
  const iconGroups = Resource.IconGroupEntry.fromEntries(resources.entries)
  const targets = iconGroups.length > 0 ? iconGroups : [{ id: 101, lang: 1033 }]

  for (const target of targets) {
    Resource.IconGroupEntry.replaceIconsForResource(resources.entries, target.id, target.lang, icons)
  }

  const versions = Resource.VersionInfo.fromEntries(resources.entries)
  const versionTargets = versions.length > 0 ? versions : [Resource.VersionInfo.createEmpty()]

  for (const version of versionTargets) {
    const languages = version.getAllLanguagesForStringValues()
    const translations = languages.length > 0 ? languages : [{ lang: 1033, codepage: 1200 }]

    for (const translation of translations) {
      version.setStringValues(translation, {
        ProductName: 'My King',
        FileDescription: 'My King',
        CompanyName: 'My King',
        InternalName: 'My-King.exe',
        OriginalFilename: 'My-King.exe',
        LegalCopyright: 'Copyright (c) 2026 My King',
        LegalTrademarks: 'My King'
      })
    }

    version.outputToResourceEntries(resources.entries)
  }

  resources.outputResource(executable)
  const output = Buffer.from(executable.generate())
  const temporary = join(dirname(exe), `.${basename(exe)}.my-king-stamp-${process.pid}`)

  try {
    await fs.writeFile(temporary, output)
    await fs.rename(temporary, exe)
  } finally {
    await fs.rm(temporary, { force: true })
  }

  console.log('[set-exe-identity] done — My King icon + identity stamped')
}

export { stampExeIdentity }

// CLI entry point: `node scripts/set-exe-identity.mjs <exe>`.
if (isMain(import.meta.url)) {
  const exe = process.argv[2]
  if (!exe) {
    console.error('[set-exe-identity] usage: set-exe-identity.mjs <path-to-exe>')
    process.exit(2)
  }
  stampExeIdentity(exe).catch(err => {
    console.error(`[set-exe-identity] ${err.message}`)
    process.exit(1)
  })
}
