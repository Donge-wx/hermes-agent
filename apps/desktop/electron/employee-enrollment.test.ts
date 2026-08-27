import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { resolveMyKingEmployeeConnectorPaths } from './employee-connector'
import { createMyKingEmployeeEnrollment, type MyKingEmployeeEnrollmentStage } from './employee-enrollment'
import { MyKingEmployeeEnrollmentError, type MyKingEmployeeHttpRequest } from './employee-enrollment-contract'

const temporaryDirectories: string[] = []
const HOST_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMyKingEmployeeHostPublicKey1234567890'
const EMPLOYEE_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMyKingEmployeeAuthorizedKey1234567890 nora'

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function fixture(
  employeeId = 'employee-1',
  failFirstPrepare = false,
  failGatewayProbe = false,
  failFirstComplete = false,
  failRevoke = false,
  failFirstCredentialStore = false
) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'myking-enrollment-'))
  temporaryDirectories.push(userData)
  const stages: MyKingEmployeeEnrollmentStage[] = []
  const calls: MyKingEmployeeHttpRequest[] = []
  const clearedGatewayUrls: (null | string)[] = []
  let prepareCount = 0
  let probeCount = 0
  let completeCount = 0
  let revokeCount = 0
  let credentialStoreCount = 0

  const connectorPaths = {
    ...resolveMyKingEmployeeConnectorPaths({ platform: 'darwin', userData }),
    baseDir: path.join(userData, 'connector'),
    controlDir: path.join(userData, 'connector', 'control'),
    diagnosticsLogPath: path.join(userData, 'connector', 'logs', 'connector.log'),
    hostPublicKeysPath: path.join(userData, 'connector', 'control', 'ssh-host-public-keys.txt'),
    readyPath: path.join(userData, 'connector', 'control', 'ready')
  }

  const enrollment = createMyKingEmployeeEnrollment({
    appVersion: '2.0.0',
    applyRemoteGateway: async () => undefined,
    arch: 'arm64',
    baseUrl: 'https://enroll.myking.com',
    clearRemoteGateway: async url => {
      clearedGatewayUrls.push(url)
    },
    connectorPaths,
    enableConnector: async () => {
      fs.mkdirSync(connectorPaths.controlDir, { recursive: true })
      fs.writeFileSync(connectorPaths.readyPath, 'ready\n')
    },
    emit: status => stages.push(status.stage),
    employeeHome: userData,
    employeeUser: 'employee',
    helperScriptPath: '/Applications/My King.app/employee-connector.sh',
    managedGatewayUrl: null,
    platform: 'darwin',
    postJson: async request => {
      calls.push(request)

      if (request.url.endsWith('/redeem')) {
        return {
          challenge: 'challenge_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
          challengeExpiresAt: '2099-08-27T01:00:00.000Z',
          enrollmentId: `enrollment-${calls.length}`,
          employeeId,
          employeeName: '测试员工',
          remoteGateway: { url: 'https://gateway.myking.com' },
          relay: {
            host: '192.0.2.51',
            port: 32222,
            user: 'relay-employee-1',
            remotePort: 22001,
            hostKeySha256: 'SHA256:abcdefghijklmnopqrstuvwxyz1234567890'
          },
          employeeSsh: { authorizedPublicKey: EMPLOYEE_PUBLIC_KEY },
          completionToken: 'completion-secret'
        }
      }

      completeCount += 1

      if (failFirstComplete && completeCount === 1) {
        throw new MyKingEmployeeEnrollmentError('company-unavailable', 'Company unavailable.')
      }

      return {
        status: 'ready',
        employeeId,
        gatewayAuth: { type: 'bearer', token: 'employee-gateway-token' },
        remoteGatewayUrl: 'https://gateway.myking.com',
        message: '已连接公司智能体'
      }
    },
    probeRemoteGateway: async () => {
      probeCount += 1

      if (failGatewayProbe && probeCount === 1) {
        throw new Error('network offline')
      }
    },
    revokeEnrollment: async () => {
      revokeCount += 1

      if (failRevoke) {
        throw new MyKingEmployeeEnrollmentError('revocation-failed', 'Revocation failed.')
      }
    },
    runElevated: async (_helper, action, planPath) => {
      if (action === 'unbind') {
        fs.rmSync(connectorPaths.baseDir, { recursive: true, force: true })

        return
      }

      if (action === 'prepare') {
        prepareCount += 1

        if (failFirstPrepare && prepareCount === 1) {
          throw new MyKingEmployeeEnrollmentError('permission-required', 'System permission is required.')
        }

        JSON.parse(fs.readFileSync(planPath, 'utf8'))
        fs.mkdirSync(path.dirname(connectorPaths.hostPublicKeysPath), { recursive: true })
        fs.writeFileSync(connectorPaths.hostPublicKeysPath, `${HOST_PUBLIC_KEY}\n`)
      }
    },
    storeGatewayCredential: async () => {
      credentialStoreCount += 1

      if (failFirstCredentialStore && credentialStoreCount === 1) {
        throw new MyKingEmployeeEnrollmentError('secure-storage-required', 'Secure storage unavailable.')
      }
    },
    userData
  })

  return {
    calls,
    clearedGatewayUrls,
    connectorPaths,
    enrollment,
    prepareCount: () => prepareCount,
    revokeCount: () => revokeCount,
    stages,
    userData
  }
}

describe('My King employee enrollment', () => {
  it('publishes only real stages and connects after Nora returns ready', async () => {
    const setup = fixture()

    const status = await setup.enrollment.enroll('ABCD-2345-EFGH')

    expect(status.stage).toBe('connected')
    expect(setup.stages).toEqual([
      'validating-invitation',
      'confirming-identity',
      'configuring-secure-connection',
      'enabling-device-access',
      'connecting-remote-gateway',
      'verifying-isolation',
      'connected'
    ])
    expect(setup.calls).toHaveLength(2)
    expect(setup.prepareCount()).toBe(1)
    expect(status.binding?.lastCheckAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('coalesces concurrent enrollment attempts into one background task', async () => {
    const setup = fixture()

    const [first, second] = await Promise.all([
      setup.enrollment.enroll('ABCD-2345-EFGH'),
      setup.enrollment.enroll('ABCD-2345-EFGH')
    ])

    expect(first).toEqual(second)
    expect(setup.calls).toHaveLength(2)
    expect(setup.prepareCount()).toBe(1)
  })

  it('retries authorization without redeeming or retaining the one-time code', async () => {
    const setup = fixture('employee-1', true)

    await expect(setup.enrollment.enroll('ABCD-2345-EFGH')).rejects.toMatchObject({ code: 'permission-required' })
    const status = await setup.enrollment.enroll('')

    expect(status.stage).toBe('connected')
    expect(setup.calls).toHaveLength(2)
    expect(setup.prepareCount()).toBe(2)
  })

  it('retries Nora completion from Check connection without redeeming or configuring twice', async () => {
    const setup = fixture('employee-1', false, false, true)

    await expect(setup.enrollment.enroll('ABCD-2345-EFGH')).rejects.toMatchObject({ code: 'company-unavailable' })
    const status = await setup.enrollment.check()

    expect(status.stage).toBe('connected')
    expect(setup.calls).toHaveLength(3)
    expect(setup.calls.filter(call => call.url.endsWith('/redeem'))).toHaveLength(1)
    expect(setup.prepareCount()).toBe(1)
  })

  it('keeps the pending enrollment retryable when secure credential storage fails', async () => {
    const setup = fixture('employee-1', false, false, false, false, true)

    await expect(setup.enrollment.enroll('ABCD-2345-EFGH')).rejects.toMatchObject({
      code: 'secure-storage-required'
    })
    const status = await setup.enrollment.check()

    expect(status.stage).toBe('connected')
    expect(setup.calls.filter(call => call.url.endsWith('/redeem'))).toHaveLength(1)
    expect(setup.prepareCount()).toBe(1)
  })

  it('reports a gateway connectivity failure instead of a connector success', async () => {
    const setup = fixture('employee-1', false, true)

    await expect(setup.enrollment.enroll('ABCD-2345-EFGH')).rejects.toMatchObject({ code: 'gateway-unreachable' })
    expect(setup.enrollment.getStatus()).toMatchObject({ error: 'gateway-unreachable', stage: 'error' })
  })

  it('rechecks a completed binding after a temporary gateway outage without redeeming again', async () => {
    const setup = fixture('employee-1', false, true)

    await expect(setup.enrollment.enroll('ABCD-2345-EFGH')).rejects.toMatchObject({ code: 'gateway-unreachable' })
    const status = await setup.enrollment.check()

    expect(status).toMatchObject({ connectorReady: true, error: null, stage: 'connected' })
    expect(setup.calls).toHaveLength(2)
  })

  it('never reports success when Nora complete fails', async () => {
    const setup = fixture()
    setup.calls.splice(0)

    const failing = createMyKingEmployeeEnrollment({
      appVersion: '2.0.0',
      applyRemoteGateway: async () => undefined,
      arch: 'arm64',
      baseUrl: 'https://enroll.myking.com',
      clearRemoteGateway: async () => undefined,
      connectorPaths: setup.connectorPaths,
      enableConnector: async () => undefined,
      emit: status => setup.stages.push(status.stage),
      employeeHome: setup.userData,
      employeeUser: 'employee',
      helperScriptPath: '/employee-connector.sh',
      managedGatewayUrl: null,
      platform: 'darwin',
      postJson: async request => {
        if (request.url.endsWith('/redeem')) {
          return {
            challenge: 'challenge_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            challengeExpiresAt: '2099-08-27T01:00:00.000Z',
            enrollmentId: 'enrollment-fail',
            employeeId: 'employee-1',
            employeeName: '测试员工',
            remoteGateway: { url: 'https://gateway.myking.com' },
            relay: {
              host: '192.0.2.51',
              port: 32222,
              user: 'relay-employee-1',
              remotePort: 22001,
              hostKeySha256: 'SHA256:abcdefghijklmnopqrstuvwxyz1234567890'
            },
            employeeSsh: { authorizedPublicKey: EMPLOYEE_PUBLIC_KEY },
            completionToken: 'completion-secret'
          }
        }

        throw new Error('company unavailable')
      },
      probeRemoteGateway: async () => undefined,
      revokeEnrollment: async () => undefined,
      runElevated: async (_helper, action, planPath) => {
        if (action === 'prepare') {
          JSON.parse(fs.readFileSync(planPath, 'utf8'))
          fs.mkdirSync(path.dirname(setup.connectorPaths.hostPublicKeysPath), { recursive: true })
          fs.writeFileSync(setup.connectorPaths.hostPublicKeysPath, `${HOST_PUBLIC_KEY}\n`)
        }
      },
      storeGatewayCredential: async () => undefined,
      userData: setup.userData
    })

    await expect(failing.enroll('ABCD-2345-EFGH')).rejects.toThrow('company unavailable')
    expect(failing.getStatus().stage).toBe('error')
  })

  it('rejects an invitation for another employee instead of overwriting the binding', async () => {
    const first = fixture('employee-1')
    await first.enrollment.enroll('ABCD-2345-EFGH')
    const second = fixture('employee-2')
    fs.copyFileSync(first.connectorPaths.bindingPath, second.connectorPaths.bindingPath)
    fs.copyFileSync(
      path.join(first.userData, 'employee-connector-device.json'),
      path.join(second.userData, 'employee-connector-device.json')
    )

    await expect(second.enrollment.enroll('WXYZ-9876-IJKL')).rejects.toMatchObject({ code: 'employee-mismatch' })
    expect(second.prepareCount()).toBe(0)
  })

  it('unbind removes local identity and asks the Electron boundary to clear only the assigned gateway session', async () => {
    const setup = fixture()
    await setup.enrollment.enroll('ABCD-2345-EFGH')

    const status = await setup.enrollment.unbind()

    expect(status).toMatchObject({ binding: null, connectorReady: false, stage: 'idle' })
    expect(setup.clearedGatewayUrls).toEqual(['https://gateway.myking.com'])
    expect(setup.revokeCount()).toBe(1)
    expect(fs.existsSync(path.join(setup.userData, 'employee-connector-device.json'))).toBe(false)
  })

  it('keeps local binding and device identity when Nora revocation fails', async () => {
    const setup = fixture('employee-1', false, false, false, true)
    await setup.enrollment.enroll('ABCD-2345-EFGH')

    await expect(setup.enrollment.unbind()).rejects.toMatchObject({ code: 'revocation-failed' })
    expect(fs.existsSync(setup.connectorPaths.bindingPath)).toBe(true)
    expect(fs.existsSync(path.join(setup.userData, 'employee-connector-device.json'))).toBe(true)
    expect(setup.clearedGatewayUrls).toEqual([])
  })
})
