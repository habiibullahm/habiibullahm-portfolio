$scriptDir = $PSScriptRoot
$vbsPath = Join-Path $scriptDir "run-hidden.vbs"
$startupDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$shortcutPath = Join-Path $startupDir "AntigravityProxy.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$vbsPath`""
$Shortcut.WorkingDirectory = $scriptDir
$Shortcut.Description = "Auto-start Antigravity Proxy and Tunnel for 9Router"
$Shortcut.Save()

Write-Host "Shortcut created in Windows Startup folder:"
Write-Host "  -> $shortcutPath"
Write-Host "Target: wscript.exe `"$vbsPath`""
