@echo off
rem =====================================================
rem  BTA-Cockpit vom USB-Stick einrichten
rem  Doppelklick genuegt - der Rest sind ein paar Fragen.
rem =====================================================
setlocal
set "HIER=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HIER%werkzeug\cockpit-einrichten.ps1"
if errorlevel 1 (
  echo.
  echo  Die Einrichtung wurde nicht abgeschlossen - Meldung oben beachten.
  pause
)
endlocal
