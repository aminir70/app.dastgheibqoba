@echo off
chcp 65001 >nul
title قالب‌بندی کتاب‌های فقهی
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Format-FiqhBook.ps1"
echo.
pause
