# Starts the local allowlisted CONNECT proxy and keeps an SSH reverse tunnel to the VPS alive.
# Result: 9Router on the VPS reaches Google/OpenCode through this PC's ISP address
# (pool "Home ISP via tunnel" = http://127.0.0.1:18081, Strict Proxy off so a dead tunnel
#  degrades to a direct call instead of failing every request).
#
# Usage:  powershell -ExecutionPolicy Bypass -File .\start-antigravity-proxy.ps1
# Stop:   Ctrl-C in this window (also stops the proxy).
#
# Hard-won lessons baked in:
#  - A dead previous tunnel leaves sshd holding the VPS port. That pid must be killed BEFORE
#    opening the new forward, otherwise ssh -R fails forever with "remote port forwarding failed".
#  - node can crash independently of ssh, so the proxy is re-checked on every retry, not just
#    at startup.
#  - Never silence ssh: the reason a tunnel refuses to come up is printed on its stderr.

$VpsHost    = 'bot-vps'     # ssh config alias for the VPS
$LocalPort  = 18080         # proxy listens here on this PC (loopback only)
$RemotePort = 18081         # tunnel port on the VPS loopback; must match the 9Router pool URL
$ProxyJs    = Join-Path $PSScriptRoot 'connect-proxy.cjs'   # .cjs: repo package.json has "type": "module"
$RetryDelay = 10

if (-not (Test-Path $ProxyJs)) { throw "Missing $ProxyJs" }

function Test-Port {
    param([int]$Port)
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Ensure-Proxy {
    if (Test-Port $LocalPort) { return }
    $p = Start-Process node -ArgumentList "`"$ProxyJs`"" -WindowStyle Minimized -PassThru
    Start-Sleep -Seconds 2
    if (-not (Test-Port $LocalPort)) {
        throw "Proxy failed to listen on 127.0.0.1:$LocalPort (pid $($p.Id)) - is node installed?"
    }
    Write-Host "$(Get-Date -Format T) proxy (re)started on 127.0.0.1:$LocalPort (pid $($p.Id))"
}

function Clear-RemotePort {
    # Kill whatever still holds the tunnel port on the VPS. fuser is the reliable path; the ss
    # fallback covers hosts without it. Both need passwordless sudo (NOPASSWD) for the ssh user.
    ssh -o ConnectTimeout=10 $VpsHost @"
sudo -n fuser -k -n tcp $RemotePort >/dev/null 2>&1 || {
  p=`$(sudo -n ss -ltnpH 'sport = :$RemotePort' 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
  [ -n "`$p" ] && sudo -n kill `$p
}
true
"@
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "$(Get-Date -Format T) cleanup on $VpsHost returned exit $LASTEXITCODE (ssh user may lack passwordless sudo)"
    }
}

Ensure-Proxy

$failures = 0
while ($true) {
    Ensure-Proxy
    Clear-RemotePort
    Write-Host "$(Get-Date -Format T) opening tunnel: VPS 127.0.0.1:$RemotePort -> PC 127.0.0.1:$LocalPort"
    ssh -N `
        -o ExitOnForwardFailure=yes `
        -o ServerAliveInterval=15 `
        -o ServerAliveCountMax=3 `
        -o TCPKeepAlive=yes `
        -o StreamLocalBindUnlink=yes `
        -R "127.0.0.1:${RemotePort}:127.0.0.1:${LocalPort}" $VpsHost

    $code = $LASTEXITCODE
    if ($code -eq 0) {
        Write-Host "$(Get-Date -Format T) tunnel closed cleanly (exit 0); retrying in ${RetryDelay}s"
        $failures = 0
    } else {
        $failures++
        Write-Host "$(Get-Date -Format T) tunnel FAILED (exit $code, attempt $failures); retrying in ${RetryDelay}s"
        if ($failures -ge 3) {
            Write-Warning "Still failing after $failures attempts. Check: (1) 'ssh -G $VpsHost | findstr /i hostname' points at the right VPS, (2) VPS port $RemotePort is free, (3) 'ssh $VpsHost true' works (key auth)."
        }
    }
    Start-Sleep -Seconds $RetryDelay
}
