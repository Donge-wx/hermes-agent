import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { test } from 'vitest'

test('electron-builder always embeds the prepared offline My King runtime', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
  const resources = packageJson.build?.extraResources ?? []
  const bundled = resources.find((entry: { to?: string }) => entry.to === 'my-king-runtime')

  assert.ok(bundled, 'extraResources must include the offline My King runtime')
  assert.equal(bundled.from, 'build/bundled/current')
})

test('employee installers prepare a platform-specific payload before packaging', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))

  assert.match(packageJson.scripts['dist:mac:dmg'], /prepare-bundled-backend\.mjs --platform darwin --arch arm64/)
  assert.match(packageJson.scripts['dist:win:nsis'], /prepare-bundled-backend\.mjs --platform win32 --arch x64/)
})

test('employee installers embed install identity, connector helpers, protocol registration, and Chinese NSIS cleanup', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
  const resources = packageJson.build?.extraResources ?? []

  assert.ok(resources.some((entry: { to?: string }) => entry.to === 'install-stamp.json'))
  assert.ok(resources.some((entry: { to?: string }) => entry.to === 'employee-connector'))
  assert.deepEqual(packageJson.build?.protocols?.[0]?.schemes, ['myking'])
  assert.equal(packageJson.build?.nsis?.language, '2052')
  assert.deepEqual(packageJson.build?.nsis?.installerLanguages, ['zh_CN'])
  assert.equal(packageJson.build?.nsis?.include, 'assets/employee-connector/installer.nsh')
  const installerInclude = fs.readFileSync(path.resolve('assets/employee-connector/installer.nsh'), 'utf8')

  assert.match(installerInclude, /customUnInstall[\s\S]+myking-employee-connector-windows\.ps1/)
  assert.match(installerInclude, /IfFileExists "\$PROGRAMDATA\\MyKing\\EmployeeConnector\\\*\.\*"/)
})

test('desktop public assets expose the backend login lockup at its fixed URL', () => {
  assert.equal(fs.existsSync(path.resolve('public/assets/my-king-lockup.png')), true)
})
