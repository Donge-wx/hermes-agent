import assert from 'node:assert/strict'
import path from 'node:path'

import { describe, it } from 'vitest'

import { resolveBundledBackend } from './bundled-backend'

describe('bundled My King backend contract', () => {
  it('resolves the macOS payload without depending on a mutable user install', () => {
    const resourcesPath = '/Applications/My King.app/Contents/Resources'

    const existing = new Set([
      path.posix.join(resourcesPath, 'my-king-runtime', 'backend', 'hermes_cli', 'main.py'),
      path.posix.join(resourcesPath, 'my-king-runtime', 'python', 'bin', 'python3.11'),
      path.posix.join(resourcesPath, 'my-king-runtime', 'python', 'lib', 'python3.11', 'site-packages', 'fastapi', '__init__.py'),
      path.posix.join(resourcesPath, 'my-king-runtime', 'python', 'lib', 'python3.11', 'site-packages', 'uvicorn', '__init__.py')
    ])

    const result = resolveBundledBackend({
      resourcesPath,
      platform: 'darwin',
      pathModule: path.posix,
      exists: candidate => existing.has(candidate)
    })

    assert.equal(result.ok, true)

    if (!result.ok) {
      return
    }

    assert.equal(result.command, path.posix.join(resourcesPath, 'my-king-runtime', 'python', 'bin', 'python3.11'))
    assert.equal(result.backendRoot, path.posix.join(resourcesPath, 'my-king-runtime', 'backend'))
  })

  it('resolves the Windows x64 payload with Windows-native paths', () => {
    const resourcesPath = 'C:\\Program Files\\My King\\resources'

    const existing = new Set([
      path.win32.join(resourcesPath, 'my-king-runtime', 'backend', 'hermes_cli', 'main.py'),
      path.win32.join(resourcesPath, 'my-king-runtime', 'python', 'python.exe'),
      path.win32.join(resourcesPath, 'my-king-runtime', 'python', 'Lib', 'site-packages', 'fastapi', '__init__.py'),
      path.win32.join(resourcesPath, 'my-king-runtime', 'python', 'Lib', 'site-packages', 'uvicorn', '__init__.py')
    ])

    const result = resolveBundledBackend({
      resourcesPath,
      platform: 'win32',
      pathModule: path.win32,
      exists: candidate => existing.has(candidate)
    })

    assert.equal(result.ok, true)

    if (!result.ok) {
      return
    }

    assert.equal(result.command, path.win32.join(resourcesPath, 'my-king-runtime', 'python', 'python.exe'))
  })

  it('fails closed with an explicit missing-resource list', () => {
    const result = resolveBundledBackend({
      resourcesPath: '/empty/resources',
      platform: 'darwin',
      pathModule: path.posix,
      exists: () => false
    })

    assert.equal(result.ok, false)

    if (result.ok) {
      return
    }

    assert.match(result.message, /安装包不完整/)
    assert.ok(result.missing.length >= 4)
  })
})
