# BTA-Cockpit: Das Werkzeug - jetzt als richtiges Fenster-Programm
# =================================================================
#
# Robertos Wunsch vom 17.09., zweite Runde: weg von der schwarzen
# CMD-Umgebung, hin zu einem echten Fenster. Umgesetzt mit WinForms -
# das steckt in jedem Windows, es wird nichts installiert und es sind
# keine Adminrechte noetig. Ein Fenster, vier Pfad-Felder mit
# Durchsuchen-Knoepfen, fuenf Aktionen, unten ein Verlaufsfeld.
#
# Die Aktionen decken den ganzen Lebenslauf eines Rechners ab:
#   Einrichten     entpacken, Pfade vorbelegen, Desktop-Verknuepfung
#   Herunterladen  neuester Programm-Stand direkt vom Release
#   Pruefen        kommt dieser Rechner an die vier Pfade heran?
#   Speichern      die GEMERKTEN Pfade des Programms aendern
#   Entfernen      Rechner sauber abraeumen (Laufwerk bleibt tabu)
#
# WICHTIG fuer Bearbeiter: Die JSON-Dateien, die das Skript SCHREIBT,
# sind bewusst OHNE BOM - das Programm liest sie mit JSON.parse, und
# eine BOM-Markierung liesse das Einlesen stillschweigend scheitern.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

# ---- Feste Werte (Werkstatt Scheurich) --------------------------------------
$WerkstattOrdnerVorgabe = "//SCHEUDC1/PSG_Gruppe/16_Technik/01_Scheurich/02_Werkstatt/Arbeitsplanung/Werkstatt_Kalender"
$DatenDateiName = "kalender-daten.json"
$StoerDateiName = "werkstatt-stoerungen.json"
$ZielVorgabe    = Join-Path $env:LOCALAPPDATA "Werkstatt-Cockpit"
# Fester Release-Link: zeigt immer auf den neuesten veroeffentlichten Stand.
$ProgrammZipUrl = "https://github.com/ciraciroberto90-debug/WerkstattKalender/releases/latest/download/Werkstatt-Cockpit-Programm-win64.zip"

$hier  = Split-Path -Parent $MyInvocation.MyCommand.Path   # ...\werkzeug
$paket = Split-Path -Parent $hier                          # Paket-Wurzel
$programmZip = Join-Path $paket "01-Programm\Werkstatt-Cockpit-Programm-win64.zip"

# =============================================================================
#  Lage-Helfer (identisch zur App-Logik in programm/main.js)
# =============================================================================
$script:exeMerker = $null
function Finde-Exe {
  # Robertos Ansage vom 17.09.: Desktop UND AppData durchsuchen und DANN
  # entscheiden - einige Rechner haben den Ordner woanders liegen. Bei
  # mehreren Funden gewinnt die zuletzt veraenderte EXE (die aktuelle
  # Fassung). Eine einmal gefundene EXE wird gemerkt und nur noch gegen
  # die Platte geprueft - die Suche kostet sonst bei jeder Statuszeile Zeit.
  if ($script:exeMerker -and (Test-Path -LiteralPath $script:exeMerker)) {
    return (Get-Item -LiteralPath $script:exeMerker)
  }
  $script:exeMerker = $null
  $treffer = Finde-Exe-Alle
  if ($treffer.Count -gt 0) {
    $beste = $treffer | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $script:exeMerker = $beste.FullName
    return $beste
  }
  return $null
}
function Verknuepfungs-Ziel([string]$lnkPfad) {
  # Wohin zeigt eine Verknuepfung? Leerer Text, wenn nicht lesbar.
  try { return [string]((New-Object -ComObject WScript.Shell).CreateShortcut($lnkPfad).TargetPath) } catch { return "" }
}
function Finde-Exe-Alle {
  # Alle LOKALEN Kopien der EXE einsammeln - Grundlage fuer Status und
  # fuer 'Vom Rechner entfernen'. Robertos Fund vom 17.09.: Seine
  # Verknuepfung hiess 'Werkstatt-Cockpit - KHB', nicht Standardname -
  # deshalb werden die Ziele ALLER Cockpit-Verknuepfungen verfolgt,
  # nicht nur die eine mit dem Standardnamen. Netz-Ziele zaehlen hier
  # nicht mit (dort wird nie geloescht, siehe Finde-NetzStart).
  $treffer = @()
  foreach ($lnk in (Finde-Verknuepfungen)) {
    $zielPfad = Verknuepfungs-Ziel $lnk.FullName
    if ($zielPfad -and ($zielPfad -like "*Werkstatt-Cockpit.exe") -and ($zielPfad -notlike "\\*") -and ($zielPfad -notlike "//*")) {
      if (Test-Path -LiteralPath $zielPfad) { $treffer += @(Get-Item -LiteralPath $zielPfad) }
    }
  }
  $suchorte = @()
  try { $suchorte += [Environment]::GetFolderPath("Desktop") } catch { }
  $suchorte += @($env:LOCALAPPDATA, $env:APPDATA)
  foreach ($ort in $suchorte) {
    if ($ort -and (Test-Path -LiteralPath $ort)) {
      $treffer += @(Get-ChildItem -LiteralPath $ort -Recurse -Depth 3 -Filter "Werkstatt-Cockpit.exe" -File -ErrorAction SilentlyContinue)
    }
  }
  return @($treffer | Sort-Object FullName -Unique)
}
function Finde-NetzStart {
  # Gibt es eine Verknuepfung, deren Ziel eine Cockpit-EXE auf dem
  # LAUFWERK ist? Dann startet dieser Rechner das Programm vom Netz -
  # das ist ein eingerichteter Zustand, nur eben ohne lokalen Ordner.
  foreach ($lnk in (Finde-Verknuepfungen)) {
    $zielPfad = Verknuepfungs-Ziel $lnk.FullName
    if ($zielPfad -and ($zielPfad -like "*Werkstatt-Cockpit.exe") -and (($zielPfad -like "\\*") -or ($zielPfad -like "//*"))) {
      return $zielPfad
    }
  }
  return $null
}
function Finde-Verknuepfungen {
  # Alle Verknuepfungen einsammeln, die zum Cockpit gehoeren - auch alte
  # mit anderen Namen, solange ihr Ziel die Cockpit-EXE ist. Durchsucht
  # werden Desktop und das Startmenue DES BENUTZERS (das gemeinsame
  # Startmenue braucht Adminrechte und bleibt darum aussen vor).
  $funde = @()
  $orte = @()
  try { $orte += [Environment]::GetFolderPath("Desktop") } catch { }
  try { $orte += [Environment]::GetFolderPath("StartMenu") } catch { }
  $schale = New-Object -ComObject WScript.Shell
  foreach ($ort in $orte) {
    if (-not ($ort -and (Test-Path -LiteralPath $ort))) { continue }
    foreach ($lnk in @(Get-ChildItem -LiteralPath $ort -Recurse -Depth 2 -Filter "*.lnk" -File -ErrorAction SilentlyContinue)) {
      $passt = ($lnk.BaseName -like "*Cockpit*")
      if (-not $passt) {
        try { $passt = ($schale.CreateShortcut($lnk.FullName).TargetPath -like "*Werkstatt-Cockpit.exe") } catch { }
      }
      if ($passt) { $funde += $lnk }
    }
  }
  return @($funde | Sort-Object FullName -Unique)
}
function Finde-Einstellungen {
  # Die GEMERKTEN Pfade des Programms liegen in einstellungen.json unter
  # dem Benutzerprofil. Der Ordnername haengt vom Electron-Programmnamen
  # ab - beide Schreibweisen pruefen und nehmen, was wirklich da ist.
  foreach ($ordner in @("Werkstatt-Cockpit", "werkstatt-cockpit")) {
    $p = Join-Path (Join-Path $env:APPDATA $ordner) "einstellungen.json"
    if (Test-Path -LiteralPath $p) { return $p }
  }
  return $null
}
function Schreibe-OhneBom([string]$pfad, [string]$inhalt) {
  [System.IO.File]::WriteAllText($pfad, $inhalt, (New-Object System.Text.UTF8Encoding($false)))
}
function Datenordner-Aus([string]$datenDatei) {
  # Der Datenordner ist der Ordner der Datendatei - kein eigenes Feld noetig.
  $o = ($datenDatei -replace "\\", "/")
  $schnitt = $o.LastIndexOf("/")
  if ($schnitt -gt 0) { return $o.Substring(0, $schnitt) }
  return $o
}

# =============================================================================
#  Das Fenster
# =============================================================================
$fenster = New-Object System.Windows.Forms.Form
$fenster.Text = "BTA-Cockpit - Werkzeug"
$fenster.ClientSize = New-Object System.Drawing.Size(640, 600)
$fenster.FormBorderStyle = "FixedSingle"
$fenster.MaximizeBox = $false
$fenster.StartPosition = "CenterScreen"
$fenster.BackColor = [System.Drawing.Color]::White
$fenster.Font = New-Object System.Drawing.Font("Segoe UI", 9.75)

$dunkel = [System.Drawing.Color]::FromArgb(44, 49, 55)
$gruen  = [System.Drawing.Color]::FromArgb(31, 122, 61)
$orange = [System.Drawing.Color]::FromArgb(176, 108, 0)
$rot    = [System.Drawing.Color]::FromArgb(192, 57, 43)

$lblTitel = New-Object System.Windows.Forms.Label
$lblTitel.Text = "BTA-Cockpit"
$lblTitel.Font = New-Object System.Drawing.Font("Segoe UI", 19, [System.Drawing.FontStyle]::Bold)
$lblTitel.ForeColor = $dunkel
$lblTitel.Location = New-Object System.Drawing.Point(18, 12)
$lblTitel.AutoSize = $true

$lblUnter = New-Object System.Windows.Forms.Label
$lblUnter.Text = "Einrichtung und Werkzeug fuer diesen Rechner"
$lblUnter.ForeColor = [System.Drawing.Color]::Gray
$lblUnter.Location = New-Object System.Drawing.Point(21, 52)
$lblUnter.AutoSize = $true

$lblPaket = New-Object System.Windows.Forms.Label
$lblPaket.Location = New-Object System.Drawing.Point(21, 80)
$lblPaket.AutoSize = $true
$lblRechner = New-Object System.Windows.Forms.Label
$lblRechner.Location = New-Object System.Drawing.Point(21, 102)
$lblRechner.AutoSize = $true

# ---- Pfad-Felder mit Durchsuchen-Knoepfen -----------------------------------
$rahmen = New-Object System.Windows.Forms.GroupBox
$rahmen.Text = " Die Pfade (Vorschlaege passen fuer die Werkstatt Scheurich) "
$rahmen.Location = New-Object System.Drawing.Point(18, 130)
$rahmen.Size = New-Object System.Drawing.Size(604, 185)
$rahmen.ForeColor = $dunkel

function Neue-PfadZeile([int]$y, [string]$beschriftung) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $beschriftung
  $l.Location = New-Object System.Drawing.Point(12, ($y + 4))
  $l.Size = New-Object System.Drawing.Size(150, 20)
  $t = New-Object System.Windows.Forms.TextBox
  $t.Location = New-Object System.Drawing.Point(165, $y)
  $t.Size = New-Object System.Drawing.Size(330, 24)
  $k = New-Object System.Windows.Forms.Button
  $k.Text = "Waehlen..."
  $k.Location = New-Object System.Drawing.Point(503, ($y - 1))
  $k.Size = New-Object System.Drawing.Size(88, 26)
  $k.FlatStyle = "System"
  $rahmen.Controls.AddRange(@($l, $t, $k))
  return @{ Feld = $t; Knopf = $k }
}
$zZiel   = Neue-PfadZeile 28  "Programm-Ordner hier:"
$zUpdate = Neue-PfadZeile 66  "Update-Ordner:"
$zDaten  = Neue-PfadZeile 104 "Datendatei:"
$zStoer  = Neue-PfadZeile 142 "Stoerungs-Datei:"

function Waehle-Ordner([System.Windows.Forms.TextBox]$feld) {
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = "Ordner waehlen"
  try { if ($feld.Text) { $d.SelectedPath = ($feld.Text -replace "/", "\") } } catch { }
  if ($d.ShowDialog($fenster) -eq "OK") { $feld.Text = ($d.SelectedPath -replace "\\", "/") }
}
function Waehle-Datei([System.Windows.Forms.TextBox]$feld) {
  $d = New-Object System.Windows.Forms.OpenFileDialog
  $d.Filter = "Datendateien (*.json)|*.json|Alle Dateien (*.*)|*.*"
  $d.CheckFileExists = $false   # eine noch nicht angelegte Datei ist erlaubt
  try { if ($feld.Text) { $d.InitialDirectory = ((Datenordner-Aus $feld.Text) -replace "/", "\") } } catch { }
  if ($d.ShowDialog($fenster) -eq "OK") { $feld.Text = ($d.FileName -replace "\\", "/") }
}
$zZiel.Knopf.Add_Click({ Waehle-Ordner $zZiel.Feld })
$zUpdate.Knopf.Add_Click({ Waehle-Ordner $zUpdate.Feld })
$zDaten.Knopf.Add_Click({ Waehle-Datei $zDaten.Feld })
$zStoer.Knopf.Add_Click({ Waehle-Datei $zStoer.Feld })

# ---- Aktions-Knoepfe ---------------------------------------------------------
function Neuer-Knopf([int]$x, [int]$y, [int]$breite, [string]$text) {
  $k = New-Object System.Windows.Forms.Button
  $k.Text = $text
  $k.Location = New-Object System.Drawing.Point($x, $y)
  $k.Size = New-Object System.Drawing.Size($breite, 34)
  $k.FlatStyle = "Flat"
  $k.BackColor = [System.Drawing.Color]::FromArgb(240, 242, 244)
  $k.ForeColor = $dunkel
  $k.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(200, 204, 208)
  $fenster.Controls.Add($k)
  return $k
}
$kEinrichten = Neuer-Knopf 18 328 196 "Einrichten"
$kEinrichten.BackColor = $gruen
$kEinrichten.ForeColor = [System.Drawing.Color]::White
$kEinrichten.FlatAppearance.BorderColor = $gruen
$kEinrichten.Font = New-Object System.Drawing.Font("Segoe UI", 9.75, [System.Drawing.FontStyle]::Bold)
$kLaden     = Neuer-Knopf 222 328 196 "Programm herunterladen"
$kPruefen   = Neuer-Knopf 426 328 196 "Verbindung pruefen"
$kSpeichern = Neuer-Knopf 222 368 196 "Pfade speichern"
$kEntfernen = Neuer-Knopf 426 368 196 "Vom Rechner entfernen"

# ---- Fortschritt + Verlauf ---------------------------------------------------
$balken = New-Object System.Windows.Forms.ProgressBar
$balken.Location = New-Object System.Drawing.Point(18, 414)
$balken.Size = New-Object System.Drawing.Size(480, 12)
$balken.Style = "Marquee"
$balken.Visible = $false

$lblFortschritt = New-Object System.Windows.Forms.Label
$lblFortschritt.Location = New-Object System.Drawing.Point(506, 408)
$lblFortschritt.Size = New-Object System.Drawing.Size(116, 20)
$lblFortschritt.TextAlign = "MiddleRight"
$lblFortschritt.ForeColor = [System.Drawing.Color]::Gray

$logFeld = New-Object System.Windows.Forms.TextBox
$logFeld.Location = New-Object System.Drawing.Point(18, 434)
$logFeld.Size = New-Object System.Drawing.Size(604, 150)
$logFeld.Multiline = $true
$logFeld.ReadOnly = $true
$logFeld.ScrollBars = "Vertical"
$logFeld.Font = New-Object System.Drawing.Font("Consolas", 9)
$logFeld.BackColor = [System.Drawing.Color]::FromArgb(30, 33, 36)
$logFeld.ForeColor = [System.Drawing.Color]::Gainsboro

$fenster.Controls.AddRange(@($lblTitel, $lblUnter, $lblPaket, $lblRechner, $rahmen, $balken, $lblFortschritt, $logFeld))

function Schreibe-Log([string]$text) {
  $logFeld.AppendText($text + [Environment]::NewLine)
  [System.Windows.Forms.Application]::DoEvents()
}
function Melde([string]$text, [string]$titel = "BTA-Cockpit") {
  [void][System.Windows.Forms.MessageBox]::Show($fenster, $text, $titel, "OK", "Information")
}
function Frage-JaNein([string]$text, [string]$titel = "BTA-Cockpit") {
  return ([System.Windows.Forms.MessageBox]::Show($fenster, $text, $titel, "YesNo", "Question") -eq "Yes")
}
function Aktualisiere-Status {
  if (Test-Path -LiteralPath $programmZip) {
    $lblPaket.Text = "Paket:  Programm-ZIP liegt bereit"; $lblPaket.ForeColor = $gruen
  } else {
    $lblPaket.Text = "Paket:  Programm-ZIP fehlt noch - 'Programm herunterladen' holt es"; $lblPaket.ForeColor = $orange
  }
  $exeStatus = Finde-Exe
  if ($exeStatus) {
    $lblRechner.Text = "Rechner:  Cockpit ist eingerichtet"; $lblRechner.ForeColor = $gruen
  } elseif (Finde-NetzStart) {
    # Kein lokaler Ordner, aber eine Verknuepfung aufs Laufwerk: dieser
    # Rechner startet das Cockpit vom Netz - auch ein eingerichteter
    # Zustand, nur eben ohne eigene Kopie.
    $lblRechner.Text = "Rechner:  Cockpit startet vom Laufwerk (Verknuepfung)"; $lblRechner.ForeColor = $gruen
  } elseif (Finde-Einstellungen) {
    # Es gibt gemerkte Einstellungen, aber weder Verknuepfung noch
    # Standardort fuehren zu einer EXE: das Cockpit lief hier schon,
    # sein Ordner ist nur von hier aus nicht auffindbar.
    $lblRechner.Text = "Rechner:  Cockpit lief hier schon - Programm-Ordner nicht auffindbar"; $lblRechner.ForeColor = $orange
  } else {
    $lblRechner.Text = "Rechner:  Cockpit ist hier noch nicht eingerichtet"; $lblRechner.ForeColor = $orange
  }
}
function Arbeit-Beginnt { $balken.Visible = $true;  [System.Windows.Forms.Application]::DoEvents() }
function Arbeit-Fertig  { $balken.Visible = $false; $lblFortschritt.Text = ""; Aktualisiere-Status }

# =============================================================================
#  Aktion: EINRICHTEN
# =============================================================================
$kEinrichten.Add_Click({
  try {
    if (-not (Test-Path -LiteralPath $programmZip)) {
      Schreibe-Log "Das Programm-ZIP fehlt noch - erst 'Programm herunterladen' druecken"
      Schreibe-Log "oder die Datei laut 04-Download-Links in 01-Programm legen."
      Melde "Das Programm-ZIP fehlt noch.`n`nErst 'Programm herunterladen' druecken (holt den neuesten Stand vom Release) oder die Datei laut 04-Download-Links in den Ordner 01-Programm legen."
      return
    }
    $ziel = [Environment]::ExpandEnvironmentVariables($zZiel.Feld.Text.Trim())
    $updateOrdner = ($zUpdate.Feld.Text.Trim() -replace "\\", "/")
    $datenDatei   = ($zDaten.Feld.Text.Trim()  -replace "\\", "/")
    $stoerDatei   = ($zStoer.Feld.Text.Trim()  -replace "\\", "/")
    if (-not $ziel -or -not $updateOrdner -or -not $datenDatei -or -not $stoerDatei) {
      Melde "Bitte alle vier Pfad-Felder ausfuellen (die Vorschlaege stehen schon drin)."
      return
    }
    $datenOrdner = Datenordner-Aus $datenDatei
    $frage = "So einrichten?`n`nProgramm nach:`n  $ziel`n`nUpdate-Ordner:`n  $updateOrdner`nDatendatei:`n  $datenDatei`nStoerungs-Datei:`n  $stoerDatei"
    if (-not (Frage-JaNein $frage "Einrichten")) { Schreibe-Log "Abgebrochen - nichts veraendert."; return }

    Arbeit-Beginnt
    Schreibe-Log "Entpacke das Programm (ca. 110 MB, dauert einen Moment) ..."
    if (-not (Test-Path -LiteralPath $ziel)) { New-Item -ItemType Directory -Path $ziel -Force | Out-Null }
    # Das Entpacken laeuft in einem Nebenlauf, damit das Fenster nicht einfriert.
    $auftrag = Start-Job -ScriptBlock {
      param($zip, $ziel)
      Expand-Archive -LiteralPath $zip -DestinationPath $ziel -Force
    } -ArgumentList $programmZip, $ziel
    while ($auftrag.State -eq "Running") { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 150 }
    $fehler = $null
    if ($auftrag.State -ne "Completed") { $fehler = "Das Entpacken ist fehlgeschlagen." }
    Receive-Job $auftrag -ErrorAction SilentlyContinue -ErrorVariable jobFehler | Out-Null
    Remove-Job $auftrag -Force
    if ($jobFehler) { $fehler = [string]$jobFehler[0] }
    if ($fehler) { throw $fehler }

    # Die EXE liegt in der ZIP-Wurzel - zur Sicherheit trotzdem suchen, damit
    # eine kuenftige ZIP-Struktur mit Unterordner die Einrichtung nicht bricht.
    $exe = Get-ChildItem -LiteralPath $ziel -Recurse -Filter "Werkstatt-Cockpit.exe" | Select-Object -First 1
    if (-not $exe) { throw "Nach dem Entpacken wurde keine Werkstatt-Cockpit.exe gefunden." }
    $script:exeMerker = $exe.FullName   # frisch eingerichtet = ab jetzt der massgebliche Ort
    Schreibe-Log ("entpackt: " + $exe.FullName)

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
    Schreibe-Log ("geschrieben: " + $jsonPfad)

    $desktop = [Environment]::GetFolderPath("Desktop")
    if ($desktop) {
      $schale = New-Object -ComObject WScript.Shell
      $v = $schale.CreateShortcut((Join-Path $desktop "Werkstatt-Cockpit.lnk"))
      $v.TargetPath = $exe.FullName
      $v.WorkingDirectory = $exe.DirectoryName
      $v.IconLocation = $exe.FullName
      $v.Description = "BTA-Cockpit (Werkstatt-Cockpit) starten"
      $v.Save()
      Schreibe-Log ("Verknuepfung: " + (Join-Path $desktop "Werkstatt-Cockpit.lnk"))
    } else {
      Schreibe-Log "Desktop-Ordner nicht gefunden - Verknuepfung bitte von Hand anlegen."
    }
    Arbeit-Fertig
    Schreibe-Log "Fertig eingerichtet."
    Melde "Fertig eingerichtet.`n`nErster Start: Desktop-Verknuepfung 'Werkstatt-Cockpit' doppelklicken. Windows-SmartScreen meldet sich nur beim allerersten Mal: 'Weitere Informationen' -> 'Trotzdem ausfuehren'."
  } catch {
    Arbeit-Fertig
    Schreibe-Log ("FEHLER: " + $_)
    Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler"
  }
})

# =============================================================================
#  Aktion: PROGRAMM HERUNTERLADEN
# =============================================================================
$kLaden.Add_Click({
  try {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) {
      Melde "Auf diesem Rechner fehlt curl.exe (gehoert seit Windows 10 dazu).`n`nBitte den Download-Weg aus 04-Download-Links\DOWNLOAD-LINKS.txt nehmen."
      return
    }
    if (Test-Path -LiteralPath $programmZip) {
      $mb = [Math]::Round((Get-Item -LiteralPath $programmZip).Length / 1MB)
      if (-not (Frage-JaNein "Es liegt schon ein Programm-ZIP hier ($mb MB).`n`nUeberschreiben und den neuesten Stand holen?")) { return }
    }
    $zielOrdner = Split-Path -Parent $programmZip
    if (-not (Test-Path -LiteralPath $zielOrdner)) { New-Item -ItemType Directory -Path $zielOrdner -Force | Out-Null }
    Arbeit-Beginnt
    Schreibe-Log "Lade den neuesten Stand vom Release (ca. 110 MB) ..."
    Schreibe-Log $ProgrammZipUrl
    # curl laeuft unsichtbar nebenher; das Fenster zeigt die geladenen MB.
    $lauf = Start-Process -FilePath "curl.exe" -ArgumentList @("-L", "-f", "-sS", "-o", ('"' + $programmZip + '"'), $ProgrammZipUrl) -WindowStyle Hidden -PassThru
    while (-not $lauf.HasExited) {
      if (Test-Path -LiteralPath $programmZip) {
        $mb = [Math]::Round((Get-Item -LiteralPath $programmZip).Length / 1MB)
        $lblFortschritt.Text = "$mb MB"
      }
      [System.Windows.Forms.Application]::DoEvents()
      Start-Sleep -Milliseconds 250
    }
    $gut = ($lauf.ExitCode -eq 0) -and (Test-Path -LiteralPath $programmZip) -and ((Get-Item -LiteralPath $programmZip).Length -gt 10MB)
    if (-not $gut) {
      if (Test-Path -LiteralPath $programmZip) { Remove-Item -LiteralPath $programmZip -Force -ErrorAction SilentlyContinue }
      Arbeit-Fertig
      Schreibe-Log "Der Download hat NICHT geklappt."
      Melde "Der Download hat nicht geklappt.`n`nMoegliche Gruende: kein Internet an diesem Rechner, die Firma sperrt GitHub, oder das Release ist noch nicht veroeffentlicht.`n`nErsatzweg: 04-Download-Links an einem Rechner mit Internet, die Datei dann in 01-Programm legen." "Download"
      return
    }
    $mb = [Math]::Round((Get-Item -LiteralPath $programmZip).Length / 1MB)
    Arbeit-Fertig
    Schreibe-Log ("Fertig: " + $mb + " MB liegen in 01-Programm. Weiter mit 'Einrichten'.")
  } catch {
    Arbeit-Fertig
    Schreibe-Log ("FEHLER: " + $_)
    Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler"
  }
})

# =============================================================================
#  Aktion: VERBINDUNG PRUEFEN
# =============================================================================
$kPruefen.Add_Click({
  try {
    Arbeit-Beginnt
    $datenOrdner = Datenordner-Aus $zDaten.Feld.Text.Trim()
    $pruefliste = @(
      @{ Titel = "Update-Ordner";   Pfad = $zUpdate.Feld.Text.Trim() },
      @{ Titel = "Datendatei";      Pfad = $zDaten.Feld.Text.Trim() },
      @{ Titel = "Datenordner";     Pfad = $datenOrdner },
      @{ Titel = "Stoerungs-Datei"; Pfad = $zStoer.Feld.Text.Trim() }
    )
    Schreibe-Log "Pruefe die Pfade aus den Feldern oben ..."
    $alleGut = $true
    foreach ($p in $pruefliste) {
      $ok = $false
      try { $ok = Test-Path -LiteralPath $p.Pfad } catch { $ok = $false }
      if ($ok) { Schreibe-Log ("  erreichbar:       " + $p.Titel) }
      else     { Schreibe-Log ("  NICHT erreichbar: " + $p.Titel + "  (" + $p.Pfad + ")"); $alleGut = $false }
    }
    # Schreibprobe: ein Nur-Leser-Rechner darf hier ruhig scheitern -
    # das ist dann kein Fehler, sondern seine Rolle.
    $probe = Join-Path $datenOrdner ("werkzeug-schreibprobe-" + $env:COMPUTERNAME + ".tmp")
    try {
      Schreibe-OhneBom $probe "Schreibprobe des BTA-Cockpit-Werkzeugs - darf geloescht werden."
      Remove-Item -LiteralPath $probe -Force
      Schreibe-Log "  Schreibprobe:     klappt - dieser Rechner kann bearbeiten."
    } catch {
      Schreibe-Log "  Schreibprobe:     kein Schreibrecht - als Leser-Rechner in Ordnung"
      Schreibe-Log "                    (das Cockpit schaltet von selbst auf 'nur ansehen')."
    }
    Arbeit-Fertig
    if ($alleGut) { Schreibe-Log "Alle Pfade erreichbar." }
    else { Schreibe-Log "Mindestens ein Pfad ist nicht erreichbar - Pfad pruefen oder Netz/Laufwerk klaeren." }
  } catch {
    Arbeit-Fertig
    Schreibe-Log ("FEHLER: " + $_)
  }
})

# =============================================================================
#  Aktion: PFADE SPEICHERN (Reparatur der gemerkten Einstellungen)
# =============================================================================
$kSpeichern.Add_Click({
  try {
    $updateOrdner = ($zUpdate.Feld.Text.Trim() -replace "\\", "/")
    $datenDatei   = ($zDaten.Feld.Text.Trim()  -replace "\\", "/")
    $stoerDatei   = ($zStoer.Feld.Text.Trim()  -replace "\\", "/")
    $datenOrdner  = Datenordner-Aus $datenDatei
    $einstellungen = Finde-Einstellungen
    if ($einstellungen) {
      if (-not (Frage-JaNein "Die vier Pfade aus den Feldern oben in die GEMERKTEN Einstellungen des Cockpits schreiben?`n`nWICHTIG: Das Cockpit vorher SCHLIESSEN - sonst ueberschreibt es die Aenderung beim Beenden wieder.`n`nEine Sicherung der alten Datei wird daneben abgelegt." "Pfade speichern")) { return }
      $json = Get-Content -LiteralPath $einstellungen -Raw | ConvertFrom-Json
      foreach ($paar in @(
        @{ Name = "programm:update-ordner";         Wert = $updateOrdner },
        @{ Name = "werkstatt-kalender-fs:handle";   Wert = $datenDatei },
        @{ Name = "werkstatt-kalender-fs:folder";   Wert = $datenOrdner },
        @{ Name = "werkstatt-stoerungen-fs:handle"; Wert = $stoerDatei })) {
        $feld = $json.PSObject.Properties[$paar.Name]
        if ($feld) { $feld.Value = $paar.Wert }
        else { $json | Add-Member -NotePropertyName $paar.Name -NotePropertyValue $paar.Wert }
      }
      Copy-Item -LiteralPath $einstellungen -Destination ($einstellungen + ".sicherung") -Force
      Schreibe-OhneBom $einstellungen (ConvertTo-Json $json -Depth 10)
      Schreibe-Log ("Gespeichert: " + $einstellungen)
      Schreibe-Log ("Sicherung:   " + $einstellungen + ".sicherung")
      Schreibe-Log "Beim naechsten Start nutzt das Cockpit die neuen Pfade."
    } else {
      # Noch keine gemerkten Einstellungen: dann als Vorbelegung neben die
      # EXE schreiben (gilt nur fuer noch nie gesetzte Schluessel).
      $exe = Finde-Exe
      if (-not $exe) {
        Melde "Auf diesem Rechner wurden weder gemerkte Einstellungen noch ein eingerichtetes Cockpit gefunden.`n`nDann genuegt der Knopf 'Einrichten' - er schreibt die Pfade gleich mit."
        return
      }
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
      Schreibe-Log ("Vorbelegung geschrieben: " + $jsonPfad)
      Schreibe-Log "(Sie gilt nur fuer Schluessel, die noch nie gesetzt wurden.)"
    }
  } catch {
    Schreibe-Log ("FEHLER: " + $_)
    Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler"
  }
})

# =============================================================================
#  Aktion: VOM RECHNER ENTFERNEN
# =============================================================================
$kEntfernen.Add_Click({
  try {
    # Robertos Ansage: ALLES vom Cockpit auf diesem Rechner abraeumen -
    # auch alte Verknuepfungen und Alt-Versionen - damit man danach
    # frisch einrichten kann. Das Firmenlaufwerk bleibt grundsaetzlich
    # unberuehrt.
    Arbeit-Beginnt
    Schreibe-Log "Suche alles vom Cockpit auf DIESEM Rechner (Desktop + AppData) ..."
    $exes = Finde-Exe-Alle
    $verknuepfungen = Finde-Verknuepfungen
    $einstellungen = Finde-Einstellungen
    Arbeit-Fertig

    # Schutzgelaender 1: niemals Desktop, AppData oder das Benutzerprofil
    # selbst loeschen, falls eine EXE dort ohne eigenen Ordner liegt.
    $tabu = @()
    foreach ($t in @([Environment]::GetFolderPath("Desktop"), $env:LOCALAPPDATA, $env:APPDATA, $env:USERPROFILE)) {
      if ($t) { $tabu += $t.TrimEnd("\").ToLower() }
    }
    $ordnerListe = @()
    $handarbeit = @()
    foreach ($exe in $exes) {
      $o = $exe.DirectoryName
      # Schutzgelaender 2: Netzpfade bleiben immer tabu.
      if ($o -like "\\*" -or $o -like "//*") { continue }
      if ($tabu -contains $o.TrimEnd("\").ToLower()) { $handarbeit += $exe.FullName; continue }
      # Schutzgelaender 3: nur Ordner loeschen, die auch wie ein
      # Programm-Ordner aussehen (Electron bringt einen resources-
      # Unterordner mit) - sonst koennte ein Sammelordner mit anderen
      # Dingen mitgerissen werden.
      $siehtRichtigAus = (Test-Path -LiteralPath (Join-Path $o "resources")) -or ((Split-Path -Leaf $o) -like "*Cockpit*")
      if (-not $siehtRichtigAus) { $handarbeit += $exe.FullName; continue }
      $ordnerListe += $o
    }
    $ordnerListe = @($ordnerListe | Sort-Object -Unique)

    if ((-not $ordnerListe) -and (-not $verknuepfungen) -and (-not $einstellungen)) {
      Schreibe-Log "Hier gibt es nichts zu entfernen."
      return
    }
    $liste = @()
    $netzHinweis = $false
    foreach ($o in $ordnerListe) { $liste += ("Programm-Ordner:  " + $o) }
    foreach ($v in $verknuepfungen) {
      # Das Ziel mit festhalten - sonst ist nach dem Loeschen die
      # Information verloren, wo das Programm eigentlich lag.
      $zielPfad = Verknuepfungs-Ziel $v.FullName
      if ($zielPfad) {
        $liste += ("Verknuepfung:     " + $v.FullName + "  (zeigt auf: " + $zielPfad + ")")
        if (($zielPfad -like "\\*") -or ($zielPfad -like "//*")) { $netzHinweis = $true }
      } else {
        $liste += ("Verknuepfung:     " + $v.FullName)
      }
    }
    if ($einstellungen) { $liste += ("Gemerkte Pfade:   " + (Split-Path -Parent $einstellungen)) }
    foreach ($z in $liste) { Schreibe-Log ("  gefunden: " + $z) }
    if ($netzHinweis) {
      Schreibe-Log "  Hinweis: mindestens eine Verknuepfung zeigt aufs LAUFWERK -"
      Schreibe-Log "  dort wird nichts geloescht, nur die Verknuepfung selbst."
    }

    $frage = "Vom Rechner entfernen?`n`n" + ($liste -join "`n") + "`n`nDie gemeinsamen Dateien auf dem Firmenlaufwerk bleiben unberuehrt."
    if (-not (Frage-JaNein $frage "Entfernen")) { Schreibe-Log "Abgebrochen - nichts veraendert."; return }
    if ($ordnerListe.Count -gt 0) {
      if (-not (Frage-JaNein ("Wirklich sicher? Es werden " + $ordnerListe.Count + " Programm-Ordner samt Inhalt geloescht.") "Entfernen")) { Schreibe-Log "Abgebrochen - nichts veraendert."; return }
    }

    foreach ($o in $ordnerListe) {
      Remove-Item -LiteralPath $o -Recurse -Force
      Schreibe-Log ("entfernt: " + $o)
    }
    foreach ($v in $verknuepfungen) {
      Remove-Item -LiteralPath $v.FullName -Force -ErrorAction SilentlyContinue
      Schreibe-Log ("entfernt: " + $v.FullName)
    }
    foreach ($h in $handarbeit) {
      Schreibe-Log ("NICHT angefasst (liegt direkt in einem Grundordner - bitte von Hand): " + $h)
    }
    if ($einstellungen) {
      if (Frage-JaNein "Auch die gemerkten Einstellungen (Pfade) dieses Rechners loeschen?`n`n'Nein' behaelt sie - eine Neu-Einrichtung findet die Pfade dann sofort wieder." "Entfernen") {
        Remove-Item -LiteralPath (Split-Path -Parent $einstellungen) -Recurse -Force
        Schreibe-Log "Gemerkte Einstellungen entfernt."
      } else {
        Schreibe-Log "Gemerkte Einstellungen bleiben (gut fuer eine Neu-Einrichtung)."
      }
    }
    $script:exeMerker = $null   # der gemerkte Fundort ist damit hinfaellig
    Aktualisiere-Status
    Schreibe-Log "Fertig - der Rechner ist sauber. 'Einrichten' richtet alles frisch ein."
  } catch {
    Arbeit-Fertig
    Schreibe-Log ("FEHLER: " + $_)
    Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler"
  }
})

# =============================================================================
#  Start: Felder vorbelegen und Fenster zeigen
# =============================================================================
$exe = Finde-Exe
if ($exe) { $zZiel.Feld.Text = (Split-Path -Parent $exe.FullName) } else { $zZiel.Feld.Text = $ZielVorgabe }

# Beste bekannte Pfade einsammeln: zuerst die gemerkten Einstellungen des
# Programms, sonst die Scheurich-Vorgaben dieses Pakets.
$quelle = "Vorgaben dieses Pakets"
$zUpdate.Feld.Text = $WerkstattOrdnerVorgabe
$zDaten.Feld.Text  = $WerkstattOrdnerVorgabe + "/" + $DatenDateiName
$zStoer.Feld.Text  = $WerkstattOrdnerVorgabe + "/" + $StoerDateiName
$einstellungen = Finde-Einstellungen
if ($einstellungen) {
  try {
    $json = Get-Content -LiteralPath $einstellungen -Raw | ConvertFrom-Json
    $treffer = 0
    foreach ($paar in @(
      @{ Name = "programm:update-ordner";         Feld = $zUpdate.Feld },
      @{ Name = "werkstatt-kalender-fs:handle";   Feld = $zDaten.Feld },
      @{ Name = "werkstatt-stoerungen-fs:handle"; Feld = $zStoer.Feld })) {
      $wert = $json.PSObject.Properties[$paar.Name]
      if ($wert -and $wert.Value) { $paar.Feld.Text = [string]$wert.Value; $treffer++ }
    }
    if ($treffer -gt 0) { $quelle = "gemerkte Einstellungen dieses Rechners" }
  } catch { }
}

Aktualisiere-Status
if ($exe) { Schreibe-Log ("Cockpit gefunden: " + $exe.FullName) }
Schreibe-Log ("Bereit. Pfad-Felder vorbelegt aus: " + $quelle)
Schreibe-Log "Neuer Rechner: Felder pruefen (oder einfach lassen) und 'Einrichten' druecken."
[void]$fenster.ShowDialog()
