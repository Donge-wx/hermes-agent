import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { MY_KING_APP_ID } from './application-menu-labels'
import { copyLegacyHermesDataIfNeeded, copyLegacyUserDataIfNeeded } from './my-king-migration'
import { migrateLegacyHermesDataIfAllowed } from './my-king-paths'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true })
  }
})

function migrationPaths(sourceName: string, targetName: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'my-king-migration-policy-'))
  roots.push(root)

  return {
    source: path.join(root, sourceName),
    target: path.join(root, targetName)
  }
}

describe('managed My King legacy migration strategy', () => {
  it('does not copy legacy Electron user data when a packaged My King launch inherits a Hermes name override', () => {
    const { source, target } = migrationPaths('Application Support/Hermes', 'Application Support/My King')
    fs.mkdirSync(source, { recursive: true })
    fs.writeFileSync(path.join(source, 'native-theme.json'), '{"theme":"legacy"}')
    const previousNameOverride = process.env.HERMES_DESKTOP_APP_NAME
    process.env.HERMES_DESKTOP_APP_NAME = 'Hermes'

    try {
      expect(
        migrateLegacyHermesDataIfAllowed({
          buildAppId: MY_KING_APP_ID,
          copy: copyLegacyUserDataIfNeeded,
          source,
          target
        })
      ).toBe(false)
    } finally {
      if (previousNameOverride === undefined) {
        delete process.env.HERMES_DESKTOP_APP_NAME
      } else {
        process.env.HERMES_DESKTOP_APP_NAME = previousNameOverride
      }
    }

    expect(fs.existsSync(target)).toBe(false)
    expect(fs.existsSync(path.join(source, 'native-theme.json'))).toBe(true)
  })

  it('does not copy the legacy Hermes home for a packaged My King build', () => {
    const { source, target } = migrationPaths('.hermes', '.myking')
    fs.mkdirSync(source, { recursive: true })
    fs.writeFileSync(path.join(source, 'config.yaml'), 'model: legacy')

    expect(
      migrateLegacyHermesDataIfAllowed({
        buildAppId: MY_KING_APP_ID,
        copy: copyLegacyHermesDataIfNeeded,
        source,
        target
      })
    ).toBe(false)
    expect(fs.existsSync(target)).toBe(false)
    expect(fs.existsSync(path.join(source, 'config.yaml'))).toBe(true)
  })

  it('preserves real legacy-home migration for a packaged Hermes build', () => {
    const { source, target } = migrationPaths('.hermes', '.hermes-next')
    fs.mkdirSync(source, { recursive: true })
    fs.writeFileSync(path.join(source, 'config.yaml'), 'model: hermes')

    expect(
      migrateLegacyHermesDataIfAllowed({
        buildAppId: 'com.nousresearch.hermes',
        copy: copyLegacyHermesDataIfNeeded,
        source,
        target
      })
    ).toBe(true)
    expect(fs.readFileSync(path.join(target, 'config.yaml'), 'utf8')).toBe('model: hermes')
  })
})
