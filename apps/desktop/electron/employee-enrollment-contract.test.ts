import { describe, expect, it, vi } from 'vitest'

import {
  completeMyKingEmployeeEnrollment,
  mintMyKingEmployeeGatewaySession,
  parseMyKingEmployeeEnrollmentCode,
  parseMyKingEmployeeRedeemResponse,
  redactMyKingEmployeeSecrets,
  redeemMyKingEmployeeInvitation,
  revokeMyKingEmployeeEnrollment
} from './employee-enrollment-contract'

const redeemResponse = {
  challenge: 'challenge_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  challengeExpiresAt: '2099-08-27T01:00:00.000Z',
  enrollmentId: 'enrollment-1',
  employeeId: 'employee-1',
  employeeName: '测试员工',
  remoteGateway: { url: 'https://gateway.myking.com/' },
  relay: {
    host: 'relay.myking.test',
    port: 32222,
    user: 'relay-employee-1',
    remotePort: 22001,
    hostKeySha256: `SHA256:${'a'.repeat(32)}`
  },
  employeeSsh: { authorizedPublicKey: `ssh-ed25519 ${'A'.repeat(44)} employee` },
  completionToken: 'short-lived-completion-token'
}

const device = {
  deviceId: '3923a574-8f83-4d62-bc53-ec1c82777e8e',
  deviceName: 'Employee Mac',
  platform: 'darwin' as const,
  arch: 'arm64' as const,
  appVersion: '2.0.0',
  sshUser: 'employee'
}

describe('employee enrollment contract', () => {
  it('rejects an illegal binding code before the Nora request', async () => {
    const postJson = vi.fn()

    await expect(
      redeemMyKingEmployeeInvitation(
        {
          baseUrl: 'https://enroll.myking.com',
          code: 'bad code',
          device,
          relayPublicKey: `ssh-ed25519 ${'A'.repeat(44)}`
        },
        postJson
      )
    ).rejects.toMatchObject({ code: 'invalid-invitation' })
    expect(postJson).not.toHaveBeenCalled()
  })

  it('posts the Nora redeem contract without changing the configured base URL', async () => {
    const postJson = vi.fn().mockResolvedValue(redeemResponse)

    const result = await redeemMyKingEmployeeInvitation(
      {
        baseUrl: 'https://enroll.myking.com',
        code: 'ABCD-2345-EFGH',
        device,
        relayPublicKey: `ssh-ed25519 ${'A'.repeat(44)}`
      },
      postJson
    )

    expect(postJson).toHaveBeenCalledWith({
      url: 'https://enroll.myking.com/api/employee-enrollments/redeem',
      timeoutMs: 15_000,
      body: { code: 'ABCD-2345-EFGH', device, relayPublicKey: `ssh-ed25519 ${'A'.repeat(44)}` }
    })
    expect(result.employeeId).toBe('employee-1')
  })

  it('posts the Nora completion contract and requires status ready', async () => {
    const postJson = vi.fn().mockResolvedValue({
      status: 'ready',
      gatewayAuth: { type: 'bearer', token: 'employee-gateway-token' },
      employeeId: 'employee-1',
      remoteGatewayUrl: 'https://gateway.myking.com',
      message: '已连接公司智能体'
    })

    await expect(
      completeMyKingEmployeeEnrollment(
        {
          baseUrl: 'https://enroll.myking.com',
          enrollmentId: 'enrollment-1',
          completionToken: 'short-lived-completion-token',
          challengeSignature: '-----BEGIN SSH SIGNATURE-----\nU1NIU0lH\n-----END SSH SIGNATURE-----',
          deviceId: device.deviceId,
          sshHostPublicKeys: [`ssh-ed25519 ${'B'.repeat(44)} host`]
        },
        postJson
      )
    ).resolves.toMatchObject({ status: 'ready', employeeId: 'employee-1' })

    postJson.mockResolvedValueOnce({ status: 'pending' })
    await expect(
      completeMyKingEmployeeEnrollment(
        {
          baseUrl: 'https://enroll.myking.com',
          enrollmentId: 'enrollment-1',
          completionToken: 'short-lived-completion-token',
          challengeSignature: '-----BEGIN SSH SIGNATURE-----\nU1NIU0lH\n-----END SSH SIGNATURE-----',
          deviceId: device.deviceId,
          sshHostPublicKeys: [`ssh-ed25519 ${'B'.repeat(44)} host`]
        },
        postJson
      )
    ).rejects.toMatchObject({ code: 'not-ready' })
  })

  it('rejects a non-HTTPS remote gateway returned by Nora', () => {
    expect(() =>
      parseMyKingEmployeeRedeemResponse({
        ...redeemResponse,
        remoteGateway: { url: 'http://gateway.myking.test' }
      })
    ).toThrow()
  })

  it('rejects an expired enrollment challenge returned by Nora', () => {
    expect(() =>
      parseMyKingEmployeeRedeemResponse({
        ...redeemResponse,
        challengeExpiresAt: '2020-01-01T00:00:00.000Z'
      })
    ).toThrow()
  })

  it('revokes the exact enrollment with its device-scoped gateway credential', async () => {
    const postJson = vi.fn().mockResolvedValue({ status: 'revoked' })

    await revokeMyKingEmployeeEnrollment(
      {
        baseUrl: 'https://enroll.myking.com',
        enrollmentId: 'enrollment-1',
        deviceId: device.deviceId,
        gatewayToken: 'employee-gateway-token'
      },
      postJson
    )

    expect(postJson).toHaveBeenCalledWith({
      url: 'https://enroll.myking.com/api/employee-enrollments/enrollment-1/revoke',
      authorization: 'Bearer employee-gateway-token',
      timeoutMs: 15_000,
      body: { deviceId: device.deviceId }
    })
  })

  it('exchanges the device credential for a short-lived gateway access token', async () => {
    const postJson = vi.fn().mockResolvedValue({
      accessToken: 'short-lived-gateway-token',
      expiresAt: '2099-08-27T01:00:00.000Z',
      tokenType: 'Bearer'
    })

    await expect(
      mintMyKingEmployeeGatewaySession(
        {
          baseUrl: 'https://enroll.myking.com',
          enrollmentId: 'enrollment-1',
          deviceId: device.deviceId,
          gatewayToken: 'employee-gateway-token'
        },
        postJson
      )
    ).resolves.toMatchObject({ accessToken: 'short-lived-gateway-token', tokenType: 'Bearer' })

    expect(postJson).toHaveBeenCalledWith({
      url: 'https://enroll.myking.com/api/employee-enrollments/enrollment-1/gateway-session',
      authorization: 'Bearer employee-gateway-token',
      timeoutMs: 15_000,
      body: { deviceId: device.deviceId }
    })
  })
})

describe('employee enrollment secret redaction', () => {
  it('redacts binding codes, completion tokens, and private keys', () => {
    const text = redactMyKingEmployeeSecrets(
      'myking://enroll?code=ABCD-2345 completionToken=secret -----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----'
    )

    expect(text).not.toContain('ABCD-2345')
    expect(text).not.toContain('completionToken=secret')
    expect(text).not.toContain('BEGIN PRIVATE KEY')
    expect(text.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('accepts only bounded alphanumeric and hyphen enrollment codes', () => {
    expect(parseMyKingEmployeeEnrollmentCode('ABCD-2345')).toBe('ABCD-2345')
    expect(parseMyKingEmployeeEnrollmentCode('bad_code')).toBeNull()
  })
})
