@echo off
rem =====================================================
rem  BTA-Cockpit - Werkzeug
rem  Doppelklick genuegt: Menue mit Pfeiltasten-Auswahl
rem  (Einrichten, Herunterladen, Reparieren, Pruefen,
rem   Entfernen). Keine Adminrechte noetig.
rem =====================================================
setlocal
set "HIER=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HIER%werkzeug\cockpit-werkzeug.ps1"
if errorlevel 1 (
  echo.
  echo  Das Werkzeug wurde nicht sauber beendet - Meldung oben beachten.
  pause
)
endlocal
