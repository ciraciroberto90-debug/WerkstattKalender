@echo off
rem ===================================================================
rem  Legt auf DIESEM Rechner eine Desktop-Verknuepfung zum Cockpit an.
rem
rem  Diese Datei darf zusammen mit den anderen auf dem Firmenlaufwerk
rem  liegen. Jeder Kollege ruft sie EINMAL auf - danach hat er sein
rem  Symbol auf dem Desktop und muss nie wieder hierher.
rem ===================================================================

setlocal
set HIER=%~dp0
if "%HIER:~-1%"=="\" set HIER=%HIER:~0,-1%
title Werkstatt-Cockpit - Verknuepfung anlegen

if not exist "%HIER%\cockpit-verknuepfung.ps1" (
  echo.
  echo   FEHLER: "cockpit-verknuepfung.ps1" fehlt neben dieser Datei:
  echo   "%HIER%"
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HIER%\cockpit-verknuepfung.ps1" -Starter "%HIER%\Cockpit starten.cmd"
