export interface RemoteOauthStatus {
  checkedInput: string
  connected: boolean
}

const EMPLOYEE_GATEWAY_DOMAIN = 'wanyushudong.xyz'
const EMPLOYEE_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function employeeGatewayUrl(employeeId: string): string {
  const normalized = employeeId.trim().toLowerCase()

  return EMPLOYEE_ID_RE.test(normalized) ? `https://${normalized}.${EMPLOYEE_GATEWAY_DOMAIN}` : ''
}

export function employeeIdFromGatewayUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    const hostname = parsed.hostname.toLowerCase()
    const suffix = `.${EMPLOYEE_GATEWAY_DOMAIN}`

    if (parsed.protocol !== 'https:' || !hostname.endsWith(suffix)) {
      return ''
    }

    const employeeId = hostname.slice(0, -suffix.length)

    return EMPLOYEE_ID_RE.test(employeeId) ? employeeId : ''
  } catch {
    return ''
  }
}

/**
 * Normalize a full gateway login-page URL when it is pasted into the remote
 * URL field. Invalid/partial values are left alone so normal typing is never
 * disrupted. The main process performs the authoritative normalization too.
 */
export function normalizePastedGatewayUrl(rawUrl: string): string {
  const value = rawUrl.trim()

  if (!value) {
    return rawUrl
  }

  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    return rawUrl
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return rawUrl
  }

  const pathname = parsed.pathname.replace(/\/+$/, '')

  if (!/\/login$/i.test(pathname)) {
    return rawUrl
  }

  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = pathname.slice(0, -'/login'.length)

  return parsed.toString().replace(/\/+$/, '')
}

/** A positive OAuth result is valid only for the exact input it checked. */
export function oauthStatusMatchesInput(status: RemoteOauthStatus, currentInput: string): boolean {
  return status.connected && status.checkedInput === currentInput.trim()
}
