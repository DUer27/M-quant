param([string]$DeploymentRoot = 'E:\M-quant', [switch]$NoStart)
$ErrorActionPreference = 'Stop'
$deploymentFile = Join-Path $DeploymentRoot 'deployment.json'
$deployment = Get-Content -LiteralPath $deploymentFile -Raw -Encoding UTF8 | ConvertFrom-Json
$script = Join-Path $deployment.repository 'tools\platform_supervisor.py'
$pythonw = Join-Path (Split-Path -Parent $deployment.python) 'pythonw.exe'
foreach ($required in @($script, $deployment.node, $deployment.python, $pythonw)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw ('Required file is missing: ' + $required) }
}
$logs = Join-Path $DeploymentRoot 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$taskName = 'M-quant Platform Supervisor'
$arguments = '"' + $script + '" --deployment "' + $deploymentFile + '" --action run'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and -not ($existing.Actions | Where-Object { $_.Arguments -like ('*"' + $script + '"*') -and $_.Execute -eq $pythonw })) {
    throw 'An unrelated task has the same name; it was not changed.'
}
if ($existing) { Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath (Join-Path $logs ($stamp + '-supervisor-task.xml')) -Encoding Unicode }
$mode = 'scheduled_task'; $taskError = $null
try {
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $action = New-ScheduledTaskAction -Execute $pythonw -Argument $arguments -WorkingDirectory $deployment.repository
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $sid
    $principal = New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Local M-quant supervisor; preserves manual stop, bounds restarts, and makes no market-data requests.' -Force | Out-Null
} catch {
    if ($existing) { throw }
    $mode = 'startup_shortcut'; $taskError = $_.Exception.GetType().Name
    $startup = [Environment]::GetFolderPath('Startup')
    $linkPath = Join-Path $startup 'M-quant Platform Supervisor.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($linkPath)
    if ((Test-Path -LiteralPath $linkPath) -and ($link.TargetPath -ne $pythonw -or $link.Arguments -notlike ('*"' + $script + '"*'))) { throw 'An unrelated startup shortcut has the same name; it was not changed.' }
    $link.TargetPath = $pythonw; $link.Arguments = $arguments; $link.WorkingDirectory = $deployment.repository
    $link.WindowStyle = 7; $link.Description = 'Local M-quant platform supervision'; $link.Save()
}
foreach ($name in @('Start-MQuant.ps1','Stop-MQuant.ps1')) {
    $destination = Join-Path $DeploymentRoot $name
    if (Test-Path -LiteralPath $destination) { Copy-Item -LiteralPath $destination -Destination (Join-Path $logs ($stamp + '-before-' + $name)) }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $destination -Force
}
$runtime = Join-Path $deployment.repository 'outputs\live-market-data\service'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$receipt = [ordered]@{ mode=$mode; task_name=$taskName; installed_at=[DateTimeOffset]::UtcNow.ToString('o'); ordinary_user=$true; scheduled_task_error_type=$taskError; deployment_root=$DeploymentRoot }
[IO.File]::WriteAllText((Join-Path $runtime 'installation.json'), ($receipt | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$receipt | ConvertTo-Json -Compress | Write-Output
if (-not $NoStart) { & (Join-Path $DeploymentRoot 'Start-MQuant.ps1') -DeploymentRoot $DeploymentRoot }
