import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  generateMyKingRelayKeyStaging,
  type MyKingEmployeeBinding,
  type MyKingEmployeeConnectorPaths,
  type MyKingRelayKeyStaging,
  prepareMyKingEmployeeConnector,
  readMyKingEmployeeBinding,
  signMyKingEmployeeEnrollmentChallenge,
  writeMyKingEmployeeBinding,
  writeMyKingRelayPublicKey
} from './employee-connector'
import { loadOrCreateMyKingEmployeeDeviceId, removeMyKingEmployeeDeviceId } from './employee-device-identity'
import {
  completeMyKingEmployeeEnrollment,
  MyKingEmployeeEnrollmentError,
  type MyKingEmployeeEnrollmentStage,
  type MyKingEmployeeEnrollmentStatus,
  type MyKingEmployeePostJson,
  type MyKingEmployeeRedeemResponse,
  parseMyKingEmployeeEnrollmentCode,
  redeemMyKingEmployeeInvitation
} from './employee-enrollment-contract'

export type { MyKingEmployeeEnrollmentStage, MyKingEmployeeEnrollmentStatus } from './employee-enrollment-contract'

interface PendingCompletion {
  readonly hostPublicKeys: null | readonly string[]
  readonly redeem: MyKingEmployeeRedeemResponse
  readonly staging: MyKingRelayKeyStaging
}

export interface MyKingEmployeeEnrollmentOptions {
  readonly appVersion: string
  readonly applyRemoteGateway: (url: string) => Promise<void>
  readonly arch: 'arm64' | 'x64'
  readonly baseUrl: null | string
  readonly clearRemoteGateway: (url: string | null) => Promise<void>
  readonly connectorPaths: MyKingEmployeeConnectorPaths
  readonly enableConnector: () => Promise<void>
  readonly emit: (status: MyKingEmployeeEnrollmentStatus) => void
  readonly employeeHome: string
  readonly employeeUser: string
  readonly helperScriptPath: string
  readonly managedGatewayUrl: null | string
  readonly platform: NodeJS.Platform
  readonly postJson: MyKingEmployeePostJson
  readonly probeRemoteGateway: (url: string) => Promise<void>
  readonly revokeEnrollment: (binding: MyKingEmployeeBinding) => Promise<void>
  readonly runElevated: (
    helperScriptPath: string,
    action: 'prepare' | 'unbind',
    planPath: string,
    planSha256: string
  ) => Promise<void>
  readonly storeGatewayCredential: (input: {
    readonly deviceId: string
    readonly employeeId: string
    readonly token: string
    readonly url: string
  }) => Promise<void>
  readonly userData: string
}

function removeStaging(staging: MyKingRelayKeyStaging | null): void {
  if (staging) {
    fs.rmSync(staging.directory, { recursive: true, force: true })
  }
}

async function connectMyKingEmployeeGateway(operation: () => Promise<void>): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (error instanceof MyKingEmployeeEnrollmentError) {
      throw error
    }

    throw new MyKingEmployeeEnrollmentError('gateway-unreachable', 'The company gateway could not be reached.')
  }
}

export function createMyKingEmployeeEnrollment(options: MyKingEmployeeEnrollmentOptions) {
  let currentStage: MyKingEmployeeEnrollmentStage = 'idle'
  let currentError: null | string = null
  let inFlight: Promise<MyKingEmployeeEnrollmentStatus> | null = null
  let pending: PendingCompletion | null = null

  const status = (): MyKingEmployeeEnrollmentStatus => ({
    binding: readMyKingEmployeeBinding(options.connectorPaths.bindingPath),
    configured: Boolean(options.managedGatewayUrl || options.baseUrl),
    connectorReady: fs.existsSync(options.connectorPaths.readyPath),
    error: currentError,
    managedGateway: Boolean(options.managedGatewayUrl),
    stage: currentStage
  })

  const publish = (stage: MyKingEmployeeEnrollmentStage, error: null | string = null) => {
    currentStage = stage
    currentError = error
    const next = status()
    options.emit(next)

    return next
  }

  const preparePending = async (): Promise<PendingCompletion> => {
    if (!pending || !options.baseUrl) {
      throw new MyKingEmployeeEnrollmentError('invalid-completion', 'No employee enrollment is ready to complete.')
    }

    if (pending.hostPublicKeys) {
      return pending
    }

    publish('configuring-secure-connection')
    const hostPublicKeys = await prepareMyKingEmployeeConnector({
      bindingPath: options.connectorPaths.bindingPath,
      connectorPaths: options.connectorPaths,
      employeeHome: options.employeeHome,
      employeeUser: options.employeeUser,
      helperScriptPath: options.helperScriptPath,
      platform: options.platform,
      privateKeyPath: pending.staging.privateKeyPath,
      redeem: pending.redeem,
      runElevated: options.runElevated,
      stagingDirectory: pending.staging.directory
    })

    pending = { ...pending, hostPublicKeys }

    return pending
  }

  const finishPending = async (): Promise<MyKingEmployeeEnrollmentStatus> => {
    const prepared = await preparePending()

    publish('enabling-device-access')
    const deviceId = loadOrCreateMyKingEmployeeDeviceId(options.userData)

    const ready = await completeMyKingEmployeeEnrollment(
      {
        baseUrl: options.baseUrl,
        enrollmentId: prepared.redeem.enrollmentId,
        completionToken: prepared.redeem.completionToken,
        challengeSignature: signMyKingEmployeeEnrollmentChallenge({
          challenge: prepared.redeem.challenge,
          platform: options.platform,
          privateKeyPath: prepared.staging.privateKeyPath
        }),
        deviceId,
        sshHostPublicKeys: prepared.hostPublicKeys
      },
      options.postJson
    )

    if (
      ready.employeeId !== prepared.redeem.employeeId ||
      ready.remoteGatewayUrl !== prepared.redeem.remoteGateway.url
    ) {
      throw new MyKingEmployeeEnrollmentError(
        'employee-mismatch',
        'Employee identity or gateway changed during enrollment.'
      )
    }

    const completed = pending

    const binding: MyKingEmployeeBinding = {
      version: 1,
      employeeId: ready.employeeId,
      employeeName: completed.redeem.employeeName,
      enrollmentId: completed.redeem.enrollmentId,
      deviceId,
      remoteGatewayUrl: ready.remoteGatewayUrl,
      enrolledAt: new Date().toISOString(),
      lastCheckAt: null
    }

    await options.storeGatewayCredential({
      deviceId,
      employeeId: ready.employeeId,
      token: ready.gatewayAuth.token,
      url: ready.remoteGatewayUrl
    })
    writeMyKingEmployeeBinding(options.connectorPaths.bindingPath, binding)
    pending = null
    removeStaging(completed.staging)
    publish('connecting-remote-gateway')
    await connectMyKingEmployeeGateway(() => options.applyRemoteGateway(binding.remoteGatewayUrl))
    await connectMyKingEmployeeGateway(() => options.probeRemoteGateway(binding.remoteGatewayUrl))
    publish('verifying-isolation')
    await options.enableConnector()
    writeMyKingEmployeeBinding(options.connectorPaths.bindingPath, {
      ...binding,
      lastCheckAt: new Date().toISOString()
    })

    return publish('connected')
  }

  const enrollOnce = async (rawCode: string): Promise<MyKingEmployeeEnrollmentStatus> => {
    const existing = readMyKingEmployeeBinding(options.connectorPaths.bindingPath)

    if (pending) {
      return finishPending()
    }

    let enrollmentCode: null | string = parseMyKingEmployeeEnrollmentCode(rawCode)

    if (!enrollmentCode || !options.baseUrl || options.managedGatewayUrl) {
      throw new MyKingEmployeeEnrollmentError('invalid-invitation', 'The employee invitation is invalid.')
    }

    publish('validating-invitation')
    const staging = generateMyKingRelayKeyStaging(options.userData)
    writeMyKingRelayPublicKey(staging)

    try {
      const redeem = await redeemMyKingEmployeeInvitation(
        {
          baseUrl: options.baseUrl,
          code: enrollmentCode,
          device: {
            deviceId: loadOrCreateMyKingEmployeeDeviceId(options.userData),
            deviceName: os.hostname(),
            platform: options.platform === 'win32' ? 'windows' : 'darwin',
            arch: options.arch,
            appVersion: options.appVersion,
            sshUser: options.employeeUser
          },
          relayPublicKey: staging.publicKey
        },
        options.postJson
      )

      enrollmentCode = null
      publish('confirming-identity')

      if (existing && existing.employeeId !== redeem.employeeId) {
        throw new MyKingEmployeeEnrollmentError(
          'employee-mismatch',
          'This device is already bound to another employee.'
        )
      }

      pending = { redeem, staging, hostPublicKeys: null }

      return finishPending()
    } catch (error) {
      if (!pending) {
        removeStaging(staging)
      }

      throw error
    } finally {
      enrollmentCode = null
    }
  }

  return {
    getStatus: status,
    enroll(rawCode: string) {
      if (!inFlight) {
        inFlight = enrollOnce(rawCode)
          .catch(error => {
            publish('error', error instanceof MyKingEmployeeEnrollmentError ? error.code : 'connector-failed')
            throw error
          })
          .finally(() => {
            inFlight = null
          })
      }

      return inFlight
    },
    async check() {
      if (inFlight) {
        return inFlight
      }

      try {
        if (pending) {
          return await finishPending()
        }

        const binding = readMyKingEmployeeBinding(options.connectorPaths.bindingPath)

        if (!binding) {
          return publish('error', 'not-bound')
        }

        publish('connecting-remote-gateway')
        await connectMyKingEmployeeGateway(() => options.probeRemoteGateway(binding.remoteGatewayUrl))
        publish('verifying-isolation')
        await options.enableConnector()
        writeMyKingEmployeeBinding(options.connectorPaths.bindingPath, {
          ...binding,
          lastCheckAt: new Date().toISOString()
        })

        return publish('connected')
      } catch (error) {
        publish('error', error instanceof MyKingEmployeeEnrollmentError ? error.code : 'connector-failed')
        throw error
      }
    },
    unbind() {
      if (!inFlight) {
        inFlight = (async () => {
          const binding = readMyKingEmployeeBinding(options.connectorPaths.bindingPath)
          const planPath = path.join(options.userData, `employee-connector-unbind-${crypto.randomUUID()}.json`)
          const planJson = '{}'
          const planSha256 = crypto.createHash('sha256').update(planJson).digest('hex')

          fs.writeFileSync(planPath, planJson, { encoding: 'utf8', flag: 'wx', mode: 0o600 })

          try {
            if (binding) {
              await options.revokeEnrollment(binding)
            }
            await options.runElevated(options.helperScriptPath, 'unbind', planPath, planSha256)
            await options.clearRemoteGateway(binding?.remoteGatewayUrl ?? null)
            removeStaging(pending?.staging ?? null)
            pending = null
            fs.rmSync(options.connectorPaths.bindingPath, { force: true })
            removeMyKingEmployeeDeviceId(options.userData)

            return publish('idle')
          } finally {
            fs.rmSync(planPath, { force: true })
          }
        })().finally(() => {
          inFlight = null
        })
      }

      return inFlight
    }
  }
}
