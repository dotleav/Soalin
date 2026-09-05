@echo off
powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0convert.ps1"
if %errorlevel% neq 0 (
    echo.
    echo ERROR: PowerShell script gagal dengan kode %errorlevel%
    echo Pastikan convert.ps1 ada di folder yang sama dengan soalin.bat
    pause
)
