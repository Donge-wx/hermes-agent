import { MY_KING_PROTOCOL } from './application-menu-labels'

export const MY_KING_DEV_PROTOCOL = 'myking-dev' as const

/** Electron defaultApp runs are development runtimes and must never own the public scheme. */
export function selectMyKingDeepLinkProtocol(devServer: boolean, defaultApp: boolean): string {
  return devServer || defaultApp ? MY_KING_DEV_PROTOCOL : MY_KING_PROTOCOL
}

/** Public URL schemes owned by My King for the current runtime. */
export function acceptedMyKingDeepLinkSchemes(devServer: boolean): readonly string[] {
  return devServer ? [MY_KING_DEV_PROTOCOL, MY_KING_PROTOCOL] : [MY_KING_PROTOCOL]
}

/** Find the first My King URL in a launcher argv without claiming another app's scheme. */
export function extractMyKingDeepLink(argv: readonly unknown[], schemes: readonly string[]): string | null {
  return (
    argv.find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && schemes.some(scheme => candidate.startsWith(`${scheme}://`))
    ) ?? null
  )
}
