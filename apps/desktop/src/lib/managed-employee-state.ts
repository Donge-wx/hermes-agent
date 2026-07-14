const MANAGED_EMPLOYEE_STORAGE_KEY = 'vanyue.desktop.managedEmployeeId'

export interface ManagedEmployeeConnectionApplied {
  employeeId?: string
  identityChanged?: boolean
}

/**
 * Clear every renderer-persisted draft, pin, session pointer, and transient
 * value before reloading into another employee. Returns true when the caller
 * must reload instead of performing an in-place gateway switch.
 */
export function applyManagedEmployeeIdentity(
  payload: ManagedEmployeeConnectionApplied | undefined,
  local: Pick<Storage, 'clear' | 'getItem' | 'setItem'> = window.localStorage,
  session: Pick<Storage, 'clear'> = window.sessionStorage
): boolean {
  const employeeId = typeof payload?.employeeId === 'string' ? payload.employeeId.trim() : ''
  const previousEmployeeId = local.getItem(MANAGED_EMPLOYEE_STORAGE_KEY)?.trim() || ''
  const identityChanged =
    payload?.identityChanged === true || Boolean(employeeId && previousEmployeeId && employeeId !== previousEmployeeId)

  if (identityChanged) {
    local.clear()
    session.clear()
  }

  if (employeeId) {
    local.setItem(MANAGED_EMPLOYEE_STORAGE_KEY, employeeId)
  }

  return identityChanged
}

export { MANAGED_EMPLOYEE_STORAGE_KEY }
