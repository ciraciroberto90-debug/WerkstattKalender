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
set "FEHLER=%HIER%werkzeug\server-werkzeug-fehler.txt"
if exist "%FEHLER%" del "%FEHLER%"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%HIER%werkzeug\server-werkzeug.ps1"
rem Bricht das Skript ab, schreibt es die Ursache in die Fehler-Datei - die
rem oeffnen wir im Editor, weil dieses Fenster durch -WindowStyle Hidden
rem unsichtbar ist (ein "pause" hier saehe niemand; so war es am 30.09.).
if errorlevel 1 (
  if exist "%FEHLER%" start "" notepad "%FEHLER%"
)
endlocal
