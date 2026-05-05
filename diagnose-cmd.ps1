$ErrorActionPreference = "Stop"

Write-Host "=== cmd.exe AutoRun (HKCU/HKLM) ==="
foreach ($path in @(
  "HKCU:\Software\Microsoft\Command Processor",
  "HKLM:\Software\Microsoft\Command Processor"
)) {
  try {
    $v = (Get-ItemProperty -Path $path -Name AutoRun -ErrorAction Stop).AutoRun
    Write-Host "$path AutoRun = $v"
  } catch {
    Write-Host "$path AutoRun = (not set)"
  }
}

Write-Host ""
Write-Host "=== Shortcut info (Desktop) ==="
$desktop = [Environment]::GetFolderPath("Desktop")
$lnk = Join-Path $desktop "Lamp Shade Generator.lnk"
Write-Host "Shortcut path: $lnk"

if (Test-Path $lnk) {
  $wsh = New-Object -ComObject WScript.Shell
  $s = $wsh.CreateShortcut($lnk)
  Write-Host "TargetPath: $($s.TargetPath)"
  Write-Host "Arguments : $($s.Arguments)"
  Write-Host "WorkDir   : $($s.WorkingDirectory)"
} else {
  Write-Host "Shortcut not found."
}

