import { describe, expect, it } from 'vitest'

import {
  removeMyKingEmployeeStaticGatewayCredential,
  resolveMyKingEmployeeGatewayRoute
} from './employee-gateway-route'

const binding = {
  version: 1 as const,
  employeeId: 'employee-1',
  employeeName: '测试员工',
  deviceId: 'random-device-id',
  remoteGatewayUrl: 'https://bound-gateway.myking.test',
  enrolledAt: '2026-08-27T00:00:00.000Z',
  lastCheckAt: null
}

describe('My King managed employee gateway route', () => {
  it('keeps the install-stamp managed gateway at highest priority', () => {
    expect(
      resolveMyKingEmployeeGatewayRoute({
        binding,
        managedEmployeeGatewayUrl: 'https://managed-gateway.myking.test'
      })
    ).toEqual({ source: 'install-stamp', url: 'https://managed-gateway.myking.test' })
  })

  it('uses the enrolled employee gateway when the install stamp has no managed gateway', () => {
    expect(resolveMyKingEmployeeGatewayRoute({ binding, managedEmployeeGatewayUrl: null })).toEqual({
      source: 'enrollment',
      url: 'https://bound-gateway.myking.test'
    })
  })

  it('returns no managed route only when neither enterprise source exists', () => {
    expect(resolveMyKingEmployeeGatewayRoute({ binding: null, managedEmployeeGatewayUrl: null })).toBeNull()
  })
})

describe('My King employee gateway credential isolation', () => {
  it('removes only static credentials for the employee gateway during unbind', () => {
    const config = {
      mode: 'remote',
      remote: { url: 'https://gateway.myking.test/', token: { encoding: 'safeStorage', value: 'employee-secret' } },
      profiles: {
        default: { url: 'https://gateway.myking.test', token: { encoding: 'safeStorage', value: 'same-secret' } },
        personal: { url: 'https://personal.myking.test', token: { encoding: 'safeStorage', value: 'keep-me' } }
      }
    }

    expect(removeMyKingEmployeeStaticGatewayCredential(config, 'https://gateway.myking.test')).toEqual({
      mode: 'remote',
      remote: { url: 'https://gateway.myking.test/', token: null },
      profiles: {
        default: { url: 'https://gateway.myking.test', token: null },
        personal: { url: 'https://personal.myking.test', token: { encoding: 'safeStorage', value: 'keep-me' } }
      }
    })
  })
})
