@echo off
setlocal EnableExtensions

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install Node.js LTS and retry.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm not found. Reinstall Node.js LTS and ensure npm is available.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First run: installing dependencies (npm install)...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Opening browser...
start "" "http://127.0.0.1:5173/"

echo Starting dev server...
call npm run dev -- --host 127.0.0.1 --port 5173

echo.
echo Dev server exited with code %errorlevel%.
pause

