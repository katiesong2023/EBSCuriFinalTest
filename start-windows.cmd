@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows.ps1"
if errorlevel 1 (
  echo.
  echo Curi could not start. Please read the error above and 00_실행방법.txt.
  pause
)
endlocal
