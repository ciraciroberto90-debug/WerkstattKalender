@echo off
rem =====================================================
rem  BTA-Cockpit - SERVER-Werkzeug (Etappe A, 30.09.2026)
rem  Auf dem Server v-btacockpit-01 als Administrator
rem  starten: Rechtsklick -> "Als Administrator ausfuehren".
rem  Es oeffnet sich ein Fenster mit den Reitern
rem  Pruefen / Einrichten / Wartung / Import.
rem  Das schwarze Fenster blitzt nur kurz auf.
rem =====================================================
setlocal
set "HIER=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%HIER%werkzeug\server-werkzeug.ps1"
if errorlevel 1 (
  echo.
  echo  Das Server-Werkzeug wurde nicht sauber beendet - Meldung oben beachten.
  pause
)
endlocal
