@echo off
rem Fuegt die beiden Teil-Dateien wieder zur Programm-ZIP zusammen.
rem Warum Teile? GitHub nimmt keine einzelne Datei ueber 100 MB an -
rem die Programm-ZIP hat 110 MB. Das Zusammensetzen ist ein reines
rem Aneinanderhaengen der Bytes, es geht nichts verloren.
cd /d "%~dp0"

set "T1=WC-Programm-1.teil"
set "T2=WC-Programm-2.teil"
rem Mancher Browser entfernt beim Herunterladen die Bindestriche
if not exist "%T1%" if exist "WCProgramm1.teil" set "T1=WCProgramm1.teil"
if not exist "%T2%" if exist "WCProgramm2.teil" set "T2=WCProgramm2.teil"

if not exist "%T1%" goto fehlt
if not exist "%T2%" goto fehlt

copy /b "%T1%"+"%T2%" "Werkstatt-Cockpit-Programm-win64.zip" >nul
if errorlevel 1 goto fehler

echo.
echo FERTIG: Werkstatt-Cockpit-Programm-win64.zip liegt jetzt in diesem Ordner.
echo Die ZIP entpacken (Rechtsklick, "Alle extrahieren ...") und
echo Werkstatt-Cockpit.exe starten.
echo.
pause
exit /b 0

:fehlt
echo.
echo FEHLER: Es muessen BEIDE Teil-Dateien in diesem Ordner liegen:
echo    WC-Programm-1.teil
echo    WC-Programm-2.teil
echo Bitte beide von GitHub herunterladen und neben diese Datei legen.
echo.
pause
exit /b 1

:fehler
echo.
echo FEHLER beim Zusammensetzen. Bitte beide Teile neu herunterladen.
echo.
pause
exit /b 1
