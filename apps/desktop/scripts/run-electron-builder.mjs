// Resolve electronDist at runtime (#38673, #47917): electron-builder 26.8.x can
// re-unpack a broken Electron.app; reusing the installed dist dodges that.
// npm workspace hoisting is non-deterministic — require.resolve finds electron
// wherever it landed. Dist present → -c.electronDist=<abs>/dist; absent → let
// electron-builder fetch via @electron/get (electronVersion + ELECTRON_MIRROR).

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function electronDistDir() {
  try {
    return path.join(path.dirname(require.resolve('electron/package.json')), 'dist')
  } catch {
    return null
  }
}

function distBinary(dist) {
  if (process.platform === 'darwin') {
    return path.join(dist, 'Electron.app', 'Contents', 'MacOS', 'Electron')
  }
  if (process.platform === 'win32') {
    return path.join(dist, 'electron.exe')
  }
  return path.join(dist, 'electron')
}

function electronBuilderCli() {
  const pkgJson = require.resolve('electron-builder/package.json')
  const bin = require(pkgJson).bin
  const rel = typeof bin === 'string' ? bin : bin['electron-builder']
  return path.join(path.dirname(pkgJson), rel)
}

const dist = electronDistDir()
const args = []
const cliArgs = process.argv.slice(2)
const requestedArch = cliArgs.includes('--arm64')
  ? 'arm64'
  : cliArgs.includes('--x64')
    ? 'x64'
    : cliArgs.includes('--ia32')
      ? 'ia32'
      : null

// A custom electronDist is copied verbatim by electron-builder. Reusing an
// arm64 host's Electron.app for an explicit x64 build (or vice versa) produces
// a mislabeled, unusable package. Keep the fast local-dist path only when the
// requested target matches this Node process; otherwise let @electron/get
// download the correct Electron distribution for the target architecture.
const localDistMatchesTarget = !requestedArch || requestedArch === process.arch

if (dist && fs.existsSync(distBinary(dist)) && localDistMatchesTarget) {
  args.push(`-c.electronDist=${dist}`)
} else {
  console.warn(
    requestedArch && requestedArch !== process.arch
      ? `[run-electron-builder] target ${requestedArch} differs from host ${process.arch}; ` +
          'electron-builder will fetch a matching Electron distribution.'
      : '[run-electron-builder] no local electron dist; electron-builder will fetch ' +
          'via @electron/get (electronVersion + ELECTRON_MIRROR).'
  )
}
args.push(...cliArgs)

const result = spawnSync(process.execPath, [electronBuilderCli(), ...args], {
  stdio: 'inherit'
})
if (result.error) {
  console.error(`[run-electron-builder] spawn failed: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status == null ? 1 : result.status)
