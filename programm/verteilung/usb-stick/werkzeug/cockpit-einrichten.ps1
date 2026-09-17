# BTA-Cockpit: Einrichtung vom USB-Stick
# =======================================
#
# Was dieses Skript tut - und nur das:
#  1. fragt, WOHIN das Programm auf diesen Rechner soll
#  2. fragt die drei Werkstatt-Pfade ab (Eingabetaste = Vorschlag)
#  3. entpackt 01-Programm\Werkstatt-Cockpit-Programm-win64.zip dorthin
#  4. schreibt standard-einstellungen.json NEBEN die EXE
#     (das Programm uebernimmt die Pfade beim ersten Start von selbst;
#      nur noch nie gesetzte Schluessel werden uebernommen - eine bewusste
#      Wahl am Geraet wird nie ueberschrieben)
#  5. legt eine Desktop-Verknuepfung an
#
# Keine Adminrechte noetig. Es wird nichts installiert im Windows-Sinn -
# nur ein Ordner entpackt und eine Verknuepfung angelegt. Loeschen des
# Ordners entfernt alles wieder.

param(
  [switch]$OhneNachfrage
)

$ErrorActionPreference = "Stop"

# ---- Vorschlaege (Werkstatt Scheurich) ------------------------------------
# Schraegstriche statt Backslashes - Windows versteht beide, und in der
# JSON-Datei erspart das die doppelten Backslashes.
$WerkstattOrdnerVorgabe = "//SCHEUDC1/PSG_Gruppe/16_Technik/01_Scheurich/02_Werkstatt/Arbeitsplanung/Werkstatt_Kalender"
$DatenDateiName = "kalender-daten.json"
$StoerDateiName = "werkstatt-stoerungen.json"

$hier = Split-Path -Parent $MyInvocation.MyCommand.Path   # ...\werkzeug
$stick = Split-Path -Parent $hier                          # Stick-Wurzel
$zip = Join-Path $stick "01-Programm\Werkstatt-Cockpit-Programm-win64.zip"

Write-Host ""
Write-Host "  BTA-Cockpit - Einrichtung vom USB-Stick" -ForegroundColor White
Write-Host "  ---------------------------------------"
Write-Host ""

if (-not (Test-Path -LiteralPath $zip)) {
  Write-Host "  FEHLER: Das Programm-ZIP wurde nicht gefunden:" -ForegroundColor Red
  Write-Host "  $zip" -ForegroundColor Red
  Write-Host ""
  Write-Host "  Erwartet wird der Stick-Ordner unveraendert, mit" -ForegroundColor Yellow
  Write-Host "  01-Programm\Werkstatt-Cockpit-Programm-win64.zip darin." -ForegroundColor Yellow
  Write-Host "  (Zum Nachladen: 04-Download-Links\DOWNLOAD-LINKS.txt)" -ForegroundColor Yellow
  if (-not $OhneNachfrage) { Read-Host "  Mit Eingabetaste schliessen" }
  exit 1
}

# ---- Frage 1: Zielordner ---------------------------------------------------
# Vorgabe im Benutzerprofil: dort darf jeder ohne Adminrechte schreiben,
# und der Ordner gehoert eindeutig diesem Rechner (nie vom Stick starten!).
$zielVorgabe = Join-Path $env:LOCALAPPDATA "Werkstatt-Cockpit"
Write-Host "  1) Wohin soll das Programm auf DIESEN Rechner?"
Write-Host ("     Vorschlag: " + $zielVorgabe) -ForegroundColor Gray
$ziel = Read-Host "     Zielordner (Eingabetaste = Vorschlag)"
if (-not $ziel) { $ziel = $zielVorgabe }
$ziel = [Environment]::ExpandEnvironmentVariables($ziel)

# ---- Fragen 2-4: die Werkstatt-Pfade ---------------------------------------
Write-Host ""
Write-Host "  2) Update-Ordner (dort liegt die neue Werkstatt_Kalender_TPM.html"
Write-Host "     fuer den gruenen Update-Balken)"
Write-Host ("     Vorschlag: " + $WerkstattOrdnerVorgabe) -ForegroundColor Gray
$updateOrdner = Read-Host "     Update-Ordner (Eingabetaste = Vorschlag)"
if (-not $updateOrdner) { $updateOrdner = $WerkstattOrdnerVorgabe }

$datenVorgabe = $updateOrdner.TrimEnd("/", "\") + "/" + $DatenDateiName
Write-Host ""
Write-Host "  3) Gemeinsame DATENDATEI (die App verbindet sich beim ersten"
Write-Host "     Start von selbst)"
Write-Host ("     Vorschlag: " + $datenVorgabe) -ForegroundColor Gray
$datenDatei = Read-Host "     Datendatei (Eingabetaste = Vorschlag)"
if (-not $datenDatei) { $datenDatei = $datenVorgabe }

$stoerVorgabe = $updateOrdner.TrimEnd("/", "\") + "/" + $StoerDateiName
Write-Host ""
Write-Host "  4) STOERUNGS-Datei (eigene Datei, fuer alle beschreibbar)"
Write-Host ("     Vorschlag: " + $stoerVorgabe) -ForegroundColor Gray
$stoerDatei = Read-Host "     Stoerungs-Datei (Eingabetaste = Vorschlag)"
if (-not $stoerDatei) { $stoerDatei = $stoerVorgabe }

# Der Datenordner ist der Ordner der Datendatei (Konflikt-Waechter,
# Tages-Sicherung, Fotos) - keine eigene Frage noetig.
$datenOrdner = ($datenDatei -replace "\\", "/")
$schnitt = $datenOrdner.LastIndexOf("/")
if ($schnitt -gt 0) { $datenOrdner = $datenOrdner.Substring(0, $schnitt) }

# Fuer die JSON-Datei alles auf Schraegstriche bringen
$updateOrdnerJson = ($updateOrdner -replace "\\", "/")
$datenDateiJson  = ($datenDatei  -replace "\\", "/")
$stoerDateiJson  = ($stoerDatei  -replace "\\", "/")

# ---- Zusammenfassung + letzte Bestaetigung ---------------------------------
Write-Host ""
Write-Host "  Zusammenfassung" -ForegroundColor White
Write-Host "  ---------------"
Write-Host ("  Programm nach:    " + $ziel)
Write-Host ("  Update-Ordner:    " + $updateOrdnerJson)
Write-Host ("  Datendatei:       " + $datenDateiJson)
Write-Host ("  Datenordner:      " + $datenOrdner)
Write-Host ("  Stoerungs-Datei:  " + $stoerDateiJson)
Write-Host ""
if (-not $OhneNachfrage) {
  $antwort = Read-Host "  So einrichten? (ja/nein)"
  if ($antwort -ne "ja") {
    Write-Host "  Abgebrochen - es wurde nichts veraendert." -ForegroundColor Yellow
    exit 0
  }
}

# ---- Entpacken -------------------------------------------------------------
Write-Host ""
Write-Host "  Entpacke das Programm (ca. 110 MB, dauert einen Moment) ..."
if (-not (Test-Path -LiteralPath $ziel)) {
  New-Item -ItemType Directory -Path $ziel -Force | Out-Null
}
Expand-Archive -LiteralPath $zip -DestinationPath $ziel -Force

# Die EXE liegt in der ZIP-Wurzel - zur Sicherheit trotzdem suchen, damit
# eine kuenftige ZIP-Struktur mit Unterordner die Einrichtung nicht bricht.
$exe = Get-ChildItem -LiteralPath $ziel -Recurse -Filter "Werkstatt-Cockpit.exe" | Select-Object -First 1
if (-not $exe) {
  Write-Host "  FEHLER: Nach dem Entpacken wurde keine Werkstatt-Cockpit.exe gefunden." -ForegroundColor Red
  if (-not $OhneNachfrage) { Read-Host "  Mit Eingabetaste schliessen" }
  exit 1
}
$exeOrdner = $exe.DirectoryName
Write-Host ("  entpackt: " + $exe.FullName) -ForegroundColor Green

# ---- standard-einstellungen.json neben die EXE ------------------------------
# WICHTIG: ohne BOM schreiben - das Programm liest die Datei mit JSON.parse,
# und eine BOM-Markierung liesse das Einlesen stillschweigend scheitern.
$json = @"
{
  "_was_ist_das": "Vorbelegung fuer diesen Rechner - geschrieben von der USB-Stick-Einrichtung. Es werden NUR Schluessel uebernommen, die auf dem Rechner noch nie gesetzt wurden.",

  "programm:update-ordner": "$updateOrdnerJson",
  "werkstatt-kalender-fs:handle": "$datenDateiJson",
  "werkstatt-kalender-fs:folder": "$datenOrdner",
  "werkstatt-stoerungen-fs:handle": "$stoerDateiJson"
}
"@
$jsonPfad = Join-Path $exeOrdner "standard-einstellungen.json"
[System.IO.File]::WriteAllText($jsonPfad, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("  geschrieben: " + $jsonPfad) -ForegroundColor Green

# ---- Desktop-Verknuepfung ---------------------------------------------------
$desktop = [Environment]::GetFolderPath("Desktop")
if ($desktop) {
  $schale = New-Object -ComObject WScript.Shell
  $v = $schale.CreateShortcut((Join-Path $desktop "Werkstatt-Cockpit.lnk"))
  $v.TargetPath = $exe.FullName
  $v.WorkingDirectory = $exeOrdner
  $v.IconLocation = $exe.FullName
  $v.Description = "BTA-Cockpit (Werkstatt-Cockpit) starten"
  $v.Save()
  Write-Host ("  Verknuepfung: " + (Join-Path $desktop "Werkstatt-Cockpit.lnk")) -ForegroundColor Green
} else {
  Write-Host "  Desktop-Ordner nicht gefunden - Verknuepfung bitte von Hand anlegen." -ForegroundColor Yellow
}

# ---- Fertig -----------------------------------------------------------------
Write-Host ""
Write-Host "  Fertig eingerichtet." -ForegroundColor Green
Write-Host ""
Write-Host "  So geht es weiter:"
Write-Host "  1. Desktop-Verknuepfung 'Werkstatt-Cockpit' doppelklicken."
Write-Host "  2. Beim ALLERERSTEN Start meldet sich Windows-SmartScreen:"
Write-Host "     'Weitere Informationen' -> 'Trotzdem ausfuehren' (nur einmal)."
Write-Host "  3. Kurz pruefen: Ordner-Symbol oben rechts -> die Kennkarte"
Write-Host "     zeigt die gemeinsame Datei mit Eintraegen und Groesse."
Write-Host ""
if (-not $OhneNachfrage) { Read-Host "  Mit Eingabetaste schliessen" }
