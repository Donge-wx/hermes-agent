import fs from 'node:fs'
import path from 'node:path'

import type { MyKingEmployeeBinding } from './employee-connector'
import { parseMyKingPublicHttpsUrl } from './install-stamp'

export type MyKingEmployeeGatewayRoute = {
  readonly source: 'enrollment' | 'install-stamp'
  readonly url: string
}

export type MyKingEmployeeGatewayCredential = {
  readonly deviceId: string
  readonly employeeId: string
  readonly token: { readonly encoding: 'safeStorage'; readonly value: string }
  readonly url: string
  readonly version: 1
}

export function writeMyKingEmployeeGatewayCredential(
  credentialPath: string,
  credential: MyKingEmployeeGatewayCredential
): void {
  fs.mkdirSync(path.dirname(credentialPath), { recursive: true })
  const temporaryPath = `${credentialPath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(credential, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporaryPath, credentialPath)
}

export function readMyKingEmployeeGatewayCredential(credentialPath: string): MyKingEmployeeGatewayCredential | null {
  try {
    const value = record(JSON.parse(fs.readFileSync(credentialPath, 'utf8')))
    const token = record(value?.token)
    const url = parseMyKingPublicHttpsUrl(value?.url)

    if (
      value?.version !== 1 ||
      typeof value.employeeId !== 'string' ||
      typeof value.deviceId !== 'string' ||
      !url ||
      token?.encoding !== 'safeStorage' ||
      typeof token.value !== 'string' ||
      !token.value
    ) {
      return null
    }

    return {
      version: 1,
      employeeId: value.employeeId,
      deviceId: value.deviceId,
      url,
      token: { encoding: 'safeStorage', value: token.value }
    }
  } catch {
    return null
  }
}

export function removeMyKingEmployeeGatewayCredential(credentialPath: string): void {
  fs.rmSync(credentialPath, { force: true })
}

export function resolveMyKingEmployeeGatewayRoute(input: {
  readonly binding: MyKingEmployeeBinding | null
  readonly managedEmployeeGatewayUrl: null | string
}): MyKingEmployeeGatewayRoute | null {
  if (input.managedEmployeeGatewayUrl) {
    return { source: 'install-stamp', url: input.managedEmployeeGatewayUrl }
  }

  if (input.binding) {
    return { source: 'enrollment', url: input.binding.remoteGatewayUrl }
  }

  return null
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}
