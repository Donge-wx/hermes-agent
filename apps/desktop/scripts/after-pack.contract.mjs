import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import afterPack from './after-pack.mjs'

test('desktop package executables stay distinct from Hermes on every platform', () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

  assert.equal(packageJson.build.mac.extendInfo.CFBundleExecutable, 'My King')
  assert.equal(packageJson.build.win.executableName, 'My-King')
  assert.equal(packageJson.build.linux.executableName, 'my-king')
})

test('macOS keeps the My King bundle and My King executable identity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'my-king-after-pack-'))
  const appPath = path.join(root, 'My King.app')
  const macosPath = path.join(appPath, 'Contents', 'MacOS')
  const resourcesPath = path.join(appPath, 'Contents', 'Resources')
  const infoPath = path.join(appPath, 'Contents', 'Info.plist')

  try {
    fs.mkdirSync(macosPath, { recursive: true })
    fs.mkdirSync(resourcesPath, { recursive: true })
    fs.writeFileSync(path.join(macosPath, 'My King'), 'binary')
    fs.writeFileSync(path.join(resourcesPath, 'icon.icns'), 'approved-my-king-icon')
    fs.writeFileSync(
      infoPath,
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
        '<plist version="1.0"><dict><key>CFBundleExecutable</key><string>My King</string><key>CFBundleIconFile</key><string>icon.icns</string></dict></plist>\n',
    )

    await afterPack({
      appOutDir: root,
      electronPlatformName: 'darwin',
      packager: { appInfo: { productFilename: 'My King' } },
    })

    assert.equal(fs.existsSync(path.join(macosPath, 'Hermes')), false)
    assert.equal(fs.existsSync(path.join(macosPath, 'My King')), true)
    assert.match(fs.readFileSync(infoPath, 'utf8'), /<string>My King<\/string>/)
    assert.equal(fs.readFileSync(path.join(resourcesPath, 'my-king.icns'), 'utf8'), 'approved-my-king-icon')
    assert.match(fs.readFileSync(infoPath, 'utf8'), /<string>my-king\.icns<\/string>/)
    assert.match(fs.readFileSync(infoPath, 'utf8'), /Copyright © 2026 My King/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('macOS fails closed when electron-builder did not emit the My King executable', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'my-king-after-pack-'))
  const appPath = path.join(root, 'My King.app')
  const macosPath = path.join(appPath, 'Contents', 'MacOS')
  const resourcesPath = path.join(appPath, 'Contents', 'Resources')
  const infoPath = path.join(appPath, 'Contents', 'Info.plist')

  try {
    fs.mkdirSync(macosPath, { recursive: true })
    fs.mkdirSync(resourcesPath, { recursive: true })
    fs.writeFileSync(path.join(macosPath, 'Hermes'), 'binary')
    fs.writeFileSync(path.join(resourcesPath, 'icon.icns'), 'approved-my-king-icon')
    fs.writeFileSync(
      infoPath,
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
        '<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Hermes</string><key>CFBundleIconFile</key><string>icon.icns</string></dict></plist>\n',
    )

    await assert.rejects(
      afterPack({
        appOutDir: root,
        electronPlatformName: 'darwin',
        packager: { appInfo: { productFilename: 'My King' } },
      }),
      /Expected macOS executable My King is missing/,
    )

    assert.equal(fs.existsSync(path.join(macosPath, 'Hermes')), true)
    assert.equal(fs.existsSync(path.join(macosPath, 'My King')), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
