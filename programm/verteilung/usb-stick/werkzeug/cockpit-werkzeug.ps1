# BTA-Cockpit: Das Werkzeug (Menue-Programm fuers schwarze Fenster)
# ==================================================================
#
# Robertos Wunsch vom 17.09.: ein "richtiges Programm" in der Konsole -
# mit Rahmen, Farben und Pfeiltasten-Auswahl statt loser Skripte. Alles
# mit Windows-Bordmitteln (PowerShell 5.1), nichts wird installiert,
# keine Adminrechte.
#
# Die fuenf Menuepunkte decken den ganzen Lebenslauf eines Rechners ab:
#   1 Neu einrichten      (entpacken, Pfade schreiben, Verknuepfung)
#   2 Programm herunterladen (neuester Stand direkt vom Release)
#   3 Pfade reparieren    (die GEMERKTEN Pfade des Programms aendern)
#   4 Verbindung pruefen  (kommt dieser Rechner ans Laufwerk?)
#   5 Vom Rechner entfernen
#
# WICHTIG fuer Bearbeiter: Diese Datei ist UTF-8 MIT BOM gespeichert.
# Ohne BOM liest Windows-PowerShell 5.1 die Rahmenzeichen als Muell.
# Die JSON-Dateien, die das Skript SCHREIBT, sind dagegen bewusst OHNE
# BOM - das Programm liest sie mit JSON.parse, und eine BOM-Markierung
# liesse das Einlesen stillschweigend scheitern.

param(
  [switch]$OhneNachfrage
)

$ErrorActionPreference = "Stop"

# ---- Feste Werte (Werkstatt Scheurich) --------------------------------------
# Schraegstriche statt Backslashes: Windows versteht beide, und in JSON
# erspart das die doppelten Backslashes.
$WerkstattOrdnerVorgabe = "//SCHEUDC1/PSG_Gruppe/16_Technik/01_Scheurich/02_Werkstatt/Arbeitsplanung/Werkstatt_Kalender"
$DatenDateiName  = "kalender-daten.json"
$StoerDateiName  = "werkstatt-stoerungen.json"
$ZielVorgabe     = Join-Path $env:LOCALAPPDATA "Werkstatt-Cockpit"
# Fester Release-Link: zeigt immer auf den neuesten veroeffentlichten Stand.
$ProgrammZipUrl  = "https://github.com/ciraciroberto90-debug/WerkstattKalender/releases/latest/download/Werkstatt-Cockpit-Programm-win64.zip"

$hier  = Split-Path -Parent $MyInvocation.MyCommand.Path   # ...\werkzeug
$paket = Split-Path -Parent $hier                          # Paket-Wurzel
$programmZip = Join-Path $paket "01-Programm\Werkstatt-Cockpit-Programm-win64.zip"

# Die vier Pfad-Schluessel, um die sich hier alles dreht (siehe
# programm/main.js, uebernehmeStandardEinstellungen).
$PfadSchluessel = @(
  @{ Name = "programm:update-ordner";          Titel = "Update-Ordner (gruener Balken)" },
  @{ Name = "werkstatt-kalender-fs:handle";    Titel = "Gemeinsame Datendatei" },
  @{ Name = "werkstatt-kalender-fs:folder";    Titel = "Datenordner (Sicherung, Fotos)" },
  @{ Name = "werkstatt-stoerungen-fs:handle";  Titel = "Stoerungs-Datei" }
)

# =============================================================================
#  Zeichen-Helfer: Rahmen, Kopf, Fusszeile
# =============================================================================
$B = 66  # Innenbreite aller Rahmen - eine Zahl, damit alles buendig ist

function Zeile([string]$links, [string]$mitte, [string]$rechts) {
  return $links + ([string]$mitte * $B) + $rechts
}
function Zeichne-Kopf([string]$untertitel) {
  Clear-Host
  Write-Host ""
  Write-Host ("  " + (Zeile "╔" "═" "╗")) -ForegroundColor DarkCyan
  $titel = "B T A - C O C K P I T   ·   W E R K Z E U G"
  $pad = [Math]::Max(0, [int](($B - $titel.Length) / 2))
  Write-Host "  ║" -NoNewline -ForegroundColor DarkCyan
  Write-Host ((" " * $pad) + $titel).PadRight($B) -NoNewline -ForegroundColor White
  Write-Host "║" -ForegroundColor DarkCyan
  if ($untertitel) {
    $pad = [Math]::Max(0, [int](($B - $untertitel.Length) / 2))
    Write-Host "  ║" -NoNewline -ForegroundColor DarkCyan
    Write-Host ((" " * $pad) + $untertitel).PadRight($B) -NoNewline -ForegroundColor DarkGray
    Write-Host "║" -ForegroundColor DarkCyan
  }
  Write-Host ("  " + (Zeile "╚" "═" "╝")) -ForegroundColor DarkCyan
  Write-Host ""
}
function Warte-Taste {
  Write-Host ""
  Write-Host "  Weiter mit einer beliebigen Taste ..." -ForegroundColor DarkGray
  [void][Console]::ReadKey($true)
}
function Frage([string]$text, [string]$vorgabe) {
  # Eine Frage mit Vorschlag: Eingabetaste uebernimmt den Vorschlag.
  Write-Host ""
  Write-Host ("  " + $text)
  if ($vorgabe) { Write-Host ("     Vorschlag: " + $vorgabe) -ForegroundColor DarkGray }
  $antwort = Read-Host "     Eingabe (Eingabetaste = Vorschlag)"
  if (-not $antwort) { $antwort = $vorgabe }
  return $antwort
}
function Schreibe-OhneBom([string]$pfad, [string]$inhalt) {
  [System.IO.File]::WriteAllText($pfad, $inhalt, (New-Object System.Text.UTF8Encoding($false)))
}

# =============================================================================
#  Lage-Helfer: Was ist auf diesem Rechner schon da?
# =============================================================================
function Finde-Exe {
  # Erst am Standardort suchen, das reicht fast immer.
  $kandidat = Join-Path $ZielVorgabe "Werkstatt-Cockpit.exe"
  if (Test-Path -LiteralPath $kandidat) { return (Get-Item -LiteralPath $kandidat) }
  if (Test-Path -LiteralPath $ZielVorgabe) {
    $t = Get-ChildItem -LiteralPath $ZielVorgabe -Recurse -Filter "Werkstatt-Cockpit.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($t) { return $t }
  }
  return $null
}
function Finde-Einstellungen {
  # Die GEMERKTEN Pfade des Programms liegen in einstellungen.json unter
  # dem Benutzerprofil. Der Ordnername haengt vom Electron-Programmnamen
  # ab - beide Schreibweisen pruefen und melden, was wirklich da ist.
  foreach ($ordner in @("Werkstatt-Cockpit", "werkstatt-cockpit")) {
    $p = Join-Path (Join-Path $env:APPDATA $ordner) "einstellungen.json"
    if (Test-Path -LiteralPath $p) { return $p }
  }
  return $null
}
function Lies-Pfade {
  # Beste bekannte Pfad-Werte einsammeln: zuerst die gemerkten
  # Einstellungen des Programms, sonst die Vorgaben dieses Pakets.
  $werte = @{}
  $quelle = "Vorgaben dieses Pakets"
  $einstellungen = Finde-Einstellungen
  if ($einstellungen) {
    try {
      $json = Get-Content -LiteralPath $einstellungen -Raw | ConvertFrom-Json
      foreach ($s in $PfadSchluessel) {
        $wert = $json.PSObject.Properties[$s.Name]
        if ($wert -and $wert.Value) { $werte[$s.Name] = [string]$wert.Value }
      }
      if ($werte.Count -gt 0) { $quelle = "gemerkte Einstellungen ($einstellungen)" }
    } catch { }
  }
  if ($werte.Count -eq 0) {
    $werte["programm:update-ordner"]         = $WerkstattOrdnerVorgabe
    $werte["werkstatt-kalender-fs:handle"]   = $WerkstattOrdnerVorgabe + "/" + $DatenDateiName
    $werte["werkstatt-kalender-fs:folder"]   = $WerkstattOrdnerVorgabe
    $werte["werkstatt-stoerungen-fs:handle"] = $WerkstattOrdnerVorgabe + "/" + $StoerDateiName
  }
  return @{ Werte = $werte; Quelle = $quelle }
}

# =============================================================================
#  1 - NEU EINRICHTEN
# =============================================================================
function Aktion-Einrichten {
  Zeichne-Kopf "Neu einrichten"
  if (-not (Test-Path -LiteralPath $programmZip)) {
    Write-Host "  Das Programm-ZIP fehlt noch:" -ForegroundColor Yellow
    Write-Host ("  " + $programmZip) -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Erst Menuepunkt 2 (Programm herunterladen) ausfuehren" -ForegroundColor Yellow
    Write-Host "  oder die Datei laut 04-Download-Links dorthin legen." -ForegroundColor Yellow
    Warte-Taste
    return
  }

  $ziel = Frage "1) Wohin soll das Programm auf DIESEN Rechner?" $ZielVorgabe
  $ziel = [Environment]::ExpandEnvironmentVariables($ziel)

  $updateOrdner = Frage "2) Update-Ordner (dort liegt die neue Werkstatt_Kalender_TPM.html)" $WerkstattOrdnerVorgabe
  $datenDatei   = Frage "3) Gemeinsame DATENDATEI" ($updateOrdner.TrimEnd("/", "\") + "/" + $DatenDateiName)
  $stoerDatei   = Frage "4) STOERUNGS-Datei" ($updateOrdner.TrimEnd("/", "\") + "/" + $StoerDateiName)

  # Der Datenordner ist der Ordner der Datendatei - keine eigene Frage noetig.
  $datenOrdner = ($datenDatei -replace "\\", "/")
  $schnitt = $datenOrdner.LastIndexOf("/")
  if ($schnitt -gt 0) { $datenOrdner = $datenOrdner.Substring(0, $schnitt) }
  $updateOrdner = ($updateOrdner -replace "\\", "/")
  $datenDatei   = ($datenDatei   -replace "\\", "/")
  $stoerDatei   = ($stoerDatei   -replace "\\", "/")

  Write-Host ""
  Write-Host ("  " + (Zeile "┌" "─" "┐")) -ForegroundColor DarkGray
  Write-Host ("  │ " + "Zusammenfassung".PadRight($B - 2) + "│") -ForegroundColor White
  foreach ($z in @(
    ("Programm nach:   " + $ziel),
    ("Update-Ordner:   " + $updateOrdner),
    ("Datendatei:      " + $datenDatei),
    ("Datenordner:     " + $datenOrdner),
    ("Stoerungs-Datei: " + $stoerDatei))) {
    if ($z.Length -gt $B - 2) { $z = $z.Substring(0, $B - 5) + "..." }
    Write-Host ("  │ " + $z.PadRight($B - 2) + "│") -ForegroundColor Gray
  }
  Write-Host ("  " + (Zeile "└" "─" "┘")) -ForegroundColor DarkGray
  if (-not $OhneNachfrage) {
    $antwort = Read-Host "  So einrichten? (ja/nein)"
    if ($antwort -ne "ja") { Write-Host "  Abgebrochen - nichts veraendert." -ForegroundColor Yellow; Warte-Taste; return }
  }

  Write-Host ""
  Write-Host "  Entpacke das Programm (ca. 110 MB, dauert einen Moment) ..."
  if (-not (Test-Path -LiteralPath $ziel)) { New-Item -ItemType Directory -Path $ziel -Force | Out-Null }
  Expand-Archive -LiteralPath $programmZip -DestinationPath $ziel -Force

  # Die EXE liegt in der ZIP-Wurzel - zur Sicherheit trotzdem suchen, damit
  # eine kuenftige ZIP-Struktur mit Unterordner die Einrichtung nicht bricht.
  $exe = Get-ChildItem -LiteralPath $ziel -Recurse -Filter "Werkstatt-Cockpit.exe" | Select-Object -First 1
  if (-not $exe) {
    Write-Host "  FEHLER: Nach dem Entpacken keine Werkstatt-Cockpit.exe gefunden." -ForegroundColor Red
    Warte-Taste; return
  }
  Write-Host ("  entpackt: " + $exe.FullName) -ForegroundColor Green

  # Vorbelegung neben die EXE - das Programm uebernimmt beim ersten Start
  # NUR Schluessel, die auf dem Rechner noch nie gesetzt wurden.
  $json = @"
{
  "_was_ist_das": "Vorbelegung fuer diesen Rechner - geschrieben vom BTA-Cockpit-Werkzeug. Es werden NUR Schluessel uebernommen, die auf dem Rechner noch nie gesetzt wurden.",

  "programm:update-ordner": "$updateOrdner",
  "werkstatt-kalender-fs:handle": "$datenDatei",
  "werkstatt-kalender-fs:folder": "$datenOrdner",
  "werkstatt-stoerungen-fs:handle": "$stoerDatei"
}
"@
  $jsonPfad = Join-Path $exe.DirectoryName "standard-einstellungen.json"
  Schreibe-OhneBom $jsonPfad $json
  Write-Host ("  geschrieben: " + $jsonPfad) -ForegroundColor Green

  $desktop = [Environment]::GetFolderPath("Desktop")
  if ($desktop) {
    $schale = New-Object -ComObject WScript.Shell
    $v = $schale.CreateShortcut((Join-Path $desktop "Werkstatt-Cockpit.lnk"))
    $v.TargetPath = $exe.FullName
    $v.WorkingDirectory = $exe.DirectoryName
    $v.IconLocation = $exe.FullName
    $v.Description = "BTA-Cockpit (Werkstatt-Cockpit) starten"
    $v.Save()
    Write-Host ("  Verknuepfung: " + (Join-Path $desktop "Werkstatt-Cockpit.lnk")) -ForegroundColor Green
  } else {
    Write-Host "  Desktop-Ordner nicht gefunden - Verknuepfung bitte von Hand anlegen." -ForegroundColor Yellow
  }

  Write-Host ""
  Write-Host "  Fertig eingerichtet." -ForegroundColor Green
  Write-Host "  Erster Start: Desktop-Verknuepfung doppelklicken. SmartScreen"
  Write-Host "  meldet sich nur beim allerersten Mal: 'Weitere Informationen'"
  Write-Host "  -> 'Trotzdem ausfuehren'."
  Warte-Taste
}

# =============================================================================
#  2 - PROGRAMM HERUNTERLADEN (Release)
# =============================================================================
function Aktion-Herunterladen {
  Zeichne-Kopf "Programm herunterladen"
  Write-Host "  Holt den neuesten veroeffentlichten Stand direkt vom Release:"
  Write-Host ("  " + $ProgrammZipUrl) -ForegroundColor DarkGray
  Write-Host ""
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curl) {
    Write-Host "  Auf diesem Rechner fehlt curl.exe (gehoert seit Windows 10" -ForegroundColor Yellow
    Write-Host "  von Haus aus dazu). Bitte den Download-Weg aus" -ForegroundColor Yellow
    Write-Host "  04-Download-Links\DOWNLOAD-LINKS.txt nehmen." -ForegroundColor Yellow
    Warte-Taste; return
  }
  $zielOrdner = Split-Path -Parent $programmZip
  if (-not (Test-Path -LiteralPath $zielOrdner)) { New-Item -ItemType Directory -Path $zielOrdner -Force | Out-Null }
  if (Test-Path -LiteralPath $programmZip) {
    $alt = (Get-Item -LiteralPath $programmZip).Length
    Write-Host ("  Hinweis: Es liegt schon ein Programm-ZIP hier (" + [Math]::Round($alt/1MB) + " MB).")
    $antwort = Read-Host "  Ueberschreiben und den neuesten Stand holen? (ja/nein)"
    if ($antwort -ne "ja") { Write-Host "  Abgebrochen - nichts veraendert." -ForegroundColor Yellow; Warte-Taste; return }
  }
  Write-Host ""
  Write-Host "  Lade herunter (ca. 110 MB) ..."
  # -L folgt der Release-Weiterleitung, -f macht aus HTTP-Fehlern echte
  # Fehler, -# zeigt den Fortschrittsbalken im Fenster.
  & curl.exe -L -f -# -o $programmZip $ProgrammZipUrl
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $programmZip) -or (Get-Item -LiteralPath $programmZip).Length -lt 10MB) {
    if (Test-Path -LiteralPath $programmZip) { Remove-Item -LiteralPath $programmZip -Force -ErrorAction SilentlyContinue }
    Write-Host ""
    Write-Host "  Der Download hat NICHT geklappt." -ForegroundColor Red
    Write-Host "  Moegliche Gruende: kein Internet an diesem Rechner, die" -ForegroundColor Yellow
    Write-Host "  Firma sperrt GitHub, oder das Release ist noch nicht" -ForegroundColor Yellow
    Write-Host "  veroeffentlicht. Ersatzweg: 04-Download-Links an einem" -ForegroundColor Yellow
    Write-Host "  Rechner mit Internet, Datei dann in 01-Programm legen." -ForegroundColor Yellow
    Warte-Taste; return
  }
  $mb = [Math]::Round((Get-Item -LiteralPath $programmZip).Length / 1MB)
  Write-Host ""
  Write-Host ("  Fertig: " + $mb + " MB liegen in 01-Programm.") -ForegroundColor Green
  Write-Host "  Weiter mit Menuepunkt 1 (Neu einrichten)."
  Warte-Taste
}

# =============================================================================
#  3 - PFADE REPARIEREN
# =============================================================================
function Aktion-Reparieren {
  Zeichne-Kopf "Pfade reparieren"
  $einstellungen = Finde-Einstellungen
  if (-not $einstellungen) {
    Write-Host "  Auf diesem Rechner wurden noch keine gemerkten Einstellungen" -ForegroundColor Yellow
    Write-Host "  gefunden (das Programm lief hier wohl noch nie)." -ForegroundColor Yellow
    Write-Host "  Dann genuegt Menuepunkt 1 - er schreibt die Vorbelegung." -ForegroundColor Yellow
    Warte-Taste; return
  }
  Write-Host "  Gefunden: " -NoNewline
  Write-Host $einstellungen -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "  WICHTIG: Das Cockpit vorher SCHLIESSEN - sonst ueberschreibt" -ForegroundColor Yellow
  Write-Host "  es die Reparatur beim Beenden mit den alten Werten." -ForegroundColor Yellow

  $json = Get-Content -LiteralPath $einstellungen -Raw | ConvertFrom-Json
  $geaendert = $false
  foreach ($s in $PfadSchluessel) {
    $feld = $json.PSObject.Properties[$s.Name]
    $alt = ""
    if ($feld -and $feld.Value) { $alt = [string]$feld.Value }
    $neu = Frage ($s.Titel) $alt
    $neu = ($neu -replace "\\", "/")
    if ($neu -ne $alt) {
      if ($feld) { $feld.Value = $neu }
      else { $json | Add-Member -NotePropertyName $s.Name -NotePropertyValue $neu }
      $geaendert = $true
    }
  }
  if (-not $geaendert) {
    Write-Host ""
    Write-Host "  Nichts geaendert - alles bleibt wie es ist." -ForegroundColor Green
    Warte-Taste; return
  }
  $antwort = Read-Host "  Die geaenderten Pfade jetzt speichern? (ja/nein)"
  if ($antwort -ne "ja") { Write-Host "  Abgebrochen - nichts veraendert." -ForegroundColor Yellow; Warte-Taste; return }
  # Sicherung neben die Datei legen, dann ohne BOM zurueckschreiben -
  # alle uebrigen gemerkten Schluessel bleiben unangetastet.
  Copy-Item -LiteralPath $einstellungen -Destination ($einstellungen + ".sicherung") -Force
  Schreibe-OhneBom $einstellungen (ConvertTo-Json $json -Depth 10)
  Write-Host ""
  Write-Host "  Gespeichert. Eine Sicherung der alten Datei liegt daneben" -ForegroundColor Green
  Write-Host ("  (" + $einstellungen + ".sicherung).") -ForegroundColor DarkGray
  Write-Host "  Beim naechsten Start nutzt das Cockpit die neuen Pfade."
  Warte-Taste
}

# =============================================================================
#  4 - VERBINDUNG PRUEFEN
# =============================================================================
function Aktion-Pruefen {
  Zeichne-Kopf "Verbindung pruefen"
  $lage = Lies-Pfade
  Write-Host ("  Geprueft werden: " + $lage.Quelle)
  Write-Host ""
  foreach ($s in $PfadSchluessel) {
    $wert = $lage.Werte[$s.Name]
    Write-Host ("  " + $s.Titel)
    Write-Host ("     " + $wert) -ForegroundColor DarkGray
    $ok = $false
    try { $ok = Test-Path -LiteralPath $wert } catch { $ok = $false }
    if ($ok) { Write-Host "     erreichbar" -ForegroundColor Green }
    else     { Write-Host "     NICHT erreichbar" -ForegroundColor Red }
  }
  # Schreibprobe im Datenordner: ein Nur-Leser-Rechner darf hier ruhig
  # scheitern - das ist dann kein Fehler, sondern seine Rolle.
  $datenOrdner = $lage.Werte["werkstatt-kalender-fs:folder"]
  Write-Host ""
  Write-Host "  Schreibprobe im Datenordner:"
  $probe = Join-Path $datenOrdner ("werkzeug-schreibprobe-" + $env:COMPUTERNAME + ".tmp")
  try {
    Schreibe-OhneBom $probe "Schreibprobe des BTA-Cockpit-Werkzeugs - darf geloescht werden."
    Remove-Item -LiteralPath $probe -Force
    Write-Host "     Schreiben klappt - dieser Rechner kann bearbeiten." -ForegroundColor Green
  } catch {
    Write-Host "     Kein Schreibrecht - als Leser-Rechner voellig in Ordnung," -ForegroundColor Yellow
    Write-Host "     das Cockpit schaltet dann von selbst auf 'nur ansehen'." -ForegroundColor Yellow
  }
  Warte-Taste
}

# =============================================================================
#  5 - VOM RECHNER ENTFERNEN
# =============================================================================
function Aktion-Entfernen {
  Zeichne-Kopf "Vom Rechner entfernen"
  $exe = Finde-Exe
  $verknuepfung = Join-Path ([Environment]::GetFolderPath("Desktop")) "Werkstatt-Cockpit.lnk"
  $einstellungen = Finde-Einstellungen

  Write-Host "  Entfernt wird NUR, was auf DIESEM Rechner liegt - die"
  Write-Host "  gemeinsamen Dateien auf dem Laufwerk bleiben unberuehrt."
  Write-Host ""
  if ($exe) { Write-Host ("  - Programm-Ordner: " + (Split-Path -Parent $exe.FullName)) }
  else      { Write-Host "  - Programm-Ordner: nicht gefunden" -ForegroundColor DarkGray }
  if (Test-Path -LiteralPath $verknuepfung) { Write-Host ("  - Verknuepfung:    " + $verknuepfung) }
  if ($einstellungen) { Write-Host ("  - Gemerkte Einstellungen: " + (Split-Path -Parent $einstellungen)) }
  Write-Host ""
  if (-not $exe -and -not (Test-Path -LiteralPath $verknuepfung) -and -not $einstellungen) {
    Write-Host "  Hier gibt es nichts zu entfernen." -ForegroundColor Green
    Warte-Taste; return
  }
  # Bewusst das Wort tippen lassen - ein "ja" ist bei einem Loeschvorgang
  # zu schnell gegeben.
  $antwort = Read-Host "  Zum Bestaetigen das Wort  entfernen  tippen"
  if ($antwort -ne "entfernen") { Write-Host "  Abgebrochen - nichts veraendert." -ForegroundColor Yellow; Warte-Taste; return }

  if ($exe) {
    Remove-Item -LiteralPath (Split-Path -Parent $exe.FullName) -Recurse -Force
    Write-Host "  Programm-Ordner entfernt." -ForegroundColor Green
  }
  if (Test-Path -LiteralPath $verknuepfung) {
    Remove-Item -LiteralPath $verknuepfung -Force
    Write-Host "  Verknuepfung entfernt." -ForegroundColor Green
  }
  if ($einstellungen) {
    $antwort = Read-Host "  Auch die gemerkten Einstellungen (Pfade) loeschen? (ja/nein)"
    if ($antwort -eq "ja") {
      Remove-Item -LiteralPath (Split-Path -Parent $einstellungen) -Recurse -Force
      Write-Host "  Gemerkte Einstellungen entfernt." -ForegroundColor Green
    } else {
      Write-Host "  Gemerkte Einstellungen bleiben (gut fuer eine Neu-Einrichtung)." -ForegroundColor DarkGray
    }
  }
  Warte-Taste
}

# =============================================================================
#  Hauptmenue mit Pfeiltasten-Auswahl
# =============================================================================
$menue = @(
  @{ Taste = "1"; Text = "Neu einrichten        Programm + Pfade + Verknuepfung"; Aktion = { Aktion-Einrichten } },
  @{ Taste = "2"; Text = "Programm herunterladen   neuester Stand vom Release";   Aktion = { Aktion-Herunterladen } },
  @{ Taste = "3"; Text = "Pfade reparieren      gemerkte Pfade ansehen/aendern";  Aktion = { Aktion-Reparieren } },
  @{ Taste = "4"; Text = "Verbindung pruefen    kommt der Rechner ans Laufwerk?"; Aktion = { Aktion-Pruefen } },
  @{ Taste = "5"; Text = "Vom Rechner entfernen sauber aufraeumen";               Aktion = { Aktion-Entfernen } }
)

function Zeichne-Menue([int]$auswahl) {
  Zeichne-Kopf ""
  # Lagebericht: zwei Zeilen, die sofort sagen, woran man ist.
  $zipDa = Test-Path -LiteralPath $programmZip
  $exe = Finde-Exe
  Write-Host "   Paket:   " -NoNewline -ForegroundColor DarkGray
  if ($zipDa) { Write-Host "Programm-ZIP liegt bereit" -ForegroundColor Green }
  else        { Write-Host "Programm-ZIP fehlt noch (Punkt 2 holt es)" -ForegroundColor Yellow }
  Write-Host "   Rechner: " -NoNewline -ForegroundColor DarkGray
  if ($exe) { Write-Host "Cockpit ist eingerichtet" -ForegroundColor Green }
  else      { Write-Host "Cockpit ist hier noch nicht eingerichtet" -ForegroundColor Yellow }
  Write-Host ""
  for ($i = 0; $i -lt $menue.Count; $i++) {
    $p = $menue[$i]
    $zeile = ("  " + $p.Taste + "  " + $p.Text).PadRight($B)
    if ($i -eq $auswahl) {
      Write-Host "   " -NoNewline
      Write-Host ("▶" + $zeile) -ForegroundColor Black -BackgroundColor Cyan
    } else {
      Write-Host ("    " + $zeile) -ForegroundColor Gray
    }
  }
  Write-Host ""
  Write-Host ("   " + ("─" * $B)) -ForegroundColor DarkGray
  Write-Host "   Pfeiltasten bewegen · Eingabetaste startet · Zahl springt · Esc beendet" -ForegroundColor DarkGray
}

$auswahl = 0
while ($true) {
  Zeichne-Menue $auswahl
  $taste = [Console]::ReadKey($true)
  switch ($taste.Key) {
    "UpArrow"   { $auswahl = ($auswahl - 1 + $menue.Count) % $menue.Count }
    "DownArrow" { $auswahl = ($auswahl + 1) % $menue.Count }
    "Enter"     { & $menue[$auswahl].Aktion }
    "Escape"    { Clear-Host; exit 0 }
    default {
      # Zahlentasten springen direkt zum Punkt und starten ihn.
      $zeichen = [string]$taste.KeyChar
      for ($i = 0; $i -lt $menue.Count; $i++) {
        if ($zeichen -eq $menue[$i].Taste) { $auswahl = $i; & $menue[$i].Aktion }
      }
      if ($zeichen -eq "0") { Clear-Host; exit 0 }
    }
  }
}
