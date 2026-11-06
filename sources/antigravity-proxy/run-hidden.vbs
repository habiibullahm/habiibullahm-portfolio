Dim WshShell
Set WshShell = CreateObject("WScript.Shell")
strScriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
strCommand = "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & strScriptDir & "\start-antigravity-proxy.ps1"""
WshShell.Run strCommand, 0, False
