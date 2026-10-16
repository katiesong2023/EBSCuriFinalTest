@echo off
cd /d "%~dp0"
echo EBS CURI - Windows launcher
echo Keep this window open. First preparation can take several minutes.
echo.
if not exist "%~dp0scripts\start-windows.ps1" goto missing
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows.ps1"
if errorlevel 1 goto failed
echo.
echo Curi has stopped.
pause
exit /b 0
:failed
echo.
echo Curi could not start. Please copy the error message above.
pause
exit /b 1
:missing
echo ERROR: scripts\start-windows.ps1 is missing.
echo Extract the complete ZIP and put this file beside package.json.
pause
exit /b 1
