@echo off
rem =====================================================
rem  BTA-Cockpit - Werkzeug
rem  Doppelklick genuegt: es oeffnet sich ein richtiges
rem  Fenster (Einrichten, Herunterladen, Pfade, Pruefen,
rem  Entfernen). Keine Adminrechte noetig.
rem  Das schwarze Fenster blitzt nur kurz auf - danach
rem  laeuft alles im Programmfenster.
rem =====================================================
setlocal
set "HIER=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%HIER%werkzeug\cockpit-werkzeug.ps1"
if errorlevel 1 (
  echo.
  echo  Das Werkzeug wurde nicht sauber beendet - Meldung oben beachten.
  pause
)
endlocal
