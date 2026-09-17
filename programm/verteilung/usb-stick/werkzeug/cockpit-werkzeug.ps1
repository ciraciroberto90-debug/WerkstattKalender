# BTA-Cockpit: Das Werkzeug - Fenster-Programm mit Reitern
# ========================================================
#
# Stand 17.09. (Robertos Wahl): Design mit Farb-Kopfband und drei Reitern
# (Einrichten / Selbsttest / Wartung). Unter den Reitern liegt ein
# DAUERHAFT sichtbares Protokoll mit Zeitstempel plus Ladebalken - jede
# Aktion schreibt dort mit, und ueber "Protokoll speichern..." laesst sich
# alles als Textdatei sichern (zum Weiterschicken bei Fehlern).
#
# Umgesetzt mit WinForms - steckt in jedem Windows, nichts wird
# installiert, keine Adminrechte.
#
# Funktionen:
#   Reiter Einrichten: Standort-Vorlage (Scheurich/Soendgen), die vier
#     Pfade, Rechner-Art (Arbeitsplatz / Info-Bildschirm mit Autostart und
#     Vollbild), Einrichten + Programm herunterladen.
#   Reiter Selbsttest: Ampel je Pruefpunkt + Pruefbericht speichern.
#   Reiter Wartung: Update suchen, Verknuepfung reparieren, an Taskleiste
#     anheften, Datenordner oeffnen, Vom Rechner entfernen, Pfade speichern.
#
# WICHTIG fuer Bearbeiter: Die JSON-Dateien, die das Skript SCHREIBT, sind
# bewusst OHNE BOM - das Programm liest sie mit JSON.parse, eine
# BOM-Markierung liesse das Einlesen stillschweigend scheitern.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

# ---- Feste Werte ------------------------------------------------------------
# Der Update-Ordner (die neue Programm-HTML) liegt auf dem Firmenlaufwerk und
# ist fuer BEIDE Standorte derselbe - so bekommt Soendgen Keramik dieselben
# Programm-Updates wie Scheurich (Robertos Ansage vom 17.09.).
$WerkstattOrdnerVorgabe = "//SCHEUDC1/PSG_Gruppe/16_Technik/01_Scheurich/02_Werkstatt/Arbeitsplanung/Werkstatt_Kalender"
$DatenDateiName = "kalender-daten.json"
$StoerDateiName = "werkstatt-stoerungen.json"
# Soendgen Keramik nutzt DENSELBEN Update-Ordner, hat aber EIGENE Daten- und
# Stoerungs-Dateien (getrennte Daten je Standort). Die Namen sind ein
# Vorschlag im selben Ordner - Ort/Name beim ersten SK-Rechner bestaetigen.
$SK_DatenName = "kalender-daten-soendgen.json"
$SK_StoerName = "werkstatt-stoerungen-soendgen.json"
$ZielVorgabe    = Join-Path $env:LOCALAPPDATA "Werkstatt-Cockpit"
$ProgrammZipUrl = "https://github.com/ciraciroberto90-debug/WerkstattKalender/releases/latest/download/Werkstatt-Cockpit-Programm-win64.zip"

$hier  = Split-Path -Parent $MyInvocation.MyCommand.Path
$paket = Split-Path -Parent $hier
$programmZip = Join-Path $paket "01-Programm\Werkstatt-Cockpit-Programm-win64.zip"

# =============================================================================
#  Lage-Helfer (identisch zur App-Logik in programm/main.js)
# =============================================================================
$script:exeMerker = $null
function Finde-Exe {
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
  try { return [string]((New-Object -ComObject WScript.Shell).CreateShortcut($lnkPfad).TargetPath) } catch { return "" }
}
function Finde-Exe-Alle {
  # Alle LOKALEN EXE-Kopien: Ziele aller Cockpit-Verknuepfungen (auch
  # Alt-Namen wie "... - KHB") plus Desktop und beide AppData. Netz-Ziele
  # zaehlen hier nicht mit - dort wird nie geloescht (Finde-NetzStart).
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
  foreach ($lnk in (Finde-Verknuepfungen)) {
    $zielPfad = Verknuepfungs-Ziel $lnk.FullName
    if ($zielPfad -and ($zielPfad -like "*Werkstatt-Cockpit.exe") -and (($zielPfad -like "\\*") -or ($zielPfad -like "//*"))) {
      return $zielPfad
    }
  }
  return $null
}
function Finde-Verknuepfungen {
  $funde = @()
  $orte = @()
  try { $orte += [Environment]::GetFolderPath("Desktop") } catch { }
  try { $orte += [Environment]::GetFolderPath("StartMenu") } catch { }
  try { $orte += [Environment]::GetFolderPath("Startup") } catch { }
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
  $o = ($datenDatei -replace "\\", "/")
  $schnitt = $o.LastIndexOf("/")
  if ($schnitt -gt 0) { return $o.Substring(0, $schnitt) }
  return $o
}
function Verknuepfung-Anlegen([string]$lnkPfad, [string]$exePfad, [string]$arg) {
  # Eine Verknuepfung schreiben (Desktop oder Autostart). $arg z.B. "--vollbild".
  $schale = New-Object -ComObject WScript.Shell
  $v = $schale.CreateShortcut($lnkPfad)
  $v.TargetPath = $exePfad
  $v.WorkingDirectory = (Split-Path -Parent $exePfad)
  $v.IconLocation = $exePfad
  if ($arg) { $v.Arguments = $arg }
  $v.Description = "BTA-Cockpit (Werkstatt-Cockpit) starten"
  $v.Save()
}

# =============================================================================
#  Farben
# =============================================================================
$dunkel = [System.Drawing.Color]::FromArgb(44, 49, 55)
$gruen  = [System.Drawing.Color]::FromArgb(31, 122, 61)
$orange = [System.Drawing.Color]::FromArgb(176, 108, 0)
$rot    = [System.Drawing.Color]::FromArgb(192, 57, 43)
$weiss  = [System.Drawing.Color]::White

# =============================================================================
#  Das Fenster + Kopfband
# =============================================================================
$fenster = New-Object System.Windows.Forms.Form
$fenster.Text = "BTA-Cockpit - Werkzeug"
$fenster.ClientSize = New-Object System.Drawing.Size(660, 704)
$fenster.FormBorderStyle = "FixedSingle"
$fenster.MaximizeBox = $false
$fenster.StartPosition = "CenterScreen"
$fenster.BackColor = $weiss
$fenster.Font = New-Object System.Drawing.Font("Segoe UI", 9.75)

$band = New-Object System.Windows.Forms.Panel
$band.Location = New-Object System.Drawing.Point(0, 0)
$band.Size = New-Object System.Drawing.Size(660, 56)
$band.BackColor = $dunkel
$logo = New-Object System.Windows.Forms.Label
$logo.Text = "B"
$logo.Size = New-Object System.Drawing.Size(36, 36)
$logo.Location = New-Object System.Drawing.Point(16, 10)
$logo.TextAlign = "MiddleCenter"
$logo.BackColor = [System.Drawing.Color]::FromArgb(192, 57, 43)
$logo.ForeColor = $weiss
$logo.Font = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
$bTitel = New-Object System.Windows.Forms.Label
$bTitel.Text = "BTA-Cockpit"
$bTitel.Location = New-Object System.Drawing.Point(62, 7)
$bTitel.AutoSize = $true
$bTitel.ForeColor = $weiss
$bTitel.BackColor = $dunkel
$bTitel.Font = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
$bUnter = New-Object System.Windows.Forms.Label
$bUnter.Text = "Einrichtung und Werkzeug fuer diesen Rechner"
$bUnter.Location = New-Object System.Drawing.Point(64, 34)
$bUnter.AutoSize = $true
$bUnter.ForeColor = [System.Drawing.Color]::FromArgb(199, 204, 210)
$bUnter.BackColor = $dunkel
$band.Controls.AddRange(@($logo, $bTitel, $bUnter))

$lblPaket = New-Object System.Windows.Forms.Label
$lblPaket.Location = New-Object System.Drawing.Point(16, 62)
$lblPaket.AutoSize = $true
$lblRechner = New-Object System.Windows.Forms.Label
$lblRechner.Location = New-Object System.Drawing.Point(16, 82)
$lblRechner.AutoSize = $true

# =============================================================================
#  Reiter
# =============================================================================
$reiter = New-Object System.Windows.Forms.TabControl
$reiter.Location = New-Object System.Drawing.Point(12, 104)
$reiter.Size = New-Object System.Drawing.Size(636, 388)
$tabEin  = New-Object System.Windows.Forms.TabPage; $tabEin.Text  = "Einrichten"; $tabEin.BackColor = $weiss; $tabEin.UseVisualStyleBackColor = $true
$tabTest = New-Object System.Windows.Forms.TabPage; $tabTest.Text = "Selbsttest"; $tabTest.BackColor = $weiss; $tabTest.UseVisualStyleBackColor = $true
$tabWart = New-Object System.Windows.Forms.TabPage; $tabWart.Text = "Wartung";    $tabWart.BackColor = $weiss; $tabWart.UseVisualStyleBackColor = $true
$reiter.Controls.AddRange(@($tabEin, $tabTest, $tabWart))

# ---- Reiter EINRICHTEN ------------------------------------------------------
# Standort-Vorlage
$gbStandort = New-Object System.Windows.Forms.GroupBox
$gbStandort.Text = " Standort-Vorlage "
$gbStandort.Location = New-Object System.Drawing.Point(10, 8)
$gbStandort.Size = New-Object System.Drawing.Size(608, 52)
$rbScheurich = New-Object System.Windows.Forms.RadioButton
$rbScheurich.Text = "Scheurich"
$rbScheurich.Location = New-Object System.Drawing.Point(16, 20)
$rbScheurich.Size = New-Object System.Drawing.Size(240, 22)
$rbScheurich.Checked = $true
$rbSoendgen = New-Object System.Windows.Forms.RadioButton
$rbSoendgen.Text = "Soendgen Keramik"
$rbSoendgen.Location = New-Object System.Drawing.Point(300, 20)
$rbSoendgen.Size = New-Object System.Drawing.Size(240, 22)
$gbStandort.Controls.AddRange(@($rbScheurich, $rbSoendgen))

# Pfade
$gbPfade = New-Object System.Windows.Forms.GroupBox
$gbPfade.Text = " Die Pfade (aus der Vorlage - bei Bedarf aendern) "
$gbPfade.Location = New-Object System.Drawing.Point(10, 66)
$gbPfade.Size = New-Object System.Drawing.Size(608, 150)
function Neue-PfadZeile($parent, [int]$y, [string]$beschriftung) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $beschriftung
  $l.Location = New-Object System.Drawing.Point(12, ($y + 4))
  $l.Size = New-Object System.Drawing.Size(140, 20)
  $t = New-Object System.Windows.Forms.TextBox
  $t.Location = New-Object System.Drawing.Point(150, $y)
  $t.Size = New-Object System.Drawing.Size(354, 24)
  $k = New-Object System.Windows.Forms.Button
  $k.Text = "Waehlen..."
  $k.Location = New-Object System.Drawing.Point(512, ($y - 1))
  $k.Size = New-Object System.Drawing.Size(84, 26)
  $k.FlatStyle = "System"
  $parent.Controls.AddRange(@($l, $t, $k))
  return @{ Feld = $t; Knopf = $k }
}
$zZiel   = Neue-PfadZeile $gbPfade 24  "Programm-Ordner:"
$zUpdate = Neue-PfadZeile $gbPfade 54  "Update-Ordner:"
$zDaten  = Neue-PfadZeile $gbPfade 84  "Datendatei:"
$zStoer  = Neue-PfadZeile $gbPfade 114 "Stoerungs-Datei:"

# Rechner-Art
$gbArt = New-Object System.Windows.Forms.GroupBox
$gbArt.Text = " Wozu dient dieser Rechner? "
$gbArt.Location = New-Object System.Drawing.Point(10, 222)
$gbArt.Size = New-Object System.Drawing.Size(608, 92)
$rbArbeit = New-Object System.Windows.Forms.RadioButton
$rbArbeit.Text = "Arbeitsplatz"
$rbArbeit.Location = New-Object System.Drawing.Point(16, 20)
$rbArbeit.Size = New-Object System.Drawing.Size(160, 22)
$rbArbeit.Checked = $true
$rbInfo = New-Object System.Windows.Forms.RadioButton
$rbInfo.Text = "Info-Bildschirm (Morgenrunde)"
$rbInfo.Location = New-Object System.Drawing.Point(210, 20)
$rbInfo.Size = New-Object System.Drawing.Size(260, 22)
$chkAutostart = New-Object System.Windows.Forms.CheckBox
$chkAutostart.Text = "Beim Windows-Start automatisch oeffnen"
$chkAutostart.Location = New-Object System.Drawing.Point(16, 44)
$chkAutostart.Size = New-Object System.Drawing.Size(320, 20)
$chkVollbild = New-Object System.Windows.Forms.CheckBox
$chkVollbild.Text = "Im Vollbild starten (Kiosk, keine Bedienung)"
$chkVollbild.Location = New-Object System.Drawing.Point(16, 66)
$chkVollbild.Size = New-Object System.Drawing.Size(340, 20)
$gbArt.Controls.AddRange(@($rbArbeit, $rbInfo, $chkAutostart, $chkVollbild))

# Knoepfe
$kEinrichten = New-Object System.Windows.Forms.Button
$kEinrichten.Text = "Einrichten"
$kEinrichten.Location = New-Object System.Drawing.Point(10, 322)
$kEinrichten.Size = New-Object System.Drawing.Size(298, 34)
$kEinrichten.FlatStyle = "Flat"
$kEinrichten.BackColor = $gruen
$kEinrichten.ForeColor = $weiss
$kEinrichten.FlatAppearance.BorderColor = $gruen
$kEinrichten.Font = New-Object System.Drawing.Font("Segoe UI", 9.75, [System.Drawing.FontStyle]::Bold)
$kLaden = New-Object System.Windows.Forms.Button
$kLaden.Text = "Programm herunterladen"
$kLaden.Location = New-Object System.Drawing.Point(318, 322)
$kLaden.Size = New-Object System.Drawing.Size(298, 34)
$kLaden.FlatStyle = "System"
$tabEin.Controls.AddRange(@($gbStandort, $gbPfade, $gbArt, $kEinrichten, $kLaden))

# ---- Reiter SELBSTTEST ------------------------------------------------------
$gbAmpel = New-Object System.Windows.Forms.GroupBox
$gbAmpel.Text = " Ergebnis "
$gbAmpel.Location = New-Object System.Drawing.Point(10, 8)
$gbAmpel.Size = New-Object System.Drawing.Size(608, 220)
$ampelZeilen = @()
$ampelTitel = @("Laufwerk erreichbar", "Datendatei gefunden & lesbar", "Schreibrecht (Bearbeiter/Leser)", "Update-Ordner erreichbar", "Stoerungs-Datei erreichbar")
for ($i = 0; $i -lt $ampelTitel.Count; $i++) {
  $y = 30 + $i * 34
  $dot = New-Object System.Windows.Forms.Panel
  $dot.Location = New-Object System.Drawing.Point(18, ($y + 3))
  $dot.Size = New-Object System.Drawing.Size(12, 12)
  $dot.BackColor = [System.Drawing.Color]::FromArgb(200, 204, 208)
  $lab = New-Object System.Windows.Forms.Label
  $lab.Location = New-Object System.Drawing.Point(40, $y)
  $lab.Size = New-Object System.Drawing.Size(552, 20)
  $lab.Text = $ampelTitel[$i] + "  -  noch nicht geprueft"
  $gbAmpel.Controls.AddRange(@($dot, $lab))
  $ampelZeilen += @{ Dot = $dot; Lab = $lab; Titel = $ampelTitel[$i] }
}
$kSelbsttest = New-Object System.Windows.Forms.Button
$kSelbsttest.Text = "Selbsttest starten"
$kSelbsttest.Location = New-Object System.Drawing.Point(10, 238)
$kSelbsttest.Size = New-Object System.Drawing.Size(298, 34)
$kSelbsttest.FlatStyle = "Flat"
$kSelbsttest.BackColor = $gruen
$kSelbsttest.ForeColor = $weiss
$kSelbsttest.FlatAppearance.BorderColor = $gruen
$kSelbsttest.Font = New-Object System.Drawing.Font("Segoe UI", 9.75, [System.Drawing.FontStyle]::Bold)
$kBericht = New-Object System.Windows.Forms.Button
$kBericht.Text = "Pruefbericht speichern..."
$kBericht.Location = New-Object System.Drawing.Point(318, 238)
$kBericht.Size = New-Object System.Drawing.Size(298, 34)
$kBericht.FlatStyle = "System"
$tabTest.Controls.AddRange(@($gbAmpel, $kSelbsttest, $kBericht))

# ---- Reiter WARTUNG ---------------------------------------------------------
$gbPflege = New-Object System.Windows.Forms.GroupBox
$gbPflege.Text = " Pflege & kleine Handgriffe "
$gbPflege.Location = New-Object System.Drawing.Point(10, 8)
$gbPflege.Size = New-Object System.Drawing.Size(608, 112)
function Wartungs-Knopf($parent, [int]$x, [int]$y, [string]$text) {
  $k = New-Object System.Windows.Forms.Button
  $k.Text = $text
  $k.Location = New-Object System.Drawing.Point($x, $y)
  $k.Size = New-Object System.Drawing.Size(286, 32)
  $k.FlatStyle = "System"
  $parent.Controls.Add($k)
  return $k
}
$kUpdate   = Wartungs-Knopf $gbPflege 12 26  "Nach Update suchen"
$kReparier = Wartungs-Knopf $gbPflege 308 26 "Verknuepfung reparieren"
$kTaskbar  = Wartungs-Knopf $gbPflege 12 64  "An Taskleiste anheften"
$kOeffnen  = Wartungs-Knopf $gbPflege 308 64 "Datenordner oeffnen"

$gbReset = New-Object System.Windows.Forms.GroupBox
$gbReset.Text = " Zuruecksetzen "
$gbReset.Location = New-Object System.Drawing.Point(10, 128)
$gbReset.Size = New-Object System.Drawing.Size(608, 68)
$kSpeichern = Wartungs-Knopf $gbReset 12 26 "Pfade neu speichern"
$kEntfernen = Wartungs-Knopf $gbReset 308 26 "Vom Rechner entfernen"
$kEntfernen.ForeColor = $rot
$tabWart.Controls.AddRange(@($gbPflege, $gbReset))

# =============================================================================
#  Dauerhaft sichtbar: Ladebalken + Protokoll (unter den Reitern)
# =============================================================================
$balken = New-Object System.Windows.Forms.ProgressBar
$balken.Location = New-Object System.Drawing.Point(16, 500)
$balken.Size = New-Object System.Drawing.Size(470, 12)
$balken.Style = "Marquee"
$balken.Visible = $false
$lblFortschritt = New-Object System.Windows.Forms.Label
$lblFortschritt.Location = New-Object System.Drawing.Point(492, 496)
$lblFortschritt.Size = New-Object System.Drawing.Size(152, 18)
$lblFortschritt.TextAlign = "MiddleRight"
$lblFortschritt.ForeColor = [System.Drawing.Color]::Gray

$logFeld = New-Object System.Windows.Forms.TextBox
$logFeld.Location = New-Object System.Drawing.Point(12, 518)
$logFeld.Size = New-Object System.Drawing.Size(636, 150)
$logFeld.Multiline = $true
$logFeld.ReadOnly = $true
$logFeld.ScrollBars = "Vertical"
$logFeld.Font = New-Object System.Drawing.Font("Consolas", 9)
$logFeld.BackColor = [System.Drawing.Color]::FromArgb(30, 33, 36)
$logFeld.ForeColor = [System.Drawing.Color]::Gainsboro

$kProtokoll = New-Object System.Windows.Forms.Button
$kProtokoll.Text = "Protokoll speichern..."
$kProtokoll.Location = New-Object System.Drawing.Point(496, 672)
$kProtokoll.Size = New-Object System.Drawing.Size(152, 26)
$kProtokoll.FlatStyle = "System"
$lblProtokoll = New-Object System.Windows.Forms.Label
$lblProtokoll.Text = "Protokoll - jede Aktion wird hier mitgeschrieben:"
$lblProtokoll.Location = New-Object System.Drawing.Point(12, 676)
$lblProtokoll.AutoSize = $true
$lblProtokoll.ForeColor = [System.Drawing.Color]::Gray

$fenster.Controls.AddRange(@($band, $lblPaket, $lblRechner, $reiter, $balken, $lblFortschritt, $logFeld, $lblProtokoll, $kProtokoll))

# =============================================================================
#  Gemeinsame Helfer (Protokoll, Meldungen, Status)
# =============================================================================
function Schreibe-Log([string]$text) {
  $zeit = (Get-Date).ToString("HH:mm:ss")
  $logFeld.AppendText($zeit + "  " + $text + [Environment]::NewLine)
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
    $lblRechner.Text = "Rechner:  Cockpit startet vom Laufwerk (Verknuepfung)"; $lblRechner.ForeColor = $gruen
  } elseif (Finde-Einstellungen) {
    $lblRechner.Text = "Rechner:  Cockpit lief hier schon - Programm-Ordner nicht auffindbar"; $lblRechner.ForeColor = $orange
  } else {
    $lblRechner.Text = "Rechner:  Cockpit ist hier noch nicht eingerichtet"; $lblRechner.ForeColor = $orange
  }
}
function Arbeit-Beginnt { $balken.Visible = $true;  [System.Windows.Forms.Application]::DoEvents() }
function Arbeit-Fertig  { $balken.Visible = $false; $lblFortschritt.Text = ""; Aktualisiere-Status }

# =============================================================================
#  Standort-Vorlage: Felder fuellen (nur auf Klick, nicht beim Aufbau)
# =============================================================================
$script:initFertig = $false
function Fuelle-Standort([string]$upd, [string]$daten, [string]$stoer, [string]$name) {
  $zUpdate.Feld.Text = $upd
  $zDaten.Feld.Text  = $daten
  $zStoer.Feld.Text  = $stoer
  Schreibe-Log ("Standort-Vorlage '" + $name + "' uebernommen - Pfade gefuellt.")
}
$rbScheurich.Add_CheckedChanged({
  if ($script:initFertig -and $rbScheurich.Checked) {
    Fuelle-Standort $WerkstattOrdnerVorgabe ($WerkstattOrdnerVorgabe + "/" + $DatenDateiName) ($WerkstattOrdnerVorgabe + "/" + $StoerDateiName) "Scheurich"
  }
})
$rbSoendgen.Add_CheckedChanged({
  if ($script:initFertig -and $rbSoendgen.Checked) {
    # Gleicher Update-Ordner wie Scheurich, aber eigene SK-Dateien.
    Fuelle-Standort $WerkstattOrdnerVorgabe ($WerkstattOrdnerVorgabe + "/" + $SK_DatenName) ($WerkstattOrdnerVorgabe + "/" + $SK_StoerName) "Soendgen Keramik"
    Schreibe-Log "  Soendgen: selber Update-Ordner, eigene Daten-/Stoerungs-Datei."
    Schreibe-Log "  SK-Datei-Namen/Ort bitte bestaetigen; die Datei selbst wird in der App angelegt."
  }
})

# Rechner-Art: Info-Bildschirm schlaegt Autostart+Vollbild vor.
$rbInfo.Add_CheckedChanged({
  if ($rbInfo.Checked) { $chkAutostart.Checked = $true; $chkVollbild.Checked = $true }
})
$rbArbeit.Add_CheckedChanged({
  if ($rbArbeit.Checked) { $chkAutostart.Checked = $false; $chkVollbild.Checked = $false }
})

# Pfad-Waehlen
function Waehle-Ordner([System.Windows.Forms.TextBox]$feld) {
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = "Ordner waehlen"
  try { if ($feld.Text) { $d.SelectedPath = ($feld.Text -replace "/", "\") } } catch { }
  if ($d.ShowDialog($fenster) -eq "OK") { $feld.Text = ($d.SelectedPath -replace "\\", "/"); Schreibe-Log ("Pfad gewaehlt: " + $feld.Text) }
}
function Waehle-Datei([System.Windows.Forms.TextBox]$feld) {
  $d = New-Object System.Windows.Forms.OpenFileDialog
  $d.Filter = "Datendateien (*.json)|*.json|Alle Dateien (*.*)|*.*"
  $d.CheckFileExists = $false
  try { if ($feld.Text) { $d.InitialDirectory = ((Datenordner-Aus $feld.Text) -replace "/", "\") } } catch { }
  if ($d.ShowDialog($fenster) -eq "OK") { $feld.Text = ($d.FileName -replace "\\", "/"); Schreibe-Log ("Datei gewaehlt: " + $feld.Text) }
}
$zZiel.Knopf.Add_Click({ Waehle-Ordner $zZiel.Feld })
$zUpdate.Knopf.Add_Click({ Waehle-Ordner $zUpdate.Feld })
$zDaten.Knopf.Add_Click({ Waehle-Datei $zDaten.Feld })
$zStoer.Knopf.Add_Click({ Waehle-Datei $zStoer.Feld })

# =============================================================================
#  Aktion: EINRICHTEN
# =============================================================================
$kEinrichten.Add_Click({
  try {
    if (-not (Test-Path -LiteralPath $programmZip)) {
      Schreibe-Log "Einrichten abgebrochen: Programm-ZIP fehlt."
      Melde "Das Programm-ZIP fehlt noch.`n`nErst 'Programm herunterladen' druecken oder die Datei laut 04-Download-Links in den Ordner 01-Programm legen."
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
    $art = if ($rbInfo.Checked) { "Info-Bildschirm" } else { "Arbeitsplatz" }
    $extra = ""
    if ($chkAutostart.Checked) { $extra += "`n  + beim Windows-Start automatisch" }
    if ($chkVollbild.Checked)  { $extra += "`n  + im Vollbild (Kiosk)" }
    $frage = "So einrichten?`n`nProgramm nach:`n  $ziel`n`nUpdate-Ordner:`n  $updateOrdner`nDatendatei:`n  $datenDatei`nStoerungs-Datei:`n  $stoerDatei`n`nRechner-Art: $art$extra"
    if (-not (Frage-JaNein $frage "Einrichten")) { Schreibe-Log "Einrichten abgebrochen - nichts veraendert."; return }

    Arbeit-Beginnt
    Schreibe-Log ("Einrichten gestartet. Rechner-Art: " + $art + ".")
    Schreibe-Log "Entpacke das Programm (ca. 110 MB, dauert einen Moment) ..."
    if (-not (Test-Path -LiteralPath $ziel)) { New-Item -ItemType Directory -Path $ziel -Force | Out-Null }
    $auftrag = Start-Job -ScriptBlock { param($zip, $ziel) Expand-Archive -LiteralPath $zip -DestinationPath $ziel -Force } -ArgumentList $programmZip, $ziel
    while ($auftrag.State -eq "Running") { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 150 }
    $fehler = $null
    if ($auftrag.State -ne "Completed") { $fehler = "Das Entpacken ist fehlgeschlagen." }
    Receive-Job $auftrag -ErrorAction SilentlyContinue -ErrorVariable jobFehler | Out-Null
    Remove-Job $auftrag -Force
    if ($jobFehler) { $fehler = [string]$jobFehler[0] }
    if ($fehler) { throw $fehler }

    $exe = Get-ChildItem -LiteralPath $ziel -Recurse -Filter "Werkstatt-Cockpit.exe" | Select-Object -First 1
    if (-not $exe) { throw "Nach dem Entpacken wurde keine Werkstatt-Cockpit.exe gefunden." }
    $script:exeMerker = $exe.FullName
    Schreibe-Log ("entpackt: " + $exe.FullName)

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

    # Startargument fuer den Info-Bildschirm (Vollbild wirkt ab der naechsten
    # Programm-Fassung; aeltere ignorieren das Argument gefahrlos).
    $arg = ""
    if ($chkVollbild.Checked) { $arg = "--vollbild" }

    $desktop = [Environment]::GetFolderPath("Desktop")
    if ($desktop) {
      Verknuepfung-Anlegen (Join-Path $desktop "Werkstatt-Cockpit.lnk") $exe.FullName $arg
      Schreibe-Log ("Desktop-Verknuepfung angelegt" + $(if ($arg) { " (Vollbild)" } else { "" }) + ".")
    } else {
      Schreibe-Log "Desktop-Ordner nicht gefunden - Verknuepfung bitte von Hand anlegen."
    }
    if ($chkAutostart.Checked) {
      $startup = [Environment]::GetFolderPath("Startup")
      if ($startup) {
        Verknuepfung-Anlegen (Join-Path $startup "Werkstatt-Cockpit.lnk") $exe.FullName $arg
        Schreibe-Log "Autostart eingerichtet (oeffnet sich beim Windows-Start)."
      }
    }
    # Gibt es die gemeinsame Datendatei schon? Wenn nicht (typisch beim
    # ERSTEN Rechner eines Standorts, z.B. Soendgen Keramik), wird sie NICHT
    # vom Werkzeug angelegt - das macht die App richtig und mit
    # Konflikt-Waechter. Hier nur der Hinweis darauf.
    $hinweisNeu = ""
    $datenPruef = ($datenDatei -replace "/", "\")
    try {
      if (-not (Test-Path -LiteralPath $datenPruef)) {
        Schreibe-Log "Hinweis: Die gemeinsame Datendatei gibt es an diesem Pfad noch nicht (beim ersten Rechner eines Standorts normal)."
        $hinweisNeu = "`n`nHinweis: Die gemeinsame Datendatei gibt es an diesem Pfad noch nicht. Das ist beim ERSTEN Rechner eines Standorts normal. Im Cockpit einmal 'Neue gemeinsame Datei anlegen' waehlen - alle weiteren Rechner oeffnen sie dann nur noch."
      }
    } catch { }

    Arbeit-Fertig
    Schreibe-Log "Fertig eingerichtet."
    Melde ("Fertig eingerichtet.`n`nErster Start: Desktop-Verknuepfung 'Werkstatt-Cockpit' doppelklicken. Windows-SmartScreen meldet sich nur beim allerersten Mal: 'Weitere Informationen' -> 'Trotzdem ausfuehren'." + $hinweisNeu)
  } catch {
    Arbeit-Fertig
    Schreibe-Log ("FEHLER beim Einrichten: " + $_)
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
    Schreibe-Log ("FEHLER beim Download: " + $_)
    Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler"
  }
})

# =============================================================================
#  Aktion: SELBSTTEST (Ampel)
# =============================================================================
function Setze-Ampel($zeile, [string]$farbe, [string]$text) {
  switch ($farbe) {
    "gruen" { $zeile.Dot.BackColor = [System.Drawing.Color]::FromArgb(34, 169, 90) }
    "gelb"  { $zeile.Dot.BackColor = [System.Drawing.Color]::FromArgb(230, 184, 0) }
    "rot"   { $zeile.Dot.BackColor = [System.Drawing.Color]::FromArgb(224, 80, 60) }
  }
  $zeile.Lab.Text = $zeile.Titel + "  -  " + $text
  [System.Windows.Forms.Application]::DoEvents()
}
$kSelbsttest.Add_Click({
  try {
    Arbeit-Beginnt
    Schreibe-Log "Selbsttest gestartet."
    $updateOrdner = $zUpdate.Feld.Text.Trim()
    $datenDatei   = $zDaten.Feld.Text.Trim()
    $stoerDatei   = $zStoer.Feld.Text.Trim()
    $datenOrdner  = Datenordner-Aus $datenDatei

    # 1) Laufwerk (Datenordner erreichbar)
    if (Test-Path -LiteralPath $datenOrdner) { Setze-Ampel $ampelZeilen[0] "gruen" "erreichbar"; Schreibe-Log "  Laufwerk: erreichbar." }
    else { Setze-Ampel $ampelZeilen[0] "rot" "NICHT erreichbar"; Schreibe-Log "  Laufwerk: NICHT erreichbar." }

    # 2) Datendatei gefunden & lesbar
    $datenOk = $false
    try { if (Test-Path -LiteralPath $datenDatei) { [void][System.IO.File]::OpenRead($datenDatei).Close(); $datenOk = $true } } catch { $datenOk = $false }
    if ($datenOk) { Setze-Ampel $ampelZeilen[1] "gruen" "gefunden und lesbar"; Schreibe-Log "  Datendatei: gefunden und lesbar." }
    elseif (Test-Path -LiteralPath $datenDatei) { Setze-Ampel $ampelZeilen[1] "gelb" "gefunden, aber nicht lesbar"; Schreibe-Log "  Datendatei: gefunden, aber nicht lesbar." }
    else { Setze-Ampel $ampelZeilen[1] "rot" "NICHT gefunden - Dateiname pruefen"; Schreibe-Log "  Datendatei: NICHT gefunden." }

    # 3) Schreibrecht (Bearbeiter/Leser)
    $probe = Join-Path $datenOrdner ("werkzeug-schreibprobe-" + $env:COMPUTERNAME + ".tmp")
    try {
      Schreibe-OhneBom $probe "Schreibprobe - darf geloescht werden."
      Remove-Item -LiteralPath $probe -Force
      Setze-Ampel $ampelZeilen[2] "gruen" "Schreibrecht - Bearbeiter"; Schreibe-Log "  Schreibrecht: ja (Bearbeiter)."
    } catch {
      Setze-Ampel $ampelZeilen[2] "gelb" "kein Schreibrecht - Leser (nur ansehen)"; Schreibe-Log "  Schreibrecht: nein - Leser-Rolle (in Ordnung)."
    }

    # 4) Update-Ordner erreichbar
    if (Test-Path -LiteralPath $updateOrdner) { Setze-Ampel $ampelZeilen[3] "gruen" "erreichbar"; Schreibe-Log "  Update-Ordner: erreichbar." }
    else { Setze-Ampel $ampelZeilen[3] "rot" "NICHT erreichbar"; Schreibe-Log "  Update-Ordner: NICHT erreichbar." }

    # 5) Stoerungs-Datei erreichbar
    if (Test-Path -LiteralPath $stoerDatei) { Setze-Ampel $ampelZeilen[4] "gruen" "erreichbar"; Schreibe-Log "  Stoerungs-Datei: erreichbar." }
    else { Setze-Ampel $ampelZeilen[4] "gelb" "noch nicht vorhanden (wird bei Bedarf angelegt)"; Schreibe-Log "  Stoerungs-Datei: noch nicht vorhanden." }

    Arbeit-Fertig
    Schreibe-Log "Selbsttest fertig."
  } catch {
    Arbeit-Fertig
    Schreibe-Log ("FEHLER beim Selbsttest: " + $_)
  }
})
$kBericht.Add_Click({
  try {
    $d = New-Object System.Windows.Forms.SaveFileDialog
    $d.Filter = "Textdatei (*.txt)|*.txt"
    $d.FileName = "BTA-Cockpit-Pruefbericht-" + $env:COMPUTERNAME + "-" + (Get-Date).ToString("yyyy-MM-dd") + ".txt"
    try { $d.InitialDirectory = [Environment]::GetFolderPath("Desktop") } catch { }
    if ($d.ShowDialog($fenster) -eq "OK") {
      $kopf = "BTA-Cockpit - Pruefbericht" + [Environment]::NewLine +
              "Rechner: " + $env:COMPUTERNAME + "   Benutzer: " + $env:USERNAME + [Environment]::NewLine +
              "Zeit: " + (Get-Date).ToString("dd.MM.yyyy HH:mm") + [Environment]::NewLine +
              ("-" * 50) + [Environment]::NewLine + [Environment]::NewLine
      Schreibe-OhneBom $d.FileName ($kopf + $logFeld.Text)
      Schreibe-Log ("Pruefbericht gespeichert: " + $d.FileName)
    }
  } catch {
    Schreibe-Log ("FEHLER beim Speichern des Berichts: " + $_)
    Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler"
  }
})

# =============================================================================
#  Aktion: WARTUNG
# =============================================================================
$kUpdate.Add_Click({
  try {
    $updateOrdner = $zUpdate.Feld.Text.Trim()
    Schreibe-Log "Suche im Update-Ordner nach einer neuen Fassung ..."
    if (-not (Test-Path -LiteralPath $updateOrdner)) { Schreibe-Log "  Update-Ordner NICHT erreichbar."; Melde "Der Update-Ordner ist nicht erreichbar."; return }
    $html = @(Get-ChildItem -LiteralPath $updateOrdner -Filter "*.html" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    if ($html.Count -eq 0) { Schreibe-Log "  Keine HTML-Fassung im Update-Ordner gefunden."; return }
    $neu = $html[0]
    Schreibe-Log ("  Neueste Fassung: " + $neu.Name + "  (" + $neu.LastWriteTime.ToString("dd.MM.yyyy HH:mm") + ")")
    Schreibe-Log "  Das Uebernehmen macht das Cockpit selbst - beim Start meldet sich der gruene Balken."
  } catch { Schreibe-Log ("FEHLER: " + $_) }
})
$kReparier.Add_Click({
  try {
    $exe = Finde-Exe
    if (-not $exe) { Melde "Es wurde keine eingerichtete Werkstatt-Cockpit.exe gefunden.`n`nDann bitte im Reiter 'Einrichten' neu aufsetzen."; return }
    $desktop = [Environment]::GetFolderPath("Desktop")
    Verknuepfung-Anlegen (Join-Path $desktop "Werkstatt-Cockpit.lnk") $exe.FullName ""
    Schreibe-Log ("Verknuepfung repariert -> " + $exe.FullName)
    Melde "Die Desktop-Verknuepfung wurde neu angelegt."
  } catch { Schreibe-Log ("FEHLER: " + $_); Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler" }
})
$kTaskbar.Add_Click({
  try {
    $exe = Finde-Exe
    if (-not $exe) { Melde "Es wurde keine eingerichtete Werkstatt-Cockpit.exe gefunden."; return }
    $angeheftet = $false
    try {
      $shell = New-Object -ComObject Shell.Application
      $ordner = $shell.Namespace((Split-Path -Parent $exe.FullName))
      $item = $ordner.ParseName((Split-Path -Leaf $exe.FullName))
      $verb = $item.Verbs() | Where-Object { ($_.Name -replace '&','') -match 'Taskleiste anheften|An Taskleiste|Pin to taskbar' } | Select-Object -First 1
      if ($verb) { $verb.DoIt(); $angeheftet = $true }
    } catch { $angeheftet = $false }
    if ($angeheftet) { Schreibe-Log "An Taskleiste angeheftet." }
    else {
      Schreibe-Log "Anheften konnte nicht automatisch ausgeloest werden (Windows blockt das oft)."
      Melde "Windows laesst das Anheften nicht immer automatisch zu.`n`nBitte die Desktop-Verknuepfung 'Werkstatt-Cockpit' mit der rechten Maustaste anklicken -> 'An Taskleiste anheften'."
    }
  } catch { Schreibe-Log ("FEHLER: " + $_) }
})
$kOeffnen.Add_Click({
  try {
    $datenOrdner = (Datenordner-Aus $zDaten.Feld.Text.Trim()) -replace "/", "\"
    Schreibe-Log ("Oeffne Datenordner: " + $datenOrdner)
    if (Test-Path -LiteralPath $datenOrdner) { Start-Process "explorer.exe" $datenOrdner }
    else { Melde "Der Datenordner ist nicht erreichbar:`n$datenOrdner" }
  } catch { Schreibe-Log ("FEHLER: " + $_) }
})

# =============================================================================
#  Aktion: PFADE SPEICHERN
# =============================================================================
$kSpeichern.Add_Click({
  try {
    $updateOrdner = ($zUpdate.Feld.Text.Trim() -replace "\\", "/")
    $datenDatei   = ($zDaten.Feld.Text.Trim()  -replace "\\", "/")
    $stoerDatei   = ($zStoer.Feld.Text.Trim()  -replace "\\", "/")
    $datenOrdner  = Datenordner-Aus $datenDatei
    $einstellungen = Finde-Einstellungen
    if ($einstellungen) {
      if (-not (Frage-JaNein "Die vier Pfade aus den Feldern in die GEMERKTEN Einstellungen des Cockpits schreiben?`n`nWICHTIG: Das Cockpit vorher SCHLIESSEN - sonst ueberschreibt es die Aenderung beim Beenden wieder.`n`nEine Sicherung der alten Datei wird daneben abgelegt." "Pfade speichern")) { return }
      $json = Get-Content -LiteralPath $einstellungen -Raw | ConvertFrom-Json
      foreach ($paar in @(
        @{ Name = "programm:update-ordner";         Wert = $updateOrdner },
        @{ Name = "werkstatt-kalender-fs:handle";   Wert = $datenDatei },
        @{ Name = "werkstatt-kalender-fs:folder";   Wert = $datenOrdner },
        @{ Name = "werkstatt-stoerungen-fs:handle"; Wert = $stoerDatei })) {
        $feld = $json.PSObject.Properties[$paar.Name]
        if ($feld) { $feld.Value = $paar.Wert } else { $json | Add-Member -NotePropertyName $paar.Name -NotePropertyValue $paar.Wert }
      }
      Copy-Item -LiteralPath $einstellungen -Destination ($einstellungen + ".sicherung") -Force
      Schreibe-OhneBom $einstellungen (ConvertTo-Json $json -Depth 10)
      Schreibe-Log ("Pfade gespeichert: " + $einstellungen)
      Schreibe-Log ("Sicherung daneben: " + $einstellungen + ".sicherung")
    } else {
      $exe = Finde-Exe
      if (-not $exe) { Melde "Weder gemerkte Einstellungen noch ein eingerichtetes Cockpit gefunden.`n`nDann genuegt 'Einrichten' - es schreibt die Pfade mit."; return }
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
    }
  } catch {
    Schreibe-Log ("FEHLER beim Speichern: " + $_)
    Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler"
  }
})

# =============================================================================
#  Aktion: VOM RECHNER ENTFERNEN
# =============================================================================
$kEntfernen.Add_Click({
  try {
    Arbeit-Beginnt
    Schreibe-Log "Entfernen: suche alles vom Cockpit auf DIESEM Rechner ..."
    $exes = Finde-Exe-Alle
    $verknuepfungen = Finde-Verknuepfungen
    $einstellungen = Finde-Einstellungen
    Arbeit-Fertig

    $tabu = @()
    foreach ($t in @([Environment]::GetFolderPath("Desktop"), $env:LOCALAPPDATA, $env:APPDATA, $env:USERPROFILE)) {
      if ($t) { $tabu += $t.TrimEnd("\").ToLower() }
    }
    $ordnerListe = @()
    $handarbeit = @()
    foreach ($exe in $exes) {
      $o = $exe.DirectoryName
      if ($o -like "\\*" -or $o -like "//*") { continue }
      if ($tabu -contains $o.TrimEnd("\").ToLower()) { $handarbeit += $exe.FullName; continue }
      $siehtRichtigAus = (Test-Path -LiteralPath (Join-Path $o "resources")) -or ((Split-Path -Leaf $o) -like "*Cockpit*")
      if (-not $siehtRichtigAus) { $handarbeit += $exe.FullName; continue }
      $ordnerListe += $o
    }
    $ordnerListe = @($ordnerListe | Sort-Object -Unique)

    if ((-not $ordnerListe) -and (-not $verknuepfungen) -and (-not $einstellungen)) { Schreibe-Log "Hier gibt es nichts zu entfernen."; return }
    $liste = @()
    $netzHinweis = $false
    foreach ($o in $ordnerListe) { $liste += ("Programm-Ordner:  " + $o) }
    foreach ($v in $verknuepfungen) {
      $zielPfad = Verknuepfungs-Ziel $v.FullName
      if ($zielPfad) {
        $liste += ("Verknuepfung:     " + $v.FullName + "  (zeigt auf: " + $zielPfad + ")")
        if (($zielPfad -like "\\*") -or ($zielPfad -like "//*")) { $netzHinweis = $true }
      } else { $liste += ("Verknuepfung:     " + $v.FullName) }
    }
    if ($einstellungen) { $liste += ("Gemerkte Pfade:   " + (Split-Path -Parent $einstellungen)) }
    foreach ($z in $liste) { Schreibe-Log ("  gefunden: " + $z) }
    if ($netzHinweis) { Schreibe-Log "  Hinweis: eine Verknuepfung zeigt aufs LAUFWERK - dort wird nichts geloescht, nur die Verknuepfung." }

    $frage = "Vom Rechner entfernen?`n`n" + ($liste -join "`n") + "`n`nDie gemeinsamen Dateien auf dem Firmenlaufwerk bleiben unberuehrt."
    if (-not (Frage-JaNein $frage "Entfernen")) { Schreibe-Log "Entfernen abgebrochen - nichts veraendert."; return }
    if ($ordnerListe.Count -gt 0) {
      if (-not (Frage-JaNein ("Wirklich sicher? Es werden " + $ordnerListe.Count + " Programm-Ordner samt Inhalt geloescht.") "Entfernen")) { Schreibe-Log "Entfernen abgebrochen - nichts veraendert."; return }
    }
    foreach ($o in $ordnerListe) { Remove-Item -LiteralPath $o -Recurse -Force; Schreibe-Log ("entfernt: " + $o) }
    foreach ($v in $verknuepfungen) { Remove-Item -LiteralPath $v.FullName -Force -ErrorAction SilentlyContinue; Schreibe-Log ("entfernt: " + $v.FullName) }
    foreach ($h in $handarbeit) { Schreibe-Log ("NICHT angefasst (liegt direkt in einem Grundordner - bitte von Hand): " + $h) }
    if ($einstellungen) {
      if (Frage-JaNein "Auch die gemerkten Einstellungen (Pfade) dieses Rechners loeschen?`n`n'Nein' behaelt sie - eine Neu-Einrichtung findet die Pfade dann sofort wieder." "Entfernen") {
        Remove-Item -LiteralPath (Split-Path -Parent $einstellungen) -Recurse -Force
        Schreibe-Log "Gemerkte Einstellungen entfernt."
      } else { Schreibe-Log "Gemerkte Einstellungen bleiben (gut fuer eine Neu-Einrichtung)." }
    }
    $script:exeMerker = $null
    Aktualisiere-Status
    Schreibe-Log "Fertig - der Rechner ist sauber. 'Einrichten' richtet alles frisch ein."
  } catch {
    Arbeit-Fertig
    Schreibe-Log ("FEHLER beim Entfernen: " + $_)
    Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler"
  }
})

# =============================================================================
#  Protokoll speichern (der Verlauf unten)
# =============================================================================
$kProtokoll.Add_Click({
  try {
    $d = New-Object System.Windows.Forms.SaveFileDialog
    $d.Filter = "Textdatei (*.txt)|*.txt"
    $d.FileName = "BTA-Cockpit-Protokoll-" + $env:COMPUTERNAME + "-" + (Get-Date).ToString("yyyy-MM-dd_HHmm") + ".txt"
    try { $d.InitialDirectory = [Environment]::GetFolderPath("Desktop") } catch { }
    if ($d.ShowDialog($fenster) -eq "OK") {
      $kopf = "BTA-Cockpit - Protokoll" + [Environment]::NewLine +
              "Rechner: " + $env:COMPUTERNAME + "   Benutzer: " + $env:USERNAME + [Environment]::NewLine +
              ("-" * 50) + [Environment]::NewLine + [Environment]::NewLine
      Schreibe-OhneBom $d.FileName ($kopf + $logFeld.Text)
      Schreibe-Log ("Protokoll gespeichert: " + $d.FileName)
    }
  } catch {
    Schreibe-Log ("FEHLER beim Speichern des Protokolls: " + $_)
    Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler"
  }
})

# =============================================================================
#  Start: Felder vorbelegen und Fenster zeigen
# =============================================================================
$exe = Finde-Exe
if ($exe) { $zZiel.Feld.Text = (Split-Path -Parent $exe.FullName) } else { $zZiel.Feld.Text = $ZielVorgabe }

$quelle = "Vorgaben dieses Pakets (Scheurich)"
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
Schreibe-Log "Neuer Rechner: Felder pruefen (oder lassen), Rechner-Art waehlen, 'Einrichten' druecken."
$script:initFertig = $true
[void]$fenster.ShowDialog()
