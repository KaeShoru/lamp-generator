$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

function Require-Command($name) {
  if (!(Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $name"
  }
}

Require-Command node
Require-Command npm

if (!(Test-Path (Join-Path $projectRoot "node_modules"))) {
  Write-Host "First run: npm install..."
  npm install
}

Write-Host "Starting dev server..."

node (Join-Path $projectRoot "scripts\launcher.mjs")

Write-Host ""
Write-Host "Dev server exited."
Read-Host "Press Enter to close"

