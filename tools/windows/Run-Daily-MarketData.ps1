param([switch]$ForceRefresh)
$ErrorActionPreference = 'Stop'
$deployment = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'deployment.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$configPath = Join-Path $deployment.repository 'platform\quant-factor-platform\config\market-data.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$localNowOffset = [DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(8))
$localNow = $localNowOffset.DateTime
$phase = if ($localNow.ToString('HH:mm') -ge $config.schedule_time) { ':eod' } else { ':previous-close' }
$autoKey = $localNow.ToString('yyyy-MM-dd') + $phase
$runtime = Join-Path $deployment.repository 'outputs\live-market-data'
$logs = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $runtime, $logs, (Join-Path $runtime 'scheduler-runs') | Out-Null
$stamp = $localNow.ToString('yyyyMMdd-HHmmss-fff')
$stdout = Join-Path $logs ('daily-market-' + $stamp + '.log')
$stderr = Join-Path $logs ('daily-market-' + $stamp + '.error.log')
$receipt = [ordered]@{ state = 'running'; started_at = $localNowOffset.ToString('o'); auto_key = $autoKey; wrapper_pid = $PID; stdout = $stdout; stderr = $stderr; message = '系统任务已启动'; forced_check = [bool]$ForceRefresh }

function Save-Receipt {
    $text = $receipt | ConvertTo-Json -Depth 5
    foreach ($path in @((Join-Path $runtime 'scheduler-status.json'), (Join-Path $runtime ('scheduler-runs\' + $stamp + '.json')))) {
        $temporary = $path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
        [IO.File]::WriteAllText($temporary, $text, [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporary -Destination $path -Force
    }
}

Save-Receipt
$resultCode = 1
$worker = $null
try {
    if (-not $config.enabled) {
        $receipt.state = 'skipped'
        $receipt.message = '自动更新已暂停'
        $resultCode = 0
    } else {
        $env:PYTHONIOENCODING = 'utf-8'
        $env:PYTHONDONTWRITEBYTECODE = '1'
        $script = Join-Path $deployment.repository 'tools\market_data_refresh.py'
        $arguments = '"' + $script + '" --config "' + $configPath + '" --runtime "' + $runtime + '" --auto-key "' + $autoKey + '"'
        if (-not $ForceRefresh) { $arguments += ' --automatic' }
        # Separate hidden worker, independent stdout/stderr; no console output pipeline.
        $worker = Start-Process -FilePath $deployment.python -ArgumentList $arguments -WorkingDirectory $deployment.repository -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        $retainedHandle = $worker.Handle # retain exit status even when a short-lived worker exits early
        $receipt.worker_pid = $worker.Id
        Save-Receipt
        if (-not $worker.WaitForExit(1680000)) {
            & "$env:SystemRoot\System32\taskkill.exe" /PID $worker.Id /T /F | Out-Null
            $receipt.state = 'failed'
            $receipt.message = '后台采集超过28分钟，已终止；保留上次成功行情'
            $resultCode = 124
        } else {
            $resultCode = $worker.ExitCode
            if ($null -eq $resultCode) { throw '后台进程未返回退出码，不能判定任务成功' }
            $lastLine = Get-Content -LiteralPath $stdout -Encoding UTF8 | Where-Object { $_.Trim() } | Select-Object -Last 1
            $summary = if ($lastLine) { $lastLine | ConvertFrom-Json } else { $null }
            $receipt.state = if ($resultCode -eq 0 -and $summary.state -in @('ready', 'skipped')) { $summary.state } else { 'failed' }
            $receipt.message = if ($summary.message) { $summary.message } else { '后台采集未成功结束，请查看错误日志' }
        }
    }
} catch {
    $receipt.state = 'failed'
    $receipt.message = $_.Exception.Message
    $resultCode = 1
} finally {
    $receipt.exit_code = $resultCode
    $receipt.finished_at = [DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(8)).ToString('o')
    $receipt.elapsed_seconds = [Math]::Round(([DateTimeOffset]::Parse($receipt.finished_at) - [DateTimeOffset]::Parse($receipt.started_at)).TotalSeconds, 3)
    Save-Receipt
}
exit $resultCode
