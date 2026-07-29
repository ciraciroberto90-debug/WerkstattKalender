@echo off
rem Holt einen frueheren Stand der Datendateien zurueck.
rem Der aktuelle Stand wird vorher als *.vor-wiederherstellung gesichert.

set ORDNER=\\scheudc1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender

setlocal
set HIER=%~dp0
if "%HIER:~-1%"=="\" set HIER=%HIER:~0,-1%
rem Liegt diese Datei selbst im App-Ordner, ist der eigene Ordner der richtige.
if exist "%HIER%\Werkstatt_Kalender_TPM*.html" set ORDNER=%HIER%

title Werkstatt-Cockpit - Sicherung zurueckholen

if not exist "%HIER%\cockpit-sicherung.ps1" (
  echo.
  echo   FEHLER: "cockpit-sicherung.ps1" fehlt neben dieser Datei:
  echo   "%HIER%"
  echo.
  pause
  exit /b 1
)

echo.
echo   ACHTUNG: Dies ersetzt die aktuellen Daten durch einen frueheren Stand.
echo   Vorher bitte das Cockpit auf ALLEN Rechnern schliessen.
echo.
pause

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HIER%\cockpit-sicherung.ps1" -Ordner "%ORDNER%" -Zurueckholen
