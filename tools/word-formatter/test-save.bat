@echo off
chcp 65001 >nul
title تست ذخیره
setlocal enabledelayedexpansion
set "S="
if exist "%~dp0Test-Save.ps1" set "S=%~dp0Test-Save.ps1"
if not defined S for /f "delims=" %%F in ('dir /b "%~dp0*est*ave*.ps1" 2^>nul') do set "S=%~dp0%%F"
if not defined S ( echo [error] Test-Save.ps1 not found next to this file. & pause & exit /b 1 )
powershell -NoProfile -ExecutionPolicy Bypass -File "!S!" %*
pause
