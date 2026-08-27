import { MY_KING_PROTOCOL } from './application-menu-labels'

export const MY_KING_DEV_PROTOCOL = 'myking-dev' as const

const MY_KING_ENROLLMENT_CODE_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{6,126}[A-Za-z0-9])$/

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

export function takeMyKingEnrollmentDeepLink(argv: string[], schemes: readonly string[]): string | null {
  let enrollmentLink: string | null = null

  for (let index = argv.length - 1; index >= 0; index -= 1) {
    const candidate = argv[index]

    if (!candidate) {
      continue
    }

    let isEnrollmentLink = false

    try {
      const parsed = new URL(candidate)
      isEnrollmentLink = schemes.includes(parsed.protocol.replace(/:$/, '')) && parsed.hostname === 'enroll'
    } catch {
      isEnrollmentLink = schemes.some(scheme => new RegExp(`^${scheme}://enroll(?:[/?#]|$)`, 'i').test(candidate))
    }

    if (isEnrollmentLink) {
      enrollmentLink = candidate
      argv.splice(index, 1)
    }
  }

  return enrollmentLink
}

export function parseMyKingEnrollmentLink(
  rawUrl: string,
  acceptedSchemes: readonly string[]
): { readonly code: string } | null {
  let parsed: URL

  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }

  const scheme = parsed.protocol.replace(/:$/, '')
  const code = parsed.searchParams.get('code') ?? ''

  if (
    !acceptedSchemes.includes(scheme) ||
    parsed.hostname !== 'enroll' ||
    (parsed.pathname !== '' && parsed.pathname !== '/') ||
    !MY_KING_ENROLLMENT_CODE_RE.test(code)
  ) {
    return null
  }

  return { code }
}
