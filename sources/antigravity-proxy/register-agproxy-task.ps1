# Registers a Task Scheduler task that runs the existing supervisor (start-antigravity-proxy.ps1)
# hidden, restarting it every minute on failure. Logon + boot triggers; no time limit.
# Run once from powershell. Unregister with: Unregister-ScheduledTask -TaskName AntigravityProxy -Confirm:$false

$dir     = $PSScriptRoot
$super   = Join-Path $dir 'start-antigravity-proxy.ps1'
$log     = Join-Path $env:USERPROFILE 'logs\agproxy-tunnel.log'
$name    = 'AntigravityProxy'

if (-not (Test-Path $super)) { throw "Missing $super" }
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $dir `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"& '$super' *>> '$log'`""

$triggers = @(New-ScheduledTaskTrigger -AtLogOn)
try { $triggers += New-ScheduledTaskTrigger -AtStartup } catch { Write-Warning "AtStartup trigger unavailable: $_" }

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

try {
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
} catch {
    # AtStartup needs admin; fall back to logon-only rather than not persisting at all.
    Write-Warning "full registration failed ($($_.Exception.Message)); retrying logon-only"
    $triggers = @(New-ScheduledTaskTrigger -AtLogOn)
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
}
Write-Host "registered $name -> $super"
Write-Host "log: $log"
