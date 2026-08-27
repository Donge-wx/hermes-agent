import fs from 'node:fs'

export interface MyKingInstallStamp {
  readonly branch: null | string
  readonly builtAt: null | string
  readonly commit: string
  readonly dirty: boolean
  readonly employeeEnrollmentBaseUrl?: string
  readonly managedEmployeeGatewayUrl?: string
  readonly path: string
  readonly schemaVersion: 1
  readonly source: null | string
}

const LOOPBACK_IPV4_RE = /^(?:127(?:\.\d{1,3}){3}|0\.0\.0\.0)$/

export function parseMyKingPublicHttpsUrl(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null
  }

  let parsed: URL

  try {
    parsed = new URL(rawValue.trim())
  } catch {
    return null
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    LOOPBACK_IPV4_RE.test(hostname)
  ) {
    return null
  }

  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')

  return parsed.toString().replace(/\/+$/, '')
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

export function parseMyKingInstallStamp(raw: string, stampPath: string): MyKingInstallStamp | null {
  let parsedValue: unknown

  try {
    parsedValue = JSON.parse(raw)
  } catch {
    return null
  }

  const parsed = record(parsedValue)

  if (parsed?.schemaVersion !== 1 || typeof parsed.commit !== 'string' || parsed.commit.length < 7) {
    return null
  }

  const managedEmployeeGatewayUrl = parseMyKingPublicHttpsUrl(parsed.managedEmployeeGatewayUrl)
  const employeeEnrollmentBaseUrl = parseMyKingPublicHttpsUrl(parsed.employeeEnrollmentBaseUrl)

  if (
    (parsed.managedEmployeeGatewayUrl !== undefined && !managedEmployeeGatewayUrl) ||
    (parsed.employeeEnrollmentBaseUrl !== undefined && !employeeEnrollmentBaseUrl)
  ) {
    return null
  }

  return Object.freeze({
    schemaVersion: 1,
    commit: parsed.commit,
    branch: typeof parsed.branch === 'string' && parsed.branch ? parsed.branch : null,
    builtAt: typeof parsed.builtAt === 'string' && parsed.builtAt ? parsed.builtAt : null,
    dirty: parsed.dirty === true,
    source: typeof parsed.source === 'string' && parsed.source ? parsed.source : null,
    path: stampPath,
    ...(managedEmployeeGatewayUrl ? { managedEmployeeGatewayUrl } : {}),
    ...(employeeEnrollmentBaseUrl ? { employeeEnrollmentBaseUrl } : {})
  })
}

export function loadMyKingInstallStamp(candidatePaths: readonly string[]): MyKingInstallStamp | null {
  for (const stampPath of candidatePaths) {
    try {
      const stamp = parseMyKingInstallStamp(fs.readFileSync(stampPath, 'utf8'), stampPath)

      if (stamp) {
        return stamp
      }
    } catch {
      // Missing or unreadable candidates fall through to the next packaged/dev location.
    }
  }

  return null
}
