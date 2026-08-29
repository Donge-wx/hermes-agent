#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appPath = process.argv[2] || path.join(DESKTOP_ROOT, 'release', 'mac-arm64', 'My King.app')
const executablePath =
  process.platform === 'darwin' ? path.join(appPath, 'Contents', 'MacOS', 'My King') : appPath
const installStampPath = path.join(appPath, 'Contents', 'Resources', 'install-stamp.json')
const installStamp = JSON.parse(fs.readFileSync(installStampPath, 'utf8'))
const employeeBuild = Boolean(installStamp.employeeEnrollmentBaseUrl)
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'my-king-offline-qa-'))
const userData = path.join(sandbox, 'user-data')
const workspace = path.join(sandbox, 'workspace')
const screenshot = path.join(DESKTOP_ROOT, 'release', 'qa', 'mac-packaged-fresh-zh.png')
const mainScreenshot = path.join(DESKTOP_ROOT, 'release', 'qa', 'mac-packaged-main-zh.png')
const evidencePath = path.join(DESKTOP_ROOT, 'release', 'qa', 'mac-packaged-offline-evidence.json')

fs.mkdirSync(userData, { recursive: true })
fs.mkdirSync(workspace, { recursive: true })
fs.mkdirSync(path.dirname(screenshot), { recursive: true })

const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !/(?:_API_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIALS)$/.test(name))
)

const app = await electron.launch({
  executablePath,
  env: {
    ...cleanEnv,
    ALL_PROXY: 'http://127.0.0.1:9',
    HTTP_PROXY: 'http://127.0.0.1:9',
    HTTPS_PROXY: 'http://127.0.0.1:9',
    NO_PROXY: '127.0.0.1,localhost,::1',
    HERMES_DESKTOP_CDP_PORT: 'off',
    HERMES_DESKTOP_CWD: workspace,
    HERMES_DESKTOP_IGNORE_EXISTING: '1',
    HERMES_DESKTOP_USER_DATA_DIR: userData
  }
})

try {
  const page = await app.firstWindow({ timeout: 90_000 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 90_000 })
  const skipProviderButton = page.getByRole('button', { name: '稍后再选择提供方', exact: true })
  if (employeeBuild) {
    await page.locator('[data-slot="employee-enrollment-gate"]').waitFor({ state: 'visible', timeout: 90_000 })
  } else {
    await skipProviderButton.waitFor({ state: 'visible', timeout: 90_000 })
  }

  const body = await page.locator('body').innerText()
  assert.doesNotMatch(body, /Setting up My King|Install dependencies|My King couldn't start|Repair install/i)
  assert.doesNotMatch(body, /fetching install\.sh|downloading dependencies/i)
  assert.doesNotMatch(body, /Connect this device with My King Employee Enrollment/i)
  assert.doesNotMatch(body, /\bSESSIONS\b|\bBOTS\b|Local \/ custom endpoint/)
  assert.match(body, /[\u3400-\u9fff]/, 'fresh packaged UI must render Simplified Chinese copy')
  const requiredCopies = employeeBuild
    ? ['连接 AI Work OS', '员工账号', '密码', '登录并连接', '查看诊断信息']
    : ['会话', '机器人', '技能与工具', '消息平台', '网关', '开始设置 My King Agent', '稍后再选择提供方']
  for (const requiredCopy of requiredCopies) {
    assert.match(body, new RegExp(requiredCopy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  const installOverlayCount = await page.locator('[data-slot="desktop-install-overlay"]').count()
  assert.equal(installOverlayCount, 0)

  const contentBounds = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.getContentBounds()
  )
  assert(contentBounds, 'packaged window content bounds must be available')
  await page.screenshot({
    path: screenshot,
    animations: 'disabled',
    caret: 'hide',
    clip: { x: 0, y: 0, width: contentBounds.width, height: contentBounds.height }
  })

  if (!employeeBuild) {
    await skipProviderButton.dispatchEvent('click')
    await page.waitForFunction(() => !document.body.innerText.includes('开始设置 My King Agent'), null, {
      timeout: 10_000
    })
    await page.screenshot({
      path: mainScreenshot,
      animations: 'disabled',
      caret: 'hide',
      clip: { x: 0, y: 0, width: contentBounds.width, height: contentBounds.height }
    })
  }

  const runtimeHome = path.join(userData, 'hermes-home')
  assert.equal(fs.existsSync(path.join(runtimeHome, 'hermes-agent', 'venv')), false)

  const logs = []
  if (fs.existsSync(userData)) {
    for (const entry of fs.readdirSync(userData, { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && /\.log$/i.test(entry.name)) {
        logs.push(fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
      }
    }
  }
  const logText = logs.join('\n')
  assert.doesNotMatch(logText, /fetching install\.sh|raw\.githubusercontent\.com|bootstrap-needed/i)
  if (!employeeBuild) {
    assert.match(logText, /Using My King bundled backend/)
    assert.match(logText, /HERMES_BACKEND_READY port=\d+/)
    assert.match(logText, /My King backend is ready/)
  }

  const backendOwnershipPath = path.join(userData, 'backend-ownership.json')
  const backendOwnership = fs.existsSync(backendOwnershipPath)
    ? JSON.parse(fs.readFileSync(backendOwnershipPath, 'utf8'))
    : null
  const bundledBackendCommand = backendOwnership?.backends?.[0]?.command ?? ''
  const stateDbPath = path.join(runtimeHome, 'state.db')
  if (!employeeBuild) {
    assert.match(bundledBackendCommand, /my-king-runtime\/python\/bin\/python3\.11/)
    assert.equal(fs.existsSync(stateDbPath), true)
  }

  const evidence = {
    ok: true,
    packagedApp: appPath,
    executablePath,
    sandbox,
    userData,
    offlineProxy: 'http://127.0.0.1:9',
    screenshots: employeeBuild ? [screenshot] : [screenshot, mainScreenshot],
    employeeBuild,
    requiredCopies,
    installOverlayCount,
    legacyUserVenvAbsent: true,
    forbiddenBootstrapLogEntriesAbsent: true,
    bundledBackendReady: /HERMES_BACKEND_READY port=\d+/.test(logText),
    backendOwnershipPath,
    bundledBackendCommand,
    stateDbPath,
    backendLogEvidence: logText
      .split('\n')
      .filter(line => /Using My King bundled backend|HERMES_BACKEND_READY|My King backend is ready/.test(line)),
    bodyText: body
  }
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify({ ...evidence, evidencePath, bodyText: undefined, bodyPreview: body.slice(0, 500) }, null, 2))
} finally {
  await app.close().catch(() => undefined)
}
