import fs from 'node:fs'
import path from 'node:path'

type ResolveOptions = {
  resourcesPath: string
  platform?: NodeJS.Platform
  pathModule?: typeof path.posix | typeof path.win32
  exists?: (candidate: string) => boolean
}

type BundledBackend = {
  ok: true
  runtimeRoot: string
  backendRoot: string
  pythonRoot: string
  sitePackages: string
  command: string
}

type IncompleteBundle = {
  ok: false
  runtimeRoot: string
  missing: string[]
  message: string
}

/** Resolve the immutable, platform-correct backend shipped in My King. */
export function resolveBundledBackend({
  resourcesPath,
  platform = process.platform,
  pathModule = platform === 'win32' ? path.win32 : path.posix,
  exists = fs.existsSync
}: ResolveOptions): BundledBackend | IncompleteBundle {
  const runtimeRoot = pathModule.join(resourcesPath, 'my-king-runtime')
  const backendRoot = pathModule.join(runtimeRoot, 'backend')
  const pythonRoot = pathModule.join(runtimeRoot, 'python')

  const command =
    platform === 'win32'
      ? pathModule.join(pythonRoot, 'python.exe')
      : pathModule.join(pythonRoot, 'bin', 'python3.11')

  const sitePackages =
    platform === 'win32'
      ? pathModule.join(pythonRoot, 'Lib', 'site-packages')
      : pathModule.join(pythonRoot, 'lib', 'python3.11', 'site-packages')

  const required = [
    pathModule.join(backendRoot, 'hermes_cli', 'main.py'),
    command,
    pathModule.join(sitePackages, 'fastapi', '__init__.py'),
    pathModule.join(sitePackages, 'uvicorn', '__init__.py')
  ]

  const missing = required.filter(candidate => !exists(candidate))

  if (missing.length > 0) {
    return {
      ok: false,
      runtimeRoot,
      missing,
      message: 'My King 安装包不完整，请联系管理员重新安装。'
    }
  }

  return { ok: true, runtimeRoot, backendRoot, pythonRoot, sitePackages, command }
}
