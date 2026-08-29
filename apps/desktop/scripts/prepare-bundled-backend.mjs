#!/usr/bin/env node

/**
 * Build the complete offline Python/backend payload consumed by My King.
 * Network access is allowed here, on the release builder, and nowhere in the
 * installed employee application's first-launch path.
 */
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { stageManagedDashboardAssets } from './managed-dashboard-assets.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(SCRIPT_DIR, '..')
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '../..')
const BUNDLED_ROOT = path.join(DESKTOP_ROOT, 'build', 'bundled')
const CACHE_ROOT = path.join(DESKTOP_ROOT, 'build', 'bundled-cache')
const CURRENT_ROOT = path.join(BUNDLED_ROOT, 'current')
const PYTHON_VERSION = '3.11.15'
const BACKEND_EXTRAS = ['messaging', 'dingtalk', 'feishu', 'wecom']

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : null
}

function run(command, args, options = {}) {
  console.log(`[bundled-backend] ${command} ${args.join(' ')}`)
  return execFileSync(command, args, {
    cwd: REPO_ROOT,
    encoding: options.encoding ?? 'utf8',
    stdio: options.stdio ?? 'inherit',
    maxBuffer: 64 * 1024 * 1024,
    ...options
  })
}

function sha256(file) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(file))
  return hash.digest('hex')
}

function pythonRequest(platform, arch) {
  if (platform === 'darwin' && arch === 'arm64') return `cpython-${PYTHON_VERSION}-macos-aarch64-none`
  if (platform === 'win32' && arch === 'x64') return `cpython-${PYTHON_VERSION}-windows-x86_64-none`
  throw new Error(`Unsupported managed My King target: ${platform}-${arch}`)
}

function pythonPlatform(platform, arch) {
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin'
  if (platform === 'win32' && arch === 'x64') return 'x86_64-pc-windows-msvc'
  throw new Error(`Unsupported dependency target: ${platform}-${arch}`)
}

function resolvePythonDownload(request) {
  const output = run(
    'uv',
    [
      'python',
      'list',
      request,
      '--only-downloads',
      '--all-platforms',
      '--all-arches',
      '--show-urls',
      '--output-format',
      'json'
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  )
  const matches = JSON.parse(output)
  if (!Array.isArray(matches) || !matches[0]?.url) {
    throw new Error(`uv did not provide a download URL for ${request}`)
  }
  return matches[0].url
}

function ensureArchive(request, url) {
  fs.mkdirSync(CACHE_ROOT, { recursive: true })
  const archive = path.join(CACHE_ROOT, `${request}.tar.gz`)
  if (!fs.existsSync(archive) || fs.statSync(archive).size < 1_000_000) {
    const partial = `${archive}.partial`
    fs.rmSync(partial, { force: true })
    run('curl', ['-L', '--fail', '--retry', '3', '--show-error', url, '-o', partial])
    fs.renameSync(partial, archive)
  }
  return archive
}

function copyBundledContent(backendRoot) {
  const wheels = path.join(path.dirname(backendRoot), '.wheel')
  fs.mkdirSync(wheels, { recursive: true })
  run('uv', ['build', '--wheel', '--out-dir', wheels], {
    // Upstream exposes this guard specifically for sealed package-manager
    // builds. My King uses the same immutable-wheel shape without changing
    // backend source or dependency resolution.
    env: { ...process.env, HERMES_NIX_BUILD: '1' },
    stdio: ['ignore', 'ignore', 'inherit']
  })
  const wheel = fs.readdirSync(wheels).find(name => name.endsWith('.whl'))
  if (!wheel) throw new Error('Backend wheel build did not produce a .whl file')
  fs.mkdirSync(backendRoot, { recursive: true })
  run('unzip', ['-q', path.join(wheels, wheel), '-d', backendRoot])
  stageManagedDashboardAssets({ repoRoot: REPO_ROOT, backendRoot })

  // These catalogs intentionally live outside the Python wheel but are part
  // of the runtime contract used by skill sync and the Skills Hub.
  for (const directory of ['skills', 'optional-skills']) {
    fs.cpSync(path.join(REPO_ROOT, directory), path.join(backendRoot, directory), {
      recursive: true,
      dereference: false
    })
  }

  return path.join(wheels, wheel)
}

function installDependencies({ platform, arch, sitePackages, requirements }) {
  const extras = BACKEND_EXTRAS.flatMap(extra => ['--extra', extra])
  run('uv', [
    'export',
    '--locked',
    '--format',
    'requirements.txt',
    '--no-dev',
    ...extras,
    '--no-emit-project',
    '--output-file',
    requirements,
    '--quiet'
  ])

  run('uv', [
    'pip',
    'install',
    '--target',
    sitePackages,
    '--python-platform',
    pythonPlatform(platform, arch),
    '--python-version',
    '3.11',
    '--no-compile',
    '--quiet',
    '-r',
    requirements
  ])

  // uv's cross-platform marker model reports x86_64, while upstream's
  // Windows marker uses AMD64. Install the pinned native relay wheel directly
  // so managed Windows builds retain the same lifecycle/metrics capability.
  if (platform === 'win32') {
    run('uv', [
      'pip',
      'install',
      '--target',
      sitePackages,
      '--python-platform',
      pythonPlatform(platform, arch),
      '--python-version',
      '3.11',
      '--no-compile',
      '--no-deps',
      'nemo-relay==0.7.2'
    ])
  }
}

function verifyPayload({ platform, root }) {
  const pythonRoot = path.join(root, 'python')
  const python = platform === 'win32' ? path.join(pythonRoot, 'python.exe') : path.join(pythonRoot, 'bin', 'python3.11')
  const sitePackages =
    platform === 'win32'
      ? path.join(pythonRoot, 'Lib', 'site-packages')
      : path.join(pythonRoot, 'lib', 'python3.11', 'site-packages')
  const required = [
    python,
    path.join(root, 'backend', 'hermes_cli', 'main.py'),
    path.join(root, 'backend', 'hermes_cli', 'web_dist', 'index.html'),
    path.join(root, 'backend', 'hermes_cli', 'dashboard_auth', 'assets', 'my-king-lockup.png'),
    path.join(root, 'backend', 'skills'),
    path.join(sitePackages, 'fastapi', '__init__.py'),
    path.join(sitePackages, 'uvicorn', '__init__.py')
  ]
  const missing = required.filter(candidate => !fs.existsSync(candidate))
  if (missing.length) throw new Error(`Prepared payload is incomplete: ${missing.join(', ')}`)
  return { python, sitePackages }
}

function pruneReleaseOnlyPayload({ platform, root }) {
  const backendRoot = path.join(root, 'backend')
  const pythonRoot = path.join(root, 'python')

  // User/developer caches occasionally exist inside source skill folders.
  // They are neither runtime inputs nor reproducible release artifacts.
  for (const candidate of fs.readdirSync(backendRoot, { recursive: true, withFileTypes: true })) {
    if (candidate.isDirectory() && candidate.name === '__pycache__') {
      fs.rmSync(path.join(candidate.parentPath, candidate.name), { recursive: true, force: true })
    }
  }

  for (const developerOnly of ['include', 'share']) {
    fs.rmSync(path.join(pythonRoot, developerOnly), { recursive: true, force: true })
  }

  if (platform === 'darwin') {
    fs.rmSync(path.join(pythonRoot, 'lib', 'pkgconfig'), { recursive: true, force: true })
    for (const name of fs.readdirSync(path.join(pythonRoot, 'bin'))) {
      if (!['python', 'python3', 'python3.11'].includes(name)) {
        fs.rmSync(path.join(pythonRoot, 'bin', name), { force: true })
      }
    }
  }
}

function main() {
  const platform = readArg('platform')
  const arch = readArg('arch')
  const request = pythonRequest(platform, arch)
  const url = resolvePythonDownload(request)
  const archive = ensureArchive(request, url)

  run('npm', ['--prefix', path.join(REPO_ROOT, 'web'), 'run', 'build'])

  fs.mkdirSync(BUNDLED_ROOT, { recursive: true })
  const staging = fs.mkdtempSync(path.join(BUNDLED_ROOT, `.staging-${platform}-${arch}-`))

  try {
    run('tar', ['-xzf', archive, '-C', staging])
    const pythonRoot = path.join(staging, 'python')
    const sitePackages =
      platform === 'win32'
        ? path.join(pythonRoot, 'Lib', 'site-packages')
        : path.join(pythonRoot, 'lib', 'python3.11', 'site-packages')
    const requirements = path.join(staging, '.requirements.lock.txt')
    const wheel = copyBundledContent(path.join(staging, 'backend'))
    const backendWheelSha256 = sha256(wheel)
    installDependencies({ platform, arch, sitePackages, requirements })
    pruneReleaseOnlyPayload({ platform, root: staging })
    fs.rmSync(requirements, { force: true })
    fs.rmSync(path.join(staging, '.wheel'), { recursive: true, force: true })

    const verified = verifyPayload({ platform, root: staging })
    if (platform === 'darwin') {
      run(verified.python, ['-c', 'import fastapi, uvicorn, pydantic_core, cryptography; print("bundled-runtime-ok")'], {
        env: {
          ...process.env,
          PYTHONPATH: `${path.join(staging, 'backend')}:${verified.sitePackages}`,
          PYTHONDONTWRITEBYTECODE: '1',
          PYTHONNOUSERSITE: '1'
        }
      })
    }

    const pyproject = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, 'package.json'), 'utf8'))
    const backendVersion = fs
      .readFileSync(path.join(REPO_ROOT, 'pyproject.toml'), 'utf8')
      .match(/^version\s*=\s*"([^"]+)"/m)?.[1]
    fs.writeFileSync(
      path.join(staging, 'manifest.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          product: 'My King',
          desktopVersion: pyproject.version,
          backendVersion,
          pythonVersion: PYTHON_VERSION,
          platform,
          arch,
          extras: BACKEND_EXTRAS,
          pythonRequest: request,
          pythonArchiveUrl: url,
          pythonArchiveSha256: sha256(archive),
          backendWheelSha256,
          uvLockSha256: sha256(path.join(REPO_ROOT, 'uv.lock')),
          builtAt: new Date().toISOString(),
          builderPlatform: `${os.platform()}-${os.arch()}`
        },
        null,
        2
      )}\n`,
      'utf8'
    )

    fs.rmSync(CURRENT_ROOT, { recursive: true, force: true })
    fs.renameSync(staging, CURRENT_ROOT)
    console.log(`[bundled-backend] ready: ${CURRENT_ROOT}`)
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

main()
