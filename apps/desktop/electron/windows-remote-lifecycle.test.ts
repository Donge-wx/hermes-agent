import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { test } from 'vitest'

import {
  buildWindowsInteractiveCommand,
  connectWindowsRemote,
  detectRemotePlatform,
  encodedPowerShell,
  helperCommand,
  listWindowsRemoteHermesProfiles,
  powerShellCommand,
  probeWindowsRemote,
  psLiteral,
  reusableWindowsLock,
  validLock
} from './windows-remote-lifecycle'

const ownershipId = '0123456789abcdef0123456789abcdef'

function sshWith(exec) {
  return { exec }
}

function decodePowerShell(command: string): string {
  const encoded = command.split(' ').pop()

  assert.ok(encoded)

  return Buffer.from(encoded, 'base64').toString('utf16le')
}

test('PowerShell transport uses UTF-16LE encoded commands and literal escaping', () => {
  assert.equal(Buffer.from(encodedPowerShell("'ok'"), 'base64').toString('utf16le'), "'ok'")
  assert.equal(psLiteral("a'b"), "'a''b'")
  assert.match(powerShellCommand('Write-Output ok'), /^powershell\.exe -NoProfile -NonInteractive .* -EncodedCommand /)
})

test('platform detection preserves POSIX and falls back to Windows PowerShell', async () => {
  assert.deepEqual(await detectRemotePlatform(sshWith(async () => 'Linux\nx86_64\n')), { os: 'Linux', arch: 'x86_64' })
  const calls: string[] = []

  const result = await detectRemotePlatform(
    sshWith(async command => {
      calls.push(command)

      if (command.startsWith('uname ')) {
        throw new Error('PowerShell does not recognize uname')
      }

      return JSON.stringify({
        os: 'Windows',
        arch: 'ARM64',
        hermesHome: 'C:\\h',
        hermesPath: 'C:\\h\\hermes.exe',
        python: 'C:\\h\\python.exe'
      })
    })
  )

  assert.equal(result.os, 'Windows')
  assert.match(calls[1], /EncodedCommand/)
})

test('managed Windows probe only searches the isolated My King home', async () => {
  const calls: string[] = []
  const managedHome = '%LOCALAPPDATA%\\myking'

  await probeWindowsRemote(
    sshWith(async command => {
      calls.push(decodePowerShell(command))

      return JSON.stringify({
        os: 'Windows',
        arch: 'AMD64',
        hermesHome: 'C:\\Users\\employee\\AppData\\Local\\myking',
        hermesPath: 'C:\\Users\\employee\\AppData\\Local\\myking\\hermes-agent\\venv\\Scripts\\hermes.exe',
        python: 'C:\\Users\\employee\\AppData\\Local\\myking\\hermes-agent\\venv\\Scripts\\python.exe'
      })
    }),
    '',
    managedHome
  )

  assert.equal(calls.length, 1)
  assert.match(calls[0], /ExpandEnvironmentVariables/)
  assert.match(calls[0], /myking/)
  assert.doesNotMatch(calls[0], /\$env:HERMES_HOME/)
  assert.doesNotMatch(calls[0], /Get-Command hermes\.exe/)
  assert.doesNotMatch(calls[0], /Join-Path \$HOME "hermes-agent/)
  assert.doesNotMatch(calls[0], /LOCALAPPDATA "hermes"/)
})

test('ordinary Windows probe preserves the upstream Hermes discovery ladder', async () => {
  let script = ''

  await probeWindowsRemote(
    sshWith(async command => {
      script = decodePowerShell(command)

      return JSON.stringify({
        os: 'Windows',
        arch: 'AMD64',
        hermesHome: 'C:\\Users\\employee\\AppData\\Local\\hermes',
        hermesPath: 'C:\\Tools\\hermes.exe',
        python: 'C:\\Tools\\python.exe'
      })
    })
  )

  assert.match(script, /\$env:HERMES_HOME/)
  assert.match(script, /Get-Command hermes\.exe/)
  assert.match(script, /Join-Path \$HOME "hermes-agent/)
  assert.match(script, /LOCALAPPDATA "hermes"/)
})

test('managed Windows profile inventory only enumerates the isolated My King root', async () => {
  let script = ''

  const profiles = await listWindowsRemoteHermesProfiles(
    sshWith(async command => {
      script = decodePowerShell(command)

      return JSON.stringify({ profiles: ['Writer', '.hidden', 'Writer.rollback-old', 'not a profile'] })
    }),
    '%LOCALAPPDATA%\\myking'
  )

  assert.deepEqual(profiles, ['default', 'Writer'])
  assert.match(script, /ExpandEnvironmentVariables/)
  assert.match(script, /Get-ChildItem -LiteralPath \$profiles -Directory/)
  assert.doesNotMatch(script, /\$env:HERMES_HOME/)
  assert.doesNotMatch(script, /Get-Command hermes\.exe/)
  assert.doesNotMatch(script, /LOCALAPPDATA "hermes"/)
  assert.doesNotMatch(script, /~\/\.hermes|ls -1|if \[ -d/)
})

test('ordinary Windows profile inventory preserves the upstream Hermes home resolution', async () => {
  let script = ''

  await listWindowsRemoteHermesProfiles(
    sshWith(async command => {
      script = decodePowerShell(command)

      return JSON.stringify({ profiles: [] })
    })
  )

  assert.match(script, /\$env:HERMES_HOME/)
  assert.match(script, /LOCALAPPDATA "hermes"/)
  assert.doesNotMatch(script, /myking/)
})

test('Windows profile inventory accepts a literal administrator-managed root', async () => {
  let script = ''

  const profiles = await listWindowsRemoteHermesProfiles(
    sshWith(async command => {
      script = decodePowerShell(command)

      return JSON.stringify({ profiles: ['employee'] })
    }),
    'D:\\My King\\managed-home'
  )

  assert.deepEqual(profiles, ['default', 'employee'])
  assert.match(script, /\$managedHome='D:\\My King\\managed-home'/)
  assert.match(script, /\$hermesHome=\$managedHome/)
  assert.doesNotMatch(script, /ExpandEnvironmentVariables|\$env:HERMES_HOME/)
})

test('managed Windows connect pins helper, profile, and lock operations to the My King root', async () => {
  const managedHome = 'D:\\My King\\managed-home'
  const hermesPath = `${managedHome}\\hermes-agent\\venv\\Scripts\\hermes.exe`
  const python = `${managedHome}\\hermes-agent\\venv\\Scripts\\python.exe`
  const calls: Array<{ readonly script: string; readonly stdinData?: string }> = []

  const ssh = sshWith(async (command, options: { readonly stdinData?: string } = {}) => {
    const script = decodePowerShell(command)
    calls.push({ script, stdinData: options.stdinData })

    if (script.includes('ConvertTo-Json -Compress')) {
      return JSON.stringify({ os: 'Windows', arch: 'AMD64', hermesHome: managedHome, hermesPath, python })
    }

    if (script.includes("'inspect'")) {
      return JSON.stringify({ path: hermesPath, version: 'My King 0.17.0', supported: true })
    }

    if (script.includes("'read-lock'")) {
      return 'null'
    }

    if (script.includes("'spawn'")) {
      return JSON.stringify({ pid: 41, creationTimeNs: '1784219690452757504' })
    }

    if (script.includes("'process-state'")) {
      return JSON.stringify({ alive: true, owned: true, indeterminate: false })
    }

    if (script.includes("'read-log'")) {
      return JSON.stringify({ content: 'HERMES_BACKEND_READY port=38421' })
    }

    return JSON.stringify({ ok: true })
  })

  const result = await connectWindowsRemote({
    ssh,
    ownershipId,
    profile: 'employee',
    remoteHermesHome: managedHome,
    pickLocalPort: async () => 39876,
    forward: async () => {},
    cancelForward: async () => {},
    waitForHermes: async () => {},
    probeReuseProof: async () => 'authenticated-ok',
    readyTimeoutMs: 100
  })

  assert.equal(result.hermesPath, hermesPath)
  const probe = calls[0]?.script || ''
  assert.match(probe, /managed-home/)
  assert.doesNotMatch(probe, /Get-Command hermes\.exe/)

  const helperCalls = calls.filter(call => call.script.includes('hermes_cli.windows_ssh_runtime'))
  assert.ok(helperCalls.length > 0)

  for (const call of helperCalls) {
    assert.match(call.script, /\$env:HERMES_HOME='D:\\My King\\managed-home'/)
  }

  const spawn = calls.find(call => call.script.includes("'spawn'"))
  assert.ok(spawn?.stdinData)
  assert.equal(JSON.parse(spawn.stdinData).profile, 'employee')

  const lockWrites = calls.filter(call => call.script.includes("'write-lock'"))
  assert.equal(lockWrites.length, 2)

  for (const call of lockWrites) {
    assert.equal(JSON.parse(call.stdinData || '{}').hermesHome, managedHome)
  }
})

test('platform detection surfaces transport failures as themselves, not unsupported-platform', async () => {
  // A dead/unauthorized host is a connectivity verdict; only a host that answers
  // neither probe is an unsupported platform.
  const transportErr: any = new Error('SSH connection timed out')
  transportErr.kind = 'timeout'
  await assert.rejects(
    detectRemotePlatform(
      sshWith(async () => {
        throw transportErr
      })
    ),
    (err: any) => err.kind === 'timeout'
  )
  // Probe genuinely failing on a reachable host still classifies unsupported,
  // and carries the probe detail for diagnosis.
  await assert.rejects(
    detectRemotePlatform(
      sshWith(async command => {
        if (command.startsWith('uname ')) {
          throw new Error('not recognized')
        }

        throw new Error('Hermes is not installed on the remote Windows host.')
      })
    ),
    (err: any) => err.kind === 'unsupported-platform' && /Hermes is not installed/.test(err.message)
  )
})

test('helper command uses the fixed remote Python entry point and quotes path data', () => {
  const command = helperCommand({ python: "C:\\Program Files\\Hermes's\\python.exe" }, 'inspect', [
    'C:\\x y\\hermes.exe'
  ])

  const encoded = command.split(' ').pop()!
  const script = Buffer.from(encoded, 'base64').toString('utf16le')
  assert.match(script, /-m' 'hermes_cli\.windows_ssh_runtime' 'inspect'/)
  assert.match(script, /Hermes''s/)
  assert.match(script, /C:\\x y\\hermes\.exe/)
})

test('Windows lock validation is scoped and exact', () => {
  const lock = {
    schemaVersion: 2,
    protocolVersion: 1,
    ownershipId,
    spawnNonce: '0123456789abcdef',
    pid: 10,
    creationTimeNs: '1784219690452757504',
    port: 1234,
    tokenFingerprint: 'a'.repeat(32),
    hermesPath: 'C:\\h\\hermes.exe',
    hermesHome: 'C:\\h'
  }

  assert.equal(validLock(lock, ownershipId), true)
  assert.equal(validLock({ ...lock, ownershipId: 'b'.repeat(32) }, ownershipId), false)
  assert.equal(validLock({ ...lock, creationTimeNs: '0' }, ownershipId), false)
  // port 0 = spawn-in-progress record: valid ownership proof (cleanup can act
  // on it) but the reuse gate must reject it separately.
  assert.equal(validLock({ ...lock, port: 0 }, ownershipId), true)
  assert.equal(validLock({ ...lock, port: -1 }, ownershipId), false)
})

test('Windows SSH reuse requires the requested remote profile to match the lock', () => {
  const token = 'stored-token'

  const lock = {
    schemaVersion: 2,
    protocolVersion: 1,
    ownershipId,
    spawnNonce: '0123456789abcdef',
    pid: 10,
    creationTimeNs: '1784219690452757504',
    port: 1234,
    profile: 'default',
    tokenFingerprint: crypto.createHash('sha256').update(token).digest('hex').slice(0, 32),
    hermesPath: 'C:\\h\\hermes.exe',
    hermesHome: 'C:\\h'
  }

  const state = { alive: true, owned: true }
  const runtime = { hermesPath: lock.hermesPath, hermesHome: lock.hermesHome }

  assert.equal(reusableWindowsLock(lock, state, 'default', token, runtime), true)
  assert.equal(reusableWindowsLock(lock, state, 'desktop-work', token, runtime), false)
  assert.equal(reusableWindowsLock({ ...lock, profile: '' }, state, '', token, runtime), true)
})

test('Windows integrated terminal uses encoded PowerShell and preserves cwd as literal data', () => {
  const command = buildWindowsInteractiveCommand("C:\\Users\\O'Brien\\repo")
  const script = Buffer.from(command.split(' ').pop()!, 'base64').toString('utf16le')
  assert.match(script, /Set-Location -LiteralPath 'C:\\Users\\O''Brien\\repo'/)
  assert.match(script, /powershell\.exe -NoLogo/)
})
