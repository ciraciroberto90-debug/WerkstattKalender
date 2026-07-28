@echo off
rem ===================================================================
rem  Werkstatt-Cockpit starten
rem ===================================================================
rem
rem  Diese Datei darf ueberall liegen - Desktop, Eigene Dateien, C:\Werkstatt.
rem  Sie muss NICHT in den Netzwerkordner. Wichtig ist nur, dass
rem  "cockpit-server.ps1" im SELBEN Ordner liegt wie diese Datei.
rem
rem  Der Netzwerkordner wird nur GELESEN. Aendert sich der Pfad, hier
rem  anpassen - das ist die einzige Zeile, die je angefasst werden muss:

set ORDNER=\\scheudc1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender

rem ===================================================================

setlocal
set HIER=%~dp0
if "%HIER:~-1%"=="\" set HIER=%HIER:~0,-1%

title Werkstatt-Cockpit - dieses Fenster offen lassen

if not exist "%HIER%\cockpit-server.ps1" (
  echo.
  echo   FEHLER: "cockpit-server.ps1" fehlt.
  echo.
  echo   Sie muss im selben Ordner liegen wie diese Datei:
  echo   %HIER%
  echo.
  pause
  exit /b 1
)

rem Liegt der Netzwerkordner nicht (mehr) dort, wird der eigene Ordner
rem genommen - dann laesst sich wenigstens eine lokale Kopie ausliefern.
if not exist "%ORDNER%" (
  echo.
  echo   Hinweis: Der Netzwerkordner ist nicht erreichbar.
  echo   %ORDNER%
  echo.
  echo   Es wird stattdessen dieser Ordner ausgeliefert:
  echo   %HIER%
  echo.
  set ORDNER=%HIER%
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HIER%\cockpit-server.ps1" -Ordner "%ORDNER%"

echo.
echo   Der Dienst wurde beendet.
pause
