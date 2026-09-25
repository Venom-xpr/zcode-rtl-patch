@echo off
rem ============================================================
rem  ZCode RTL Patch - Installer
rem  Installs dist\app-patched.asar (built by build.cmd) into
rem  your ZCode installation. Run build.cmd first!
rem ============================================================
setlocal
title ZCode RTL Patch Installer
cd /d "%~dp0"

rem ---- self-elevate (writes to Program Files) ----
>nul 2>&1 net session
if errorlevel 1 (
  echo Requesting administrator permission...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "RES=C:\Program Files\ZCode\resources"
set "EXE=C:\Program Files\ZCode\ZCode.exe"
set "PAYLOAD=%~dp0dist\app-patched.asar"
set "LOG=%~dp0Install-Log.txt"

call :log "=== ZCode RTL Patch Installer ==="

rem ---- checks ----
if not exist "%PAYLOAD%" (
  echo [FAIL] dist\app-patched.asar not found.
  echo        Run build.cmd first - it builds the patched archive
  echo        from your own ZCode installation.
  call :log "payload missing"
  goto :end_fail
)
if not exist "%RES%\app.asar" (
  echo [FAIL] ZCode installation not found at: %RES%
  echo        If ZCode is installed elsewhere, edit the RES path in this file.
  call :log "zcode not found"
  goto :end_fail
)

for %%F in ("%PAYLOAD%") do set "PAY_SIZE=%%~zF"
for %%F in ("%RES%\app.asar") do set "CUR_SIZE=%%~zF"

if "%CUR_SIZE%"=="%PAY_SIZE%" (
  echo [OK] The RTL patch is already installed.
  echo      To remove it, run Uninstall.cmd instead.
  call :log "already installed"
  goto :end_ok
)

rem ---- close ZCode ----
call :app_running
if "%RUNNING%"=="0" goto :closed
echo.
echo ZCode is currently running and must be closed before installing.
choice /C YN /M "Close ZCode now? Y=Yes, N=No I will close it myself"
if errorlevel 2 (
  echo Please close ZCode completely, then run Install.cmd again.
  call :log "user will close app manually"
  goto :end_fail
)
echo Closing ZCode...
taskkill /IM ZCode.exe >nul 2>&1
set /a TRIES=0
:wait_close
call :app_running
if "%RUNNING%"=="0" goto :closed
timeout /t 1 /nobreak >nul
set /a TRIES+=1
if %TRIES% lss 30 goto :wait_close
echo Still running - force closing...
taskkill /F /IM ZCode.exe >nul 2>&1
timeout /t 3 /nobreak >nul
call :app_running
if "%RUNNING%"=="0" goto :closed
echo [FAIL] Could not close ZCode. Close it manually and retry.
call :log "could not close app"
goto :end_fail
:closed

rem ---- backup ----
set "BACKUP="
for %%F in ("%RES%\app.asar.backup*") do set "BACKUP=%%~fF"
if defined BACKUP (
  echo Backup already exists: %BACKUP%
  goto :backup_done
)
echo Backing up the original app.asar ...
copy /y "%RES%\app.asar" "%RES%\app.asar.backup-original" >nul
if errorlevel 1 (
  echo [FAIL] Backup failed - nothing was changed.
  call :log "backup failed"
  goto :end_fail
)
set "BACKUP=%RES%\app.asar.backup-original"
call :log "backup created"
:backup_done

rem ---- install ----
if exist "%RES%\app.asar.pre-rtl-patch" del /f /q "%RES%\app.asar.pre-rtl-patch"
echo Installing patched archive ...
move /y "%RES%\app.asar" "%RES%\app.asar.pre-rtl-patch" >nul
if errorlevel 1 (
  echo [FAIL] app.asar is locked. ZCode is still running - close it and retry.
  call :log "asar locked"
  goto :end_fail
)
copy /y "%PAYLOAD%" "%RES%\app.asar" >nul
if errorlevel 1 (
  echo [FAIL] Copy failed. Restoring original...
  move /y "%RES%\app.asar.pre-rtl-patch" "%RES%\app.asar" >nul
  call :log "copy failed, restored"
  goto :end_fail
)

rem ---- verify ----
for %%F in ("%RES%\app.asar") do set "NEW_SIZE=%%~zF"
if not "%NEW_SIZE%"=="%PAY_SIZE%" (
  echo [FAIL] Size verification failed. Restoring original...
  copy /y "%RES%\app.asar.pre-rtl-patch" "%RES%\app.asar" >nul
  call :log "verification failed, restored"
  goto :end_fail
)

echo.
echo ============================================================
echo  [OK] RTL patch installed successfully!
echo      app.asar: %NEW_SIZE% bytes
echo      Backup:   %BACKUP%
echo ============================================================
call :log "installed OK"
echo.
choice /C YN /M "Start ZCode now? Y=Yes, N=No"
if errorlevel 2 goto :end_ok
start "" "%EXE%"
goto :end_ok

:app_running
set "RUNNING=0"
tasklist /FI "IMAGENAME eq ZCode.exe" 2>nul | find /I "ZCode.exe" >nul
if not errorlevel 1 set "RUNNING=1"
exit /b

:log
echo %DATE% %TIME%  %~1>>"%LOG%" 2>nul
exit /b

:end_ok
echo.
echo Done.
pause
exit /b 0

:end_fail
echo.
echo Installation did not complete. See messages above.
pause
exit /b 1
