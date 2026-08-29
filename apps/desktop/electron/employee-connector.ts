import dns from 'node:dns/promises'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { MyKingEmployeeEnrollmentError, type MyKingEmployeeRedeemResponse } from './employee-enrollment-contract'
import type { MyKingRelayKeyStaging } from './employee-relay-key'

export { generateMyKingRelayKeyStaging } from './employee-relay-key'
export type { MyKingRelayKeyStaging } from './employee-relay-key'

export interface MyKingEmployeeConnectorPaths {
  readonly baseDir: string
  readonly bindingPath: string
  readonly controlDir: string
  readonly diagnosticsLogPath: string
  readonly enabledPath: string
  readonly readyPath: string
}

export interface MyKingEmployeeBinding {
  readonly deviceId: string
  readonly employeeId: string
  readonly employeeName: string
  readonly enrollmentId: string
  readonly enrolledAt: string
  readonly lastCheckAt: null | string
  readonly remoteGatewayUrl: string
  readonly version: 1
}

export interface MyKingConnectorPrepareInput {
  readonly bindingPath: string
  readonly employeeHome: string
  readonly employeeIsAdministrator: boolean
  readonly employeeUser: string
  readonly helperScriptPath: string
  readonly outputPath: string
  readonly platform: NodeJS.Platform
  readonly privateKeyPath: string
  readonly redeem: MyKingEmployeeRedeemResponse
  readonly runElevated: (helperScriptPath: string, action: 'prepare' | 'unbind', planPath: string) => Promise<void>
  readonly stagingDirectory: string
}

const LOCAL_HOSTS = new Set(['0.0.0.0', '::', '::1', 'localhost'])
const SSH_HOST_PUBLIC_KEY_RE = /^(?:ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)) [A-Za-z0-9+/]+={0,3}(?: [^\r\n]+)?$/
type MyKingRelayLookup = (host: string, options: { readonly all: true }) => Promise<readonly { readonly address: string }[]>

export function resolveMyKingEmployeeConnectorPaths(input: {
  readonly platform: NodeJS.Platform
  readonly programData?: string
  readonly userData: string
}): MyKingEmployeeConnectorPaths {
  const baseDir =
    input.platform === 'win32'
      ? path.win32.join(input.programData || 'C:\\ProgramData', 'MyKing', 'EmployeeConnector')
      : '/Library/Application Support/MyKing/EmployeeConnector'

  return {
    baseDir,
    bindingPath: path.join(input.userData, 'employee-connector-binding.json'),
    controlDir: path.join(baseDir, 'control'),
    diagnosticsLogPath: path.join(baseDir, 'logs', 'connector.log'),
    enabledPath: path.join(baseDir, 'control', 'enabled'),
    readyPath: path.join(baseDir, 'control', 'ready')
  }
}

export async function enableMyKingEmployeeConnector(
  paths: MyKingEmployeeConnectorPaths,
  timeoutMs = 30_000
): Promise<void> {
  fs.mkdirSync(paths.controlDir, { recursive: true })
  fs.writeFileSync(paths.enabledPath, 'enabled\n', { encoding: 'utf8', mode: 0o600 })
  const deadline = Date.now() + timeoutMs

  while (!fs.existsSync(paths.readyPath)) {
    if (Date.now() >= deadline) {
      throw new MyKingEmployeeEnrollmentError(
        'secure-connection-failed',
        'My King Employee Connector could not establish the secure connection.'
      )
    }

    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

function localAddresses(): ReadonlySet<string> {
  const addresses = new Set<string>()

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      addresses.add(entry.address.toLowerCase())
    }
  }

  return addresses
}

export async function assertSafeMyKingRelayHost(
  host: string,
  lookup: MyKingRelayLookup = dns.lookup,
  machineAddresses: ReadonlySet<string> = localAddresses()
): Promise<void> {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '')

  if (!normalized || LOCAL_HOSTS.has(normalized) || normalized.startsWith('127.')) {
    throw new Error('My King relay host must not be localhost or a loopback address.')
  }

  const resolved = net.isIP(normalized) ? [{ address: normalized }] : await lookup(normalized, { all: true })

  if (
    resolved.some(entry => {
      const address = entry.address.toLowerCase().replace(/^::ffff:/, '')

      return LOCAL_HOSTS.has(address) || address.startsWith('127.') || machineAddresses.has(address)
    })
  ) {
    throw new MyKingEmployeeEnrollmentError(
      'central-host-blocked',
      'This device is the company relay host and cannot be enrolled as an employee computer.'
    )
  }
}

export async function prepareMyKingEmployeeConnector(input: MyKingConnectorPrepareInput): Promise<readonly string[]> {
  await assertSafeMyKingRelayHost(input.redeem.relay.host)

  const planPath = path.join(input.stagingDirectory, 'connector-plan.json')

  const plan = {
    baseDir: resolveMyKingEmployeeConnectorPaths({
      platform: input.platform,
      programData: process.env.ProgramData,
      userData: path.dirname(input.bindingPath)
    }).baseDir,
    employeeHome: input.employeeHome,
    employeeIsAdministrator: input.employeeIsAdministrator,
    employeeUser: input.employeeUser,
    relayPrivateKeySource: input.privateKeyPath,
    relayPublicKey: fs.readFileSync(`${input.privateKeyPath}.pub`, 'utf8').trim(),
    authorizedPublicKey: input.redeem.employeeSsh.authorizedPublicKey,
    relay: input.redeem.relay,
    outputPath: input.outputPath
  }

  fs.writeFileSync(planPath, JSON.stringify(plan), { encoding: 'utf8', mode: 0o600 })
  await input.runElevated(input.helperScriptPath, 'prepare', planPath)

  const hostPublicKeys = fs
    .readFileSync(input.outputPath, 'utf8')
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(value => SSH_HOST_PUBLIC_KEY_RE.test(value))

  if (hostPublicKeys.length === 0) {
    throw new Error('My King Employee Connector could not read an SSH host public key.')
  }

  return hostPublicKeys
}

export function writeMyKingRelayPublicKey(staging: MyKingRelayKeyStaging): void {
  fs.writeFileSync(`${staging.privateKeyPath}.pub`, `${staging.publicKey}\n`, { encoding: 'utf8', mode: 0o600 })
}

export function writeMyKingEmployeeBinding(bindingPath: string, binding: MyKingEmployeeBinding): void {
  fs.mkdirSync(path.dirname(bindingPath), { recursive: true })
  const temporaryPath = `${bindingPath}.${process.pid}.tmp`

  fs.writeFileSync(temporaryPath, `${JSON.stringify(binding, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporaryPath, bindingPath)
}

export function readMyKingEmployeeBinding(bindingPath: string): MyKingEmployeeBinding | null {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(bindingPath, 'utf8'))

    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return null
    }

    const binding = Object.fromEntries(Object.entries(value))

    if (
      binding.version !== 1 ||
      typeof binding.employeeId !== 'string' ||
      typeof binding.employeeName !== 'string' ||
      typeof binding.deviceId !== 'string' ||
      typeof binding.enrollmentId !== 'string' ||
      typeof binding.remoteGatewayUrl !== 'string' ||
      typeof binding.enrolledAt !== 'string'
    ) {
      return null
    }

    return {
      version: 1,
      employeeId: binding.employeeId,
      employeeName: binding.employeeName,
      deviceId: binding.deviceId,
      enrollmentId: binding.enrollmentId,
      remoteGatewayUrl: binding.remoteGatewayUrl,
      enrolledAt: binding.enrolledAt,
      lastCheckAt: typeof binding.lastCheckAt === 'string' ? binding.lastCheckAt : null
    }
  } catch {
    return null
  }
}
