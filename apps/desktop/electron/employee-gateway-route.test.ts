import fs from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  createMyKingEmployeeGatewayAccessTokenCache,
  mergeMyKingEmployeeProxyBypassList,
  preserveMyKingEmployeeManagedMarker,
  removeMyKingEmployeeStaticGatewayCredential,
  resolveMyKingEmployeeGatewayClearUrl,
  resolveMyKingEmployeeRuntimeProxyConfig,
  resolveMyKingEmployeeGatewayRoute
} from './employee-gateway-route'

const binding = {
  version: 1 as const,
  employeeId: 'employee-1',
  employeeName: '测试员工',
  deviceId: 'random-device-id',
  enrollmentId: 'enrollment-1',
  remoteGatewayUrl: 'https://bound-gateway.myking.test',
  enrolledAt: '2026-08-27T00:00:00.000Z',
  lastCheckAt: null
}

describe('My King managed employee gateway route', () => {
  it('shares one employee gateway session across concurrent requests until its refresh window', async () => {
    let now = Date.parse('2026-08-30T00:00:00.000Z')
    let loads = 0
    const getAccessToken = createMyKingEmployeeGatewayAccessTokenCache({ now: () => now })
    const load = async () => {
      loads += 1

      return {
        accessToken: `access-${loads}`,
        expiresAt: new Date(now + 300_000).toISOString()
      }
    }

    await expect(Promise.all(Array.from({ length: 20 }, () => getAccessToken('employee-1', load)))).resolves.toEqual(
      Array(20).fill('access-1')
    )
    expect(loads).toBe(1)

    now += 269_000
    await expect(getAccessToken('employee-1', load)).resolves.toBe('access-1')
    expect(loads).toBe(1)

    now += 2_000
    await expect(Promise.all(Array.from({ length: 20 }, () => getAccessToken('employee-1', load)))).resolves.toEqual(
      Array(20).fill('access-2')
    )
    expect(loads).toBe(2)
  })

  it('does not cache a failed employee gateway session request', async () => {
    let loads = 0
    const getAccessToken = createMyKingEmployeeGatewayAccessTokenCache()
    const load = async () => {
      loads += 1

      if (loads === 1) {
        throw new Error('temporary gateway-session failure')
      }

      return { accessToken: 'recovered', expiresAt: new Date(Date.now() + 300_000).toISOString() }
    }

    await expect(getAccessToken('employee-1', load)).rejects.toThrow('temporary gateway-session failure')
    await expect(getAccessToken('employee-1', load)).resolves.toBe('recovered')
    expect(loads).toBe(2)
  })

  it('refreshes the employee gateway session when its binding or device credential changes', async () => {
    let loads = 0
    const getAccessToken = createMyKingEmployeeGatewayAccessTokenCache()
    const load = async () => ({
      accessToken: `access-${++loads}`,
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    })

    await expect(getAccessToken('enrollment-1:device-1:credential-1', load)).resolves.toBe('access-1')
    await expect(getAccessToken('enrollment-1:device-1:credential-1', load)).resolves.toBe('access-1')
    await expect(getAccessToken('enrollment-1:device-2:credential-1', load)).resolves.toBe('access-2')
    await expect(getAccessToken('enrollment-1:device-2:credential-2', load)).resolves.toBe('access-3')
    expect(loads).toBe(3)
  })

  it('adds only the company gateway hosts to the existing Chromium proxy bypass list', () => {
    expect(
      mergeMyKingEmployeeProxyBypassList('localhost;*.internal.test', [
        'https://mac-studio.tail2b3890.ts.net:8443',
        'https://mac-studio.tail2b3890.ts.net:8443/api/employee-gateways/enrollment-1',
        'https://secondary-gateway.myking.test/api',
        'http://not-public.test'
      ])
    ).toBe('localhost;*.internal.test;mac-studio.tail2b3890.ts.net;secondary-gateway.myking.test')
  })

  it('keeps an explicit PAC proxy while adding a gateway returned after startup', () => {
    expect(
      resolveMyKingEmployeeRuntimeProxyConfig({
        autoDetect: false,
        noProxyServer: false,
        pacScript: 'https://proxy.company.test/config.pac',
        proxyBypassRules: 'localhost;enroll.myking.test',
        proxyRules: '',
        urls: ['https://assigned-gateway.myking.test/api/employee-gateways/employee-1']
      })
    ).toEqual({
      mode: 'pac_script',
      pacScript: 'https://proxy.company.test/config.pac',
      proxyBypassRules: 'localhost;enroll.myking.test;assigned-gateway.myking.test'
    })
  })

  it('keeps fixed proxy rules while adding the managed gateway host', () => {
    expect(
      resolveMyKingEmployeeRuntimeProxyConfig({
        autoDetect: false,
        noProxyServer: false,
        pacScript: '',
        proxyBypassRules: '',
        proxyRules: 'http=proxy.company.test:8080;https=proxy.company.test:8443',
        urls: ['https://assigned-gateway.myking.test']
      })
    ).toEqual({
      mode: 'fixed_servers',
      proxyBypassRules: 'assigned-gateway.myking.test',
      proxyRules: 'http=proxy.company.test:8080;https=proxy.company.test:8443'
    })
  })

  it('uses the operating-system proxy when no command-line proxy mode is configured', () => {
    expect(
      resolveMyKingEmployeeRuntimeProxyConfig({
        autoDetect: false,
        noProxyServer: false,
        pacScript: '',
        proxyBypassRules: 'localhost',
        proxyRules: '',
        urls: ['https://assigned-gateway.myking.test']
      })
    ).toEqual({
      mode: 'system',
      proxyBypassRules: 'localhost;assigned-gateway.myking.test'
    })
  })

  it('connects directly to a Tailscale employee gateway instead of sending it to the system proxy', () => {
    expect(
      resolveMyKingEmployeeRuntimeProxyConfig({
        autoDetect: false,
        noProxyServer: false,
        pacScript: '',
        proxyBypassRules: '',
        proxyRules: '',
        urls: ['https://mac-studio.tail2b3890.ts.net:8443/api/employee-gateways/employee-1']
      })
    ).toEqual({ mode: 'direct' })
  })

  it('does not enable a proxy when Chromium was launched with proxying disabled', () => {
    expect(
      resolveMyKingEmployeeRuntimeProxyConfig({
        autoDetect: false,
        noProxyServer: true,
        pacScript: 'https://proxy.company.test/config.pac',
        proxyBypassRules: 'localhost',
        proxyRules: 'https=proxy.company.test:8443',
        urls: ['https://assigned-gateway.myking.test']
      })
    ).toEqual({ mode: 'direct' })
  })

  it('keeps proxy auto-detection when it is the configured mode', () => {
    expect(
      resolveMyKingEmployeeRuntimeProxyConfig({
        autoDetect: true,
        noProxyServer: false,
        pacScript: '',
        proxyBypassRules: 'localhost',
        proxyRules: '',
        urls: ['https://assigned-gateway.myking.test']
      })
    ).toEqual({
      mode: 'auto_detect',
      proxyBypassRules: 'localhost;assigned-gateway.myking.test'
    })
  })

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
  it('preserves the managed marker when a generic settings save keeps the assigned gateway', () => {
    expect(
      preserveMyKingEmployeeManagedMarker(
        {
          url: 'https://gateway.myking.test/',
          employeeManaged: true,
          token: { encoding: 'safeStorage', value: 'employee-secret' }
        },
        {
          url: 'https://gateway.myking.test',
          authMode: 'token',
          token: { encoding: 'safeStorage', value: 'employee-secret' }
        }
      )
    ).toEqual({
      url: 'https://gateway.myking.test',
      authMode: 'token',
      employeeManaged: true,
      token: { encoding: 'safeStorage', value: 'employee-secret' }
    })
  })

  it('does not carry the managed marker to a different gateway', () => {
    expect(
      preserveMyKingEmployeeManagedMarker(
        { url: 'https://gateway.myking.test', employeeManaged: true },
        { url: 'https://personal.myking.test', authMode: 'token', token: 'personal-secret' }
      )
    ).toEqual({
      url: 'https://personal.myking.test',
      authMode: 'token',
      token: 'personal-secret'
    })
  })

  it('does not preserve the managed marker when the saved credential changes', () => {
    expect(
      preserveMyKingEmployeeManagedMarker(
        {
          url: 'https://gateway.myking.test',
          employeeManaged: true,
          token: { encoding: 'safeStorage', value: 'employee-secret' }
        },
        {
          url: 'https://gateway.myking.test',
          authMode: 'token',
          token: { encoding: 'safeStorage', value: 'replacement-secret' }
        }
      )
    ).toEqual({
      url: 'https://gateway.myking.test',
      authMode: 'token',
      token: { encoding: 'safeStorage', value: 'replacement-secret' }
    })
  })

  it('removes only static credentials for the employee gateway during unbind', () => {
    const config = {
      mode: 'remote',
      remote: {
        employeeManaged: true,
        url: 'https://gateway.myking.test/',
        token: { encoding: 'safeStorage', value: 'employee-secret' }
      },
      profiles: {
        managed: {
          employeeManaged: true,
          url: 'https://gateway.myking.test',
          token: { encoding: 'safeStorage', value: 'managed-secret' }
        },
        genericSameUrl: {
          url: 'https://gateway.myking.test',
          token: { encoding: 'safeStorage', value: 'generic-secret' }
        },
        personal: { url: 'https://personal.myking.test', token: { encoding: 'safeStorage', value: 'keep-me' } }
      }
    }

    expect(removeMyKingEmployeeStaticGatewayCredential(config, 'https://gateway.myking.test')).toEqual({
      mode: 'remote',
      remote: { url: 'https://gateway.myking.test/', token: null },
      profiles: {
        managed: { url: 'https://gateway.myking.test', token: null },
        genericSameUrl: {
          url: 'https://gateway.myking.test',
          token: { encoding: 'safeStorage', value: 'generic-secret' }
        },
        personal: { url: 'https://personal.myking.test', token: { encoding: 'safeStorage', value: 'keep-me' } }
      }
    })
  })

  it('falls back to a saved employee-managed URL but never a normal remote URL', () => {
    expect(
      resolveMyKingEmployeeGatewayClearUrl(
        {
          remote: {
            employeeManaged: true,
            url: 'https://gateway.myking.test/',
            token: { encoding: 'safeStorage', value: 'employee-secret' }
          }
        },
        null
      )
    ).toBe('https://gateway.myking.test')
    expect(
      resolveMyKingEmployeeGatewayClearUrl(
        {
          remote: {
            url: 'https://personal.myking.test',
            token: { encoding: 'safeStorage', value: 'personal-secret' }
          }
        },
        null
      )
    ).toBeNull()
  })

  it('keeps employee gateway clearing scoped away from global OAuth and native token stores', () => {
    const source = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8')
    const start = source.indexOf('async function clearMyKingEmployeeGateway')
    const end = source.indexOf('\nfunction getMyKingEmployeeEnrollment', start)
    const implementation = source.slice(start, end)

    expect(implementation).not.toContain('clearOauthSession')
    expect(implementation).not.toContain('_clearNativeTokens')
  })
})
