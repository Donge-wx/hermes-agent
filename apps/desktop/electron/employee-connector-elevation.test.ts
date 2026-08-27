import { describe, expect, it } from 'vitest'

import {
  buildMyKingMacElevationArgs,
  buildMyKingWindowsElevationArgs
} from './employee-connector-elevation'

describe('My King Employee Connector elevation commands', () => {
  it('passes macOS paths as AppleScript argv instead of interpolating them', () => {
    const args = buildMyKingMacElevationArgs({
      action: 'prepare',
      helperScriptPath: "/Applications/My King's.app/connector.sh",
      planPath: "/Users/employee/Library/Application Support/My King/plan.json"
    })

    expect(args.slice(-3)).toEqual([
      "/Applications/My King's.app/connector.sh",
      'prepare',
      '/Users/employee/Library/Application Support/My King/plan.json'
    ])
    expect(args.join(' ')).toContain('quoted form of item')
  })

  it('encodes the Windows UAC script without exposing paths on the command line', () => {
    const args = buildMyKingWindowsElevationArgs({
      action: 'unbind',
      helperScriptPath: "C:\\Program Files\\My King\\connector's.ps1",
      planPath: 'C:\\ProgramData\\MyKing\\unbind.json',
      powershellPath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    })
    const encoded = args.at(-1)

    expect(encoded).toBeDefined()
    expect(args).not.toContain('C:\\ProgramData\\MyKing\\unbind.json')
    expect(Buffer.from(encoded ?? '', 'base64').toString('utf16le')).toContain("connector''s.ps1")
  })
})
