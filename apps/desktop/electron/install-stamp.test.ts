import { describe, expect, it } from 'vitest'

import { parseMyKingInstallStamp, parseMyKingPublicHttpsUrl } from './install-stamp'

const baseStamp = {
  schemaVersion: 1,
  commit: 'a'.repeat(40),
  branch: 'main',
  builtAt: '2026-08-27T00:00:00.000Z',
  dirty: false,
  source: 'local'
}

describe('parseMyKingInstallStamp', () => {
  it('keeps the existing install-stamp format compatible', () => {
    expect(parseMyKingInstallStamp(JSON.stringify(baseStamp), '/resources/install-stamp.json')).toEqual({
      ...baseStamp,
      path: '/resources/install-stamp.json'
    })
  })

  it('reads the employee enrollment and managed gateway fields', () => {
    const stamp = parseMyKingInstallStamp(
      JSON.stringify({
        ...baseStamp,
        employeeEnrollmentBaseUrl: 'https://enroll.myking.com/',
        managedEmployeeGatewayUrl: 'https://gateway.myking.com/'
      }),
      '/resources/install-stamp.json'
    )

    expect(stamp?.employeeEnrollmentBaseUrl).toBe('https://enroll.myking.com')
    expect(stamp?.managedEmployeeGatewayUrl).toBe('https://gateway.myking.com')
  })

  it('rejects the whole stamp when an employee URL is unsafe', () => {
    expect(
      parseMyKingInstallStamp(
        JSON.stringify({ ...baseStamp, employeeEnrollmentBaseUrl: 'https://localhost' }),
        '/resources/install-stamp.json'
      )
    ).toBeNull()
  })
})

describe('parseMyKingPublicHttpsUrl', () => {
  it.each([
    'http://company.test',
    'https://127.0.0.2',
    'https://10.0.0.1',
    'https://172.16.0.1',
    'https://192.168.2.56',
    'https://169.254.1.1',
    'https://[::1]',
    'https://[fc00::1]',
    'https://[fe80::1]',
    'https://enroll.myking.test',
    'https://enroll.example',
    'file:///tmp/x'
  ])('rejects %s', value => {
    expect(parseMyKingPublicHttpsUrl(value)).toBeNull()
  })
})
