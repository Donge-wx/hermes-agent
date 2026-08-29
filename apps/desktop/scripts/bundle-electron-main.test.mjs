import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { test } from 'vitest'

import { readElectronBuildAppId } from './electron-build-identity.mjs'

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('development and production Electron bundles embed build.appId at both startup migration decisions', () => {
  for (const args of [['scripts/bundle-electron-main.mjs', '--dev'], ['scripts/bundle-electron-main.mjs']]) {
    execFileSync(process.execPath, args, { cwd: desktopRoot, stdio: 'pipe' })

    const bundle = fs.readFileSync(path.join(desktopRoot, 'dist', 'electron-main.mjs'), 'utf8')

    assert.equal(bundle.match(/buildAppId:\s*"com\.myking\.workos\.desktop"/g)?.length, 2)
    assert.doesNotMatch(bundle, /__HERMES_DESKTOP_BUILD_APP_ID__/)
  }
})

test('build identity follows package configuration for an ordinary Hermes build', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-build-identity-'))
  const packageJsonPath = path.join(tempRoot, 'package.json')

  try {
    fs.writeFileSync(packageJsonPath, JSON.stringify({ build: { appId: 'com.nousresearch.hermes' } }))
    assert.equal(readElectronBuildAppId(packageJsonPath), 'com.nousresearch.hermes')
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true })
  }
})
