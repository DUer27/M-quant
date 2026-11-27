param([string]$DeploymentRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath (Join-Path $DeploymentRoot 'deployment.json'))) { $DeploymentRoot = 'E:\M-quant' }
$deploymentFile = Join-Path $DeploymentRoot 'deployment.json'
$deployment = Get-Content -LiteralPath $deploymentFile -Raw -Encoding UTF8 | ConvertFrom-Json
$script = Join-Path $deployment.repository 'tools\platform_supervisor.py'
& $deployment.python $script --deployment $deploymentFile --action stop
if ($LASTEXITCODE -ne 0) { throw 'The stop request could not be saved.' }
$stateFile = Join-Path $deployment.repository 'outputs\live-market-data\service\supervisor-status.json'
$watch = [Diagnostics.Stopwatch]::StartNew()
while ($watch.Elapsed.TotalSeconds -lt 20) {
    try {
        $state = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($state.state -eq 'stopped' -and -not $state.enabled) {
            Write-Output 'Supervisor stopped. Its own platform process was released; independently started processes were not terminated.'
            exit 0
        }
    } catch { }
    Start-Sleep -Milliseconds 250
}
Write-Output 'Stop request saved; no current supervisor has confirmed completion. Automatic relaunch remains disabled until Start-MQuant is used.'
