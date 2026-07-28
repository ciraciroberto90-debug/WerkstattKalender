@echo off
rem Prueft, warum das Cockpit auf diesem Rechner nicht laeuft.
rem Veraendert nichts - liest nur und schreibt einen Bericht.

set ORDNER=\\scheudc1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender

setlocal
set HIER=%~dp0
if "%HIER:~-1%"=="\" set HIER=%HIER:~0,-1%
title Werkstatt-Cockpit - Selbsttest

if not exist "%HIER%\cockpit-selbsttest.ps1" (
  echo.
  echo   FEHLER: "cockpit-selbsttest.ps1" fehlt neben dieser Datei:
  echo   "%HIER%"
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HIER%\cockpit-selbsttest.ps1" -Ordner "%ORDNER%"
