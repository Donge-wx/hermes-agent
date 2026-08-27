import type { MyKingEmployeeBinding } from './employee-connector'
import { parseMyKingPublicHttpsUrl } from './install-stamp'

export type MyKingEmployeeGatewayRoute = {
  readonly source: 'enrollment' | 'install-stamp'
  readonly url: string
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
