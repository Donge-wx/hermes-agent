import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  assertMyKingEmployeeConnectorHelperTrusted,
  buildMyKingMacElevationArgs,
  buildMyKingWindowsElevationArgs
} from './employee-connector-elevation'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.restoreAllMocks()

  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true })
  }
})

describe('My King Employee Connector elevation commands', () => {
  it('passes macOS paths as AppleScript argv instead of interpolating them', () => {
    const args = buildMyKingMacElevationArgs({
      action: 'prepare',
      helperScriptPath: "/Applications/My King's.app/connector.sh",
      planPath: "/Users/employee/Library/Application Support/My King/plan.json",
      planSha256: 'a'.repeat(64)
    })

    expect(args.slice(-4)).toEqual([
      "/Applications/My King's.app/connector.sh",
      'prepare',
      '/Users/employee/Library/Application Support/My King/plan.json',
      'a'.repeat(64)
    ])
    expect(args.join(' ')).toContain('quoted form of item')
  })

  it('encodes the Windows UAC script without exposing paths on the command line', () => {
    const args = buildMyKingWindowsElevationArgs({
      action: 'unbind',
      helperScriptPath: "C:\\Program Files\\My King\\connector's.ps1",
      planPath: 'C:\\ProgramData\\MyKing\\unbind.json',
      planSha256: 'b'.repeat(64),
      powershellPath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    })
    const encoded = args.at(-1)

    expect(encoded).toBeDefined()
    expect(args).not.toContain('C:\\ProgramData\\MyKing\\unbind.json')
    expect(Buffer.from(encoded ?? '', 'base64').toString('utf16le')).toContain("connector''s.ps1")
    expect(Buffer.from(encoded ?? '', 'base64').toString('utf16le')).toContain("'b".concat('b'.repeat(63), "'"))
  })

  it('rejects a privileged helper outside packaged resources', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'myking-helper-'))
    temporaryDirectories.push(directory)
    const resourcesPath = path.join(directory, 'resources')
    const helperScriptPath = path.join(directory, 'connector.sh')
    fs.mkdirSync(resourcesPath)
    fs.writeFileSync(helperScriptPath, '#!/bin/sh\n')

    expect(() =>
      assertMyKingEmployeeConnectorHelperTrusted({
        helperScriptPath,
        isPackaged: true,
        platform: 'darwin',
        resourcesPath
      })
    ).toThrow('outside the packaged resources directory')
  })

  it('requires the packaged macOS helper to be root-owned and non-writable', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'myking-helper-'))
    temporaryDirectories.push(directory)
    const helperScriptPath = path.join(directory, 'connector.sh')
    fs.writeFileSync(helperScriptPath, '#!/bin/sh\n')
    vi.spyOn(fs, 'lstatSync').mockReturnValue({
      isFile: () => true,
      isSymbolicLink: () => false,
      mode: 0o100755,
      uid: 501
    } as fs.Stats)

    expect(() =>
      assertMyKingEmployeeConnectorHelperTrusted({
        helperScriptPath,
        isPackaged: true,
        platform: 'darwin',
        resourcesPath: directory
      })
    ).toThrow('root-owned')
  })
})
