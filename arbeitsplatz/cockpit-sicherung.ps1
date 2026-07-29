# Werkstatt-Cockpit: Sicherung der Datendateien
# =============================================
#
# Warum es das gibt
# -----------------
# Sicherungen gab es bisher nur IM BROWSER jedes Geraets (30 Staende in der
# IndexedDB). Werden die Browser-Daten zurueckgesetzt und ist gleichzeitig die
# gemeinsame Datei beschaedigt, ist der Bestand weg. Dieses Skript legt eine
# zweite, vom Browser unabhaengige Sicherung auf der Platte an.
#
# Es laeuft beim Start des Cockpits automatisch mit und braucht Sekunden.
#
# Wichtigste Regel: EINE BESCHAEDIGTE DATEI WIRD NICHT GESICHERT.
# Sonst wuerde ein Torso nach und nach die guten Staende aus der Rotation
# draengen - und die Sicherung waere genau dann wertlos, wenn man sie braucht.
#
# Zurueckholen:  powershell -File cockpit-sicherung.ps1 -Zurueckholen

param(
  [string]$Ordner = "\\scheudc1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender",
  [string]$Ziel = "",          # leer = Unterordner "Sicherungen" beim Datenordner
  [int]$Tage = 60,             # aeltere Sicherungen werden entfernt
  [switch]$Zurueckholen,
  [switch]$Gruendlich,         # zusaetzlich vollstaendig als JSON einlesen (langsamer)
  [switch]$Leise               # fuer den Aufruf aus dem Starter heraus
)

$ErrorActionPreference = "Stop"
function Sag($text, $farbe = "Gray") { if (-not $Leise) { Write-Host $text -ForegroundColor $farbe } }
function Groesse($bytes) {
  if ($bytes -lt 1024) { return "$bytes Bytes" }
  return ([math]::Round($bytes / 1KB)).ToString() + " KB"
}

# ---------------------------------------------------------------------------
# Ist die Datei vollstaendig?
#
# Die schnelle Pruefung erkennt genau das, was in der Praxis passiert: eine
# mitten im Schreiben abgebrochene Datei hoert vor der schliessenden Klammer
# auf, oder sie ist leer. Das kostet Millisekunden. Die vollstaendige Pruefung
# (-Gruendlich) liest zusaetzlich das ganze JSON ein - richtiger, aber bei
# mehreren Megabyte spuerbar langsamer, und der Starter soll morgens nicht
# warten muessen.
# ---------------------------------------------------------------------------
function Ist-Vollstaendig($pfad) {
  try {
    $roh = [System.IO.File]::ReadAllText($pfad)
  } catch { return @{ ok = $false; grund = "nicht lesbar" } }

  $t = $roh.Trim()
  if ($t.Length -eq 0) { return @{ ok = $false; grund = "leer (0 Zeichen)" } }
  $auf = $t.Substring(0, 1)
  $zu  = $t.Substring($t.Length - 1, 1)
  if (-not (($auf -eq "{" -and $zu -eq "}") -or ($auf -eq "[" -and $zu -eq "]"))) {
    return @{ ok = $false; grund = "unvollstaendig (endet mit '$zu')" }
  }
  if ($Gruendlich) {
    try { $null = $roh | ConvertFrom-Json }
    catch { return @{ ok = $false; grund = "kein gueltiges JSON" } }
  }
  return @{ ok = $true; zeichen = $t.Length }
}

function Hash-Von($pfad) {
  try { return (Get-FileHash -LiteralPath $pfad -Algorithm SHA256).Hash } catch { return "" }
}

# Den Ordner mit den Datendateien finden.
#
# In der Werkstatt liegen App und Daten NICHT im selben Ordner: die App auf dem
# Firmenlaufwerk, die JSON-Dateien in OneDrive. Wer hier stur den uebergebenen
# Ordner nimmt, sichert einen Ordner ohne Daten - und merkt es nicht, weil
# "0 gesichert" wie ein ruhiger Tag aussieht.
#
# Gesucht wird deshalb der Reihe nach: der uebergebene Ordner, der Ordner
# dieses Skripts, dessen Elternordner. Das deckt beide Ablagen ab - Paket im
# Datenordner und Paket in einem Unterordner davon.
function Hat-Daten($pfad) {
  if (-not $pfad) { return $false }
  if (-not (Test-Path -LiteralPath $pfad)) { return $false }
  return @(Get-ChildItem -LiteralPath $pfad -Filter "werkstatt-*.json" -File -ErrorAction SilentlyContinue).Count -gt 0
}

$skriptOrdner = Split-Path -Parent $MyInvocation.MyCommand.Path
$elternOrdner = Split-Path -Parent $skriptOrdner
if (-not (Hat-Daten $Ordner)) {
  foreach ($k in @($skriptOrdner, $elternOrdner)) {
    if (Hat-Daten $k) {
      Sag ("  Datendateien nicht im angegebenen Ordner - gefunden in: " + $k) "Yellow"
      $Ordner = $k
      break
    }
  }
}

if (-not (Test-Path -LiteralPath $Ordner)) {
  Sag "" ; Sag "  Der Datenordner ist nicht erreichbar:" "Red"; Sag "  $Ordner" "Red"
  if (-not $Leise) { Read-Host "  Mit Eingabetaste schliessen" }
  exit 1
}

# Ablageort bestimmen. Bevorzugt neben den Daten - dort liegt die Sicherung
# fuer alle sichtbar. Geht das nicht (fehlende Rechte), dann lokal, damit
# ueberhaupt gesichert wird statt gar nicht.
if (-not $Ziel) { $Ziel = Join-Path $Ordner "Sicherungen" }
try {
  if (-not (Test-Path -LiteralPath $Ziel)) { New-Item -ItemType Directory -Path $Ziel -Force | Out-Null }
  $probe = Join-Path $Ziel ".schreibprobe"
  [System.IO.File]::WriteAllText($probe, "x"); Remove-Item -LiteralPath $probe -Force
} catch {
  # Dieser Zweig ist kein Sonderfall: Freigaben, die keine Skripte zulassen,
  # verbieten oft auch das Anlegen von Ordnern. Dann muss die Sicherung
  # trotzdem stattfinden - lokal statt zentral, aber sie findet statt.
  $heim = $env:USERPROFILE
  if (-not $heim) { $heim = $HOME }
  if (-not $heim) { $heim = [System.IO.Path]::GetTempPath() }
  $Ziel = Join-Path $heim "Cockpit-Sicherungen"
  Sag "  Im Datenordner kann nicht angelegt werden - es wird lokal gesichert:" "Yellow"
  Sag "  $Ziel" "Yellow"
  if (-not (Test-Path -LiteralPath $Ziel)) { New-Item -ItemType Directory -Path $Ziel -Force | Out-Null }
}

# ===========================================================================
#  Zurueckholen
# ===========================================================================
if ($Zurueckholen) {
  Write-Host ""
  Write-Host "  Werkstatt-Cockpit - Sicherung zurueckholen" -ForegroundColor White
  Write-Host "  ------------------------------------------"
  Write-Host ""

  $staende = Get-ChildItem -LiteralPath $Ziel -Directory -ErrorAction SilentlyContinue |
             Sort-Object Name -Descending
  if (-not $staende) {
    Write-Host "  Es gibt noch keine Sicherungen in:" -ForegroundColor Yellow
    Write-Host "  $Ziel"
    Read-Host "  Mit Eingabetaste schliessen"; exit 0
  }

  $i = 0
  $liste = @()
  foreach ($s in $staende) {
    $i++
    $dateien = Get-ChildItem -LiteralPath $s.FullName -Filter "*.json" -File
    $summe = ($dateien | Measure-Object -Property Length -Sum).Sum
    $liste += [pscustomobject]@{ Nr = $i; Pfad = $s.FullName; Name = $s.Name; Anzahl = $dateien.Count; KB = [math]::Round($summe / 1KB) }
    Write-Host ("  [{0,2}]  {1}   {2} Datei(en), {3} KB" -f $i, $s.Name, $dateien.Count, [math]::Round($summe / 1KB))
  }
  Write-Host ""
  $wahl = Read-Host "  Welchen Stand zurueckholen? (Nummer, oder Eingabetaste zum Abbrechen)"
  if (-not $wahl) { Write-Host "  Abgebrochen."; exit 0 }
  $gewaehlt = $liste | Where-Object { $_.Nr -eq [int]$wahl }
  if (-not $gewaehlt) { Write-Host "  Ungueltige Auswahl." -ForegroundColor Red; Read-Host; exit 1 }

  Write-Host ""
  Write-Host "  Der aktuelle Stand wird vorher als *.vor-wiederherstellung gesichert." -ForegroundColor Yellow
  $sicher = Read-Host "  Wirklich zurueckholen? (ja/nein)"
  if ($sicher -ne "ja") { Write-Host "  Abgebrochen."; exit 0 }

  foreach ($d in Get-ChildItem -LiteralPath $gewaehlt.Pfad -Filter "*.json" -File) {
    $zielDatei = Join-Path $Ordner $d.Name
    if (Test-Path -LiteralPath $zielDatei) {
      $rettung = "$zielDatei.vor-wiederherstellung"
      Copy-Item -LiteralPath $zielDatei -Destination $rettung -Force
      Write-Host ("  aktueller Stand gesichert: " + (Split-Path $rettung -Leaf)) -ForegroundColor DarkGray
    }
    Copy-Item -LiteralPath $d.FullName -Destination $zielDatei -Force
    Write-Host ("  zurueckgeholt: " + $d.Name) -ForegroundColor Green
  }
  Write-Host ""
  Write-Host "  Fertig. Das Cockpit bitte neu laden." -ForegroundColor Green
  Read-Host "  Mit Eingabetaste schliessen"
  exit 0
}

# ===========================================================================
#  Sichern
# ===========================================================================
Sag ""
Sag "  Sicherung der Cockpit-Daten" "White"

$heute = Get-Date -Format "yyyy-MM-dd"
$tagesordner = Join-Path $Ziel $heute
$gesichert = 0; $uebersprungen = 0; $abgelehnt = 0

$quellen = Get-ChildItem -LiteralPath $Ordner -Filter "*.json" -File -ErrorAction SilentlyContinue |
           Where-Object { $_.Length -lt 50MB }

foreach ($q in $quellen) {
  $pruefung = Ist-Vollstaendig $q.FullName
  if (-not $pruefung.ok) {
    Sag ("  UEBERSPRUNGEN (" + $pruefung.grund + "): " + $q.Name) "Red"
    $abgelehnt++
    continue
  }

  # Gibt es schon eine inhaltsgleiche Sicherung? Dann nicht doppelt ablegen -
  # sonst stehen nach zwei Monaten 60 identische Kopien herum.
  $neueste = Get-ChildItem -LiteralPath $Ziel -Directory -ErrorAction SilentlyContinue |
             Sort-Object Name -Descending |
             ForEach-Object { Join-Path $_.FullName $q.Name } |
             Where-Object { Test-Path -LiteralPath $_ } |
             Select-Object -First 1
  if ($neueste -and (Hash-Von $neueste) -eq (Hash-Von $q.FullName)) {
    $uebersprungen++
    continue
  }

  if (-not (Test-Path -LiteralPath $tagesordner)) { New-Item -ItemType Directory -Path $tagesordner -Force | Out-Null }
  $zielDatei = Join-Path $tagesordner $q.Name
  if (Test-Path -LiteralPath $zielDatei) {
    # Schon eine Sicherung von heute, aber mit anderem Inhalt: beide behalten.
    $zielDatei = Join-Path $tagesordner ($q.BaseName + "_" + (Get-Date -Format "HHmm") + $q.Extension)
  }
  Copy-Item -LiteralPath $q.FullName -Destination $zielDatei -Force
  Sag ("  gesichert: " + $q.Name + "  (" + (Groesse $q.Length) + ")") "Green"
  $gesichert++
}

# Alte Staende entfernen
$grenze = (Get-Date).AddDays(-$Tage)
$weg = 0
Get-ChildItem -LiteralPath $Ziel -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  # Bewusst mit try/catch statt TryParseExact: Letzteres braucht eine als
  # datetime typisierte Referenzvariable, sonst findet PowerShell die
  # Ueberladung nicht - und die Rotation lief still gar nicht. Genau so war
  # es hier, gefunden vom Test, nicht im Betrieb.
  $name = $_.Name
  if ($name.Length -lt 10) { return }
  try {
    $d = [datetime]::ParseExact($name.Substring(0, 10), "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
  } catch { return }
  if ($d -lt $grenze) {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    $weg++
  }
}

$staendeGesamt = (Get-ChildItem -LiteralPath $Ziel -Directory -ErrorAction SilentlyContinue).Count
Sag ("  " + $gesichert + " neu, " + $uebersprungen + " unveraendert, " + $abgelehnt + " abgelehnt, " +
     $weg + " alte entfernt - insgesamt " + $staendeGesamt + " Staende") "Gray"
Sag ("  Ablage: " + $Ziel) "DarkGray"
Sag ""

if ($abgelehnt -gt 0 -and -not $Leise) {
  Write-Host "  ACHTUNG: Mindestens eine Datei ist unvollstaendig und wurde NICHT gesichert." -ForegroundColor Red
  Write-Host "  Das ist Absicht - eine beschaedigte Datei darf die guten Staende nicht verdraengen." -ForegroundColor Red
  Write-Host ""
}
exit 0
