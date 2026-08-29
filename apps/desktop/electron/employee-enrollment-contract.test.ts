import { describe, expect, it, vi } from 'vitest'

import {
  completeMyKingEmployeeEnrollment,
  parseMyKingEmployeeEnrollmentCode,
  parseMyKingEmployeeRedeemResponse,
  requestMyKingEmployeeAccountEnrollmentCode,
  redactMyKingEmployeeSecrets,
  redeemMyKingEmployeeInvitation,
  revokeMyKingEmployeeEnrollment
} from './employee-enrollment-contract'

const redeemResponse = {
  challenge: 'challenge-token-1',
  challengeExpiresAt: '2026-08-28T12:10:00.000Z',
  enrollmentId: 'enrollment-1',
  employeeId: 'employee-1',
  employeeName: '测试员工',
  remoteGateway: { url: 'https://gateway.myking.test/' },
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
  it('uses the employee account only to obtain an internal one-time enrollment code', async () => {
    const postJson = vi
      .fn()
      .mockResolvedValueOnce({ token: 'nora-session-token' })
      .mockResolvedValueOnce({ code: 'ABCD-2345-EFGH' })

    await expect(
      requestMyKingEmployeeAccountEnrollmentCode(
        {
          baseUrl: 'https://enroll.myking.test',
          email: 'employee@wysd.com',
          password: 'correct-password'
        },
        postJson
      )
    ).resolves.toBe('ABCD-2345-EFGH')

    expect(postJson).toHaveBeenNthCalledWith(1, {
      url: 'https://enroll.myking.test/api/auth/login',
      timeoutMs: 15_000,
      body: { email: 'employee@wysd.com', password: 'correct-password' }
    })
    expect(postJson).toHaveBeenNthCalledWith(2, {
      url: 'https://enroll.myking.test/api/employee-enrollments/account',
      authorization: 'Bearer nora-session-token',
      timeoutMs: 15_000,
      body: {}
    })
  })

  it('rejects an illegal binding code before the Nora request', async () => {
    const postJson = vi.fn()

    await expect(
      redeemMyKingEmployeeInvitation(
        {
          baseUrl: 'https://enroll.myking.test',
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
        baseUrl: 'https://enroll.myking.test',
        code: 'ABCD-2345-EFGH',
        device,
        relayPublicKey: `ssh-ed25519 ${'A'.repeat(44)}`
      },
      postJson
    )

    expect(postJson).toHaveBeenCalledWith({
      url: 'https://enroll.myking.test/api/employee-enrollments/redeem',
      timeoutMs: 15_000,
      body: { code: 'ABCD-2345-EFGH', device, relayPublicKey: `ssh-ed25519 ${'A'.repeat(44)}` }
    })
    expect(result.employeeId).toBe('employee-1')
  })

  it('posts the Nora completion contract and requires status ready', async () => {
    const postJson = vi.fn().mockResolvedValue({
      status: 'ready',
      employeeId: 'employee-1',
      gatewayAuth: { type: 'bearer', token: 'device-token' },
      remoteGatewayUrl: 'https://gateway.myking.test',
      message: '已连接公司智能体'
    })

    await expect(
      completeMyKingEmployeeEnrollment(
        {
          baseUrl: 'https://enroll.myking.test',
          challengeSignature: '-----BEGIN SSH SIGNATURE-----\nsignature\n-----END SSH SIGNATURE-----',
          enrollmentId: 'enrollment-1',
          completionToken: 'short-lived-completion-token',
          deviceId: device.deviceId,
          sshHostPublicKeys: [`ssh-ed25519 ${'B'.repeat(44)} host`]
        },
        postJson
      )
    ).resolves.toMatchObject({ status: 'ready', employeeId: 'employee-1' })

    expect(postJson).toHaveBeenCalledWith({
      url: 'https://enroll.myking.test/api/employee-enrollments/enrollment-1/complete',
      authorization: 'Bearer short-lived-completion-token',
      timeoutMs: 15_000,
      body: {
        challengeSignature: '-----BEGIN SSH SIGNATURE-----\nsignature\n-----END SSH SIGNATURE-----',
        deviceId: device.deviceId,
        sshHostPublicKeys: [`ssh-ed25519 ${'B'.repeat(44)} host`]
      }
    })

    postJson.mockResolvedValueOnce({ status: 'pending' })
    await expect(
      completeMyKingEmployeeEnrollment(
        {
          baseUrl: 'https://enroll.myking.test',
          challengeSignature: '-----BEGIN SSH SIGNATURE-----\nsignature\n-----END SSH SIGNATURE-----',
          enrollmentId: 'enrollment-1',
          completionToken: 'short-lived-completion-token',
          deviceId: device.deviceId,
          sshHostPublicKeys: [`ssh-ed25519 ${'B'.repeat(44)} host`]
        },
        postJson
      )
    ).rejects.toMatchObject({ code: 'not-ready' })
  })

  it('posts the device-bound Nora revocation contract and requires confirmation', async () => {
    const postJson = vi.fn().mockResolvedValue({ status: 'revoked' })

    await expect(
      revokeMyKingEmployeeEnrollment(
        {
          baseUrl: 'https://enroll.myking.test',
          deviceId: device.deviceId,
          deviceToken: 'device-token',
          enrollmentId: 'enrollment-1'
        },
        postJson
      )
    ).resolves.toBeUndefined()

    expect(postJson).toHaveBeenCalledWith({
      url: 'https://enroll.myking.test/api/employee-enrollments/enrollment-1/revoke',
      authorization: 'Bearer device-token',
      timeoutMs: 15_000,
      body: { deviceId: device.deviceId }
    })

    postJson.mockResolvedValueOnce({ status: 'active' })
    await expect(
      revokeMyKingEmployeeEnrollment(
        {
          baseUrl: 'https://enroll.myking.test',
          deviceId: device.deviceId,
          deviceToken: 'device-token',
          enrollmentId: 'enrollment-1'
        },
        postJson
      )
    ).rejects.toMatchObject({ code: 'invalid-server-response' })
  })

  it('rejects a non-HTTPS remote gateway returned by Nora', () => {
    expect(() =>
      parseMyKingEmployeeRedeemResponse({
        ...redeemResponse,
        remoteGateway: { url: 'http://gateway.myking.test' }
      })
    ).toThrow()
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
