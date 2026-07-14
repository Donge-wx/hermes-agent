import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

if (process.platform !== 'darwin') {
  process.exit(0)
}

const desktopRoot = path.resolve(import.meta.dirname, '..')
const source = path.join(desktopRoot, 'assets', 'icon.png')
const output = path.join(desktopRoot, 'assets', 'icon.icns')

if (!existsSync(source)) {
  throw new Error(`Missing macOS icon source: ${source}`)
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'vanyue-icon-'))
const iconset = path.join(tempRoot, 'icon.iconset')
mkdirSync(iconset, { recursive: true })

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })

  if (result.error || result.status !== 0) {
    throw result.error || new Error(`${command} exited with ${result.status}`)
  }
}

const variants = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
]

try {
  for (const [name, size] of variants) {
    run('sips', ['-z', String(size), String(size), source, '--out', path.join(iconset, name)])
  }

  run('iconutil', ['-c', 'icns', iconset, '-o', output])
  console.log(`[prepare-mac-icon] wrote ${output}`)
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
