import assert from 'node:assert/strict'
import test from 'node:test'

import { myKingEmployeeArtifactName, shouldUseLocalElectronDist } from './electron-builder-target.mjs'

test('does not reuse a macOS Electron distribution for a Windows target', () => {
  assert.equal(shouldUseLocalElectronDist('darwin', ['--win', 'nsis', '--x64']), false)
})

test('reuses the installed Electron distribution for a matching macOS target', () => {
  assert.equal(shouldUseLocalElectronDist('darwin', ['--mac', 'dmg', '--arm64']), true)
})

test('uses the employee setup filename only for employee distributions', () => {
  assert.equal(myKingEmployeeArtifactName({}), null)
  assert.equal(
    myKingEmployeeArtifactName({ MYKING_EMPLOYEE_ENROLLMENT_BASE_URL: 'https://enroll.myking.test' }),
    'My-King-Employee-Setup-${arch}.${ext}'
  )
  assert.equal(
    myKingEmployeeArtifactName({ MYKING_MANAGED_EMPLOYEE_GATEWAY_URL: 'https://gateway.myking.test' }),
    'My-King-Employee-Setup-${arch}.${ext}'
  )
})
