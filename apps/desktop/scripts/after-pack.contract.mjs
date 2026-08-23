import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import afterPack from './after-pack.mjs'

test('macOS keeps the My King bundle while preserving the Hermes executable', async () => {
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

    assert.equal(fs.existsSync(path.join(macosPath, 'Hermes')), true)
    assert.equal(fs.existsSync(path.join(macosPath, 'My King')), false)
    assert.match(fs.readFileSync(infoPath, 'utf8'), /<string>Hermes<\/string>/)
    assert.equal(fs.readFileSync(path.join(resourcesPath, 'my-king.icns'), 'utf8'), 'approved-my-king-icon')
    assert.match(fs.readFileSync(infoPath, 'utf8'), /<string>my-king\.icns<\/string>/)
    assert.match(fs.readFileSync(infoPath, 'utf8'), /Copyright © 2026 My King/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('macOS accepts a My King bundle whose executable is already Hermes', async () => {
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

    await afterPack({
      appOutDir: root,
      electronPlatformName: 'darwin',
      packager: { appInfo: { productFilename: 'My King' } },
    })

    assert.equal(fs.existsSync(path.join(macosPath, 'Hermes')), true)
    assert.equal(fs.existsSync(path.join(macosPath, 'My King')), false)
    assert.match(fs.readFileSync(infoPath, 'utf8'), /<string>Hermes<\/string>/)
    assert.equal(fs.readFileSync(path.join(resourcesPath, 'my-king.icns'), 'utf8'), 'approved-my-king-icon')
    assert.match(fs.readFileSync(infoPath, 'utf8'), /<string>my-king\.icns<\/string>/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
