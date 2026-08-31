import type { MyKingEmployeeBinding } from './employee-connector'
import { MyKingEmployeeEnrollmentError } from './employee-enrollment-contract'
import { parseMyKingPublicHttpsUrl } from './install-stamp'

export type MyKingEmployeeGatewayRoute = {
  readonly source: 'enrollment' | 'install-stamp'
  readonly url: string
}

export type MyKingEmployeeRuntimeProxyConfig = {
  readonly mode: 'auto_detect' | 'direct' | 'fixed_servers' | 'pac_script' | 'system'
  readonly pacScript?: string
  readonly proxyBypassRules?: string
  readonly proxyRules?: string
}

export function isMyKingEmployeeGatewaySessionRejection(error: unknown): boolean {
  return (
    error instanceof MyKingEmployeeEnrollmentError &&
    (error.code === 'invalid-credentials' || error.code === 'gateway-auth-required')
  )
}

export function createMyKingEmployeeGatewayAccessTokenCache({
  failureBackoffMs = 1_000,
  now = Date.now,
  refreshSkewMs = 30_000
}: {
  readonly failureBackoffMs?: number
  readonly now?: () => number
  readonly refreshSkewMs?: number
} = {}) {
  let cached: { readonly accessToken: string; readonly expiresAtMs: number; readonly key: string } | null = null
  let pending: { failedUntil: null | number; readonly key: string; readonly request: Promise<string> } | null = null

  const getAccessToken = (
    key: string,
    load: () => Promise<{ readonly accessToken: string; readonly expiresAt: null | number | string }>
  ): Promise<string> => {
    if (cached?.key === key && cached.expiresAtMs - refreshSkewMs > now()) {
      return Promise.resolve(cached.accessToken)
    }

    if (pending?.key === key && (pending.failedUntil === null || now() < pending.failedUntil)) {
      return pending.request
    }

    let entry: NonNullable<typeof pending>
    const request = Promise.resolve()
      .then(load)
      .then(session => {
        const expiresAtMs =
          typeof session.expiresAt === 'number' ? session.expiresAt : Date.parse(String(session.expiresAt || ''))

        if (Number.isFinite(expiresAtMs) && expiresAtMs > now()) {
          cached = { accessToken: session.accessToken, expiresAtMs, key }
        }

        return session.accessToken
      })

    entry = { failedUntil: null, key, request }
    pending = entry
    void request.then(
      () => {
        if (pending === entry) {
          pending = null
        }
      },
      () => {
        if (pending === entry) {
          entry.failedUntil = now() + failureBackoffMs
        }
      }
    )

    return request
  }

  getAccessToken.invalidate = (key?: string) => {
    if (!key || cached?.key === key) {
      cached = null
    }
  }

  return getAccessToken
}

export function resolveMyKingEmployeeGatewayRoute(input: {
  readonly binding: MyKingEmployeeBinding | null
  readonly managedEmployeeGatewayUrl: null | string
}): MyKingEmployeeGatewayRoute | null {
  if (input.managedEmployeeGatewayUrl) {
    return { source: 'install-stamp', url: input.managedEmployeeGatewayUrl }
  }

  if (input.binding) {
    return { source: 'enrollment', url: input.binding.remoteGatewayUrl }
  }

  return null
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

export function mergeMyKingEmployeeProxyBypassList(current: string, urls: readonly unknown[]): string {
  const entries = current
    .split(';')
    .map(value => value.trim())
    .filter(Boolean)
  const known = new Set(entries.map(value => value.toLowerCase()))

  for (const rawUrl of urls) {
    const normalized = parseMyKingPublicHttpsUrl(rawUrl)

    if (!normalized) {
      continue
    }

    const hostname = new URL(normalized).hostname.toLowerCase()

    if (!known.has(hostname)) {
      entries.push(hostname)
      known.add(hostname)
    }
  }

  return entries.join(';')
}

export function myKingEmployeeGatewayRequiresDirectProxy(urls: readonly unknown[]): boolean {
  return urls.some(rawUrl => {
    const normalized = parseMyKingPublicHttpsUrl(rawUrl)

    return normalized ? new URL(normalized).hostname.toLowerCase().endsWith('.ts.net') : false
  })
}

export function resolveMyKingEmployeeRuntimeProxyConfig(input: {
  readonly autoDetect: boolean
  readonly noProxyServer: boolean
  readonly pacScript: string
  readonly proxyBypassRules: string
  readonly proxyRules: string
  readonly urls: readonly unknown[]
}): MyKingEmployeeRuntimeProxyConfig {
  if (input.noProxyServer || myKingEmployeeGatewayRequiresDirectProxy(input.urls)) {
    return { mode: 'direct' }
  }

  const proxyBypassRules = mergeMyKingEmployeeProxyBypassList(input.proxyBypassRules, input.urls)
  const bypass = proxyBypassRules ? { proxyBypassRules } : {}

  if (input.pacScript) {
    return { mode: 'pac_script', pacScript: input.pacScript, ...bypass }
  }

  if (input.proxyRules) {
    return { mode: 'fixed_servers', proxyRules: input.proxyRules, ...bypass }
  }

  return input.autoDetect ? { mode: 'auto_detect', ...bypass } : { mode: 'system', ...bypass }
}

export function preserveMyKingEmployeeManagedMarker(
  existing: unknown,
  next: Record<string, unknown>
): Record<string, unknown> {
  const existingBlock = record(existing)
  const existingToken = record(existingBlock?.token)
  const nextToken = record(next.token)

  if (
    existingBlock?.employeeManaged !== true ||
    !existingToken ||
    !nextToken ||
    existingToken.encoding !== nextToken.encoding ||
    existingToken.value !== nextToken.value ||
    parseMyKingPublicHttpsUrl(existingBlock.url) !== parseMyKingPublicHttpsUrl(next.url)
  ) {
    return next
  }

  return { ...next, employeeManaged: true }
}

export function removeMyKingEmployeeStaticGatewayCredential(
  config: Record<string, unknown>,
  assignedUrl: string
): Record<string, unknown> {
  const normalizedAssignedUrl = parseMyKingPublicHttpsUrl(assignedUrl)

  if (!normalizedAssignedUrl) {
    return config
  }

  const clearBlock = (value: unknown): unknown => {
    const block = record(value)

    if (block?.employeeManaged !== true || parseMyKingPublicHttpsUrl(block.url) !== normalizedAssignedUrl) {
      return value
    }

    const cleared: Record<string, unknown> = { ...block, token: null }
    delete cleared.employeeManaged
    return cleared
  }

  const profiles = record(config.profiles)

  return {
    ...config,
    remote: clearBlock(config.remote),
    ...(profiles
      ? { profiles: Object.fromEntries(Object.entries(profiles).map(([key, value]) => [key, clearBlock(value)])) }
      : {})
  }
}

export function resolveMyKingEmployeeGatewayClearUrl(
  config: Record<string, unknown>,
  assignedUrl: null | string
): null | string {
  const explicitUrl = assignedUrl ? parseMyKingPublicHttpsUrl(assignedUrl) : null

  if (explicitUrl) {
    return explicitUrl
  }

  const remote = record(config.remote)

  return remote?.employeeManaged === true ? parseMyKingPublicHttpsUrl(remote.url) : null
}
