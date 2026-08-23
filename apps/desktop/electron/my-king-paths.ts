import path from 'node:path'

import {
  MY_KING_HOME_DIRNAME,
  MY_KING_USER_DATA_DIRNAME,
  MY_KING_WINDOWS_HOME_DIRNAME
} from './application-menu-labels'

interface MyKingHomeOptions {
  readonly platform: NodeJS.Platform
  readonly home: string
  readonly localAppData?: string
  readonly envOverride?: string
  readonly registryOverride?: string
  readonly userDataOverride?: string
}

interface MyKingUserDataOptions {
  readonly appData: string
  readonly override?: string
}

interface ExternalHermesRuntimeOptions {
  readonly hasExplicitOverride: boolean
  readonly isPackaged: boolean
}

export function resolveMyKingHome(options: MyKingHomeOptions): string {
  const pathModule = options.platform === 'win32' ? path.win32 : path.posix

  if (options.envOverride) {
    return pathModule.resolve(options.envOverride)
  }

  if (options.userDataOverride) {
    return pathModule.join(pathModule.resolve(options.userDataOverride), 'hermes-home')
  }

  if (options.platform === 'win32') {
    if (options.registryOverride) {
      return pathModule.resolve(options.registryOverride)
    }

    if (options.localAppData) {
      return pathModule.join(options.localAppData, MY_KING_WINDOWS_HOME_DIRNAME)
    }
  }

  return pathModule.join(options.home, MY_KING_HOME_DIRNAME)
}

export function resolveMyKingUserData(options: MyKingUserDataOptions): string {
  return path.resolve(options.override || path.join(options.appData, MY_KING_USER_DATA_DIRNAME))
}

/** Packaged My King owns its runtime tree. Only an explicit deployment
 * override may route it to an external compatibility CLI; automatic PATH or
 * system-Python discovery is reserved for development builds. */
export function shouldUseExternalHermesRuntime(options: ExternalHermesRuntimeOptions): boolean {
  return !options.isPackaged || options.hasExplicitOverride
}
