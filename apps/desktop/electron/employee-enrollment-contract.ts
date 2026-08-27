import type { MyKingEmployeeBinding } from './employee-connector'
import { parseMyKingPublicHttpsUrl } from './install-stamp'

export type MyKingEmployeePlatform = 'darwin' | 'windows'

export type MyKingEmployeeEnrollmentStage =
  | 'idle'
  | 'validating-invitation'
  | 'confirming-identity'
  | 'configuring-secure-connection'
  | 'enabling-device-access'
  | 'connecting-remote-gateway'
  | 'verifying-isolation'
  | 'connected'
  | 'error'

export interface MyKingEmployeeEnrollmentStatus {
  readonly binding: MyKingEmployeeBinding | null
  readonly configured: boolean
  readonly connectorReady: boolean
  readonly error: null | string
  readonly managedGateway: boolean
  readonly stage: MyKingEmployeeEnrollmentStage
}

export interface MyKingEmployeeDevice {
  readonly appVersion: string
  readonly arch: 'arm64' | 'x64'
  readonly deviceId: string
  readonly deviceName: string
  readonly platform: MyKingEmployeePlatform
  readonly sshUser: string
}

export interface MyKingEmployeeRedeemRequest {
  readonly baseUrl: string
  readonly code: string
  readonly device: MyKingEmployeeDevice
  readonly relayPublicKey: string
}

export interface MyKingEmployeeRedeemResponse {
  readonly challenge: string
  readonly challengeExpiresAt: string
  readonly completionToken: string
  readonly employeeId: string
  readonly employeeName: string
  readonly employeeSsh: { readonly authorizedPublicKey: string }
  readonly enrollmentId: string
  readonly relay: {
    readonly host: string
    readonly hostKeySha256: string
    readonly port: number
    readonly remotePort: number
    readonly user: string
  }
  readonly remoteGateway: { readonly url: string }
}

export interface MyKingEmployeeCompleteRequest {
  readonly baseUrl: string
  readonly completionToken: string
  readonly challengeSignature: string
  readonly deviceId: string
  readonly enrollmentId: string
  readonly sshHostPublicKeys: readonly string[]
}

export interface MyKingEmployeeRevokeRequest {
  readonly baseUrl: string
  readonly deviceId: string
  readonly enrollmentId: string
  readonly gatewayToken: string
}

export interface MyKingEmployeeGatewaySessionRequest extends MyKingEmployeeRevokeRequest {}

export interface MyKingEmployeeGatewaySessionResponse {
  readonly accessToken: string
  readonly expiresAt: string
  readonly tokenType: 'Bearer'
}

export interface MyKingEmployeeReadyResponse {
  readonly employeeId: string
  readonly gatewayAuth: { readonly token: string; readonly type: 'bearer' }
  readonly message: string
  readonly remoteGatewayUrl: string
  readonly status: 'ready'
}

export interface MyKingEmployeeHttpRequest {
  readonly authorization?: string
  readonly body: Readonly<Record<string, unknown>>
  readonly timeoutMs: number
  readonly url: string
}

export type MyKingEmployeePostJson = (request: MyKingEmployeeHttpRequest) => Promise<unknown>

const ENROLLMENT_CODE_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{6,126}[A-Za-z0-9])$/
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/
const SSH_PUBLIC_KEY_RE = /^ssh-ed25519 [A-Za-z0-9+/]+={0,3}(?: [^\r\n]+)?$/
const SSH_FINGERPRINT_RE = /^SHA256:[A-Za-z0-9+/]{20,}={0,3}$/
const CHALLENGE_RE = /^[A-Za-z0-9_-]{32,512}$/
const SSH_SIGNATURE_RE = /^-----BEGIN SSH SIGNATURE-----[\s\S]+-----END SSH SIGNATURE-----$/
const SECRET_MAX_LENGTH = 16_384

export class MyKingEmployeeEnrollmentError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'MyKingEmployeeEnrollmentError'
    this.code = code
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MyKingEmployeeEnrollmentError('invalid-server-response', 'Company server returned an invalid response.')
  }

  return Object.fromEntries(Object.entries(value))
}

function requiredString(record: Record<string, unknown>, key: string, pattern?: RegExp): string {
  const value = record[key]

  if (typeof value !== 'string' || !value || (pattern && !pattern.test(value))) {
    throw new MyKingEmployeeEnrollmentError('invalid-server-response', 'Company server returned an invalid response.')
  }

  return value
}

function requiredPort(record: Record<string, unknown>, key: string): number {
  const value = record[key]

  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 65_535) {
    throw new MyKingEmployeeEnrollmentError('invalid-server-response', 'Company server returned an invalid response.')
  }

  return Number(value)
}

export function parseMyKingEmployeeEnrollmentCode(rawValue: string): string | null {
  const value = rawValue.trim()

  return ENROLLMENT_CODE_RE.test(value) ? value : null
}

export function redactMyKingEmployeeSecrets(rawValue: string): string {
  return rawValue
    .replace(
      /-----BEGIN (?:OPENSSH |EC |RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:OPENSSH |EC |RSA )?PRIVATE KEY-----/g,
      '[REDACTED]'
    )
    .replace(/([?&]code=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/("?(?:code|completionToken|password|cookie|oauthToken|privateKey)"?\s*[:=]\s*)[^,}\s]+/gi, '$1[REDACTED]')
}

export function parseMyKingEmployeeRedeemResponse(value: unknown): MyKingEmployeeRedeemResponse {
  const root = objectRecord(value)
  const relay = objectRecord(root.relay)
  const remoteGateway = objectRecord(root.remoteGateway)
  const employeeSsh = objectRecord(root.employeeSsh)
  const remoteGatewayUrl = parseMyKingPublicHttpsUrl(remoteGateway.url)

  if (!remoteGatewayUrl) {
    throw new MyKingEmployeeEnrollmentError('invalid-server-response', 'Company server returned an unsafe gateway URL.')
  }

  const challengeExpiresAt = requiredString(root, 'challengeExpiresAt')
  const challengeExpiry = Date.parse(challengeExpiresAt)
  const completionToken = requiredString(root, 'completionToken')

  if (
    !Number.isFinite(challengeExpiry) ||
    challengeExpiry <= Date.now() ||
    completionToken.length > SECRET_MAX_LENGTH
  ) {
    throw new MyKingEmployeeEnrollmentError('invalid-server-response', 'Company server returned an invalid response.')
  }

  return {
    challenge: requiredString(root, 'challenge', CHALLENGE_RE),
    challengeExpiresAt,
    enrollmentId: requiredString(root, 'enrollmentId', SAFE_ID_RE),
    employeeId: requiredString(root, 'employeeId', SAFE_ID_RE),
    employeeName: requiredString(root, 'employeeName'),
    remoteGateway: { url: remoteGatewayUrl },
    relay: {
      host: requiredString(relay, 'host'),
      port: requiredPort(relay, 'port'),
      user: requiredString(relay, 'user', SAFE_ID_RE),
      remotePort: requiredPort(relay, 'remotePort'),
      hostKeySha256: requiredString(relay, 'hostKeySha256', SSH_FINGERPRINT_RE)
    },
    employeeSsh: { authorizedPublicKey: requiredString(employeeSsh, 'authorizedPublicKey', SSH_PUBLIC_KEY_RE) },
    completionToken
  }
}

export function parseMyKingEmployeeReadyResponse(value: unknown): MyKingEmployeeReadyResponse {
  const root = objectRecord(value)
  const remoteGatewayUrl = parseMyKingPublicHttpsUrl(root.remoteGatewayUrl)

  if (root.status !== 'ready' || !remoteGatewayUrl) {
    throw new MyKingEmployeeEnrollmentError('not-ready', 'Company server did not confirm that this device is ready.')
  }

  const gatewayAuth = objectRecord(root.gatewayAuth)

  if (gatewayAuth.type !== 'bearer') {
    throw new MyKingEmployeeEnrollmentError(
      'invalid-server-response',
      'Company server returned invalid gateway authentication.'
    )
  }

  const response: MyKingEmployeeReadyResponse = {
    status: 'ready',
    employeeId: requiredString(root, 'employeeId', SAFE_ID_RE),
    gatewayAuth: { type: 'bearer', token: requiredString(gatewayAuth, 'token') },
    remoteGatewayUrl,
    message: requiredString(root, 'message')
  }

  if (response.gatewayAuth.token.length > SECRET_MAX_LENGTH) {
    throw new MyKingEmployeeEnrollmentError('invalid-server-response', 'Company server returned an invalid response.')
  }

  return response
}

export async function redeemMyKingEmployeeInvitation(
  request: MyKingEmployeeRedeemRequest,
  postJson: MyKingEmployeePostJson
): Promise<MyKingEmployeeRedeemResponse> {
  const code = parseMyKingEmployeeEnrollmentCode(request.code)
  const baseUrl = parseMyKingPublicHttpsUrl(request.baseUrl)

  if (!code || !baseUrl || !SSH_PUBLIC_KEY_RE.test(request.relayPublicKey)) {
    throw new MyKingEmployeeEnrollmentError('invalid-invitation', 'The employee invitation is invalid.')
  }

  const response = await postJson({
    url: `${baseUrl}/api/employee-enrollments/redeem`,
    timeoutMs: 15_000,
    body: { code, device: request.device, relayPublicKey: request.relayPublicKey }
  })

  return parseMyKingEmployeeRedeemResponse(response)
}

export async function completeMyKingEmployeeEnrollment(
  request: MyKingEmployeeCompleteRequest,
  postJson: MyKingEmployeePostJson
): Promise<MyKingEmployeeReadyResponse> {
  const baseUrl = parseMyKingPublicHttpsUrl(request.baseUrl)

  if (
    !baseUrl ||
    !SAFE_ID_RE.test(request.enrollmentId) ||
    request.sshHostPublicKeys.length === 0 ||
    !SSH_SIGNATURE_RE.test(request.challengeSignature)
  ) {
    throw new MyKingEmployeeEnrollmentError('invalid-completion', 'The employee enrollment cannot be completed.')
  }

  const response = await postJson({
    url: `${baseUrl}/api/employee-enrollments/${encodeURIComponent(request.enrollmentId)}/complete`,
    authorization: `Bearer ${request.completionToken}`,
    timeoutMs: 15_000,
    body: {
      deviceId: request.deviceId,
      challengeSignature: request.challengeSignature,
      sshHostPublicKeys: [...request.sshHostPublicKeys]
    }
  })

  return parseMyKingEmployeeReadyResponse(response)
}

export async function revokeMyKingEmployeeEnrollment(
  request: MyKingEmployeeRevokeRequest,
  postJson: MyKingEmployeePostJson
): Promise<void> {
  const baseUrl = parseMyKingPublicHttpsUrl(request.baseUrl)

  if (
    !baseUrl ||
    !SAFE_ID_RE.test(request.enrollmentId) ||
    !SAFE_ID_RE.test(request.deviceId) ||
    !request.gatewayToken
  ) {
    throw new MyKingEmployeeEnrollmentError('invalid-revocation', 'The employee enrollment cannot be revoked.')
  }

  await postJson({
    url: `${baseUrl}/api/employee-enrollments/${encodeURIComponent(request.enrollmentId)}/revoke`,
    authorization: `Bearer ${request.gatewayToken}`,
    timeoutMs: 15_000,
    body: { deviceId: request.deviceId }
  })
}

export async function mintMyKingEmployeeGatewaySession(
  request: MyKingEmployeeGatewaySessionRequest,
  postJson: MyKingEmployeePostJson
): Promise<MyKingEmployeeGatewaySessionResponse> {
  const baseUrl = parseMyKingPublicHttpsUrl(request.baseUrl)

  if (
    !baseUrl ||
    !SAFE_ID_RE.test(request.enrollmentId) ||
    !SAFE_ID_RE.test(request.deviceId) ||
    !request.gatewayToken
  ) {
    throw new MyKingEmployeeEnrollmentError('invalid-gateway-session', 'The employee gateway session is invalid.')
  }

  const root = objectRecord(
    await postJson({
      url: `${baseUrl}/api/employee-enrollments/${encodeURIComponent(request.enrollmentId)}/gateway-session`,
      authorization: `Bearer ${request.gatewayToken}`,
      timeoutMs: 15_000,
      body: { deviceId: request.deviceId }
    })
  )
  const expiresAt = requiredString(root, 'expiresAt')
  const accessToken = requiredString(root, 'accessToken')

  if (
    root.tokenType !== 'Bearer' ||
    accessToken.length > SECRET_MAX_LENGTH ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.now()
  ) {
    throw new MyKingEmployeeEnrollmentError(
      'invalid-server-response',
      'Company server returned invalid gateway authentication.'
    )
  }

  return { accessToken, expiresAt, tokenType: 'Bearer' }
}
