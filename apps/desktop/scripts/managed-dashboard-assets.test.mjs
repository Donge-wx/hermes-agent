import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { stageManagedDashboardAssets } from './managed-dashboard-assets.mjs'

test('stages the branded login assets and built dashboard into the offline backend', t => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'my-king-dashboard-assets-'))
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }))

  const repoRoot = path.join(scratch, 'repo')
  const backendRoot = path.join(scratch, 'backend')
  const sourceWebDist = path.join(repoRoot, 'hermes_cli', 'web_dist')
  const sourceAuthAssets = path.join(repoRoot, 'web', 'public', 'assets')
  const bundledAuth = path.join(backendRoot, 'hermes_cli', 'dashboard_auth')

  fs.mkdirSync(path.join(sourceWebDist, 'assets'), { recursive: true })
  fs.mkdirSync(sourceAuthAssets, { recursive: true })
  fs.mkdirSync(bundledAuth, { recursive: true })
  fs.writeFileSync(path.join(sourceWebDist, 'index.html'), '<title>My King 管理后台</title>')
  fs.writeFileSync(path.join(sourceWebDist, 'assets', 'index.js'), 'console.log("My King")')
  fs.writeFileSync(path.join(sourceWebDist, 'assets', 'my-king-lockup.png'), 'web-brand')
  fs.writeFileSync(path.join(sourceAuthAssets, 'my-king-lockup.png'), 'brand')
  fs.writeFileSync(
    path.join(bundledAuth, 'login_page.py'),
    'LOGIN = \'<img src="/assets/my-king-lockup.png" alt="My King">\'',
  )

  stageManagedDashboardAssets({ repoRoot, backendRoot })

  assert.equal(
    fs.readFileSync(path.join(backendRoot, 'hermes_cli', 'web_dist', 'index.html'), 'utf8'),
    '<title>My King 管理后台</title>',
  )
  assert.equal(
    fs.readFileSync(
      path.join(backendRoot, 'hermes_cli', 'dashboard_auth', 'assets', 'my-king-lockup.png'),
      'utf8',
    ),
    'brand',
  )
  assert.equal(
    fs.readFileSync(
      path.join(backendRoot, 'hermes_cli', 'web_dist', 'assets', 'my-king-lockup.png'),
      'utf8',
    ),
    'web-brand',
  )
})
