param(
  [Parameter(Mandatory = $true)][ValidateSet('prepare', 'unbind')][string]$Action,
  [Parameter(Mandatory = $true)][string]$PlanPath
)

$ErrorActionPreference = 'Stop'
$TaskName = 'MyKingEmployeeConnector'
$BaseDir = Join-Path $env:ProgramData 'MyKing\EmployeeConnector'

function Remove-InstalledKey {
  $KeyPath = Join-Path $BaseDir 'employee-authorized-key.pub'
  $HomePath = Join-Path $BaseDir 'employee-home.txt'
  if (-not (Test-Path -LiteralPath $KeyPath) -or -not (Test-Path -LiteralPath $HomePath)) { return }

  $InstalledKey = (Get-Content -LiteralPath $KeyPath -Raw).Trim()
  $EmployeeHome = (Get-Content -LiteralPath $HomePath -Raw).Trim()
  $Targets = @(
    (Join-Path $EmployeeHome '.ssh\authorized_keys'),
    (Join-Path $env:ProgramData 'ssh\administrators_authorized_keys')
  )
  foreach ($Target in $Targets) {
    if (Test-Path -LiteralPath $Target) {
      @(Get-Content -LiteralPath $Target | Where-Object { $_ -ne $InstalledKey }) | Set-Content -LiteralPath $Target -Encoding ascii
    }
  }
}

if ($Action -eq 'unbind') {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-InstalledKey
  Remove-Item -LiteralPath $BaseDir -Recurse -Force -ErrorAction SilentlyContinue
  exit 0
}

$Plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
if ($Plan.baseDir -ne $BaseDir -or -not (Test-Path -LiteralPath $Plan.employeeHome -PathType Container)) { exit 65 }
if ($Plan.relay.host -in @('localhost', '0.0.0.0', '::', '::1') -or $Plan.relay.host -match '^127\.') { exit 65 }

$Client = Get-WindowsCapability -Online | Where-Object Name -Like 'OpenSSH.Client*'
if ($Client.State -ne 'Installed') { Add-WindowsCapability -Online -Name $Client.Name | Out-Null }
$Server = Get-WindowsCapability -Online | Where-Object Name -Like 'OpenSSH.Server*'
if ($Server.State -ne 'Installed') { Add-WindowsCapability -Online -Name $Server.Name | Out-Null }

Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
& (Join-Path $env:WINDIR 'System32\OpenSSH\ssh-keygen.exe') -A

$SshDir = Join-Path $Plan.employeeHome '.ssh'
$UserAuthorizedKeys = Join-Path $SshDir 'authorized_keys'
New-Item -ItemType Directory -Path $SshDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $UserAuthorizedKeys)) { New-Item -ItemType File -Path $UserAuthorizedKeys | Out-Null }
$ExistingKeys = @(Get-Content -LiteralPath $UserAuthorizedKeys -ErrorAction SilentlyContinue)
if ($Plan.authorizedPublicKey -notin $ExistingKeys) { Add-Content -LiteralPath $UserAuthorizedKeys -Value $Plan.authorizedPublicKey -Encoding ascii }

if ($Plan.employeeIsAdministrator) {
  $AdminKeys = Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'
  if (-not (Test-Path -LiteralPath $AdminKeys)) { New-Item -ItemType File -Path $AdminKeys -Force | Out-Null }
  $AdminExisting = @(Get-Content -LiteralPath $AdminKeys -ErrorAction SilentlyContinue)
  if ($Plan.authorizedPublicKey -notin $AdminExisting) { Add-Content -LiteralPath $AdminKeys -Value $Plan.authorizedPublicKey -Encoding ascii }
  & icacls.exe $AdminKeys /inheritance:r /grant 'SYSTEM:F' /grant 'Administrators:F' | Out-Null
}

$KeysDir = Join-Path $BaseDir 'keys'
$ControlDir = Join-Path $BaseDir 'control'
$LogsDir = Join-Path $BaseDir 'logs'
$EnabledPath = Join-Path $ControlDir 'enabled'
$ReadyPath = Join-Path $ControlDir 'ready'
New-Item -ItemType Directory -Path $KeysDir, $ControlDir, $LogsDir -Force | Out-Null
Copy-Item -LiteralPath $Plan.relayPrivateKeySource -Destination (Join-Path $KeysDir 'relay_client') -Force
Set-Content -LiteralPath (Join-Path $KeysDir 'relay_client.pub') -Value $Plan.relayPublicKey -Encoding ascii
Set-Content -LiteralPath (Join-Path $BaseDir 'employee-authorized-key.pub') -Value $Plan.authorizedPublicKey -Encoding ascii
Set-Content -LiteralPath (Join-Path $BaseDir 'employee-home.txt') -Value $Plan.employeeHome -Encoding utf8

$SshKeyScan = Join-Path $env:WINDIR 'System32\OpenSSH\ssh-keyscan.exe'
$SshKeygen = Join-Path $env:WINDIR 'System32\OpenSSH\ssh-keygen.exe'
$KnownHosts = Join-Path $KeysDir 'known_hosts'
& $SshKeyScan -T 10 -p $Plan.relay.port $Plan.relay.host 2>$null | Set-Content -LiteralPath $KnownHosts -Encoding ascii
$Fingerprints = @(& $SshKeygen -E sha256 -lf $KnownHosts | ForEach-Object { ($_ -split '\s+')[1] })
if ($Plan.relay.hostKeySha256 -notin $Fingerprints) { Remove-Item -LiteralPath $KnownHosts -Force; exit 66 }

$RunnerPath = Join-Path $BaseDir 'run-connector.ps1'
$Runner = @"
`$ErrorActionPreference = 'Continue'
`$EnabledPath = '$($ControlDir.Replace("'", "''"))\enabled'
`$ReadyPath = '$($ControlDir.Replace("'", "''"))\ready'
`$LogPath = '$($LogsDir.Replace("'", "''"))\connector.log'
`$SshPath = '$env:WINDIR\System32\OpenSSH\ssh.exe'
`$SshArgs = @('-NT', '-E', `$LogPath, '-i', '$($KeysDir.Replace("'", "''"))\relay_client', '-p', '$($Plan.relay.port)', '-R', '$($Plan.relay.remotePort):127.0.0.1:22', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'IdentitiesOnly=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=$($KeysDir.Replace("'", "''"))\known_hosts', '$($Plan.relay.user)@$($Plan.relay.host)')
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

Get-ChildItem -Path (Join-Path $env:ProgramData 'ssh\ssh_host_*_key.pub') -File | Get-Content | Set-Content -LiteralPath $Plan.outputPath -Encoding ascii
& icacls.exe $Plan.outputPath /grant "$($Plan.employeeUser):R" | Out-Null
