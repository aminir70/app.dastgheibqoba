@echo off
chcp 65001 >nul
title قالب‌بندی کتاب‌های فقهی + خروجی PDF
setlocal enabledelayedexpansion

rem --- پیدا کردن فایل اسکریپت کنار همین run.bat (با یا بدون خط تیره) ---
set "SCRIPT="
if exist "%~dp0Format-FiqhBook.ps1" set "SCRIPT=%~dp0Format-FiqhBook.ps1"
if not defined SCRIPT if exist "%~dp0FormatFiqhBook.ps1" set "SCRIPT=%~dp0FormatFiqhBook.ps1"
if not defined SCRIPT (
    for /f "delims=" %%F in ('dir /b "%~dp0*FiqhBook*.ps1" 2^>nul') do set "SCRIPT=%~dp0%%F"
)

if not defined SCRIPT (
    echo.
    echo [خطا] فایل اسکریپت پیدا نشد.
    echo باید فایل Format-FiqhBook.ps1 کنار همین run.bat باشد.
    echo محل جستجو: %~dp0
    echo.
    pause
    exit /b 1
)

echo اسکریپت: !SCRIPT!
powershell -NoProfile -STA -ExecutionPolicy Bypass -File "!SCRIPT!" -AlsoPdf %*
echo.
echo ---------------------------------------------------------------
echo برای بستن این پنجره یک کلید بزنید.
pause >nul
