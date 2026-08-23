import fs from 'node:fs'
import path from 'node:path'

const LEGACY_RUNTIME_EXCLUSIONS = new Set([
  '.hermes-update-in-progress',
  '.hermes-update-result.json',
  'app-backups',
  'bootstrap-cache',
  'hermes-agent',
  'hermes-setup',
  'hermes-setup.exe',
  'install_id',
  'logs'
])

const LEGACY_RUNTIME_PREFIX_EXCLUSIONS = ['hermes-agent-update-integration-', 'hermes-agent.broken-'] as const

const SAFE_DESKTOP_PREFERENCES = new Set([
  'data-url-read-max.json',
  'disable-f12.json',
  'hud-state.json',
  'keep-awake.json',
  'native-theme.json',
  'open-in-terminal',
  'quick-entry.json',
  'translucency.json',
  'window-state.json',
  'zoom-state.json'
])

function copyDirectoryIfTargetMissing(
  source: string,
  target: string,
  filter?: (sourcePath: string) => boolean
): boolean {
  if (!fs.existsSync(source) || fs.existsSync(target)) {
    return false
  }

  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, { recursive: true, filter })
  return true
}

export function copyLegacyUserDataIfNeeded(source: string, target: string): boolean {
  const root = path.resolve(source)

  return copyDirectoryIfTargetMissing(source, target, sourcePath => {
    const relative = path.relative(root, path.resolve(sourcePath))

    if (!relative) {
      return true
    }

    const topLevelName = relative.split(path.sep)[0]

    return Boolean(topLevelName && SAFE_DESKTOP_PREFERENCES.has(topLevelName))
  })
}

export function copyLegacyHermesDataIfNeeded(source: string, target: string): boolean {
  const root = path.resolve(source)

  return copyDirectoryIfTargetMissing(source, target, sourcePath => {
    const relative = path.relative(root, path.resolve(sourcePath))

    if (!relative) {
      return true
    }

    const topLevelName = relative.split(path.sep)[0]

    if (
      !topLevelName ||
      LEGACY_RUNTIME_EXCLUSIONS.has(topLevelName) ||
      LEGACY_RUNTIME_PREFIX_EXCLUSIONS.some(prefix => topLevelName.startsWith(prefix))
    ) {
      return false
    }

    return !topLevelName.endsWith('.lock')
  })
}
