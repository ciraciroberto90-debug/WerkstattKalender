@echo off
rem Startet den Ausliefer-Dienst fuer das Werkstatt-Cockpit und oeffnet es.
rem
rem -ExecutionPolicy Bypass gilt nur fuer diesen einen Aufruf. Es wird nichts
rem dauerhaft umgestellt und nichts installiert.

setlocal
set ORDNER=%~dp0
if "%ORDNER:~-1%"=="\" set ORDNER=%ORDNER:~0,-1%

title Werkstatt-Cockpit - bitte offen lassen

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ORDNER%\cockpit-server.ps1" -Ordner "%ORDNER%"

echo.
echo Der Dienst wurde beendet.
pause
