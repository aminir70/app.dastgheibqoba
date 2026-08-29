@echo off
chcp 65001 >nul
title قالب‌بندی — ذخیره دستی
setlocal enabledelayedexpansion
set "SCRIPT="
if exist "%~dp0Format-FiqhBook.ps1" set "SCRIPT=%~dp0Format-FiqhBook.ps1"
if not defined SCRIPT if exist "%~dp0FormatFiqhBook.ps1" set "SCRIPT=%~dp0FormatFiqhBook.ps1"
if not defined SCRIPT (
    for /f "delims=" %%F in ('dir /b "%~dp0*FiqhBook*.ps1" 2^>nul') do set "SCRIPT=%~dp0%%F"
)
if not defined SCRIPT (
    echo.
    echo [خطا] فایل اسکریپت پیدا نشد.
    echo.
    pause
    exit /b 1
)
echo اسکریپت: !SCRIPT!
powershell -NoProfile -STA -ExecutionPolicy Bypass -File "!SCRIPT!" -NoSave %*
echo.
echo ---------------------------------------------------------------
echo تمام شد. اگر کتابی باز مانده، با F12 ذخیره‌اش کنید.
pause >nul
