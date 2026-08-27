import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

type MyKingElevationInput = {
  readonly action: 'prepare' | 'unbind'
  readonly helperScriptPath: string
  readonly planPath: string
  readonly planSha256: string
}

function powerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function buildMyKingMacElevationArgs(input: MyKingElevationInput): readonly string[] {
  return [
    '-e',
    'on run argv',
    '-e',
    'do shell script "/bin/sh " & quoted form of item 1 of argv & " " & quoted form of item 2 of argv & " " & quoted form of item 3 of argv & " " & quoted form of item 4 of argv with administrator privileges',
    '-e',
    'end run',
    input.helperScriptPath,
    input.action,
    input.planPath,
    input.planSha256
  ]
}

export function buildMyKingWindowsElevationArgs(
  input: MyKingElevationInput & { readonly powershellPath: string }
): readonly string[] {
  const argumentsList = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    input.helperScriptPath,
    '-Action',
    input.action,
    '-PlanPath',
    input.planPath,
    '-PlanSha256',
    input.planSha256
  ]
    .map(powerShellLiteral)
    .join(',')

  const script = [
    `$process = Start-Process -FilePath ${powerShellLiteral(input.powershellPath)} -ArgumentList @(${argumentsList}) -Verb RunAs -Wait -PassThru`,
    'exit $process.ExitCode'
  ].join('\n')

  return [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64')
  ]
}

function execFilePromise(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], { windowsHide: true }, error => {
      if (error) {
        reject(error)

        return
      }

      resolve()
    })
  })
}

export function assertMyKingEmployeeConnectorHelperTrusted(input: {
  readonly helperScriptPath: string
  readonly isPackaged: boolean
  readonly platform: NodeJS.Platform
  readonly resourcesPath: string
}): void {
  if (!input.isPackaged) {
    throw new Error('The privileged Employee Connector is available only from a packaged My King installation.')
  }

  const helperPath = path.resolve(input.helperScriptPath)
  const resourcesPath = path.resolve(input.resourcesPath)
  const helperStat = fs.lstatSync(helperPath)

  if (
    !helperStat.isFile() ||
    helperStat.isSymbolicLink() ||
    path.relative(resourcesPath, helperPath).startsWith('..')
  ) {
    throw new Error('The Employee Connector helper is outside the packaged resources directory.')
  }

  if (input.platform === 'darwin' && (helperStat.uid !== 0 || (helperStat.mode & 0o022) !== 0)) {
    throw new Error('The Employee Connector helper must be installed as a root-owned, non-writable file.')
  }

  if (input.platform === 'win32' && !/^[A-Za-z]:\\Program Files(?: \(x86\))?\\/i.test(resourcesPath)) {
    throw new Error('The Employee Connector helper must be installed under Program Files.')
  }
}

export function runMyKingEmployeeConnectorElevated(
  input: MyKingElevationInput & { readonly platform: NodeJS.Platform }
): Promise<void> {
  if (input.platform === 'darwin') {
    return execFilePromise('/usr/bin/osascript', buildMyKingMacElevationArgs(input))
  }

  if (input.platform === 'win32') {
    const powershellPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

    return execFilePromise(powershellPath, buildMyKingWindowsElevationArgs({ ...input, powershellPath }))
  }

  return Promise.reject(new Error('My King Employee Connector supports only Windows and macOS.'))
}
