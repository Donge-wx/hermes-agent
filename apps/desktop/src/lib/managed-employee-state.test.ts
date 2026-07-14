import { beforeEach, describe, expect, it } from 'vitest'

import { applyManagedEmployeeIdentity, MANAGED_EMPLOYEE_STORAGE_KEY } from './managed-employee-state'

describe('managed employee renderer state', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('keeps renderer data when applying the same employee', () => {
    window.localStorage.setItem(MANAGED_EMPLOYEE_STORAGE_KEY, 'wangxudong')
    window.localStorage.setItem('hermes:composer-drafts:v3', 'draft')
    window.sessionStorage.setItem('transient', 'value')

    expect(applyManagedEmployeeIdentity({ employeeId: 'wangxudong', identityChanged: false })).toBe(false)
    expect(window.localStorage.getItem('hermes:composer-drafts:v3')).toBe('draft')
    expect(window.sessionStorage.getItem('transient')).toBe('value')
  })

  it('clears local and session state before another employee reloads', () => {
    window.localStorage.setItem(MANAGED_EMPLOYEE_STORAGE_KEY, 'wangxudong')
    window.localStorage.setItem('hermes:composer-drafts:v3', 'wang draft')
    window.localStorage.setItem('hermes.desktop.pinnedSessionIds', '["wang-session"]')
    window.sessionStorage.setItem('transient', 'wang')

    expect(applyManagedEmployeeIdentity({ employeeId: 'weijia', identityChanged: true })).toBe(true)
    expect(window.localStorage.getItem('hermes:composer-drafts:v3')).toBeNull()
    expect(window.localStorage.getItem('hermes.desktop.pinnedSessionIds')).toBeNull()
    expect(window.sessionStorage.getItem('transient')).toBeNull()
    expect(window.localStorage.getItem(MANAGED_EMPLOYEE_STORAGE_KEY)).toBe('weijia')
  })

  it('detects a persisted employee mismatch even if main lost pending state after a restart', () => {
    window.localStorage.setItem(MANAGED_EMPLOYEE_STORAGE_KEY, 'wangxudong')
    window.localStorage.setItem('draft', 'wang')

    expect(applyManagedEmployeeIdentity({ employeeId: 'weijia', identityChanged: false })).toBe(true)
    expect(window.localStorage.getItem('draft')).toBeNull()
    expect(window.localStorage.getItem(MANAGED_EMPLOYEE_STORAGE_KEY)).toBe('weijia')
  })
})
