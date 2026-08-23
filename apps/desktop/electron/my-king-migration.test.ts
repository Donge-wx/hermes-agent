import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { copyLegacyHermesDataIfNeeded, copyLegacyUserDataIfNeeded } from './my-king-migration'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true })
  }
})

function sandbox(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'my-king-migration-'))
  roots.push(root)
  return root
}

describe('copyLegacyUserDataIfNeeded', () => {
  it('copies safe appearance settings without deleting the Hermes source', () => {
    const root = sandbox()
    const source = path.join(root, 'Hermes')
    const target = path.join(root, 'My King')
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(source, 'native-theme.json'), '{"source":"liquid-glass"}')
    fs.writeFileSync(path.join(source, 'backend-ownership.json'), '{"pid":123}')
    fs.writeFileSync(path.join(source, 'native-oauth-tokens.json'), 'encrypted')

    expect(copyLegacyUserDataIfNeeded(source, target)).toBe(true)
    expect(fs.readFileSync(path.join(target, 'native-theme.json'), 'utf8')).toBe('{"source":"liquid-glass"}')
    expect(fs.existsSync(path.join(target, 'backend-ownership.json'))).toBe(false)
    expect(fs.existsSync(path.join(target, 'native-oauth-tokens.json'))).toBe(false)
    expect(fs.existsSync(path.join(source, 'native-theme.json'))).toBe(true)
  })

  it('never overwrites an existing My King directory', () => {
    const root = sandbox()
    const source = path.join(root, 'Hermes')
    const target = path.join(root, 'My King')
    fs.mkdirSync(source)
    fs.mkdirSync(target)
    fs.writeFileSync(path.join(source, 'native-theme.json'), 'legacy')
    fs.writeFileSync(path.join(target, 'native-theme.json'), 'current')

    expect(copyLegacyUserDataIfNeeded(source, target)).toBe(false)
    expect(fs.readFileSync(path.join(target, 'native-theme.json'), 'utf8')).toBe('current')
  })
})

describe('copyLegacyHermesDataIfNeeded', () => {
  it('copies user data but leaves the Hermes runtime and volatile files isolated', () => {
    const root = sandbox()
    const source = path.join(root, '.hermes')
    const target = path.join(root, '.myking')
    fs.mkdirSync(path.join(source, 'hermes-agent'), { recursive: true })
    fs.mkdirSync(path.join(source, 'logs'), { recursive: true })
    fs.mkdirSync(path.join(source, 'hermes-agent-update-integration-20260822-test'), { recursive: true })
    fs.mkdirSync(path.join(source, 'app-backups'), { recursive: true })
    fs.mkdirSync(path.join(source, 'hermes-agent.broken-20260818-164548'), { recursive: true })
    fs.mkdirSync(path.join(source, 'skills'), { recursive: true })
    fs.writeFileSync(path.join(source, 'config.yaml'), 'model: test')
    fs.writeFileSync(path.join(source, '.env'), 'TOKEN=secret')
    fs.writeFileSync(path.join(source, 'skills', 'custom.md'), 'custom')
    fs.writeFileSync(path.join(source, 'hermes-agent', 'runtime.py'), 'runtime')
    fs.writeFileSync(path.join(source, 'logs', 'agent.log'), 'log')
    fs.writeFileSync(path.join(source, 'hermes-agent-update-integration-20260822-test', 'runtime.py'), 'runtime')
    fs.writeFileSync(path.join(source, 'app-backups', 'Hermes.app.zip'), 'backup')
    fs.writeFileSync(path.join(source, 'hermes-agent.broken-20260818-164548', 'runtime.py'), 'runtime')
    fs.writeFileSync(path.join(source, 'install_id'), 'legacy-install-id')

    expect(copyLegacyHermesDataIfNeeded(source, target)).toBe(true)
    expect(fs.readFileSync(path.join(target, 'config.yaml'), 'utf8')).toBe('model: test')
    expect(fs.readFileSync(path.join(target, '.env'), 'utf8')).toBe('TOKEN=secret')
    expect(fs.readFileSync(path.join(target, 'skills', 'custom.md'), 'utf8')).toBe('custom')
    expect(fs.existsSync(path.join(target, 'hermes-agent'))).toBe(false)
    expect(fs.existsSync(path.join(target, 'logs'))).toBe(false)
    expect(fs.existsSync(path.join(target, 'hermes-agent-update-integration-20260822-test'))).toBe(false)
    expect(fs.existsSync(path.join(target, 'app-backups'))).toBe(false)
    expect(fs.existsSync(path.join(target, 'hermes-agent.broken-20260818-164548'))).toBe(false)
    expect(fs.existsSync(path.join(target, 'install_id'))).toBe(false)
  })
})
