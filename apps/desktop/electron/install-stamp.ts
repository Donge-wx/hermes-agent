import fs from 'node:fs'
import net from 'node:net'

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

const RESERVED_HOST_SUFFIXES = ['.example', '.invalid', '.localhost', '.test'] as const

function isNonPublicIpAddress(hostname: string): boolean {
  const address = hostname.startsWith('::ffff:') ? hostname.slice('::ffff:'.length) : hostname
  const version = net.isIP(address)

  if (version === 4) {
    const octets = address.split('.').map(Number)
    const first = octets[0] ?? -1
    const second = octets[1] ?? -1

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0) ||
      first >= 224
    )
  }

  if (version === 6) {
    const firstGroup = Number.parseInt(address.split(':')[0] ?? '', 16)

    return (
      address === '::' ||
      address === '::1' ||
      (firstGroup & 0xfe00) === 0xfc00 ||
      (firstGroup & 0xffc0) === 0xfe80 ||
      (firstGroup & 0xff00) === 0xff00 ||
      address.startsWith('2001:db8:')
    )
  }

  return false
}

function isReservedHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    RESERVED_HOST_SUFFIXES.some(suffix => hostname === suffix.slice(1) || hostname.endsWith(suffix))
  )
}

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
    isReservedHostname(hostname) ||
    isNonPublicIpAddress(hostname)
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
