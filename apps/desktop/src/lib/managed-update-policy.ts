import type { DesktopUpdateApplyResult } from '@/global'

/**
 * My King is distributed as an administrator-managed desktop deployment.
 *
 * Renderer surfaces must remain read-only even if an old menu item, extension,
 * or DevTools invocation reaches an updater function. The Electron process
 * enforces the same policy at the privileged IPC boundary.
 */
export const MANAGED_UPDATES_EXTERNALLY = true

/** The stable renderer response for blocked legacy update execution paths. */
export function managedUpdatesDisabledResult(): DesktopUpdateApplyResult {
  return { ok: false, error: 'updates-disabled', message: 'Updates are managed by your administrator.' }
}
