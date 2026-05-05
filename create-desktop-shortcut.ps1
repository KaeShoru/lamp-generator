$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $projectRoot "run-dev.ps1"

if (!(Test-Path $target)) {
  throw "Target file not found: $target"
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Lamp Shade Generator.lnk"

$wsh = New-Object -ComObject WScript.Shell
$s = $wsh.CreateShortcut($shortcutPath)
$s.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$s.Arguments = "-NoProfile -ExecutionPolicy Bypass -File ""$target"""
$s.WorkingDirectory = $projectRoot
$s.WindowStyle = 1
$s.Description = "Launch local lamp shade generator"
$s.Save()

Write-Host "Done: $shortcutPath"

