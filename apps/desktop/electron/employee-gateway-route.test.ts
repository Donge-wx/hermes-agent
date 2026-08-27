import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  readMyKingEmployeeGatewayCredential,
  removeMyKingEmployeeGatewayCredential,
  resolveMyKingEmployeeGatewayRoute,
  writeMyKingEmployeeGatewayCredential
} from './employee-gateway-route'

const binding = {
  version: 1 as const,
  employeeId: 'employee-1',
  employeeName: '测试员工',
  enrollmentId: 'enrollment-1',
  deviceId: 'random-device-id',
  remoteGatewayUrl: 'https://bound-gateway.myking.com',
  enrolledAt: '2026-08-27T00:00:00.000Z',
  lastCheckAt: null
}

describe('My King managed employee gateway route', () => {
  it('keeps the install-stamp managed gateway at highest priority', () => {
    expect(
      resolveMyKingEmployeeGatewayRoute({
        binding,
        managedEmployeeGatewayUrl: 'https://managed-gateway.myking.com'
      })
    ).toEqual({ source: 'install-stamp', url: 'https://managed-gateway.myking.com' })
  })

  it('uses the enrolled employee gateway when the install stamp has no managed gateway', () => {
    expect(resolveMyKingEmployeeGatewayRoute({ binding, managedEmployeeGatewayUrl: null })).toEqual({
      source: 'enrollment',
      url: 'https://bound-gateway.myking.com'
    })
  })

  it('returns no managed route only when neither enterprise source exists', () => {
    expect(resolveMyKingEmployeeGatewayRoute({ binding: null, managedEmployeeGatewayUrl: null })).toBeNull()
  })
})

describe('My King employee gateway credential isolation', () => {
  it('round-trips only an employee-scoped safeStorage payload and removes it independently', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'myking-employee-gateway-'))
    const credentialPath = path.join(directory, 'credential.json')

    try {
      const credential = {
        version: 1 as const,
        employeeId: 'employee-1',
        deviceId: 'device-1',
        url: 'https://gateway.myking.com',
        token: { encoding: 'safeStorage' as const, value: 'encrypted-payload' }
      }

      writeMyKingEmployeeGatewayCredential(credentialPath, credential)
      expect(readMyKingEmployeeGatewayCredential(credentialPath)).toEqual(credential)
      expect(fs.statSync(credentialPath).mode & 0o077).toBe(0)
      removeMyKingEmployeeGatewayCredential(credentialPath)
      expect(readMyKingEmployeeGatewayCredential(credentialPath)).toBeNull()
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
