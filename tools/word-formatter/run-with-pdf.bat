@echo off
chcp 65001 >nul
title قالب‌بندی کتاب‌های فقهی + خروجی PDF
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Format-FiqhBook.ps1" -AlsoPdf
echo.
pause
