import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function myKingEmployeeDeviceIdPath(userData: string): string {
  return path.join(userData, 'employee-connector-device.json')
}

export function loadOrCreateMyKingEmployeeDeviceId(userData: string): string {
  const statePath = myKingEmployeeDeviceIdPath(userData)

  try {
    const value: unknown = JSON.parse(fs.readFileSync(statePath, 'utf8'))

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const deviceId = Object.fromEntries(Object.entries(value)).deviceId

      if (typeof deviceId === 'string' && /^[0-9a-f-]{36}$/i.test(deviceId)) {
        return deviceId
      }
    }
  } catch {
    // First enrollment creates a privacy-preserving random UUID.
  }

  const deviceId = crypto.randomUUID()
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(statePath, `${JSON.stringify({ deviceId })}\n`, { encoding: 'utf8', mode: 0o600 })

  return deviceId
}

export function removeMyKingEmployeeDeviceId(userData: string): void {
  fs.rmSync(myKingEmployeeDeviceIdPath(userData), { force: true })
}
