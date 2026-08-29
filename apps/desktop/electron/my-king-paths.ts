import path from 'node:path'

import {
  MY_KING_APP_ID,
  MY_KING_HOME_DIRNAME,
  MY_KING_USER_DATA_DIRNAME,
  MY_KING_WINDOWS_HOME_DIRNAME
} from './application-menu-labels'

interface MyKingHomeOptions {
  readonly platform: NodeJS.Platform
  readonly home: string
  readonly localAppData?: string
  readonly envOverride?: string
  readonly isPackaged?: boolean
  readonly registryOverride?: string
  readonly userDataOverride?: string
}

interface MyKingUserDataOptions {
  readonly appData: string
  readonly override?: string
  readonly platform?: NodeJS.Platform
}

interface ExternalHermesRuntimeOptions {
  readonly hasExplicitOverride: boolean
  readonly isPackaged: boolean
}

interface MyKingRemoteHermesHomeOptions {
  readonly isPackaged: boolean
  readonly remoteHermesPath: string
}

interface LegacyHermesMigrationOptions {
  readonly buildAppId: string
}

interface LegacyHermesMigrationRunOptions extends LegacyHermesMigrationOptions {
  readonly copy: (source: string, target: string) => boolean
  readonly source: string
  readonly target: string
}

export function resolveMyKingHome(options: MyKingHomeOptions): string {
  const pathModule = options.platform === 'win32' ? path.win32 : path.posix

  if (options.userDataOverride) {
    const sandboxRoot = pathModule.resolve(options.userDataOverride)

    if (options.envOverride) {
      const requestedHome = pathModule.resolve(options.envOverride)
      const relativeHome = pathModule.relative(sandboxRoot, requestedHome)

      if (
        relativeHome &&
        !relativeHome.startsWith(`..${pathModule.sep}`) &&
        relativeHome !== '..' &&
        !pathModule.isAbsolute(relativeHome)
      ) {
        return requestedHome
      }
    }

    return pathModule.join(sandboxRoot, 'hermes-home')
  }

  if (options.platform === 'win32') {
    if (!options.isPackaged && options.registryOverride) {
      return pathModule.resolve(options.registryOverride)
    }

    if (options.localAppData) {
      return pathModule.join(options.localAppData, MY_KING_WINDOWS_HOME_DIRNAME)
    }
  }

  return pathModule.join(options.home, MY_KING_HOME_DIRNAME)
}

export function resolveMyKingUserData(options: MyKingUserDataOptions): string {
  const platform = options.platform || process.platform
  const pathModule = platform === 'win32' ? path.win32 : path.posix
  const defaultUserData = pathModule.resolve(options.appData, MY_KING_USER_DATA_DIRNAME)

  if (!options.override) {
    return defaultUserData
  }

  const requestedUserData = pathModule.resolve(options.override)
  const legacyUserData = pathModule.resolve(options.appData, 'Hermes')

  const compare = platform === 'win32' || platform === 'darwin'
    ? (value: string) => value.toLocaleLowerCase('en-US')
    : (value: string) => value

  return compare(requestedUserData) === compare(legacyUserData) ? defaultUserData : requestedUserData
}

/** Packaged My King owns automatic SSH discovery under its isolated remote
 * home. Development and administrator-selected remote executables preserve the
 * ordinary Hermes discovery ladder. */
export function resolveMyKingRemoteHermesHome(options: MyKingRemoteHermesHomeOptions): string {
  return options.isPackaged && !options.remoteHermesPath.trim() ? `~/${MY_KING_HOME_DIRNAME}` : ''
}

/** A My King build never imports ordinary Hermes state. The build ID is
 * compile-time product identity, unlike Electron's mutable display name. */
export function shouldMigrateLegacyHermesData(options: LegacyHermesMigrationOptions): boolean {
  return options.buildAppId !== MY_KING_APP_ID
}

export function migrateLegacyHermesDataIfAllowed(options: LegacyHermesMigrationRunOptions): boolean {
  if (!shouldMigrateLegacyHermesData(options)) {
    return false
  }

  return options.copy(options.source, options.target)
}

/** Packaged My King owns its runtime tree. Only an explicit deployment
 * override may route it to an external compatibility CLI; automatic PATH or
 * system-Python discovery is reserved for development builds. */
export function shouldUseExternalHermesRuntime(options: ExternalHermesRuntimeOptions): boolean {
  return !options.isPackaged || options.hasExplicitOverride
}
