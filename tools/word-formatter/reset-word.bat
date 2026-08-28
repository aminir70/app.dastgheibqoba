@echo off
chcp 65001 >nul
title بازگرداندن Word به حالت سالم
setlocal enabledelayedexpansion
set "S="
if exist "%~dp0Reset-Word.ps1" set "S=%~dp0Reset-Word.ps1"
if not defined S for /f "delims=" %%F in ('dir /b "%~dp0*eset*ord*.ps1" 2^>nul') do set "S=%~dp0%%F"
if not defined S ( echo [error] Reset-Word.ps1 not found next to this file. & pause & exit /b 1 )
powershell -NoProfile -ExecutionPolicy Bypass -File "!S!"
pause
