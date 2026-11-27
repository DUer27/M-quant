param([switch]$OpenBrowser, [string]$DeploymentRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath (Join-Path $DeploymentRoot 'deployment.json'))) { $DeploymentRoot = 'E:\M-quant' }
$deploymentFile = Join-Path $DeploymentRoot 'deployment.json'
$deployment = Get-Content -LiteralPath $deploymentFile -Raw -Encoding UTF8 | ConvertFrom-Json
$script = Join-Path $deployment.repository 'tools\platform_supervisor.py'
$stateFile = Join-Path $deployment.repository 'outputs\live-market-data\service\supervisor-status.json'
$task = Get-ScheduledTask -TaskName 'M-quant Platform Supervisor' -ErrorAction SilentlyContinue
if ($task) {
    if (-not ($task.Actions | Where-Object { $_.Arguments -like ('*"' + $script + '"*') })) { throw 'Task identity differs; nothing was started.' }
    # A stopped receipt can precede the task process exit by a few milliseconds.
    # Wait for that exit before requesting a new IgnoreNew task instance.
    for ($taskWait=0; $taskWait -lt 20 -and $task.State -eq 'Running'; $taskWait++) {
        $prior = if (Test-Path -LiteralPath $stateFile) { Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
        if ($prior.state -ne 'stopped') { break }
        Start-Sleep -Milliseconds 250
        $task = Get-ScheduledTask -TaskName $task.TaskName
    }
}
& $deployment.python $script --deployment $deploymentFile --action enable
if ($LASTEXITCODE -ne 0) { throw 'Cannot enable the local supervisor.' }
if ($task) {
    Start-ScheduledTask -TaskName $task.TaskName
} else {
    $pythonw = Join-Path (Split-Path -Parent $deployment.python) 'pythonw.exe'
    if (-not (Test-Path -LiteralPath $pythonw -PathType Leaf)) { throw 'The hidden Python runtime is missing.' }
    $arguments = '"' + $script + '" --deployment "' + $deploymentFile + '" --action run'
    Start-Process -FilePath $pythonw -ArgumentList $arguments -WorkingDirectory $deployment.repository -WindowStyle Hidden | Out-Null
}
$watch = [Diagnostics.Stopwatch]::StartNew()
while ($watch.Elapsed.TotalSeconds -lt 30) {
    try {
        $request = [Net.HttpWebRequest]::Create('http://127.0.0.1:' + $deployment.port + '/market-data-api/service/health')
        $request.Proxy = $null; $request.Timeout = 1500; $request.ReadWriteTimeout = 1500
        $response = $request.GetResponse()
        try {
            $reader = [IO.StreamReader]::new($response.GetResponseStream())
            try { $health = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        } finally { $response.Dispose() }
        $state = Get-Content -LiteralPath (Join-Path $deployment.repository 'outputs\live-market-data\service\supervisor-status.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($health.ok -and $health.project_id -eq $state.project_id -and $state.enabled -and $state.state -in @('healthy', 'collection_warning')) {
            Write-Output ('M-quant is running with supervision at http://127.0.0.1:' + $deployment.port)
            if ($OpenBrowser) { Start-Process -FilePath ('http://127.0.0.1:' + $deployment.port) }
            exit 0
        }
    } catch { }
    Start-Sleep -Milliseconds 250
}
throw 'Supervised startup was not confirmed within 30 seconds. Check outputs/live-market-data/service/.'
