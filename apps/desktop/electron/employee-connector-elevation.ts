import { execFile } from 'node:child_process'

type MyKingElevationInput = {
  readonly action: 'prepare' | 'unbind'
  readonly helperScriptPath: string
  readonly planPath: string
}

function powerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function buildMyKingMacElevationArgs(input: MyKingElevationInput): readonly string[] {
  return [
    '-e',
    'on run argv',
    '-e',
    'do shell script "/bin/sh " & quoted form of item 1 of argv & " " & quoted form of item 2 of argv & " " & quoted form of item 3 of argv with administrator privileges',
    '-e',
    'end run',
    input.helperScriptPath,
    input.action,
    input.planPath
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
    input.planPath
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

export function runMyKingEmployeeConnectorElevated(
  input: MyKingElevationInput & { readonly platform: NodeJS.Platform; readonly systemRoot?: string }
): Promise<void> {
  if (input.platform === 'darwin') {
    return execFilePromise('/usr/bin/osascript', buildMyKingMacElevationArgs(input))
  }

  if (input.platform === 'win32') {
    const powershellPath = `${input.systemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`

    return execFilePromise(powershellPath, buildMyKingWindowsElevationArgs({ ...input, powershellPath }))
  }

  return Promise.reject(new Error('My King Employee Connector supports only Windows and macOS.'))
}
