/**
 * Employee builds are administered through approved My King distribution, not
 * through the in-app updater. Keep this policy at the Electron trust boundary:
 * renderer affordances can be removed, but DevTools and stale renderer bundles
 * can still invoke IPC directly.
 */

export const MANAGED_UPDATE_ERROR = 'updates-disabled' as const
export const MANAGED_UPDATE_MESSAGE = 'Updates are managed by your organization.' as const
export const MANAGED_UPDATE_ACCESS = 'administrator-only' as const

export interface ManagedUpdateConfig {
  readonly branch: string
}

export function managedUpdateDenied() {
  return {
    error: MANAGED_UPDATE_ERROR,
    message: MANAGED_UPDATE_MESSAGE,
    ok: false
  } as const
}

export function managedUpdateCheckDenied(config: ManagedUpdateConfig, fetchedAt: number) {
  return {
    branch: config.branch,
    error: MANAGED_UPDATE_ERROR,
    fetchedAt,
    message: MANAGED_UPDATE_MESSAGE,
    reason: MANAGED_UPDATE_ERROR,
    supported: false
  } as const
}

export function managedUpdateBranch(config: ManagedUpdateConfig) {
  return { branch: config.branch } as const
}

export function managedUpdateBranchChangeDenied(config: ManagedUpdateConfig) {
  return {
    ...managedUpdateDenied(),
    ...managedUpdateBranch(config)
  } as const
}

export function managedUpdateAllDenied() {
  return { ...managedUpdateDenied(), results: [] as const } as const
}

/** True only for the two backend endpoints that initiate or check for updates. */
export function isManagedUpdateApiRequest(request: unknown): boolean {
  if (!request || typeof request !== 'object' || !('path' in request)) {
    return false
  }

  try {
    // Match the generic API router's coercion so boxed strings and other
    // structured-clone values cannot change meaning after this policy gate.
    const path = request.path ? String(request.path) : ''
    const pathname = decodeURIComponent(new URL(path, 'http://my-king.invalid').pathname).replace(/\/+$/, '') || '/'

    return pathname === '/api/hermes/update' || pathname === '/api/hermes/update/check'
  } catch {
    return false
  }
}

/** Stable generic-API response that performs no network or backend work. */
export function managedUpdateApiDenied() {
  return managedUpdateDenied()
}
