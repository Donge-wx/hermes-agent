import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readMyKingEmployeeBinding, resolveMyKingEmployeeConnectorPaths } from './employee-connector'
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
  failFirstGatewayApply = false,
  failServerRevoke = false,
  failFirstLocalUnbind = false
) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'myking-enrollment-'))
  temporaryDirectories.push(userData)
  const stages: MyKingEmployeeEnrollmentStage[] = []
  const calls: MyKingEmployeeHttpRequest[] = []
  const clearedGatewayUrls: (null | string)[] = []
  const events: string[] = []
  const revokedEnrollmentIds: string[] = []
  let prepareCount = 0
  let probeCount = 0
  let completeCount = 0
  let gatewayApplyCount = 0
  let localUnbindCount = 0
  const gatewayApplyBindingIds: (null | string)[] = []
  const gatewayProbeBindingIds: (null | string)[] = []

  const connectorPaths = {
    ...resolveMyKingEmployeeConnectorPaths({ platform: 'darwin', userData }),
    baseDir: path.join(userData, 'connector'),
    controlDir: path.join(userData, 'connector', 'control'),
    diagnosticsLogPath: path.join(userData, 'connector', 'logs', 'connector.log'),
    readyPath: path.join(userData, 'connector', 'control', 'ready')
  }

  const enrollment = createMyKingEmployeeEnrollment({
    appVersion: '2.0.0',
    applyRemoteGateway: async () => {
      gatewayApplyCount += 1
      gatewayApplyBindingIds.push(readMyKingEmployeeBinding(connectorPaths.bindingPath)?.enrollmentId ?? null)

      if (failFirstGatewayApply && gatewayApplyCount === 1) {
        throw new Error('credential persistence failed')
      }
    },
    arch: 'arm64',
    baseUrl: 'https://enroll.myking.test',
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
    employeeIsAdministrator: false,
    employeeUser: 'employee',
    helperScriptPath: '/Applications/My King.app/employee-connector.sh',
    managedGatewayUrl: null,
    platform: 'darwin',
    postJson: async request => {
      calls.push(request)

      if (request.url.endsWith('/api/auth/login')) {
        return { token: 'nora-session-token' }
      }

      if (request.url.endsWith('/api/employee-enrollments/account')) {
        return { code: 'ABCD-2345-EFGH' }
      }

      if (request.url.endsWith('/redeem')) {
        return {
          challenge: `challenge-token-${calls.length}`,
          challengeExpiresAt: '2026-08-28T12:10:00.000Z',
          enrollmentId: `enrollment-${calls.length}`,
          employeeId,
          employeeName: '测试员工',
          remoteGateway: { url: 'https://gateway.myking.test' },
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
        gatewayAuth: { type: 'bearer', token: 'device-token' },
        remoteGatewayUrl: 'https://gateway.myking.test',
        message: '已连接公司智能体'
      }
    },
    probeRemoteGateway: async () => {
      probeCount += 1
      gatewayProbeBindingIds.push(readMyKingEmployeeBinding(connectorPaths.bindingPath)?.enrollmentId ?? null)

      if (failGatewayProbe && probeCount === 1) {
        throw new Error('network offline')
      }
    },
    revokeRemoteGateway: async binding => {
      events.push('server-revoke')
      revokedEnrollmentIds.push(binding.enrollmentId)

      if (failServerRevoke) {
        throw new MyKingEmployeeEnrollmentError('company-unavailable', 'Company unavailable.')
      }
    },
    runElevated: async (_helper, action, planPath) => {
      if (action === 'unbind') {
        events.push('local-unbind')
        localUnbindCount += 1

        if (failFirstLocalUnbind && localUnbindCount === 1) {
          throw new MyKingEmployeeEnrollmentError('permission-required', 'System permission is required.')
        }

        fs.rmSync(connectorPaths.baseDir, { recursive: true, force: true })

        return
      }

      if (action === 'prepare') {
        prepareCount += 1

        if (failFirstPrepare && prepareCount === 1) {
          throw new MyKingEmployeeEnrollmentError('permission-required', 'System permission is required.')
        }

        const plan: unknown = JSON.parse(fs.readFileSync(planPath, 'utf8'))

        if (plan !== null && typeof plan === 'object' && 'outputPath' in plan && typeof plan.outputPath === 'string') {
          fs.mkdirSync(path.dirname(plan.outputPath), { recursive: true })
          fs.writeFileSync(plan.outputPath, `${HOST_PUBLIC_KEY}\n`)
        }
      }
    },
    userData
  })

  return {
    calls,
    clearedGatewayUrls,
    connectorPaths,
    enrollment,
    events,
    gatewayApplyBindingIds,
    gatewayProbeBindingIds,
    prepareCount: () => prepareCount,
    revokedEnrollmentIds,
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
    expect(setup.gatewayApplyBindingIds).toEqual([null])
    expect(setup.gatewayProbeBindingIds).toEqual(['enrollment-1'])
    expect(status.binding?.lastCheckAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('uses an employee account to obtain an internal code and then runs the existing secure enrollment', async () => {
    const setup = fixture()

    const status = await setup.enrollment.login({
      email: 'employee@wysd.com',
      password: 'correct-password'
    })

    expect(status.stage).toBe('connected')
    expect(setup.calls.map(call => new URL(call.url).pathname)).toEqual([
      '/api/auth/login',
      '/api/employee-enrollments/account',
      '/api/employee-enrollments/redeem',
      '/api/employee-enrollments/enrollment-3/complete'
    ])
    expect(setup.prepareCount()).toBe(1)
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

  it('reports a gateway connectivity failure instead of a connector success', async () => {
    const setup = fixture('employee-1', false, true)

    await expect(setup.enrollment.enroll('ABCD-2345-EFGH')).rejects.toMatchObject({ code: 'gateway-unreachable' })
    expect(setup.enrollment.getStatus()).toMatchObject({ error: 'gateway-unreachable', stage: 'error' })
  })

  it('does not leave a completed binding without a persisted gateway credential', async () => {
    const setup = fixture('employee-1', false, false, false, true)

    await expect(
      setup.enrollment.login({ email: 'employee@wysd.com', password: 'correct-password' })
    ).rejects.toMatchObject({ code: 'gateway-unreachable' })
    expect(setup.enrollment.getStatus().binding).toBeNull()

    const status = await setup.enrollment.login({
      email: 'employee@wysd.com',
      password: 'correct-password'
    })

    expect(status.stage).toBe('connected')
    expect(setup.calls.filter(call => call.url.endsWith('/api/auth/login'))).toHaveLength(2)
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
      baseUrl: 'https://enroll.myking.test',
      clearRemoteGateway: async () => undefined,
      connectorPaths: setup.connectorPaths,
      enableConnector: async () => undefined,
      emit: status => setup.stages.push(status.stage),
      employeeHome: setup.userData,
      employeeIsAdministrator: false,
      employeeUser: 'employee',
      helperScriptPath: '/employee-connector.sh',
      managedGatewayUrl: null,
      platform: 'darwin',
      postJson: async request => {
        if (request.url.endsWith('/redeem')) {
          return {
            challenge: 'challenge-token-fail',
            challengeExpiresAt: '2026-08-28T12:10:00.000Z',
            enrollmentId: 'enrollment-fail',
            employeeId: 'employee-1',
            employeeName: '测试员工',
            remoteGateway: { url: 'https://gateway.myking.test' },
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
      revokeRemoteGateway: async () => undefined,
      runElevated: async (_helper, action, planPath) => {
        if (action === 'prepare') {
          const plan: unknown = JSON.parse(fs.readFileSync(planPath, 'utf8'))

          if (plan !== null && typeof plan === 'object' && 'outputPath' in plan && typeof plan.outputPath === 'string') {
            fs.writeFileSync(plan.outputPath, `${HOST_PUBLIC_KEY}\n`)
          }
        }
      },
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

  it('unbind revokes Nora first, then removes local identity and clears only the assigned gateway session', async () => {
    const setup = fixture()
    await setup.enrollment.enroll('ABCD-2345-EFGH')

    const status = await setup.enrollment.unbind()

    expect(status).toMatchObject({ binding: null, connectorReady: false, stage: 'idle' })
    expect(setup.revokedEnrollmentIds).toEqual(['enrollment-1'])
    expect(setup.events).toEqual(['server-revoke', 'local-unbind'])
    expect(setup.clearedGatewayUrls).toEqual(['https://gateway.myking.test'])
    expect(fs.existsSync(path.join(setup.userData, 'employee-connector-device.json'))).toBe(false)
  })

  it('keeps the binding and local connector retryable when Nora revocation fails', async () => {
    const setup = fixture('employee-1', false, false, false, false, true)
    await setup.enrollment.enroll('ABCD-2345-EFGH')

    await expect(setup.enrollment.unbind()).rejects.toMatchObject({ code: 'company-unavailable' })

    expect(setup.enrollment.getStatus()).toMatchObject({
      binding: expect.objectContaining({ enrollmentId: 'enrollment-1' }),
      error: 'company-unavailable',
      stage: 'error'
    })
    expect(setup.events).toEqual(['server-revoke'])
    expect(setup.clearedGatewayUrls).toEqual([])
    expect(fs.existsSync(path.join(setup.userData, 'employee-connector-device.json'))).toBe(true)
  })

  it('retries local cleanup after Nora already confirmed revocation', async () => {
    const setup = fixture('employee-1', false, false, false, false, false, true)
    await setup.enrollment.enroll('ABCD-2345-EFGH')

    await expect(setup.enrollment.unbind()).rejects.toMatchObject({ code: 'permission-required' })
    expect(setup.enrollment.getStatus().binding).toMatchObject({ enrollmentId: 'enrollment-1' })

    await expect(setup.enrollment.unbind()).resolves.toMatchObject({ binding: null, stage: 'idle' })
    expect(setup.events).toEqual(['server-revoke', 'local-unbind', 'server-revoke', 'local-unbind'])
    expect(setup.revokedEnrollmentIds).toEqual(['enrollment-1', 'enrollment-1'])
    expect(fs.existsSync(path.join(setup.userData, 'employee-connector-device.json'))).toBe(false)
  })
})
