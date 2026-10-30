@echo off
rem =====================================================
rem  BTA-Cockpit - DAS Werkzeug (ein Werkzeug fuer alles)
rem  Doppelklick genuegt. Es oeffnet sich ein Fenster, das
rem  selbst erkennt, ob es auf einem Werkstatt-Rechner oder
rem  auf dem BTA-Server laeuft, und fuehrt in drei Schritten
rem  durch. Auf dem Server: Rechtsklick -> Als Administrator
rem  ausfuehren (das Fenster sagt es sonst selbst).
rem  Das schwarze Fenster blitzt nur kurz auf.
rem =====================================================
setlocal
set "HIER=%~dp0"
set "FEHLER=%HIER%werkzeug\bta-werkzeug-fehler.txt"
if exist "%FEHLER%" del "%FEHLER%"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%HIER%werkzeug\bta-werkzeug.ps1"
if errorlevel 1 (
  if exist "%FEHLER%" start "" notepad "%FEHLER%"
)
endlocal
