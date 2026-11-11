# Starts the local allowlisted CONNECT proxy and keeps an SSH reverse tunnel to the VPS alive.
# Result: 9Router on the VPS reaches Google through this PC's ISP address
# (pool "Home ISP via tunnel" = http://127.0.0.1:18081, Strict Proxy on).
#
# Usage:  powershell -ExecutionPolicy Bypass -File .\start-antigravity-proxy.ps1
# Stop:   Ctrl-C in this window (also stops the proxy).

$VpsHost    = 'bot-vps'     # ssh config alias for the VPS
$LocalPort  = 18080         # proxy listens here on this PC (loopback only)
$RemotePort = 18081         # tunnel port on the VPS loopback; must match the 9Router pool URL
$ProxyJs    = Join-Path $PSScriptRoot 'connect-proxy.cjs'   # .cjs: repo package.json has "type": "module"

if (-not (Test-Path $ProxyJs)) { throw "Missing $ProxyJs" }

# Start the proxy unless something already listens on the port.
$listening = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue
$proxy = $null
if (-not $listening) {
    $proxy = Start-Process node -ArgumentList "`"$ProxyJs`"" -WindowStyle Minimized -PassThru
    Start-Sleep -Seconds 2
    Write-Host "Proxy started (pid $($proxy.Id)) on 127.0.0.1:$LocalPort"
} else {
    Write-Host "Proxy already listening on 127.0.0.1:$LocalPort"
}

try {
    # Reconnect loop: if the tunnel drops, wait 10 s and retry.
    while ($true) {
        Write-Host "$(Get-Date -Format T) opening tunnel to $VpsHost (VPS 127.0.0.1:$RemotePort -> PC 127.0.0.1:$LocalPort)"
        ssh -N `
            -o ExitOnForwardFailure=yes `
            -o ServerAliveInterval=15 `
            -o ServerAliveCountMax=3 `
            -R "127.0.0.1:${RemotePort}:127.0.0.1:${LocalPort}" $VpsHost
        Write-Host "$(Get-Date -Format T) tunnel closed (exit $LASTEXITCODE); retrying in 10 s"
        Start-Sleep -Seconds 10
    }
}
finally {
    if ($proxy -and -not $proxy.HasExited) { Stop-Process -Id $proxy.Id }
}
