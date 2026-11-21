Dim WshShell
Set WshShell = CreateObject("WScript.Shell")
strScriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
strLog = WshShell.ExpandEnvironmentStrings("%USERPROFILE%") & "\logs\agproxy-tunnel.log"
' Hidden means silent: redirect all supervisor output to a log file, else failures vanish.
strCommand = "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -Command ""& '" & strScriptDir & "\start-antigravity-proxy.ps1' *>> '" & strLog & "'"""
WshShell.Run strCommand, 0, False
