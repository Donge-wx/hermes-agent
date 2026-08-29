import type { MyKingEmployeeBinding } from './employee-connector'
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

export function resolveMyKingEmployeeRuntimeProxyConfig(input: {
  readonly autoDetect: boolean
  readonly noProxyServer: boolean
  readonly pacScript: string
  readonly proxyBypassRules: string
  readonly proxyRules: string
  readonly urls: readonly unknown[]
}): MyKingEmployeeRuntimeProxyConfig {
  if (input.noProxyServer) {
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

    return block && parseMyKingPublicHttpsUrl(block.url) === normalizedAssignedUrl ? { ...block, token: null } : value
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
