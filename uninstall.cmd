@echo off
rem ============================================================
rem  ZCode RTL Patch - Uninstaller
rem  Restores the original app.asar from the backup.
rem ============================================================
setlocal
title ZCode RTL Patch Uninstaller
cd /d "%~dp0"

>nul 2>&1 net session
if errorlevel 1 (
  echo Requesting administrator permission...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "RES=C:\Program Files\ZCode\resources"
set "LOG=%~dp0Install-Log.txt"

set "BACKUP="
for %%F in ("%RES%\app.asar.backup*") do set "BACKUP=%%~fF"
if not defined BACKUP (
  echo [FAIL] No backup found in %RES%
  echo        The original archive is not available to restore.
  pause
  exit /b 1
)

tasklist /FI "IMAGENAME eq ZCode.exe" 2>nul | find /I "ZCode.exe" >nul
if not errorlevel 1 (
  echo ZCode is running and must be closed first.
  choice /C YN /M "Close ZCode now? Y=Yes, N=No"
  if errorlevel 2 (
    echo Please close ZCode completely, then run Uninstall.cmd again.
    exit /b 1
  )
  taskkill /IM ZCode.exe >nul 2>&1
  timeout /t 5 /nobreak >nul
  tasklist /FI "IMAGENAME eq ZCode.exe" 2>nul | find /I "ZCode.exe" >nul
  if not errorlevel 1 taskkill /F /IM ZCode.exe >nul 2>&1
  timeout /t 3 /nobreak >nul
)

echo Restoring %BACKUP% ...
copy /y "%BACKUP%" "%RES%\app.asar" >nul
if errorlevel 1 (
  echo [FAIL] Restore failed.
  pause
  exit /b 1
)
if exist "%RES%\app.asar.pre-rtl-patch" del /f /q "%RES%\app.asar.pre-rtl-patch"

echo.
echo [OK] Original app.asar restored. Start ZCode now.
echo %DATE% %TIME%  uninstalled>>"%LOG%" 2>nul
pause
exit /b 0
