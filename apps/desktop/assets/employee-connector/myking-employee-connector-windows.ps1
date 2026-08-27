param(
  [Parameter(Mandatory = $true)][ValidateSet('prepare', 'unbind')][string]$Action,
  [Parameter(Mandatory = $true)][string]$PlanPath,
  [string]$PlanSha256 = ''
)

$ErrorActionPreference = 'Stop'
$TaskName = 'MyKingEmployeeConnector'
$ProgramData = [Environment]::GetFolderPath('CommonApplicationData')
$BaseDir = Join-Path $ProgramData 'MyKing\EmployeeConnector'
$StatePath = Join-Path $BaseDir 'installation-state.json'

function Remove-InstalledKey {
  $KeyPath = Join-Path $BaseDir 'employee-authorized-key.pub'
  if (-not (Test-Path -LiteralPath $StatePath) -or -not (Test-Path -LiteralPath $KeyPath)) { return }

  $InstalledKey = (Get-Content -LiteralPath $KeyPath -Raw).Trim()
  $State = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
  foreach ($TargetState in @($State.keyTargets)) {
    if ($TargetState.added -and (Test-Path -LiteralPath $TargetState.path -PathType Leaf)) {
      if ((Get-Item -LiteralPath $TargetState.path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to update a reparse-point authorized_keys file.' }
      @(Get-Content -LiteralPath $TargetState.path | Where-Object { $_ -ne $InstalledKey }) | Set-Content -LiteralPath $TargetState.path -Encoding ascii
      if (-not $TargetState.existed -and (Get-Item -LiteralPath $TargetState.path).Length -eq 0) {
        Remove-Item -LiteralPath $TargetState.path -Force
      }
    }
  }
}

if ($Action -eq 'unbind') {
  $Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($Task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { throw 'Employee Connector scheduled task still exists.' }
  }
  Remove-InstalledKey
  if (Test-Path -LiteralPath $StatePath) {
    $State = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ($State.sshdExisted) {
      $StartupType = switch ($State.sshdStartupType) {
        'Auto' { 'Automatic' }
        'Disabled' { 'Disabled' }
        default { 'Manual' }
      }
      Set-Service -Name sshd -StartupType $StartupType
      if ($State.sshdWasRunning) { Start-Service sshd } else { Stop-Service sshd -ErrorAction SilentlyContinue }
    }
    if ($State.serverCapabilityAdded) { Remove-WindowsCapability -Online -Name $State.serverCapabilityName | Out-Null }
    if ($State.clientCapabilityAdded) { Remove-WindowsCapability -Online -Name $State.clientCapabilityName | Out-Null }
  }
  Remove-Item -LiteralPath $BaseDir -Recurse -Force
  exit 0
}

New-Item -ItemType Directory -Path $BaseDir -Force | Out-Null
if ($PlanSha256 -notmatch '^[0-9a-f]{64}$') { exit 64 }
$ProtectedPlan = Join-Path $BaseDir ("connector-plan-{0}.json" -f [Guid]::NewGuid().ToString('N'))
Copy-Item -LiteralPath $PlanPath -Destination $ProtectedPlan
if ((Get-FileHash -LiteralPath $ProtectedPlan -Algorithm SHA256).Hash.ToLowerInvariant() -ne $PlanSha256) {
  Remove-Item -LiteralPath $ProtectedPlan -Force
  exit 67
}
$Plan = Get-Content -LiteralPath $ProtectedPlan -Raw | ConvertFrom-Json
Remove-Item -LiteralPath $ProtectedPlan -Force

$InteractiveAccount = (Get-CimInstance Win32_ComputerSystem).UserName
if (-not $InteractiveAccount) { exit 65 }
$InteractiveUser = ($InteractiveAccount -split '\\')[-1]
$InteractiveSid = (New-Object Security.Principal.NTAccount($InteractiveAccount)).Translate([Security.Principal.SecurityIdentifier]).Value
$ProfilePath = (Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$InteractiveSid").ProfileImagePath
$ProfilePath = [Environment]::ExpandEnvironmentVariables($ProfilePath)

if ($Plan.baseDir -ne $BaseDir -or $Plan.employeeUser -ne $InteractiveUser -or $Plan.employeeHome -ne $ProfilePath -or -not (Test-Path -LiteralPath $Plan.employeeHome -PathType Container)) { exit 65 }
if ($Plan.relay.host -in @('localhost', '0.0.0.0', '::', '::1') -or $Plan.relay.host -match '^127\.') { exit 65 }
if ($Plan.relay.host -notmatch '^[A-Za-z0-9.-]+$' -or $Plan.relay.user -notmatch '^[A-Za-z0-9._-]+$') { exit 65 }
if ($Plan.relay.port -notin 1..65535 -or $Plan.relay.remotePort -notin 1..65535) { exit 65 }

$SourceKey = Get-Item -LiteralPath $Plan.relayPrivateKeySource -Force
if (-not $SourceKey.PSIsContainer -and -not ($SourceKey.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  $SourceHash = (Get-FileHash -LiteralPath $SourceKey.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
} else { exit 67 }
if ($SourceHash -ne $Plan.relayPrivateKeySha256) { exit 67 }

$Client = Get-WindowsCapability -Online | Where-Object Name -Like 'OpenSSH.Client*'
$ClientAdded = $Client.State -ne 'Installed'
$Server = Get-WindowsCapability -Online | Where-Object Name -Like 'OpenSSH.Server*'
$ServerAdded = $Server.State -ne 'Installed'
$OriginalSshd = Get-Service -Name sshd -ErrorAction SilentlyContinue
$SshdExisted = $null -ne $OriginalSshd
$SshdWasRunning = $SshdExisted -and $OriginalSshd.Status -eq 'Running'
$SshdStartupType = if ($SshdExisted) { (Get-CimInstance Win32_Service -Filter "Name='sshd'").StartMode } else { 'Manual' }

if ($ClientAdded) { Add-WindowsCapability -Online -Name $Client.Name | Out-Null }

$KeysDir = Join-Path $BaseDir 'keys'
$ControlDir = Join-Path $BaseDir 'control'
$LogsDir = Join-Path $BaseDir 'logs'
$EnabledPath = Join-Path $ControlDir 'enabled'
$ReadyPath = Join-Path $ControlDir 'ready'
New-Item -ItemType Directory -Path $KeysDir, $ControlDir, $LogsDir -Force | Out-Null
Copy-Item -LiteralPath $Plan.relayPrivateKeySource -Destination (Join-Path $KeysDir 'relay_client') -Force
if ((Get-FileHash -LiteralPath (Join-Path $KeysDir 'relay_client') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Plan.relayPrivateKeySha256) { exit 67 }
Set-Content -LiteralPath (Join-Path $KeysDir 'relay_client.pub') -Value $Plan.relayPublicKey -Encoding ascii

$SshKeyScan = Join-Path $env:WINDIR 'System32\OpenSSH\ssh-keyscan.exe'
$SshKeygen = Join-Path $env:WINDIR 'System32\OpenSSH\ssh-keygen.exe'
$KnownHosts = Join-Path $KeysDir 'known_hosts'
& $SshKeyScan -T 10 -p $Plan.relay.port $Plan.relay.host 2>$null | Set-Content -LiteralPath $KnownHosts -Encoding ascii
$Fingerprints = @(& $SshKeygen -E sha256 -lf $KnownHosts | ForEach-Object { ($_ -split '\s+')[1] })
if ($Plan.relay.hostKeySha256 -notin $Fingerprints) {
  if ($ClientAdded) { Remove-WindowsCapability -Online -Name $Client.Name | Out-Null }
  Remove-Item -LiteralPath $BaseDir -Recurse -Force
  exit 66
}

if ($ServerAdded) { Add-WindowsCapability -Online -Name $Server.Name | Out-Null }
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
& (Join-Path $env:WINDIR 'System32\OpenSSH\ssh-keygen.exe') -A

$SshDir = Join-Path $Plan.employeeHome '.ssh'
$UserAuthorizedKeys = Join-Path $SshDir 'authorized_keys'
New-Item -ItemType Directory -Path $SshDir -Force | Out-Null
$SshDirItem = Get-Item -LiteralPath $SshDir -Force
if ($SshDirItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to use a reparse-point SSH directory.' }
$UserKeysExisted = Test-Path -LiteralPath $UserAuthorizedKeys
if (-not (Test-Path -LiteralPath $UserAuthorizedKeys)) { New-Item -ItemType File -Path $UserAuthorizedKeys | Out-Null }
$UserKeysItem = Get-Item -LiteralPath $UserAuthorizedKeys -Force
if ($UserKeysItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to use a reparse-point authorized_keys file.' }
$ExistingKeys = @(Get-Content -LiteralPath $UserAuthorizedKeys -ErrorAction SilentlyContinue)
$UserKeyAdded = $Plan.authorizedPublicKey -notin $ExistingKeys
if ($UserKeyAdded) { Add-Content -LiteralPath $UserAuthorizedKeys -Value $Plan.authorizedPublicKey -Encoding ascii }

$AdminGroup = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
$EmployeeIsAdministrator = (Get-LocalGroupMember -SID $AdminGroup -ErrorAction SilentlyContinue | ForEach-Object SID) -contains $InteractiveSid
$AdminKeys = Join-Path $ProgramData 'ssh\administrators_authorized_keys'
$AdminKeysExisted = Test-Path -LiteralPath $AdminKeys
$AdminKeyAdded = $false
if ($EmployeeIsAdministrator) {
  if (-not (Test-Path -LiteralPath $AdminKeys)) { New-Item -ItemType File -Path $AdminKeys -Force | Out-Null }
  if ((Get-Item -LiteralPath $AdminKeys -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to use a reparse-point administrator authorized_keys file.' }
  $AdminExisting = @(Get-Content -LiteralPath $AdminKeys -ErrorAction SilentlyContinue)
  $AdminKeyAdded = $Plan.authorizedPublicKey -notin $AdminExisting
  if ($AdminKeyAdded) { Add-Content -LiteralPath $AdminKeys -Value $Plan.authorizedPublicKey -Encoding ascii }
  & icacls.exe $AdminKeys /inheritance:r /grant 'SYSTEM:F' /grant 'Administrators:F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not protect administrator authorized_keys.' }
}

Set-Content -LiteralPath (Join-Path $BaseDir 'employee-authorized-key.pub') -Value $Plan.authorizedPublicKey -Encoding ascii

@{
  clientCapabilityAdded = $ClientAdded
  clientCapabilityName = $Client.Name
  serverCapabilityAdded = $ServerAdded
  serverCapabilityName = $Server.Name
  sshdExisted = $SshdExisted
  sshdWasRunning = $SshdWasRunning
  sshdStartupType = $SshdStartupType
  keyTargets = @(
    @{ path = $UserAuthorizedKeys; existed = $UserKeysExisted; added = $UserKeyAdded },
    @{ path = $AdminKeys; existed = $AdminKeysExisted; added = $AdminKeyAdded }
  )
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $StatePath -Encoding utf8

$RunnerPath = Join-Path $BaseDir 'run-connector.ps1'
$RelayConfigPath = Join-Path $BaseDir 'relay-config.json'
@{
  host = [string]$Plan.relay.host
  port = [int]$Plan.relay.port
  user = [string]$Plan.relay.user
  remotePort = [int]$Plan.relay.remotePort
} | ConvertTo-Json | Set-Content -LiteralPath $RelayConfigPath -Encoding utf8
$Runner = @"
`$ErrorActionPreference = 'Continue'
`$Relay = Get-Content -LiteralPath '$($RelayConfigPath.Replace("'", "''"))' -Raw | ConvertFrom-Json
`$EnabledPath = '$($ControlDir.Replace("'", "''"))\enabled'
`$ReadyPath = '$($ControlDir.Replace("'", "''"))\ready'
`$LogPath = '$($LogsDir.Replace("'", "''"))\connector.log'
`$SshPath = '$env:WINDIR\System32\OpenSSH\ssh.exe'
`$SshArgs = @('-NT', '-E', `$LogPath, '-i', '$($KeysDir.Replace("'", "''"))\relay_client', '-p', [string]`$Relay.port, '-R', "0.0.0.0:`$(`$Relay.remotePort):127.0.0.1:22", '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'IdentitiesOnly=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=$($KeysDir.Replace("'", "''"))\known_hosts', "`$(`$Relay.user)@`$(`$Relay.host)")
Remove-Item -LiteralPath `$ReadyPath -Force -ErrorAction SilentlyContinue
while ((Get-Content -LiteralPath `$EnabledPath -Raw -ErrorAction SilentlyContinue).Trim() -ne 'enabled') { Start-Sleep -Seconds 2 }
while ((Get-Content -LiteralPath `$EnabledPath -Raw -ErrorAction SilentlyContinue).Trim() -eq 'enabled') {
  if ((Test-Path -LiteralPath `$LogPath) -and (Get-Item -LiteralPath `$LogPath).Length -gt 5MB) {
    Move-Item -LiteralPath `$LogPath -Destination "`$LogPath.1" -Force
  }
  `$SshProcess = Start-Process -FilePath `$SshPath -ArgumentList `$SshArgs -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 2
  if (-not `$SshProcess.HasExited) { New-Item -ItemType File -Path `$ReadyPath -Force | Out-Null }
  `$SshProcess.WaitForExit()
  Remove-Item -LiteralPath `$ReadyPath -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 5
}
"@
Set-Content -LiteralPath $RunnerPath -Value $Runner -Encoding utf8

& icacls.exe $BaseDir /inheritance:r /grant 'SYSTEM:(OI)(CI)F' /grant 'Administrators:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect Employee Connector files.' }
& icacls.exe $BaseDir /grant "$($Plan.employeeUser):(RX)" | Out-Null
& icacls.exe $ControlDir /inheritance:r /grant 'SYSTEM:(OI)(CI)F' /grant 'Administrators:(OI)(CI)F' /grant "$($Plan.employeeUser):(RX)" | Out-Null
& icacls.exe $LogsDir /inheritance:r /grant 'SYSTEM:(OI)(CI)F' /grant 'Administrators:(OI)(CI)F' /grant "$($Plan.employeeUser):(OI)(CI)R" | Out-Null
Set-Content -LiteralPath $EnabledPath -Value '' -Encoding ascii
& icacls.exe $EnabledPath /inheritance:r /grant 'SYSTEM:F' /grant 'Administrators:F' /grant "$($Plan.employeeUser):M" | Out-Null
Remove-Item -LiteralPath $ReadyPath -Force -ErrorAction SilentlyContinue

$TaskAction = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$RunnerPath`""
$TaskTrigger = New-ScheduledTaskTrigger -AtStartup
$TaskSettings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Days 3650)
$TaskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $TaskAction -Trigger $TaskTrigger -Settings $TaskSettings -Principal $TaskPrincipal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

$HostPublicKeysPath = Join-Path $ControlDir 'ssh-host-public-keys.txt'
Get-ChildItem -Path (Join-Path $ProgramData 'ssh\ssh_host_*_key.pub') -File | Get-Content | Set-Content -LiteralPath $HostPublicKeysPath -Encoding ascii
& icacls.exe $HostPublicKeysPath /inheritance:r /grant 'SYSTEM:F' /grant 'Administrators:F' /grant "$($Plan.employeeUser):R" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not expose SSH host public keys safely.' }
