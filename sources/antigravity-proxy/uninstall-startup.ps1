$startupDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$shortcutPath = Join-Path $startupDir "AntigravityProxy.lnk"

if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
    Write-Host "Removed shortcut from Startup:"
    Write-Host "  -> $shortcutPath"
} else {
    Write-Host "No startup shortcut found at $shortcutPath"
}
