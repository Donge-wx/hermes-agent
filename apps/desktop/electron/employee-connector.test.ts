import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  assertSafeMyKingRelayHost,
  enableMyKingEmployeeConnector,
  generateMyKingRelayKeyStaging,
  readMyKingEmployeeBinding,
  resolveMyKingEmployeeConnectorPaths,
  writeMyKingEmployeeBinding,
  writeMyKingRelayPublicKey
} from './employee-connector'

const temporaryDirectories: string[] = []

const MAC_HELPER = fs.readFileSync(
  new URL('../assets/employee-connector/myking-employee-connector-macos.sh', import.meta.url),
  'utf8'
)

const WINDOWS_HELPER = fs.readFileSync(
  new URL('../assets/employee-connector/myking-employee-connector-windows.ps1', import.meta.url),
  'utf8'
)

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('My King Employee Connector paths', () => {
  it('uses the required Windows ProgramData directory', () => {
    expect(
      resolveMyKingEmployeeConnectorPaths({
        platform: 'win32',
        programData: 'D:\\ProgramData',
        userData: 'D:\\Users\\employee\\AppData\\Roaming\\My King'
      }).baseDir
    ).toBe('D:\\ProgramData\\MyKing\\EmployeeConnector')
  })

  it('uses the required macOS Library directory', () => {
    expect(resolveMyKingEmployeeConnectorPaths({ platform: 'darwin', userData: '/Users/e/Library/My King' }).baseDir).toBe(
      '/Library/Application Support/MyKing/EmployeeConnector'
    )
  })
})

describe('My King Employee Connector readiness', () => {
  it('enables the background connector but reports ready only after the connector confirms its tunnel', async () => {
    const userData = fs.mkdtempSync(path.join('/tmp', 'myking-connector-ready-'))
    temporaryDirectories.push(userData)
    const controlDir = path.join(userData, 'control')

    const paths = {
      ...resolveMyKingEmployeeConnectorPaths({ platform: 'darwin', userData }),
      baseDir: userData,
      controlDir,
      diagnosticsLogPath: path.join(userData, 'connector.log'),
      enabledPath: path.join(controlDir, 'enabled'),
      readyPath: path.join(controlDir, 'ready')
    }

    fs.mkdirSync(controlDir, { recursive: true })
    fs.writeFileSync(paths.readyPath, 'ready\n')

    await expect(enableMyKingEmployeeConnector(paths, 0)).resolves.toBeUndefined()
    expect(fs.existsSync(paths.enabledPath)).toBe(true)
  })

  it('fails instead of claiming success when the background connector never confirms its tunnel', async () => {
    const userData = fs.mkdtempSync(path.join('/tmp', 'myking-connector-timeout-'))
    temporaryDirectories.push(userData)
    const controlDir = path.join(userData, 'control')

    const paths = {
      ...resolveMyKingEmployeeConnectorPaths({ platform: 'darwin', userData }),
      baseDir: userData,
      controlDir,
      diagnosticsLogPath: path.join(userData, 'connector.log'),
      enabledPath: path.join(controlDir, 'enabled'),
      readyPath: path.join(controlDir, 'ready')
    }

    await expect(enableMyKingEmployeeConnector(paths, 0)).rejects.toMatchObject({
      code: 'secure-connection-failed'
    })
    expect(fs.existsSync(paths.enabledPath)).toBe(true)
    expect(fs.existsSync(paths.readyPath)).toBe(false)
  })
})

describe('relay identity', () => {
  it('generates a random local Ed25519 private key and OpenSSH public key', () => {
    const userData = fs.mkdtempSync(path.join('/tmp', 'myking-relay-key-'))
    temporaryDirectories.push(userData)
    const staging = generateMyKingRelayKeyStaging(userData)
    writeMyKingRelayPublicKey(staging)

    expect(staging.publicKey).toMatch(/^ssh-ed25519 /)
    expect(fs.readFileSync(staging.privateKeyPath, 'utf8')).toContain('BEGIN OPENSSH PRIVATE KEY')
    expect(execFileSync('/usr/bin/ssh-keygen', ['-y', '-f', staging.privateKeyPath], { encoding: 'utf8' }).trim()).toBe(
      staging.publicKey
    )
    expect(fs.statSync(staging.privateKeyPath).mode & 0o077).toBe(0)
  })

  it('removes only stale My King relay-key staging before generating a replacement', () => {
    const userData = fs.mkdtempSync(path.join('/tmp', 'myking-relay-key-cleanup-'))
    temporaryDirectories.push(userData)
    const stale = generateMyKingRelayKeyStaging(userData)
    const unrelated = path.join(userData, 'employee-owned-folder')
    fs.mkdirSync(unrelated)

    const current = generateMyKingRelayKeyStaging(userData)

    expect(fs.existsSync(stale.directory)).toBe(false)
    expect(fs.existsSync(current.privateKeyPath)).toBe(true)
    expect(fs.existsSync(unrelated)).toBe(true)
  })

  it.each(['localhost', '127.0.0.1', '0.0.0.0', '::1'])(
    'rejects a local relay before installing anything: %s',
    async host => {
      await expect(assertSafeMyKingRelayHost(host)).rejects.toThrow()
    }
  )

  it('rejects a relay hostname that resolves to the employee computer', async () => {
    const lookup = async () => [{ address: '192.0.2.50', family: 4 }]

    await expect(assertSafeMyKingRelayHost('relay.company.test', lookup, new Set(['192.0.2.50']))).rejects.toMatchObject({
      code: 'central-host-blocked'
    })
  })
})

describe('employee binding isolation', () => {
  it('round-trips only non-secret binding state', () => {
    const userData = fs.mkdtempSync(path.join('/tmp', 'myking-binding-'))
    temporaryDirectories.push(userData)
    const bindingPath = path.join(userData, 'employee-binding.json')

    const binding = {
      version: 1 as const,
      employeeId: 'employee-1',
      employeeName: '测试员工',
      deviceId: 'a-random-device-id',
      enrollmentId: 'enrollment-1',
      remoteGatewayUrl: 'https://gateway.myking.test',
      enrolledAt: '2026-08-27T00:00:00.000Z',
      lastCheckAt: null
    }

    writeMyKingEmployeeBinding(bindingPath, binding)
    expect(readMyKingEmployeeBinding(bindingPath)).toEqual(binding)
    expect(fs.readFileSync(bindingPath, 'utf8')).not.toMatch(/completionToken|privateKey|password|cookie/i)
  })
})

describe('packaged connector helper contracts', () => {
  it('requests the employee relay port on the public bind address on both platforms', () => {
    expect(MAC_HELPER).toContain("-R '0.0.0.0:$remote_port:127.0.0.1:22'")
    expect(WINDOWS_HELPER).toContain("'-R', '0.0.0.0:$($Plan.relay.remotePort):127.0.0.1:22'")
  })

  it('pins the relay host key and never disables strict SSH verification on either platform', () => {
    for (const helper of [MAC_HELPER, WINDOWS_HELPER]) {
      expect(helper).toContain('StrictHostKeyChecking=yes')
      expect(helper).toContain('HostKeyAlgorithms=ssh-ed25519')
      expect(helper).not.toContain('StrictHostKeyChecking=no')
      expect(helper).toContain('hostKeySha256')
    }

    const knownHostsOption = MAC_HELPER.match(/-o '(UserKnownHostsFile="\$base_dir\/keys\/known_hosts")'/)?.[1]
    if (!knownHostsOption) {
      throw new Error('macOS connector must pass its spaced known_hosts path as one SSH option')
    }
    const effectiveSshConfig = execFileSync(
      '/usr/bin/ssh',
      ['-G', '-o', knownHostsOption.replace('$base_dir', '/tmp/My King Employee Connector'), 'relay.example.com'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    expect(effectiveSshConfig).toContain(
      'userknownhostsfile /tmp/My King Employee Connector/keys/known_hosts'
    )
    expect(MAC_HELPER).toContain('ssh-keyscan -T 10 -t ed25519 -p')
    expect(WINDOWS_HELPER).toContain('& $SshKeyScan -T 10 -t ed25519 -p')
  })

  it('backs off after a failed relay connection instead of hot-looping through the shared Funnel source', () => {
    expect(MAC_HELPER).toContain('/bin/sleep 30')
    expect(WINDOWS_HELPER).toContain('Start-Sleep -Seconds 30')
  })

  it('keeps authorized keys and background startup idempotent', () => {
    expect(MAC_HELPER).toContain('grep -Fqx -- "$authorized_public_key"')
    expect(MAC_HELPER).toContain('launchctl bootout system')
    expect(MAC_HELPER).toContain('launchctl bootstrap system')
    expect(WINDOWS_HELPER).toContain('$Plan.authorizedPublicKey -notin $ExistingKeys')
    expect(WINDOWS_HELPER).toContain('-MultipleInstances IgnoreNew')
    expect(WINDOWS_HELPER).toContain('Register-ScheduledTask')
    expect(WINDOWS_HELPER).toContain('-Force | Out-Null')
  })

  it('reports ready only while a real SSH process remains connected and restarts after failure', () => {
    expect(MAC_HELPER).toContain('kill -0 "\\$ssh_pid"')
    expect(MAC_HELPER).toContain('touch "\\$ready_path"')
    expect(MAC_HELPER).toContain('<key>KeepAlive</key>')
    expect(WINDOWS_HELPER).toContain('if (-not `$SshProcess.HasExited)')
    expect(WINDOWS_HELPER).toContain('Remove-Item -LiteralPath `$ReadyPath')
    expect(WINDOWS_HELPER).toContain('-RestartCount 999')
  })

  it('unbind removes only My King task, files, and the exact installed key', () => {
    expect(MAC_HELPER).toContain('grep -Fvx -- "$installed_key"')
    expect(MAC_HELPER).toContain('chown "$employee_user":staff "$authorized_keys"')
    expect(MAC_HELPER).toContain('rm -rf "$base_dir"')
    expect(MAC_HELPER).not.toMatch(/rm -rf "?\$employee_home/)
    expect(WINDOWS_HELPER).toContain('Unregister-ScheduledTask -TaskName $TaskName')
    expect(WINDOWS_HELPER).toContain('Where-Object { $_ -ne $InstalledKey }')
    expect(WINDOWS_HELPER).not.toMatch(/Remove-Item[^\n]+\$Plan\.employeeHome/)
  })

  it('rotates connector logs on both platforms', () => {
    expect(MAC_HELPER).toContain('/etc/newsyslog.d/${label}.conf')
    expect(WINDOWS_HELPER).toContain('Length -gt 5MB')
    expect(WINDOWS_HELPER).toContain('"`$LogPath.1"')
  })

  it('lets the employee request and diagnose the connector without allowing a forged ready state', () => {
    expect(MAC_HELPER).toContain('chmod 711 "$base_dir"')
    expect(MAC_HELPER).toContain('chmod 700 "$base_dir/keys"')
    expect(MAC_HELPER).toContain('chown "$employee_user":staff "$base_dir/control/enabled"')
    expect(MAC_HELPER).not.toContain('chown "$employee_user":staff "$base_dir/control"')
    expect(MAC_HELPER).toContain('chown "$employee_user":staff "$base_dir/logs"')
    expect(WINDOWS_HELPER).toContain('/grant "$($Plan.employeeUser):(RX)"')
    expect(WINDOWS_HELPER).toMatch(/icacls\.exe \$EnabledPath[^\n]+\/grant "\$\(\$Plan\.employeeUser\):M"/)
    expect(WINDOWS_HELPER).not.toMatch(/icacls\.exe \$ControlDir[^\n]+"\$\(\$Plan\.employeeUser\):\(OI\)\(CI\)M"/)
    expect(WINDOWS_HELPER).toMatch(/icacls\.exe \$LogsDir[^\n]+"\$\(\$Plan\.employeeUser\):\(OI\)\(CI\)R"/)
    expect(WINDOWS_HELPER).not.toContain('$KeysDir /grant "$($Plan.employeeUser)')
  })
})
