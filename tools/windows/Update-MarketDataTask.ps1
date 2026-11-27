param([string]$DeploymentRoot = 'E:\M-quant')
$ErrorActionPreference = 'Stop'
$taskName = 'M-quant Daily Market Data'
$task = Get-ScheduledTask -TaskName $taskName
$backup = Join-Path $DeploymentRoot ('logs\task-before-upgrade-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.xml')
Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath $backup -Encoding Unicode
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Run-Daily-MarketData.ps1') -Destination (Join-Path $DeploymentRoot 'Run-Daily-MarketData.ps1') -Force
$settings = $task.Settings
$settings.StartWhenAvailable = $true
$settings.DisallowStartIfOnBatteries = $false
$settings.StopIfGoingOnBatteries = $false
$settings.RunOnlyIfIdle = $false
$settings.IdleSettings.StopOnIdleEnd = $false
$settings.ExecutionTimeLimit = 'PT30M'
$settings.MultipleInstances = 2 # IgnoreNew
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $DeploymentRoot 'Run-Daily-MarketData.ps1') + '"') -WorkingDirectory $DeploymentRoot
Set-ScheduledTask -TaskName $taskName -Settings $settings -Action $action | Select-Object TaskName, State
Write-Output ('Previous task settings: ' + $backup)
