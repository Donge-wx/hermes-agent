import fs from 'node:fs'

export function readElectronBuildAppId(packageJsonPath) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const appId = packageJson?.build?.appId

  if (typeof appId !== 'string' || !appId.trim()) {
    throw new TypeError(`Desktop package build.appId must be a non-empty string: ${packageJsonPath}`)
  }

  return appId
}
