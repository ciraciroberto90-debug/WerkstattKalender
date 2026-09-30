# BTA-Cockpit: SERVER-Werkzeug - Fenster-Programm fuer v-btacockpit-01
# ===================================================================
#
# Etappe A des Bauplans (doku/BAUPLAN-SERVER-SYSTEM.md, Abschnitt 11):
# EIN Werkzeug, das auf dem Server alles anlegt - und dabei jeden Schritt
# sichtbar macht (Robertos Regel: Schritt fuer Schritt, jede Zeile im
# Protokoll, erst "nur pruefen", dann "einrichten").
#
# Reiter:
#   Pruefen    - Ampeln: Admin, Ordner, Gruppen, Node, Dienst-Dateien,
#                Aufgabe, Firewall, antwortet der Dienst
#   Einrichten - Node + Dienst kopieren, Einstellungen schreiben,
#                Firewall-Regel, Aufgabe "Beim Systemstart" (Konto SYSTEM,
#                Neustart bei Fehler), Dienst starten, Status pruefen
#   Wartung    - Dienst starten/stoppen/neu starten, Status-Seite,
#                Protokoll, Sicherung jetzt, Sicherung einspielen (der
#                geuebte Rueckweg), App-Datei tauschen, Vom Server entfernen
#   Import     - kommt in Etappe B
#
# Bewusst ohne Umlaute im Quelltext (PowerShell 5.1 liest die Datei sonst je
# nach Kodierung falsch) - im Fenster steht deshalb "Pruefen", nicht "Pruefen".
# WinForms - steckt in jedem Windows Server, nichts zu installieren.
# Muss ALS ADMINISTRATOR laufen (Aufgabe, Firewall, C:\BTA).

$ErrorActionPreference = "Stop"

# Faengt jeden Abbruch VOR und IM Fenster: Das Startfenster ist versteckt
# (-WindowStyle Hidden), ein Fehler waere sonst unsichtbar - genau das passierte
# am 30.09. Der Fehler landet in werkzeug\server-werkzeug-fehler.txt (die
# .cmd oeffnet die Datei) und, wenn WinForms schon geladen ist, in einer Meldung.
trap {
  $meldung = "BTA-Server-Werkzeug abgebrochen`r`n`r`n" + $_.Exception.Message + "`r`n`r`nStelle: " + $_.InvocationInfo.PositionMessage
  try { [System.IO.File]::WriteAllText((Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "server-werkzeug-fehler.txt"), (Get-Date).ToString("dd.MM.yyyy HH:mm:ss") + "`r`n" + $meldung) } catch { }
  try { [void][System.Windows.Forms.MessageBox]::Show($meldung, "BTA-Cockpit Server-Werkzeug", "OK", "Error") } catch { }
  exit 1
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
# Ein Fehler in einem Knopf-Handler soll als lesbare Meldung erscheinen, nicht
# als "Unbehandelte Ausnahme in einer Komponente der Anwendung" (30.09., 21:47).
try {
  [System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)
  [System.Windows.Forms.Application]::add_ThreadException([System.Threading.ThreadExceptionEventHandler]{
    param($sender, $e)
    $text = "Unerwarteter Fehler: " + $e.Exception.Message
    try { $logFeld.AppendText((Get-Date).ToString("HH:mm:ss") + "  FEHLER " + $text + [Environment]::NewLine) } catch { }
    try { [void][System.Windows.Forms.MessageBox]::Show($text + "`n`nDas Werkzeug laeuft weiter. Bitte Protokoll speichern und schicken.", "BTA-Cockpit Server-Werkzeug", "OK", "Warning") } catch { }
  })
} catch { }

# ---- Feste Werte ------------------------------------------------------------
$ServerOrdner   = "C:\BTA"
$DienstOrdner   = Join-Path $ServerOrdner "BTA-Programm\Dienst"
$AppOrdner      = Join-Path $ServerOrdner "BTA-Programm\App"
$SicherungOrdner= Join-Path $ServerOrdner "BTA-Sicherung"
$PortVorgabe    = 8765
$AufgabeName    = "bta-cockpit-dienst"
$FirewallName   = "BTA-Cockpit-Dienst"
$Standorte = @(
  @{ Id = "scheurich"; Name = "Scheurich";        Ordner = (Join-Path $ServerOrdner "BTA-Scheurich") },
  @{ Id = "soendgen";  Name = "Soendgen Keramik"; Ordner = (Join-Path $ServerOrdner "BTA-Soendgen") }
)
$Gruppen = @("BTA-Verwalter", "BTA-Scheurich-Werkstatt", "BTA-Scheurich-Ansehen", "BTA-Soendgen-Werkstatt", "BTA-Soendgen-Ansehen")
$NodeFassung = "v22.23.3"
$NodeUrl = "https://nodejs.org/dist/$NodeFassung/node-$NodeFassung-win-x64.zip"

$hier  = Split-Path -Parent $MyInvocation.MyCommand.Path
$paket = Split-Path -Parent $hier
$stickDienst = Join-Path $paket "05-Server\dienst"
$stickNode   = Join-Path $paket "05-Server\node\node.exe"
$nodeExe     = Join-Path $DienstOrdner "node\node.exe"
$dienstJs    = Join-Path $DienstOrdner "dienst.js"
$einstellungenPfad = Join-Path $DienstOrdner "einstellungen.json"

# =============================================================================
#  Helfer ohne Fenster
# =============================================================================
function Ist-Admin {
  $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object System.Security.Principal.WindowsPrincipal($id)).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Schreibe-OhneBom([string]$pfad, [string]$inhalt) {
  # Der Dienst liest die Einstellungen mit JSON.parse - eine BOM liesse das scheitern.
  [System.IO.File]::WriteAllText($pfad, $inhalt, (New-Object System.Text.UTF8Encoding($false)))
}
function Gruppe-Da([string]$name) {
  try { return [bool](Get-LocalGroup -Name $name -ErrorAction Stop) } catch { }
  try { $r = (net localgroup $name 2>&1); return ($LASTEXITCODE -eq 0) } catch { return $false }
}
function Aufgabe-Holen { try { return Get-ScheduledTask -TaskName $AufgabeName -ErrorAction Stop } catch { return $null } }
function Firewall-Da { try { return [bool](Get-NetFirewallRule -DisplayName $FirewallName -ErrorAction Stop) } catch { return $false } }
function Port-Lesen {
  try { if (Test-Path -LiteralPath $einstellungenPfad) { $e = Get-Content -LiteralPath $einstellungenPfad -Raw | ConvertFrom-Json; if ($e.port) { return [int]$e.port } } } catch { }
  return $PortVorgabe
}
function Dienst-Status([int]$port) {
  # Fragt /api/status - antwortet der Dienst, kommt sein Zustand zurueck, sonst $null.
  try { return Invoke-RestMethod -Uri ("http://localhost:" + $port + "/api/status") -TimeoutSec 3 -ErrorAction Stop } catch { return $null }
}
function Dienst-Prozesse {
  try { return @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like "*dienst.js*" }) } catch { return @() }
}
function Warte-Auf-Dienst([int]$port, [int]$sekunden) {
  for ($i = 0; $i -lt ($sekunden * 2); $i++) {
    $s = Dienst-Status $port
    if ($s) { return $s }
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 500
  }
  return $null
}

# =============================================================================
#  Fenster + Kopfband
# =============================================================================
$dunkel = [System.Drawing.Color]::FromArgb(30, 39, 97)
$gruen  = [System.Drawing.Color]::FromArgb(31, 122, 61)
$orange = [System.Drawing.Color]::FromArgb(176, 108, 0)
$rot    = [System.Drawing.Color]::FromArgb(192, 57, 43)
$weiss  = [System.Drawing.Color]::White

$fenster = New-Object System.Windows.Forms.Form
$fenster.Text = "BTA-Cockpit - Server-Werkzeug"
# 700 hoch statt 740: bei 125 % Schriftgroesse (Robertos Server-Sitzung 30.09.)
# war der untere Rand mit 740 abgeschnitten.
$fenster.ClientSize = New-Object System.Drawing.Size(700, 700)
$fenster.FormBorderStyle = "FixedSingle"
$fenster.MaximizeBox = $false
$fenster.StartPosition = "CenterScreen"
$fenster.BackColor = $weiss
$fenster.Font = New-Object System.Drawing.Font("Segoe UI", 9.75)

$band = New-Object System.Windows.Forms.Panel
$band.Location = New-Object System.Drawing.Point(0, 0)
$band.Size = New-Object System.Drawing.Size(700, 56)
$band.BackColor = $dunkel
$logo = New-Object System.Windows.Forms.Label
$logo.Text = "S"
$logo.Size = New-Object System.Drawing.Size(36, 36)
$logo.Location = New-Object System.Drawing.Point(16, 10)
$logo.TextAlign = "MiddleCenter"
$logo.BackColor = $rot
$logo.ForeColor = $weiss
$logo.Font = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
$bTitel = New-Object System.Windows.Forms.Label
$bTitel.Text = "BTA-Cockpit - Server"
$bTitel.Location = New-Object System.Drawing.Point(62, 7)
$bTitel.AutoSize = $true
$bTitel.ForeColor = $weiss
$bTitel.BackColor = $dunkel
$bTitel.Font = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
$bUnter = New-Object System.Windows.Forms.Label
$bUnter.Text = "Dienst auf " + $env:COMPUTERNAME + " einrichten und pflegen - Schritt fuer Schritt"
$bUnter.Location = New-Object System.Drawing.Point(64, 34)
$bUnter.AutoSize = $true
$bUnter.ForeColor = [System.Drawing.Color]::FromArgb(199, 204, 210)
$bUnter.BackColor = $dunkel
$band.Controls.AddRange(@($logo, $bTitel, $bUnter))

$lblStatus1 = New-Object System.Windows.Forms.Label
$lblStatus1.Location = New-Object System.Drawing.Point(16, 62)
$lblStatus1.AutoSize = $true
$lblStatus2 = New-Object System.Windows.Forms.Label
$lblStatus2.Location = New-Object System.Drawing.Point(16, 82)
$lblStatus2.AutoSize = $true

# =============================================================================
#  Reiter
# =============================================================================
$reiter = New-Object System.Windows.Forms.TabControl
$reiter.Location = New-Object System.Drawing.Point(12, 104)
$reiter.Size = New-Object System.Drawing.Size(676, 380)
$tabPruef = New-Object System.Windows.Forms.TabPage; $tabPruef.Text = "Pruefen";    $tabPruef.BackColor = $weiss; $tabPruef.UseVisualStyleBackColor = $true
$tabEin   = New-Object System.Windows.Forms.TabPage; $tabEin.Text   = "Einrichten"; $tabEin.BackColor = $weiss;   $tabEin.UseVisualStyleBackColor = $true
$tabWart  = New-Object System.Windows.Forms.TabPage; $tabWart.Text  = "Wartung";    $tabWart.BackColor = $weiss;  $tabWart.UseVisualStyleBackColor = $true
$tabImp   = New-Object System.Windows.Forms.TabPage; $tabImp.Text   = "Import";     $tabImp.BackColor = $weiss;   $tabImp.UseVisualStyleBackColor = $true
$reiter.Controls.AddRange(@($tabPruef, $tabEin, $tabWart, $tabImp))

# ---- Reiter PRUEFEN ----------------------------------------------------------
$lblPruef = New-Object System.Windows.Forms.Label
$lblPruef.Text = "Acht Fragen an den Server. Gruen = passt, gelb = fehlt noch (Einrichten macht es), rot = bitte erst klaeren."
$lblPruef.Location = New-Object System.Drawing.Point(12, 10)
$lblPruef.Size = New-Object System.Drawing.Size(640, 22)
$lblPruef.ForeColor = [System.Drawing.Color]::Gray
# Namen werden IN den Text eingebettet ("...$AufgabeName...") statt mit + angehaengt:
# in einer Liste bindet das Komma staerker als das Plus, "a" + $x + "b", "c" zerfiel
# am 30.09. auf dem Server in elf statt acht Zeilen (Robertos Bild).
$ampelTitel = @("Als Administrator gestartet", "Ordner unter C:\BTA (Programm, Scheurich, Sicherung, Soendgen)", "Fuenf BTA-Gruppen auf dem Server", "Node (auf dem Stick oder schon im Dienst-Ordner)", "Dienst-Dateien im Dienst-Ordner", "Aufgabe '$AufgabeName' (Beim Systemstart)", "Firewall-Regel '$FirewallName'", "Dienst antwortet (/api/status)")
$ampelZeilen = @()
$y = 40
foreach ($t in $ampelTitel) {
  $dot = New-Object System.Windows.Forms.Panel
  $dot.Location = New-Object System.Drawing.Point(16, ($y + 4))
  $dot.Size = New-Object System.Drawing.Size(14, 14)
  $dot.BackColor = [System.Drawing.Color]::Gainsboro
  $lab = New-Object System.Windows.Forms.Label
  $lab.Text = $t
  $lab.Location = New-Object System.Drawing.Point(40, $y)
  $lab.Size = New-Object System.Drawing.Size(610, 22)
  $tabPruef.Controls.AddRange(@($dot, $lab))
  $ampelZeilen += @{ Dot = $dot; Lab = $lab; Titel = $t }
  $y += 30
}
$kPruefen = New-Object System.Windows.Forms.Button
$kPruefen.Text = "Jetzt pruefen"
$kPruefen.Location = New-Object System.Drawing.Point(16, 300)
$kPruefen.Size = New-Object System.Drawing.Size(200, 36)
$kPruefen.FlatStyle = "System"
$kPruefen.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$kBericht = New-Object System.Windows.Forms.Button
$kBericht.Text = "Pruefbericht speichern..."
$kBericht.Location = New-Object System.Drawing.Point(230, 300)
$kBericht.Size = New-Object System.Drawing.Size(200, 36)
$kBericht.FlatStyle = "System"
$tabPruef.Controls.AddRange(@($lblPruef, $kPruefen, $kBericht))

# ---- Reiter EINRICHTEN -------------------------------------------------------
$gbEin = New-Object System.Windows.Forms.GroupBox
$gbEin.Text = " Was eingerichtet wird "
$gbEin.Location = New-Object System.Drawing.Point(10, 8)
$gbEin.Size = New-Object System.Drawing.Size(648, 190)
$lblEin = New-Object System.Windows.Forms.Label
$lblEin.Text = "1. Ordner Dienst / App / Protokoll anlegen`n2. Node (portabel) und die Dienst-Dateien nach " + $DienstOrdner + " kopieren`n3. einstellungen.json schreiben (Port, Standorte, Ordner)`n4. Firewall-Regel fuer den Port (eingehend, nur Firmennetz)`n5. Aufgabe '" + $AufgabeName + "' anlegen: Beim Systemstart, Konto SYSTEM, Neustart bei Fehler`n6. Dienst starten und /api/status abfragen"
$lblEin.Location = New-Object System.Drawing.Point(14, 22)
$lblEin.Size = New-Object System.Drawing.Size(620, 118)
$lblPort = New-Object System.Windows.Forms.Label
$lblPort.Text = "Port:"
$lblPort.Location = New-Object System.Drawing.Point(14, 150)
$lblPort.Size = New-Object System.Drawing.Size(40, 22)
$txtPort = New-Object System.Windows.Forms.TextBox
$txtPort.Text = "$PortVorgabe"
$txtPort.Location = New-Object System.Drawing.Point(56, 147)
$txtPort.Size = New-Object System.Drawing.Size(70, 24)
$chkSoendgen = New-Object System.Windows.Forms.CheckBox
$chkSoendgen.Text = "Soendgen Keramik als zweite (leere) Datenbank anlegen (Robertos Entscheidung 30.09.: ja)"
$chkSoendgen.Location = New-Object System.Drawing.Point(150, 148)
$chkSoendgen.Size = New-Object System.Drawing.Size(490, 22)
$chkSoendgen.Checked = $true
$gbEin.Controls.AddRange(@($lblEin, $lblPort, $txtPort, $chkSoendgen))

$kVorschau = New-Object System.Windows.Forms.Button
$kVorschau.Text = "Nur pruefen (Vorschau, aendert nichts)"
$kVorschau.Location = New-Object System.Drawing.Point(10, 210)
$kVorschau.Size = New-Object System.Drawing.Size(316, 40)
$kVorschau.FlatStyle = "System"
$kEinrichten = New-Object System.Windows.Forms.Button
$kEinrichten.Text = "Einrichten"
$kEinrichten.Location = New-Object System.Drawing.Point(342, 210)
$kEinrichten.Size = New-Object System.Drawing.Size(316, 40)
$kEinrichten.FlatStyle = "Flat"
$kEinrichten.BackColor = $gruen
$kEinrichten.ForeColor = $weiss
$kEinrichten.Font = New-Object System.Drawing.Font("Segoe UI", 10.5, [System.Drawing.FontStyle]::Bold)
$kNode = New-Object System.Windows.Forms.Button
$kNode.Text = "Node herunterladen (falls nicht auf dem Stick)"
$kNode.Location = New-Object System.Drawing.Point(10, 262)
$kNode.Size = New-Object System.Drawing.Size(316, 32)
$kNode.FlatStyle = "System"
$lblEinHinweis = New-Object System.Windows.Forms.Label
$lblEinHinweis.Text = "Einrichten laesst sich wiederholen: Bestehendes wird ersetzt, die Datenbanken bleiben unangetastet."
$lblEinHinweis.Location = New-Object System.Drawing.Point(12, 306)
$lblEinHinweis.Size = New-Object System.Drawing.Size(640, 40)
$lblEinHinweis.ForeColor = [System.Drawing.Color]::Gray
$tabEin.Controls.AddRange(@($gbEin, $kVorschau, $kEinrichten, $kNode, $lblEinHinweis))

# ---- Reiter WARTUNG ----------------------------------------------------------
function Wartungs-Knopf($parent, [int]$x, [int]$y, [string]$text) {
  $k = New-Object System.Windows.Forms.Button
  $k.Text = $text
  $k.Location = New-Object System.Drawing.Point($x, $y)
  $k.Size = New-Object System.Drawing.Size(306, 32)
  $k.FlatStyle = "System"
  $parent.Controls.Add($k)
  return $k
}
$gbDienst = New-Object System.Windows.Forms.GroupBox
$gbDienst.Text = " Dienst "
$gbDienst.Location = New-Object System.Drawing.Point(10, 8)
$gbDienst.Size = New-Object System.Drawing.Size(648, 112)
$kStart    = Wartungs-Knopf $gbDienst 12 26  "Dienst starten"
$kStopp    = Wartungs-Knopf $gbDienst 328 26 "Dienst stoppen"
$kNeustart = Wartungs-Knopf $gbDienst 12 64  "Dienst neu starten"
$kStatus   = Wartungs-Knopf $gbDienst 328 64 "Status-Seite oeffnen"
$gbDaten = New-Object System.Windows.Forms.GroupBox
$gbDaten.Text = " Daten und Sicherung "
$gbDaten.Location = New-Object System.Drawing.Point(10, 128)
$gbDaten.Size = New-Object System.Drawing.Size(648, 112)
$kSichern  = Wartungs-Knopf $gbDaten 12 26  "Sicherung jetzt"
$kRueckweg = Wartungs-Knopf $gbDaten 328 26 "Sicherung einspielen..."
$kProtOrd  = Wartungs-Knopf $gbDaten 12 64  "Protokoll-Ordner oeffnen"
$kAppTausch= Wartungs-Knopf $gbDaten 328 64 "App-Datei tauschen..."
$gbWeg = New-Object System.Windows.Forms.GroupBox
$gbWeg.Text = " Zuruecksetzen "
$gbWeg.Location = New-Object System.Drawing.Point(10, 248)
$gbWeg.Size = New-Object System.Drawing.Size(648, 68)
$kEntfernen = Wartungs-Knopf $gbWeg 12 26 "Dienst vom Server entfernen (Datenbanken bleiben)"
$kEntfernen.Size = New-Object System.Drawing.Size(622, 32)
$kEntfernen.ForeColor = $rot
$tabWart.Controls.AddRange(@($gbDienst, $gbDaten, $gbWeg))

# ---- Reiter IMPORT (Etappe B) ------------------------------------------------
# Die heutigen Dateien liegen auf W: (Werkstatt-Ordner, wie im Cockpit-Werkzeug).
# Der Server liest sie NUR - geschrieben wird ausschliesslich in die Datenbank.
$WerkstattOrdnerW = "\\SCHEUDC1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender"
$lblImp = New-Object System.Windows.Forms.Label
$lblImp.Text = "Liest die heutigen Dateien von W: in die Datenbank des Servers. Wiederholbar: was schon da ist, wird gezaehlt, nicht doppelt angelegt. W: wird nur gelesen. Erst 'Nur pruefen', dann 'Import' - der Nachweis (Eintrag fuer Eintrag zurueckgelesen) steht danach im Protokoll."
$lblImp.Location = New-Object System.Drawing.Point(12, 10)
$lblImp.Size = New-Object System.Drawing.Size(646, 58)
$lblImp.ForeColor = [System.Drawing.Color]::Gray
$lblImpStandort = New-Object System.Windows.Forms.Label
$lblImpStandort.Text = "Standort:"
$lblImpStandort.Location = New-Object System.Drawing.Point(12, 76)
$lblImpStandort.Size = New-Object System.Drawing.Size(120, 22)
$cmbImpStandort = New-Object System.Windows.Forms.ComboBox
$cmbImpStandort.DropDownStyle = "DropDownList"
$cmbImpStandort.Location = New-Object System.Drawing.Point(136, 73)
$cmbImpStandort.Size = New-Object System.Drawing.Size(200, 24)
foreach ($st in $Standorte) { [void]$cmbImpStandort.Items.Add($st.Name) }
$cmbImpStandort.SelectedIndex = 0
function Import-Zeile([int]$y, [string]$titel, [string]$vorgabe) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $titel
  $l.Location = New-Object System.Drawing.Point(12, $y)
  $l.Size = New-Object System.Drawing.Size(120, 22)
  $t = New-Object System.Windows.Forms.TextBox
  $t.Text = $vorgabe
  $t.Location = New-Object System.Drawing.Point(136, ($y - 3))
  $t.Size = New-Object System.Drawing.Size(478, 24)
  $k = New-Object System.Windows.Forms.Button
  $k.Text = "..."
  $k.Location = New-Object System.Drawing.Point(618, ($y - 4))
  $k.Size = New-Object System.Drawing.Size(40, 26)
  $k.FlatStyle = "System"
  $tabImp.Controls.AddRange(@($l, $t, $k))
  return @{ Feld = $t; Knopf = $k }
}
$zKal   = Import-Zeile 108 "Kalender-Datei:"  ($WerkstattOrdnerW + "\werkstatt-kalender-daten.json")
$zStoer = Import-Zeile 140 "Stoerungs-Datei:" ($WerkstattOrdnerW + "\werkstatt-stoerungen.json")
$chkImpFotos = New-Object System.Windows.Forms.CheckBox
$chkImpFotos.Text = "Fotos mitnehmen: Unterordner 'Fotos' neben der Kalender-Datei in den fotos-Ordner des Standorts kopieren"
$chkImpFotos.Location = New-Object System.Drawing.Point(136, 170)
$chkImpFotos.Size = New-Object System.Drawing.Size(522, 22)
$chkImpFotos.Checked = $true
$kImpVorschau = New-Object System.Windows.Forms.Button
$kImpVorschau.Text = "Nur pruefen (Vorschau, aendert nichts)"
$kImpVorschau.Location = New-Object System.Drawing.Point(12, 206)
$kImpVorschau.Size = New-Object System.Drawing.Size(316, 40)
$kImpVorschau.FlatStyle = "System"
$kImport = New-Object System.Windows.Forms.Button
$kImport.Text = "Import"
$kImport.Location = New-Object System.Drawing.Point(342, 206)
$kImport.Size = New-Object System.Drawing.Size(316, 40)
$kImport.FlatStyle = "Flat"
$kImport.BackColor = $gruen
$kImport.ForeColor = $weiss
$kImport.Font = New-Object System.Drawing.Font("Segoe UI", 10.5, [System.Drawing.FontStyle]::Bold)
$lblImpHinweis = New-Object System.Windows.Forms.Label
$lblImpHinweis.Text = "Kommt der Server nicht an W: heran (Zugriff verweigert), die beiden Dateien vorher auf den Server kopieren (z. B. Desktop) und hier waehlen. Die Datei traegt ihren Standort - eine Scheurich-Datei laesst sich nicht in Soendgen einlesen."
$lblImpHinweis.Location = New-Object System.Drawing.Point(12, 256)
$lblImpHinweis.Size = New-Object System.Drawing.Size(646, 60)
$lblImpHinweis.ForeColor = [System.Drawing.Color]::Gray
$tabImp.Controls.AddRange(@($lblImp, $lblImpStandort, $cmbImpStandort, $chkImpFotos, $kImpVorschau, $kImport, $lblImpHinweis))

# =============================================================================
#  Dauerhaft sichtbar: Ladebalken + Protokoll
# =============================================================================
$balken = New-Object System.Windows.Forms.ProgressBar
$balken.Location = New-Object System.Drawing.Point(16, 492)
$balken.Size = New-Object System.Drawing.Size(510, 12)
$balken.Style = "Marquee"
$balken.Visible = $false
$lblFortschritt = New-Object System.Windows.Forms.Label
$lblFortschritt.Location = New-Object System.Drawing.Point(532, 488)
$lblFortschritt.Size = New-Object System.Drawing.Size(152, 18)
$lblFortschritt.TextAlign = "MiddleRight"
$lblFortschritt.ForeColor = [System.Drawing.Color]::Gray
$logFeld = New-Object System.Windows.Forms.TextBox
$logFeld.Location = New-Object System.Drawing.Point(12, 510)
$logFeld.Size = New-Object System.Drawing.Size(676, 154)
$logFeld.Multiline = $true
$logFeld.ReadOnly = $true
$logFeld.ScrollBars = "Vertical"
$logFeld.Font = New-Object System.Drawing.Font("Consolas", 9)
$logFeld.BackColor = [System.Drawing.Color]::FromArgb(30, 33, 36)
$logFeld.ForeColor = [System.Drawing.Color]::Gainsboro
$kProtokoll = New-Object System.Windows.Forms.Button
$kProtokoll.Text = "Protokoll speichern..."
$kProtokoll.Location = New-Object System.Drawing.Point(536, 668)
$kProtokoll.Size = New-Object System.Drawing.Size(152, 26)
$kProtokoll.FlatStyle = "System"
$lblProtokoll = New-Object System.Windows.Forms.Label
$lblProtokoll.Text = "Protokoll - jede Aktion wird hier mitgeschrieben:"
$lblProtokoll.Location = New-Object System.Drawing.Point(12, 672)
$lblProtokoll.AutoSize = $true
$lblProtokoll.ForeColor = [System.Drawing.Color]::Gray
$fenster.Controls.AddRange(@($band, $lblStatus1, $lblStatus2, $reiter, $balken, $lblFortschritt, $logFeld, $lblProtokoll, $kProtokoll))

# =============================================================================
#  Gemeinsame Helfer (Protokoll, Meldungen, Status)
# =============================================================================
function Schreibe-Log([string]$text) {
  $zeit = (Get-Date).ToString("HH:mm:ss")
  $logFeld.AppendText($zeit + "  " + $text + [Environment]::NewLine)
  [System.Windows.Forms.Application]::DoEvents()
}
function Melde([string]$text, [string]$titel = "BTA-Cockpit Server") {
  [void][System.Windows.Forms.MessageBox]::Show($fenster, $text, $titel, "OK", "Information")
}
function Frage-JaNein([string]$text, [string]$titel = "BTA-Cockpit Server") {
  return ([System.Windows.Forms.MessageBox]::Show($fenster, $text, $titel, "YesNo", "Question") -eq "Yes")
}
function Arbeit-Beginnt { $balken.Visible = $true;  [System.Windows.Forms.Application]::DoEvents() }
function Arbeit-Fertig  { $balken.Visible = $false; $lblFortschritt.Text = ""; Aktualisiere-Status }
function Setze-Ampel($zeile, [string]$farbe, [string]$text) {
  switch ($farbe) {
    "gruen" { $zeile.Dot.BackColor = [System.Drawing.Color]::FromArgb(34, 169, 90) }
    "gelb"  { $zeile.Dot.BackColor = [System.Drawing.Color]::FromArgb(230, 184, 0) }
    "rot"   { $zeile.Dot.BackColor = [System.Drawing.Color]::FromArgb(224, 80, 60) }
    default { $zeile.Dot.BackColor = [System.Drawing.Color]::Gainsboro }
  }
  $zeile.Lab.Text = $zeile.Titel + "  -  " + $text
  [System.Windows.Forms.Application]::DoEvents()
}
function Aktualisiere-Status {
  $aufgabe = Aufgabe-Holen
  if (Test-Path -LiteralPath $dienstJs) {
    if ($aufgabe) { $lblStatus1.Text = "Dienst:  eingerichtet, Aufgabe '" + $AufgabeName + "' ist " + $aufgabe.State; $lblStatus1.ForeColor = $gruen }
    else { $lblStatus1.Text = "Dienst:  Dateien liegen da, aber keine Aufgabe - 'Einrichten' wiederholen"; $lblStatus1.ForeColor = $orange }
  } else { $lblStatus1.Text = "Dienst:  noch nicht eingerichtet"; $lblStatus1.ForeColor = $orange }
  $s = Dienst-Status (Port-Lesen)
  if ($s) {
    $teile = @()
    foreach ($p in $s.standorte.PSObject.Properties) { $teile += ($p.Name + " v" + $p.Value.version + " (" + $p.Value.eintraege + "/" + $p.Value.stoerungen + ")") }
    $lblStatus2.Text = "Antwort:  laeuft seit " + ([string]$s.gestartet).Replace("T", " ").Substring(0, 16) + " - " + ($teile -join ", "); $lblStatus2.ForeColor = $gruen
  } else { $lblStatus2.Text = "Antwort:  der Dienst antwortet nicht auf Port " + (Port-Lesen); $lblStatus2.ForeColor = $orange }
}

# =============================================================================
#  Aktion: PRUEFEN
# =============================================================================
function Pruefe-Alles([bool]$laut) {
  $ergebnis = @{}
  # 1 Admin
  $admin = Ist-Admin
  if ($admin) { Setze-Ampel $ampelZeilen[0] "gruen" "ja" } else { Setze-Ampel $ampelZeilen[0] "rot" "NEIN - Rechtsklick auf BTA-Server-Werkzeug.cmd -> Als Administrator ausfuehren" }
  $ergebnis.admin = $admin
  # 2 Ordner
  $fehlend = @()
  foreach ($o in @((Join-Path $ServerOrdner "BTA-Programm"), (Join-Path $ServerOrdner "BTA-Scheurich"), $SicherungOrdner, (Join-Path $ServerOrdner "BTA-Soendgen"))) { if (-not (Test-Path -LiteralPath $o)) { $fehlend += (Split-Path -Leaf $o) } }
  if ($fehlend.Count -eq 0) { Setze-Ampel $ampelZeilen[1] "gruen" "alle vier da" } else { Setze-Ampel $ampelZeilen[1] "rot" ("fehlt: " + ($fehlend -join ", ") + " - siehe SERVER-AUFBAU Schritt 1") }
  $ergebnis.ordner = ($fehlend.Count -eq 0)
  # 3 Gruppen
  $gFehlend = @(); foreach ($g in $Gruppen) { if (-not (Gruppe-Da $g)) { $gFehlend += $g } }
  if ($gFehlend.Count -eq 0) { Setze-Ampel $ampelZeilen[2] "gruen" "alle fuenf da" } else { Setze-Ampel $ampelZeilen[2] "gelb" ("fehlt: " + ($gFehlend -join ", ") + " - SERVER-AUFBAU Schritt 2") }
  $ergebnis.gruppen = ($gFehlend.Count -eq 0)
  # 4 Node
  if (Test-Path -LiteralPath $nodeExe) { Setze-Ampel $ampelZeilen[3] "gruen" ("im Dienst-Ordner: " + (& $nodeExe -v)) }
  elseif (Test-Path -LiteralPath $stickNode) { Setze-Ampel $ampelZeilen[3] "gelb" "auf dem Stick - Einrichten kopiert es" }
  else { Setze-Ampel $ampelZeilen[3] "rot" "fehlt - Reiter Einrichten: 'Node herunterladen'" }
  $ergebnis.node = ((Test-Path -LiteralPath $nodeExe) -or (Test-Path -LiteralPath $stickNode))
  # 5 Dienst-Dateien
  if ((Test-Path -LiteralPath $dienstJs) -and (Test-Path -LiteralPath (Join-Path $DienstOrdner "db.js")) -and (Test-Path -LiteralPath $einstellungenPfad)) { Setze-Ampel $ampelZeilen[4] "gruen" "dienst.js, db.js, einstellungen.json" }
  elseif (Test-Path -LiteralPath (Join-Path $stickDienst "dienst.js")) { Setze-Ampel $ampelZeilen[4] "gelb" "noch nicht kopiert - Einrichten macht es" }
  else { Setze-Ampel $ampelZeilen[4] "rot" "auch auf dem Stick fehlt 05-Server\dienst - Stick neu bespielen" }
  $ergebnis.dateien = (Test-Path -LiteralPath $dienstJs)
  # 6 Aufgabe
  $aufgabe = Aufgabe-Holen
  if ($aufgabe) { Setze-Ampel $ampelZeilen[5] "gruen" ("da, Zustand " + $aufgabe.State) } else { Setze-Ampel $ampelZeilen[5] "gelb" "noch nicht angelegt - Einrichten macht es" }
  $ergebnis.aufgabe = [bool]$aufgabe
  # 7 Firewall
  if (Firewall-Da) { Setze-Ampel $ampelZeilen[6] "gruen" "da" } else { Setze-Ampel $ampelZeilen[6] "gelb" "noch nicht angelegt - Einrichten macht es" }
  $ergebnis.firewall = (Firewall-Da)
  # 8 Dienst antwortet
  $port = Port-Lesen
  $s = Dienst-Status $port
  if ($s) { Setze-Ampel $ampelZeilen[7] "gruen" ("ja, Port " + $port + ", Fassung " + $s.fassung) } else { Setze-Ampel $ampelZeilen[7] "gelb" ("nein (Port " + $port + ") - nach dem Einrichten gruen") }
  $ergebnis.antwortet = [bool]$s
  if ($laut) { foreach ($z in $ampelZeilen) { Schreibe-Log ("  " + $z.Lab.Text) } }
  return $ergebnis
}
$kPruefen.Add_Click({
  try { Arbeit-Beginnt; Schreibe-Log "Pruefung gestartet."; [void](Pruefe-Alles $true); Arbeit-Fertig; Schreibe-Log "Pruefung fertig." }
  catch { Arbeit-Fertig; Schreibe-Log ("FEHLER bei der Pruefung: " + $_) }
})
$kBericht.Add_Click({
  try {
    $d = New-Object System.Windows.Forms.SaveFileDialog
    $d.Filter = "Textdatei (*.txt)|*.txt"
    $d.FileName = "BTA-Server-Pruefbericht-" + $env:COMPUTERNAME + "-" + (Get-Date).ToString("yyyy-MM-dd") + ".txt"
    try { $d.InitialDirectory = [Environment]::GetFolderPath("Desktop") } catch { }
    if ($d.ShowDialog($fenster) -eq "OK") {
      $kopf = "BTA-Cockpit - Server-Pruefbericht" + [Environment]::NewLine + "Server: " + $env:COMPUTERNAME + "   Benutzer: " + $env:USERNAME + "   Zeit: " + (Get-Date).ToString("dd.MM.yyyy HH:mm") + [Environment]::NewLine + [Environment]::NewLine
      $zeilen = ($ampelZeilen | ForEach-Object { $_.Lab.Text }) -join [Environment]::NewLine
      Schreibe-OhneBom $d.FileName ($kopf + $zeilen + [Environment]::NewLine + [Environment]::NewLine + "Protokoll:" + [Environment]::NewLine + $logFeld.Text)
      Schreibe-Log ("Pruefbericht gespeichert: " + $d.FileName)
    }
  } catch { Schreibe-Log ("FEHLER beim Speichern: " + $_) }
})

# =============================================================================
#  Aktion: NODE HERUNTERLADEN (nur wenn der Stick es nicht mitbringt)
# =============================================================================
$kNode.Add_Click({
  try {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) { Melde "Auf diesem Server fehlt curl.exe. Bitte Node ueber einen anderen Rechner laden und nach 05-Server\node\node.exe auf den Stick legen."; return }
    $zielOrdner = Join-Path $DienstOrdner "node"
    if (-not (Test-Path -LiteralPath $zielOrdner)) { New-Item -ItemType Directory -Path $zielOrdner -Force | Out-Null }
    $zip = Join-Path $env:TEMP ("node-" + $NodeFassung + ".zip")
    Arbeit-Beginnt
    Schreibe-Log ("Lade Node " + $NodeFassung + " (ca. 35 MB) von nodejs.org ...")
    $lauf = Start-Process -FilePath "curl.exe" -ArgumentList @("-L", "-f", "-sS", "-o", ('"' + $zip + '"'), $NodeUrl) -WindowStyle Hidden -PassThru
    while (-not $lauf.HasExited) { if (Test-Path -LiteralPath $zip) { $lblFortschritt.Text = ([Math]::Round((Get-Item -LiteralPath $zip).Length / 1MB)).ToString() + " MB" }; [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 250 }
    if ($lauf.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $zip)) {
      # Zweiter Weg: curl.exe kennt den Firmen-Proxy nicht von selbst, der
      # Browser auf dem Server schon (Roberto 30.09.: "ich kann ins Internet").
      # Invoke-WebRequest nimmt die Windows-Proxy-Einstellung mit.
      Schreibe-Log "curl.exe kam nicht durch - zweiter Weg ueber die Windows-Proxy-Einstellung ..."
      $lblFortschritt.Text = "laedt (2. Weg)"; [System.Windows.Forms.Application]::DoEvents()
      Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
      try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
      $alt = $ProgressPreference; $ProgressPreference = "SilentlyContinue"
      try { Invoke-WebRequest -Uri $NodeUrl -OutFile $zip -UseBasicParsing -TimeoutSec 600 } finally { $ProgressPreference = $alt }
      if (-not (Test-Path -LiteralPath $zip)) { throw "Download fehlgeschlagen (kein Internet auf dem Server oder nodejs.org gesperrt)." }
    }
    $mb = [Math]::Round((Get-Item -LiteralPath $zip).Length / 1MB)
    if ($mb -lt 20) { throw ("Download unvollstaendig: nur " + $mb + " MB statt ca. 35 MB.") }
    Schreibe-Log "Entpacke node.exe ..."
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archiv = [System.IO.Compression.ZipFile]::OpenRead($zip)
    try {
      $eintrag = $archiv.Entries | Where-Object { $_.Name -eq "node.exe" } | Select-Object -First 1
      if (-not $eintrag) { throw "node.exe nicht im Archiv gefunden." }
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($eintrag, $nodeExe, $true)
    } finally { $archiv.Dispose() }
    Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
    Arbeit-Fertig
    Schreibe-Log ("Node liegt im Dienst-Ordner: " + (& $nodeExe -v))
  } catch { Arbeit-Fertig; Schreibe-Log ("FEHLER beim Node-Download: " + $_); Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler" }
})

# =============================================================================
#  Aktion: EINRICHTEN (Vorschau oder ausfuehren)
# =============================================================================
function Baue-Einstellungen([int]$port, [bool]$mitSoendgen) {
  $p = { param($x) ($x -replace "\\", "/") }
  $standorte = [ordered]@{}
  $standorte["scheurich"] = [ordered]@{ name = "Scheurich"; datenOrdner = (& $p (Join-Path $ServerOrdner "BTA-Scheurich")) }
  if ($mitSoendgen) { $standorte["soendgen"] = [ordered]@{ name = "Soendgen Keramik"; datenOrdner = (& $p (Join-Path $ServerOrdner "BTA-Soendgen")) } }
  $e = [ordered]@{
    "_was_ist_das" = "Einstellungen des BTA-Cockpit-Dienstes - geschrieben vom BTA-Server-Werkzeug am " + (Get-Date).ToString("dd.MM.yyyy HH:mm") + ". Aenderungen nur ueber das Werkzeug."
    port = $port
    host = "0.0.0.0"
    appDatei = (& $p (Join-Path $AppOrdner "Werkstatt_Kalender_TPM.html"))
    protokollOrdner = (& $p (Join-Path $DienstOrdner "protokoll"))
    sicherungOrdner = (& $p $SicherungOrdner)
    sicherungUhrzeit = "02:00"
    sicherungBehalten = 14
    standorte = $standorte
  }
  return ($e | ConvertTo-Json -Depth 6)
}
function Einrichten-Laufen([bool]$nurVorschau) {
  $port = 0
  if (-not [int]::TryParse($txtPort.Text.Trim(), [ref]$port) -or $port -lt 1024 -or $port -gt 65535) { Melde "Bitte einen Port zwischen 1024 und 65535 eintragen (Vorgabe 8765)."; return }
  $mitSoendgen = $chkSoendgen.Checked
  $tu = -not $nurVorschau
  $praefix = if ($nurVorschau) { "VORSCHAU: " } else { "" }
  if (-not (Ist-Admin)) { Schreibe-Log "Abbruch: nicht als Administrator gestartet."; Melde "Das Werkzeug muss als Administrator laufen: Rechtsklick auf BTA-Server-Werkzeug.cmd -> Als Administrator ausfuehren."; return }
  $nodeQuelle = $null
  if (Test-Path -LiteralPath $stickNode) { $nodeQuelle = $stickNode } elseif (Test-Path -LiteralPath $nodeExe) { $nodeQuelle = $nodeExe }
  if (-not $nodeQuelle) { Schreibe-Log "Abbruch: Node fehlt (weder Stick noch Dienst-Ordner)."; Melde "Node fehlt. Entweder liegt es auf dem Stick unter 05-Server\node\node.exe, oder 'Node herunterladen' druecken."; return }
  if (-not (Test-Path -LiteralPath (Join-Path $stickDienst "dienst.js"))) { Schreibe-Log "Abbruch: 05-Server\dienst fehlt auf dem Stick."; Melde "Auf dem Stick fehlt der Ordner 05-Server\dienst mit dienst.js und db.js. Stick neu bespielen (node tools/stick-bauen.js)."; return }
  if ($tu) {
    $frage = "So einrichten?`n`nDienst-Ordner:  $DienstOrdner`nPort:  $port`nStandorte:  Scheurich" + $(if ($mitSoendgen) { ", Soendgen Keramik" } else { "" }) + "`nAufgabe:  $AufgabeName (Beim Systemstart, Konto SYSTEM)`nFirewall:  $FirewallName (TCP $port eingehend)`n`nVorhandene Dienst-Dateien und Aufgabe werden ersetzt, Datenbanken bleiben."
    if (-not (Frage-JaNein $frage "Einrichten")) { Schreibe-Log "Einrichten abgebrochen - nichts veraendert."; return }
  }
  Arbeit-Beginnt
  Schreibe-Log ($praefix + "Einrichten gestartet (Port $port).")
  try {
    # 1 Ordner
    $ordner = @($DienstOrdner, (Join-Path $DienstOrdner "node"), (Join-Path $DienstOrdner "protokoll"), $AppOrdner, $SicherungOrdner, (Join-Path $ServerOrdner "BTA-Scheurich\fotos"))
    if ($mitSoendgen) { $ordner += (Join-Path $ServerOrdner "BTA-Soendgen\fotos") }
    foreach ($o in $ordner) { if (-not (Test-Path -LiteralPath $o)) { Schreibe-Log ($praefix + "1. Ordner anlegen: " + $o); if ($tu) { New-Item -ItemType Directory -Path $o -Force | Out-Null } } }
    Schreibe-Log ($praefix + "1. Ordner: fertig.")
    # 1b Schreibrecht fuer SYSTEM: die Aufgabe laeuft als SYSTEM und schreibt die
    # Datenbanken nach C:\BTA. Hat die IT dort die Vererbung von C:\ gekappt,
    # fehlt SYSTEM - der Dienst kaeme hoch und scheiterte beim ersten Schreiben.
    # Geprueft ueber die SID S-1-5-18 (sprachunabhaengig), gesetzt mit icacls.
    $systemHatRecht = $false
    try {
      $acl = Get-Acl -LiteralPath $ServerOrdner
      foreach ($r in $acl.Access) {
        $sid = $null; try { $sid = $r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { $sid = [string]$r.IdentityReference }
        if ($sid -eq "S-1-5-18" -and $r.AccessControlType -eq "Allow" -and (($r.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Modify) -eq [System.Security.AccessControl.FileSystemRights]::Modify)) { $systemHatRecht = $true }
      }
    } catch { Schreibe-Log ($praefix + "1b. Rechte auf " + $ServerOrdner + " nicht lesbar: " + $_) }
    if ($systemHatRecht) { Schreibe-Log ($praefix + "1b. SYSTEM hat Schreibrecht auf " + $ServerOrdner + " - nichts zu tun.") }
    else {
      Schreibe-Log ($praefix + "1b. SYSTEM fehlt das Schreibrecht auf " + $ServerOrdner + " - wird gesetzt: icacls (OI)(CI)F fuer S-1-5-18")
      if ($tu) { $aus = (& icacls.exe $ServerOrdner /grant "*S-1-5-18:(OI)(CI)F" 2>&1); Schreibe-Log ("   icacls: " + (($aus | Select-Object -Last 1) -join " ")) }
    }
    # 2 Node + Dienst-Dateien
    if ($nodeQuelle -ne $nodeExe) { Schreibe-Log ($praefix + "2. Node kopieren: " + $nodeQuelle + " -> " + $nodeExe); if ($tu) { Copy-Item -LiteralPath $nodeQuelle -Destination $nodeExe -Force } }
    else { Schreibe-Log ($praefix + "2. Node liegt schon im Dienst-Ordner.") }
    foreach ($datei in @("dienst.js", "db.js")) {
      $q = Join-Path $stickDienst $datei
      Schreibe-Log ($praefix + "2. Dienst-Datei kopieren: " + $datei)
      if ($tu) { Copy-Item -LiteralPath $q -Destination (Join-Path $DienstOrdner $datei) -Force }
    }
    if ($tu) { Schreibe-Log ("   Node-Fassung: " + (& $nodeExe -v)) }
    # 3 Einstellungen
    $json = Baue-Einstellungen $port $mitSoendgen
    Schreibe-Log ($praefix + "3. einstellungen.json schreiben: " + $einstellungenPfad)
    if ($tu) { Schreibe-OhneBom $einstellungenPfad $json }
    # 4 Firewall
    Schreibe-Log ($praefix + "4. Firewall-Regel '" + $FirewallName + "' (TCP " + $port + ", eingehend, erlauben)")
    if ($tu) {
      try { Remove-NetFirewallRule -DisplayName $FirewallName -ErrorAction SilentlyContinue } catch { }
      New-NetFirewallRule -DisplayName $FirewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Any -Description "BTA-Cockpit-Dienst (node.exe) - Cockpit-Programme im Firmennetz" | Out-Null
    }
    # 5 Aufgabe
    Schreibe-Log ($praefix + "5. Aufgabe '" + $AufgabeName + "': Beim Systemstart, Konto SYSTEM, ohne Zeitlimit, Neustart bei Fehler (3x je 1 min)")
    if ($tu) {
      $alt = Aufgabe-Holen
      if ($alt) { try { Stop-ScheduledTask -TaskName $AufgabeName -ErrorAction SilentlyContinue } catch { }; Unregister-ScheduledTask -TaskName $AufgabeName -Confirm:$false }
      foreach ($pz in (Dienst-Prozesse)) { try { Stop-Process -Id $pz.ProcessId -Force -ErrorAction SilentlyContinue } catch { } }
      $aktion = New-ScheduledTaskAction -Execute $nodeExe -Argument ('--no-warnings "' + $dienstJs + '" "' + $einstellungenPfad + '"') -WorkingDirectory $DienstOrdner
      $ausloeser = New-ScheduledTaskTrigger -AtStartup
      $konto = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
      $regeln = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
      # Bekannter Haken ab Windows 10 / Server 2016: die Null-Zeitspanne oben wird
      # verworfen und es gilt wieder das Vorgabe-Limit von 3 Tagen - der Dienst
      # wuerde nach drei Tagen beendet. "PT0S" direkt gesetzt heisst "kein Limit".
      $regeln.ExecutionTimeLimit = "PT0S"
      Register-ScheduledTask -TaskName $AufgabeName -Action $aktion -Trigger $ausloeser -Principal $konto -Settings $regeln -Description "BTA-Cockpit-Dienst: haelt die Datenbanken, beantwortet die Cockpit-Programme, sichert nachts. Eingerichtet vom BTA-Server-Werkzeug." | Out-Null
    }
    # 6 Starten
    Schreibe-Log ($praefix + "6. Dienst starten und /api/status abfragen")
    if ($tu) {
      Start-ScheduledTask -TaskName $AufgabeName
      $s = Warte-Auf-Dienst $port 20
      if ($s) {
        $teile = @(); foreach ($p2 in $s.standorte.PSObject.Properties) { $teile += ($p2.Name + ": Version " + $p2.Value.version + ", " + $p2.Value.eintraege + " Eintraege, " + $p2.Value.stoerungen + " Stoerberichte") }
        Schreibe-Log ("   Dienst antwortet: Fassung " + $s.fassung + " - " + ($teile -join " | "))
        Arbeit-Fertig
        Schreibe-Log "Fertig eingerichtet."
        Melde ("Fertig eingerichtet.`n`nDer Dienst laeuft und startet ab jetzt mit dem Server.`nStatus-Seite: http://" + $env:COMPUTERNAME + ":" + $port + "/status`n`nSie oeffnet sich gleich im Browser.")
        Start-Process ("http://localhost:" + $port + "/status")
      } else {
        Arbeit-Fertig
        $prot = Join-Path $DienstOrdner "protokoll"
        Schreibe-Log "   Der Dienst antwortet NICHT binnen 20 s."
        Melde ("Der Dienst antwortet nicht.`n`nBitte den Protokoll-Ordner ansehen (Reiter Wartung -> Protokoll-Ordner oeffnen):`n" + $prot + "`n`nHaeufigste Ursache: Port belegt oder node.exe wird vom Virenscanner blockiert.") "Dienst"
      }
    } else {
      Arbeit-Fertig
      Schreibe-Log "VORSCHAU fertig - nichts veraendert. Wenn alles passt: 'Einrichten'."
    }
  } catch {
    Arbeit-Fertig
    Schreibe-Log ("FEHLER beim Einrichten: " + $_)
    Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler"
  }
}
$kVorschau.Add_Click({ Einrichten-Laufen $true })
$kEinrichten.Add_Click({ Einrichten-Laufen $false })

# =============================================================================
#  Aktion: IMPORT (Etappe B) - Vorschau oder ausfuehren
# =============================================================================
function Datei-Waehlen($feld, [string]$titel) {
  $d = New-Object System.Windows.Forms.OpenFileDialog
  $d.Title = $titel
  $d.Filter = "JSON-Datei (*.json)|*.json|Alle Dateien (*.*)|*.*"
  try { $start = Split-Path -Parent $feld.Text; if ($start -and [System.IO.Directory]::Exists($start)) { $d.InitialDirectory = $start } else { $d.InitialDirectory = (Join-Path $ServerOrdner "BTA-Programm\Installation") } } catch { }
  if ($d.ShowDialog($fenster) -eq "OK") { $feld.Text = $d.FileName; Schreibe-Log ("Datei gewaehlt: " + $d.FileName) }
}
$zKal.Knopf.Add_Click({ Datei-Waehlen $zKal.Feld "Kalender-Datei (werkstatt-kalender-daten.json)" })
$zStoer.Knopf.Add_Click({ Datei-Waehlen $zStoer.Feld "Stoerungs-Datei (werkstatt-stoerungen.json)" })

function Import-Sende([string]$standortId, [string]$bereich, [string]$pfad, [bool]$nurVorschau) {
  # -InFile schickt die Datei so, wie sie ist (4-5 MB) - ohne sie in PowerShell
  # zu zerlegen; zaehlen und vergleichen macht der Dienst.
  $port = Port-Lesen
  $weg = "http://localhost:" + $port + "/api/" + $standortId + "/import?bereich=" + $bereich + "&benutzer=" + $env:USERNAME
  if ($nurVorschau) { $weg += "&nurPruefen=1" }
  return Invoke-RestMethod -Method Post -Uri $weg -ContentType "application/json; charset=utf-8" -InFile $pfad -TimeoutSec 600
}
function Datei-Lesbar([string]$pfad) {
  # Test-Path wirft bei "Zugriff verweigert" (UNC-Pfad, fremdes Konto) unter
  # ErrorActionPreference=Stop eine Ausnahme - so kam am 30.09. um 21:47 das
  # WinForms-Fehlerfenster statt einer Meldung. Hier: nie werfen, Grund nennen.
  if (-not $pfad) { return "kein Pfad eingetragen" }
  try {
    if ([System.IO.File]::Exists($pfad)) { [void][System.IO.File]::OpenRead($pfad).Dispose(); return $null }
    try { $null = Get-Item -LiteralPath $pfad -ErrorAction Stop; return "ist keine Datei" }
    catch { if ($_.Exception -is [System.UnauthorizedAccessException] -or $_.Exception.Message -match "verweigert|denied") { return "Zugriff verweigert (das Server-Konto " + $env:USERDOMAIN + "\" + $env:USERNAME + " darf dort nicht lesen)" } else { return "nicht gefunden" } }
  } catch { return "Zugriff verweigert: " + $_.Exception.Message }
}
function Import-Laufen([bool]$nurVorschau) {
  $praefix = if ($nurVorschau) { "VORSCHAU: " } else { "" }
  $st = $Standorte[$cmbImpStandort.SelectedIndex]
  $kal = $zKal.Feld.Text.Trim(); $stoer = $zStoer.Feld.Text.Trim()
  foreach ($p in @($kal, $stoer)) {
    $grund = Datei-Lesbar $p
    if ($grund) {
      Schreibe-Log ("Import: " + $p + " - " + $grund)
      Melde ("Datei nicht lesbar:`n" + $p + "`n`nGrund: " + $grund + "`n`nErsatzweg: Die beiden Dateien (und den Ordner 'Fotos', falls vorhanden) von deinem PC aus von W: nach \\" + $env:COMPUTERNAME + "\BTA\BTA-Programm\Installation kopieren und hier ueber '...' unter C:\BTA\BTA-Programm\Installation waehlen.")
      return
    }
  }
  if (-not (Dienst-Status (Port-Lesen))) { Melde "Der Dienst antwortet nicht - erst im Reiter Wartung starten."; return }
  $kalMb = [Math]::Round((Get-Item -LiteralPath $kal).Length / 1MB, 1); $stoerMb = [Math]::Round((Get-Item -LiteralPath $stoer).Length / 1MB, 1)
  if (-not $nurVorschau) {
    $frage = "Import in die Datenbank " + $st.Name + "?`n`nKalender:  $kal ($kalMb MB)`nStoerungen:  $stoer ($stoerMb MB)`n`nW: wird nur gelesen. Was schon in der Datenbank steht, wird nicht doppelt angelegt."
    if (-not (Frage-JaNein $frage "Import")) { Schreibe-Log "Import abgebrochen - nichts veraendert."; return }
  }
  Arbeit-Beginnt
  Schreibe-Log ($praefix + "Import " + $st.Name + " gestartet - Kalender $kalMb MB, Stoerungen $stoerMb MB")
  $uhr = [System.Diagnostics.Stopwatch]::StartNew()
  $ergebnisse = @()
  try {
    foreach ($teil in @(@{ Bereich = "kalender"; Pfad = $kal; Titel = "Kalender" }, @{ Bereich = "stoerungen"; Pfad = $stoer; Titel = "Stoerungen" })) {
      $lblFortschritt.Text = $teil.Titel + " ..."; [System.Windows.Forms.Application]::DoEvents()
      $t0 = $uhr.ElapsedMilliseconds
      try { $r = Import-Sende $st.Id $teil.Bereich $teil.Pfad $nurVorschau }
      catch {
        $detail = ""
        try { $detail = ($_.ErrorDetails.Message | ConvertFrom-Json).fehler } catch { $detail = [string]$_ }
        throw ($teil.Titel + ": " + $detail)
      }
      $ms = $uhr.ElapsedMilliseconds - $t0
      $kopf = $r.kopf
      Schreibe-Log ($praefix + $teil.Titel + ": Datei-Kopf format=" + $kopf.format + ", standort=" + $kopf.standort + ", gespeichert " + $kopf.savedAt)
      Schreibe-Log ($praefix + $teil.Titel + ": " + $r.gelesen + " gelesen - " + $r.neu + " neu, " + $r.geaendert + " geaendert, " + $r.unveraendert + " unveraendert, " + $r.geloescht + " geloescht (Loeschliste), " + $r.konfig + " Einstellungen, " + $r.ohneId + " ohne Kennung  [" + $ms + " ms]")
      # Die Kennkarte der App zaehlt nur fachliche Zeilen - diese Zahl muss zu ihr passen.
      Schreibe-Log ($praefix + $teil.Titel + ": davon " + $r.davon.fachlich + " FACHLICH (= Kennkarte), " + $r.davon.verlauf + " Verlauf, " + $r.davon.einstellungen + " Einstellungen")
      if (-not $nurVorschau) {
        $n = $r.nachweis
        $satz = if ($n.abweichungen -eq 0) { "NACHWEIS OK - " + $n.eintraegeVerglichen + " Eintraege zurueckgelesen, 0 Abweichungen" } else { "NACHWEIS ROT - " + $n.abweichungen + " Abweichungen: " + (($n.beispiele | Select-Object -First 3) -join "; ") }
        Schreibe-Log ("   " + $satz)
        Schreibe-Log ("   Datenbank " + $st.Name + " vorher: " + $r.stand.vorher.eintraege + " Eintraege / " + $r.stand.vorher.stoerungen + " Stoerberichte  ->  nachher: " + $r.stand.nachher.eintraege + " / " + $r.stand.nachher.stoerungen + " fachlich (dazu Verlauf " + ($r.stand.nachher.verlauf.eintraege + $r.stand.nachher.verlauf.stoerungen) + ", Einstellungen " + ($r.stand.nachher.system.eintraege + $r.stand.nachher.system.stoerungen) + ")  (Version " + $r.version + ")")
      }
      $ergebnisse += $r
    }
    # Fotos: Unterordner "Fotos" neben der Kalender-Datei -> <Standort>\fotos (nur Dateien, die dort fehlen oder eine andere Groesse haben)
    if ($chkImpFotos.Checked) {
      $fotoQuelle = Join-Path (Split-Path -Parent $kal) "Fotos"
      $fotoZiel = Join-Path $st.Ordner "fotos"
      $fotoDa = $false; try { $fotoDa = [System.IO.Directory]::Exists($fotoQuelle) } catch { $fotoDa = $false }
      if ($fotoDa) {
        $dateien = @(); try { $dateien = @(Get-ChildItem -LiteralPath $fotoQuelle -File -ErrorAction Stop) } catch { Schreibe-Log ($praefix + "Fotos: Ordner " + $fotoQuelle + " nicht lesbar - " + $_.Exception.Message) }
        $kopiert = 0; $gleich = 0
        foreach ($f in $dateien) {
          $z = Join-Path $fotoZiel $f.Name
          if ((Test-Path -LiteralPath $z) -and ((Get-Item -LiteralPath $z).Length -eq $f.Length)) { $gleich++; continue }
          if (-not $nurVorschau) { if (-not (Test-Path -LiteralPath $fotoZiel)) { New-Item -ItemType Directory -Path $fotoZiel -Force | Out-Null }; Copy-Item -LiteralPath $f.FullName -Destination $z -Force }
          $kopiert++
        }
        Schreibe-Log ($praefix + "Fotos: " + $dateien.Count + " Dateien in " + $fotoQuelle + " - " + $kopiert + $(if ($nurVorschau) { " zu kopieren, " } else { " kopiert, " }) + $gleich + " schon da")
      } else { Schreibe-Log ($praefix + "Fotos: kein Unterordner 'Fotos' neben der Kalender-Datei - nichts zu kopieren") }
    }
    Arbeit-Fertig
    $gesamt = [Math]::Round($uhr.ElapsedMilliseconds / 1000, 1)
    if ($nurVorschau) { Schreibe-Log ("VORSCHAU fertig in $gesamt s - nichts veraendert. Wenn die Zahlen zur Kennkarte im Cockpit passen: 'Import'.") }
    else {
      $rot = @($ergebnisse | Where-Object { $_.nachweis.abweichungen -gt 0 }).Count
      Schreibe-Log ("Import fertig in $gesamt s." + $(if ($rot -eq 0) { " Beide Nachweise OK." } else { " ACHTUNG: $rot Nachweis(e) rot - Protokoll speichern und schicken." }))
      $letzt = $ergebnisse[-1]
      Melde ("Import fertig (" + $gesamt + " s).`n`n" + $st.Name + " hat jetzt " + $letzt.stand.nachher.eintraege + " Eintraege und " + $letzt.stand.nachher.stoerungen + " Stoerberichte.`n`nBitte mit der Kennkarte im heutigen Cockpit vergleichen (Zahnrad -> Verlauf & Sicherung).`n" + $(if ($rot -eq 0) { "Nachweis: 0 Abweichungen." } else { "ACHTUNG: Nachweis rot - Protokoll schicken." }))
    }
  } catch {
    Arbeit-Fertig
    Schreibe-Log ("FEHLER beim Import: " + $_)
    Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler"
  }
}
$kImpVorschau.Add_Click({ Import-Laufen $true })
$kImport.Add_Click({ Import-Laufen $false })

# =============================================================================
#  Aktion: WARTUNG
# =============================================================================
function Dienst-Starten {
  $aufgabe = Aufgabe-Holen
  if (-not $aufgabe) { Melde "Es gibt noch keine Aufgabe '$AufgabeName' - erst 'Einrichten'."; return $false }
  Schreibe-Log "Dienst starten ..."
  Start-ScheduledTask -TaskName $AufgabeName
  $s = Warte-Auf-Dienst (Port-Lesen) 20
  if ($s) { Schreibe-Log ("Dienst laeuft (Fassung " + $s.fassung + ")."); return $true }
  Schreibe-Log "Dienst antwortet nicht binnen 20 s - Protokoll-Ordner ansehen."; return $false
}
function Dienst-Stoppen {
  Schreibe-Log "Dienst stoppen ..."
  try { Stop-ScheduledTask -TaskName $AufgabeName -ErrorAction SilentlyContinue } catch { }
  Start-Sleep -Milliseconds 800
  foreach ($pz in (Dienst-Prozesse)) { try { Stop-Process -Id $pz.ProcessId -Force -ErrorAction SilentlyContinue; Schreibe-Log ("  node.exe (PID " + $pz.ProcessId + ") beendet.") } catch { } }
  for ($i = 0; $i -lt 10; $i++) { if (-not (Dienst-Status (Port-Lesen))) { break }; Start-Sleep -Milliseconds 300 }
  if (Dienst-Status (Port-Lesen)) { Schreibe-Log "Der Dienst antwortet weiterhin - lief er von Hand gestartet?"; return $false }
  Schreibe-Log "Dienst gestoppt."; return $true
}
$kStart.Add_Click({ try { Arbeit-Beginnt; [void](Dienst-Starten); Arbeit-Fertig } catch { Arbeit-Fertig; Schreibe-Log ("FEHLER: " + $_) } })
$kStopp.Add_Click({ try { Arbeit-Beginnt; [void](Dienst-Stoppen); Arbeit-Fertig } catch { Arbeit-Fertig; Schreibe-Log ("FEHLER: " + $_) } })
$kNeustart.Add_Click({ try { Arbeit-Beginnt; [void](Dienst-Stoppen); [void](Dienst-Starten); Arbeit-Fertig } catch { Arbeit-Fertig; Schreibe-Log ("FEHLER: " + $_) } })
$kStatus.Add_Click({ Start-Process ("http://localhost:" + (Port-Lesen) + "/status"); Schreibe-Log "Status-Seite geoeffnet." })
$kProtOrd.Add_Click({ $p = Join-Path $DienstOrdner "protokoll"; if (Test-Path -LiteralPath $p) { Start-Process explorer.exe $p } else { Melde "Es gibt noch keinen Protokoll-Ordner - der Dienst ist noch nicht eingerichtet." } })
$kSichern.Add_Click({
  try {
    $port = Port-Lesen
    if (-not (Dienst-Status $port)) { Melde "Der Dienst antwortet nicht - erst starten."; return }
    Arbeit-Beginnt; Schreibe-Log "Sicherung angefordert ..."
    $r = Invoke-RestMethod -Method Post -Uri ("http://localhost:" + $port + "/api/scheurich/sicherung") -ContentType "application/json" -Body "{}" -TimeoutSec 120
    foreach ($e in $r.ergebnis) { if ($e.fehler) { Schreibe-Log ("  " + $e.standort + ": FEHLER " + $e.fehler) } else { Schreibe-Log ("  " + $e.standort + ": " + $e.datenbank + " (" + [Math]::Round($e.bytes / 1024) + " kB) + Export") } }
    Arbeit-Fertig; Schreibe-Log ("Sicherung fertig: " + $SicherungOrdner)
  } catch { Arbeit-Fertig; Schreibe-Log ("FEHLER bei der Sicherung: " + $_) }
})
$kRueckweg.Add_Click({
  try {
    $d = New-Object System.Windows.Forms.OpenFileDialog
    $d.Title = "Welche Sicherung einspielen? (Datenbank-Kopie eines Standorts)"
    $d.Filter = "Datenbank-Kopie (*.sqlite)|*.sqlite"
    if (Test-Path -LiteralPath $SicherungOrdner) { $d.InitialDirectory = $SicherungOrdner }
    if ($d.ShowDialog($fenster) -ne "OK") { return }
    $quelle = $d.FileName
    $name = [System.IO.Path]::GetFileNameWithoutExtension($quelle)
    $standort = $null
    foreach ($st in $Standorte) { if ($name -like ("*_" + $st.Id)) { $standort = $st } }
    if (-not $standort) { Melde "Aus dem Dateinamen ist der Standort nicht zu erkennen (erwartet: ..._scheurich.sqlite oder ..._soendgen.sqlite)."; return }
    $ziel = Join-Path $standort.Ordner "cockpit.sqlite"
    $frage = "Sicherung einspielen?`n`nQuelle:  $quelle`nZiel:  $ziel (" + $standort.Name + ")`n`nDer Dienst wird gestoppt, die heutige Datenbank wird vorher als Kopie 'cockpit.vor-rueckweg-<Zeit>.sqlite' aufgehoben, dann wird die Sicherung eingespielt und der Dienst neu gestartet."
    if (-not (Frage-JaNein $frage "Sicherung einspielen")) { Schreibe-Log "Rueckweg abgebrochen."; return }
    Arbeit-Beginnt
    Schreibe-Log ("Rueckweg " + $standort.Name + ": " + $quelle)
    if (-not (Dienst-Stoppen)) { throw "Der Dienst liess sich nicht stoppen - Rueckweg abgebrochen, nichts veraendert." }
    $stempel = (Get-Date).ToString("yyyy-MM-dd-HH-mm")
    if (Test-Path -LiteralPath $ziel) { Copy-Item -LiteralPath $ziel -Destination (Join-Path $standort.Ordner ("cockpit.vor-rueckweg-" + $stempel + ".sqlite")) -Force; Schreibe-Log "  Heutige Datenbank aufgehoben: cockpit.vor-rueckweg-$stempel.sqlite" }
    foreach ($rest in @("cockpit.sqlite-wal", "cockpit.sqlite-shm")) { $r = Join-Path $standort.Ordner $rest; if (Test-Path -LiteralPath $r) { Remove-Item -LiteralPath $r -Force } }
    Copy-Item -LiteralPath $quelle -Destination $ziel -Force
    Schreibe-Log "  Sicherung eingespielt."
    if (Dienst-Starten) {
      $s = Dienst-Status (Port-Lesen)
      $st2 = $s.standorte.($standort.Id)
      Schreibe-Log ("  Stand jetzt: Version " + $st2.version + ", " + $st2.eintraege + " Eintraege, " + $st2.stoerungen + " Stoerberichte.")
      Melde ("Rueckweg fertig.`n`n" + $standort.Name + ": Version " + $st2.version + ", " + $st2.eintraege + " Eintraege, " + $st2.stoerungen + " Stoerberichte.`nDie vorige Datenbank liegt als cockpit.vor-rueckweg-$stempel.sqlite daneben.")
    }
    Arbeit-Fertig
  } catch { Arbeit-Fertig; Schreibe-Log ("FEHLER beim Rueckweg: " + $_); Melde ("Das hat nicht geklappt:`n`n" + $_) "Fehler" }
})
$kAppTausch.Add_Click({
  try {
    $d = New-Object System.Windows.Forms.OpenFileDialog
    $d.Title = "Neue App-Datei (Werkstatt_Kalender_TPM.html)"
    $d.Filter = "App-Datei (*.html)|*.html"
    if ($d.ShowDialog($fenster) -ne "OK") { return }
    if (-not (Test-Path -LiteralPath $AppOrdner)) { New-Item -ItemType Directory -Path $AppOrdner -Force | Out-Null }
    $ziel = Join-Path $AppOrdner "Werkstatt_Kalender_TPM.html"
    if (Test-Path -LiteralPath $ziel) { $alt = Join-Path $AppOrdner ("Werkstatt_Kalender_TPM.vor-" + (Get-Date).ToString("yyyy-MM-dd-HH-mm") + ".html"); Copy-Item -LiteralPath $ziel -Destination $alt -Force; Schreibe-Log ("  Alte App-Datei aufgehoben: " + (Split-Path -Leaf $alt)) }
    Copy-Item -LiteralPath $d.FileName -Destination $ziel -Force
    Schreibe-Log ("App-Datei getauscht: " + $d.FileName + " -> " + $ziel + " (" + [Math]::Round((Get-Item -LiteralPath $ziel).Length / 1024) + " kB). Jeder Rechner hat sie beim naechsten Oeffnen.")
  } catch { Schreibe-Log ("FEHLER beim Tausch: " + $_) }
})
$kEntfernen.Add_Click({
  try {
    if (-not (Frage-JaNein "Den Dienst vom Server entfernen?`n`nEntfernt: Aufgabe, Firewall-Regel, Dienst-Ordner (Node, dienst.js, Einstellungen, Protokoll).`nBLEIBT: die Datenbanken in BTA-Scheurich/BTA-Soendgen, die App-Datei, die Sicherungen." "Entfernen")) { return }
    if (-not (Frage-JaNein "Wirklich? Das laesst sich mit 'Einrichten' jederzeit wieder aufbauen." "Entfernen - zweite Nachfrage")) { return }
    Arbeit-Beginnt
    [void](Dienst-Stoppen)
    if (Aufgabe-Holen) { Unregister-ScheduledTask -TaskName $AufgabeName -Confirm:$false; Schreibe-Log "  Aufgabe entfernt." }
    try { Remove-NetFirewallRule -DisplayName $FirewallName -ErrorAction SilentlyContinue; Schreibe-Log "  Firewall-Regel entfernt." } catch { }
    if (Test-Path -LiteralPath $DienstOrdner) { Remove-Item -LiteralPath $DienstOrdner -Recurse -Force; Schreibe-Log ("  Dienst-Ordner entfernt: " + $DienstOrdner) }
    Arbeit-Fertig
    Schreibe-Log "Dienst vom Server entfernt. Datenbanken, App und Sicherungen sind unberuehrt."
  } catch { Arbeit-Fertig; Schreibe-Log ("FEHLER beim Entfernen: " + $_) }
})
$kProtokoll.Add_Click({
  try {
    $d = New-Object System.Windows.Forms.SaveFileDialog
    $d.Filter = "Textdatei (*.txt)|*.txt"
    $d.FileName = "BTA-Server-Werkzeug-Protokoll-" + (Get-Date).ToString("yyyy-MM-dd-HHmm") + ".txt"
    try { $d.InitialDirectory = [Environment]::GetFolderPath("Desktop") } catch { }
    if ($d.ShowDialog($fenster) -eq "OK") { Schreibe-OhneBom $d.FileName $logFeld.Text; Schreibe-Log ("Protokoll gespeichert: " + $d.FileName) }
  } catch { Schreibe-Log ("FEHLER beim Speichern: " + $_) }
})

# =============================================================================
#  Start
# =============================================================================
# $( ... ) statt ( ... ): in runden Klammern liest PowerShell "if" als Befehl
# und bricht mit "The term 'if' is not recognized" ab - so blieb das Fenster
# am 30.09. auf dem Server unsichtbar (Robertos "Fenster blitzt auf, nichts oeffnet sich").
$adminText = $(if (Ist-Admin) { " (Administrator)" } else { " (KEIN Administrator - bitte neu starten: Rechtsklick -> Als Administrator ausfuehren)" })
Schreibe-Log ("BTA-Server-Werkzeug gestartet auf " + $env:COMPUTERNAME + " als " + $env:USERDOMAIN + "\" + $env:USERNAME + $adminText)
Schreibe-Log ("Stick-Paket: " + $paket)
Aktualisiere-Status
try { [void](Pruefe-Alles $false) } catch { Schreibe-Log ("Hinweis: erste Pruefung unvollstaendig - " + $_) }
[void]$fenster.ShowDialog()
