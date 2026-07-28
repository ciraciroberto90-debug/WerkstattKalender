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

rem Das Skript suchen. Beim Herunterladen gehen Bindestriche schon mal
rem verloren - deshalb wird nicht auf einen einzigen Namen bestanden,
rem sondern der Ordner abgesucht.
set SKRIPT=
if exist "%HIER%\cockpit-server.ps1" set SKRIPT=%HIER%\cockpit-server.ps1
if not defined SKRIPT if exist "%HIER%\cockpitserver.ps1" set SKRIPT=%HIER%\cockpitserver.ps1
if not defined SKRIPT for %%F in ("%HIER%\*cockpit*server*.ps1") do set SKRIPT=%%~fF
if not defined SKRIPT for %%F in ("%HIER%\*.ps1") do set SKRIPT=%%~fF

if not defined SKRIPT (
  echo.
  echo   FEHLER: Es liegt keine PowerShell-Datei ^(.ps1^) in diesem Ordner:
  echo   "%HIER%"
  echo.
  echo   Erwartet wird "cockpit-server.ps1" - sie muss neben dieser Datei liegen.
  echo.
  echo   Tipp: Wenn die Datei anders heisst ^(z. B. "cockpitserver"^), reicht
  echo         Rechtsklick - Umbenennen in "cockpit-server".
  echo.
  pause
  exit /b 1
)

rem Liegt der Netzwerkordner nicht (mehr) dort, wird der eigene Ordner
rem genommen - dann laesst sich wenigstens eine lokale Kopie ausliefern.
if not exist "%ORDNER%" (
  echo.
  echo   Hinweis: Der Netzwerkordner ist nicht erreichbar.
  echo   "%ORDNER%"
  echo.
  echo   Es wird stattdessen dieser Ordner ausgeliefert:
  echo   "%HIER%"
  echo.
  set ORDNER=%HIER%
)

echo   Skript:  %SKRIPT%
echo.

rem Taegliche Sicherung der Datendateien - laeuft beim Oeffnen mit, damit dafuer
rem kein zweiter Autostart-Eintrag noetig ist. Schlaegt sie fehl, wird trotzdem
rem gestartet: eine fehlende Sicherung darf niemanden an der Arbeit hindern.
if exist "%HIER%\cockpit-sicherung.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HIER%\cockpit-sicherung.ps1" -Ordner "%ORDNER%" -Leise
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SKRIPT%" -Ordner "%ORDNER%"

echo.
echo   Der Dienst wurde beendet.
pause
