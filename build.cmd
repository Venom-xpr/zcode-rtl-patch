@echo off
rem ============================================================
rem  ZCode RTL Patch - build the patched archive from your own
rem  installed ZCode. Requires Node.js 18+.
rem ============================================================
setlocal
title ZCode RTL Patch - Build
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Node.js is not installed or not in PATH.
  echo        Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

echo Building the patched app.asar from your local ZCode install...
echo.
node build\build-patch.js %*
set EXITCODE=%ERRORLEVEL%
echo.
if %EXITCODE% neq 0 (
  echo Build failed. See messages above.
) else (
  echo Next step: run install.cmd
)
pause
exit /b %EXITCODE%
