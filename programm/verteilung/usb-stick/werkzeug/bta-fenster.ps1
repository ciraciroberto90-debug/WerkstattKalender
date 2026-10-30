# BTA-Cockpit: Das FENSTER des Werkzeugs - Assistent (Vorlage A) mit Ampel-Tafel
# (Vorlage C) dahinter. Robertos Wahl vom 30.10.2026 (Roll-out 79).
# ================================================================================
#
# Wird von bta-werkzeug.ps1 eingebunden; erwartet $hier, $paket. Alles, was das
# Werkzeug TUT, steht in bta-kern.ps1 - hier stehen nur Bildschirme und Knoepfe.
#
# Drei Schritte fuer den Laien:
#   1  Das Werkzeug schaut sich um (Lage als Ampelzeilen)         -> Weiter
#   2  EINE Frage: Wofuer ist dieser Rechner? (Karten)            -> Einrichten
#      Am Server stattdessen: Was soll passieren? (Karten)        -> Ausfuehren
#   3  Gruener Haken oder rote Zeile mit dem einen naechsten Schritt
# "Mehr..." oeffnet die Tafel: je Zeile eine Ampel und ein Reparatur-Knopf,
# ein Knopf "Alles einrichten, was fehlt", darunter die Fachknoepfe.
#
# Bewusst ohne Umlaute im Quelltext (PowerShell 5.1 liest die Datei sonst je
# nach Kodierung falsch) - im Fenster steht deshalb "Pruefen".
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
try {
  [System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)
  [System.Windows.Forms.Application]::add_ThreadException([System.Threading.ThreadExceptionEventHandler]{
    param($sender, $e)
    try { $logFeld.AppendText((Get-Date).ToString("HH:mm:ss") + "  FEHLER " + $e.Exception.Message + [Environment]::NewLine) } catch { }
    try { [void][System.Windows.Forms.MessageBox]::Show("Unerwarteter Fehler: " + $e.Exception.Message + "`n`nDas Werkzeug laeuft weiter. Bitte Protokoll speichern und schicken.", "BTA-Cockpit Werkzeug", "OK", "Warning") } catch { }
  })
} catch { }

# ---- Farben und Schriften ----------------------------------------------------
$dunkel  = [System.Drawing.Color]::FromArgb(30, 39, 97)
$tinte   = [System.Drawing.Color]::FromArgb(34, 38, 43)
$gruen   = [System.Drawing.Color]::FromArgb(31, 122, 61)
$orange  = [System.Drawing.Color]::FromArgb(176, 108, 0)
$rot     = [System.Drawing.Color]::FromArgb(178, 58, 52)
$gelb    = [System.Drawing.Color]::FromArgb(201, 162, 39)
$grauhell= [System.Drawing.Color]::FromArgb(244, 245, 247)
$grau    = [System.Drawing.Color]::FromArgb(138, 144, 153)
$linie   = [System.Drawing.Color]::FromArgb(214, 217, 220)
$weiss   = [System.Drawing.Color]::White
$fNormal = New-Object System.Drawing.Font("Segoe UI", 9.75)
$fFett   = New-Object System.Drawing.Font("Segoe UI", 9.75, [System.Drawing.FontStyle]::Bold)
$fGross  = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
$fFrage  = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$fKlein  = New-Object System.Drawing.Font("Segoe UI", 8.5)
$fHaken  = New-Object System.Drawing.Font("Segoe UI", 34, [System.Drawing.FontStyle]::Bold)
$B = 700   # Fensterbreite innen

# ---- Fenster + Kopfband ------------------------------------------------------
$fenster = New-Object System.Windows.Forms.Form
$fenster.Text = "BTA-Cockpit - Werkzeug"
$fenster.ClientSize = New-Object System.Drawing.Size($B, 740)
$fenster.FormBorderStyle = "FixedSingle"
$fenster.MaximizeBox = $false
$fenster.StartPosition = "CenterScreen"
$fenster.BackColor = $weiss
$fenster.Font = $fNormal

$band = New-Object System.Windows.Forms.Panel
$band.Location = New-Object System.Drawing.Point(0, 0); $band.Size = New-Object System.Drawing.Size($B, 60); $band.BackColor = $dunkel
$logo = New-Object System.Windows.Forms.Label
$logo.Text = "S"; $logo.Size = New-Object System.Drawing.Size(36, 36); $logo.Location = New-Object System.Drawing.Point(16, 12); $logo.TextAlign = "MiddleCenter"
$logo.BackColor = $rot; $logo.ForeColor = $weiss; $logo.Font = $fGross
$bTitel = New-Object System.Windows.Forms.Label
$bTitel.Text = "BTA-Cockpit"; $bTitel.Location = New-Object System.Drawing.Point(62, 8); $bTitel.AutoSize = $true; $bTitel.ForeColor = $weiss; $bTitel.BackColor = $dunkel; $bTitel.Font = $fGross
$bUnter = New-Object System.Windows.Forms.Label
$bUnter.Text = "Werkzeug"; $bUnter.Location = New-Object System.Drawing.Point(64, 36); $bUnter.AutoSize = $true; $bUnter.ForeColor = [System.Drawing.Color]::FromArgb(199, 204, 210); $bUnter.BackColor = $dunkel
$band.Controls.AddRange(@($logo, $bTitel, $bUnter))

# ---- Vier Flaechen (immer nur eine sichtbar) ---------------------------------
function Neue-Flaeche {
  $p = New-Object System.Windows.Forms.Panel
  $p.Location = New-Object System.Drawing.Point(0, 60); $p.Size = New-Object System.Drawing.Size($B, 470); $p.BackColor = $weiss; $p.Visible = $false
  return $p
}
$fl1 = Neue-Flaeche; $fl2 = Neue-Flaeche; $fl3 = Neue-Flaeche; $flT = Neue-Flaeche
$flT.AutoScroll = $true

# ---- Unten: Balken, Protokoll, Knoepfe ---------------------------------------
$balken = New-Object System.Windows.Forms.ProgressBar
$balken.Location = New-Object System.Drawing.Point(16, 536); $balken.Size = New-Object System.Drawing.Size(500, 10); $balken.Style = "Marquee"; $balken.Visible = $false
$lblFortschritt = New-Object System.Windows.Forms.Label
$lblFortschritt.Location = New-Object System.Drawing.Point(520, 532); $lblFortschritt.Size = New-Object System.Drawing.Size(164, 18); $lblFortschritt.TextAlign = "MiddleRight"; $lblFortschritt.ForeColor = $grau
$logFeld = New-Object System.Windows.Forms.TextBox
$logFeld.Location = New-Object System.Drawing.Point(12, 552); $logFeld.Size = New-Object System.Drawing.Size(676, 150)
$logFeld.Multiline = $true; $logFeld.ReadOnly = $true; $logFeld.ScrollBars = "Vertical"
$logFeld.Font = New-Object System.Drawing.Font("Consolas", 9); $logFeld.BackColor = [System.Drawing.Color]::FromArgb(30, 33, 36); $logFeld.ForeColor = [System.Drawing.Color]::Gainsboro
$kMehr = New-Object System.Windows.Forms.Button
$kMehr.Text = "Mehr ..."; $kMehr.Location = New-Object System.Drawing.Point(12, 708); $kMehr.Size = New-Object System.Drawing.Size(150, 26); $kMehr.FlatStyle = "System"
$kProtokoll = New-Object System.Windows.Forms.Button
$kProtokoll.Text = "Protokoll speichern..."; $kProtokoll.Location = New-Object System.Drawing.Point(536, 708); $kProtokoll.Size = New-Object System.Drawing.Size(152, 26); $kProtokoll.FlatStyle = "System"
$lblUnten = New-Object System.Windows.Forms.Label
$lblUnten.Text = "Protokoll - jede Aktion wird hier mitgeschrieben"; $lblUnten.Location = New-Object System.Drawing.Point(172, 713); $lblUnten.AutoSize = $true; $lblUnten.ForeColor = $grau; $lblUnten.Font = $fKlein
$fenster.Controls.AddRange(@($band, $fl1, $fl2, $fl3, $flT, $balken, $lblFortschritt, $logFeld, $kMehr, $kProtokoll, $lblUnten))

# ---- Rueckkanaele fuer den Kern ------------------------------------------------
$script:Ausgabe = { param($t) $logFeld.AppendText((Get-Date).ToString("HH:mm:ss") + "  " + $t + [Environment]::NewLine); [System.Windows.Forms.Application]::DoEvents() }
$script:Fragen = { param($t, $titel) return ([System.Windows.Forms.MessageBox]::Show($fenster, $t, $titel, "YesNo", "Question") -eq "Yes") }
$script:Melden = { param($t, $titel) [void][System.Windows.Forms.MessageBox]::Show($fenster, $t, $titel, "OK", "Information") }
$script:Fortschritt = { param($t) $lblFortschritt.Text = $t; [System.Windows.Forms.Application]::DoEvents() }
$script:Pump = { [System.Windows.Forms.Application]::DoEvents() }
. (Join-Path $hier "bta-kern.ps1")

function Arbeit-Beginnt { $balken.Visible = $true; [System.Windows.Forms.Application]::DoEvents() }
function Arbeit-Fertig  { $balken.Visible = $false; $lblFortschritt.Text = "" }
function Zeige([System.Windows.Forms.Panel]$welche, [string]$unter) {
  foreach ($f in @($fl1, $fl2, $fl3, $flT)) { $f.Visible = ($f -eq $welche) }
  $bUnter.Text = $unter
  $kMehr.Text = $(if ($welche -eq $flT) { "Zurueck zum Assistenten" } else { "Mehr ..." })
}
function Ampel-Farbe([string]$farbe) { switch ($farbe) { "gruen" { return [System.Drawing.Color]::FromArgb(34, 169, 90) } "gelb" { return [System.Drawing.Color]::FromArgb(230, 184, 0) } "rot" { return [System.Drawing.Color]::FromArgb(224, 80, 60) } default { return [System.Drawing.Color]::FromArgb(200, 204, 208) } } }
function Neue-Ampelzeile($parent, [int]$y, [string]$farbe, [string]$text, [int]$breite = 640) {
  $dot = New-Object System.Windows.Forms.Panel
  $dot.Location = New-Object System.Drawing.Point(0, ($y + 4)); $dot.Size = New-Object System.Drawing.Size(14, 14); $dot.BackColor = (Ampel-Farbe $farbe)
  $lab = New-Object System.Windows.Forms.Label
  $lab.Location = New-Object System.Drawing.Point(24, $y); $lab.Size = New-Object System.Drawing.Size($breite, 22); $lab.Text = $text; $lab.AutoEllipsis = $true
  $parent.Controls.AddRange(@($dot, $lab))
  return @{ Dot = $dot; Lab = $lab }
}
function Gruener-Knopf([string]$text, [int]$x, [int]$y, [int]$b, [int]$h) {
  $k = New-Object System.Windows.Forms.Button
  $k.Text = $text; $k.Location = New-Object System.Drawing.Point($x, $y); $k.Size = New-Object System.Drawing.Size($b, $h)
  $k.FlatStyle = "Flat"; $k.BackColor = $gruen; $k.ForeColor = $weiss; $k.FlatAppearance.BorderColor = $gruen
  $k.Font = New-Object System.Drawing.Font("Segoe UI", $(if ($h -ge 40) { 12 } else { 9.75 }), [System.Drawing.FontStyle]::Bold)
  return $k
}
function Weisser-Knopf([string]$text, [int]$x, [int]$y, [int]$b, [int]$h) {
  $k = New-Object System.Windows.Forms.Button
  $k.Text = $text; $k.Location = New-Object System.Drawing.Point($x, $y); $k.Size = New-Object System.Drawing.Size($b, $h); $k.FlatStyle = "System"
  return $k
}
# Eine Karte = Rahmen mit Symbol, Titel, Untertitel; Klick waehlt sie (RadioButton dahinter).
function Neue-Karte($parent, [int]$y, [string]$sym, [string]$titel, [string]$unter, [string]$kennung) {
  $p = New-Object System.Windows.Forms.Panel
  $p.Location = New-Object System.Drawing.Point(30, $y); $p.Size = New-Object System.Drawing.Size(640, 58); $p.BackColor = $weiss; $p.BorderStyle = "FixedSingle"; $p.Tag = $kennung; $p.Cursor = "Hand"
  $s = New-Object System.Windows.Forms.Label
  $s.Text = $sym; $s.Location = New-Object System.Drawing.Point(10, 8); $s.Size = New-Object System.Drawing.Size(44, 40); $s.Font = New-Object System.Drawing.Font("Segoe UI Emoji", 18); $s.TextAlign = "MiddleCenter"; $s.Cursor = "Hand"
  $t = New-Object System.Windows.Forms.Label
  $t.Text = $titel; $t.Location = New-Object System.Drawing.Point(62, 8); $t.Size = New-Object System.Drawing.Size(560, 22); $t.Font = $fFett; $t.Cursor = "Hand"
  $u = New-Object System.Windows.Forms.Label
  $u.Text = $unter; $u.Location = New-Object System.Drawing.Point(62, 30); $u.Size = New-Object System.Drawing.Size(560, 20); $u.ForeColor = $grau; $u.Font = $fKlein; $u.Cursor = "Hand"
  $p.Controls.AddRange(@($s, $t, $u))
  $parent.Controls.Add($p)
  return $p
}
function Markiere-Karte($karten, [string]$kennung) {
  foreach ($k in $karten) {
    $gewaehlt = ($k.Tag -eq $kennung)
    $k.BackColor = $(if ($gewaehlt) { [System.Drawing.Color]::FromArgb(241, 248, 243) } else { $weiss })
    foreach ($c in $k.Controls) { $c.BackColor = $k.BackColor }
  }
}

# =============================================================================
#  Zustand
# =============================================================================
$script:lage = $null
$script:zweck = "arbeitsplatz"
$script:serverAktion = "server-einrichten"
$script:standort = "scheurich"

# =============================================================================
#  SCHRITT 1 - Das Werkzeug schaut sich um
# =============================================================================
$l1 = New-Object System.Windows.Forms.Label
$l1.Text = "SCHRITT 1 VON 3 - DAS WERKZEUG SCHAUT SICH UM"; $l1.Location = New-Object System.Drawing.Point(30, 18); $l1.AutoSize = $true; $l1.ForeColor = $grau; $l1.Font = $fKlein
$fl1Zeilen = New-Object System.Windows.Forms.Panel
$fl1Zeilen.Location = New-Object System.Drawing.Point(30, 46); $fl1Zeilen.Size = New-Object System.Drawing.Size(640, 300)
$kWeiter = Gruener-Knopf "Weiter  >" 30 380 300 44
$kNeuSchauen = Weisser-Knopf "Noch einmal nachsehen" 340 380 200 44
$kAdmin = Weisser-Knopf "Als Administrator neu starten" 30 380 300 44
$kAdmin.Visible = $false
$fl1.Controls.AddRange(@($l1, $fl1Zeilen, $kWeiter, $kNeuSchauen, $kAdmin))

function Fuelle-Schritt1 {
  $fl1Zeilen.Controls.Clear()
  Arbeit-Beginnt
  $script:lage = Erkenne-Lage
  $l = $script:lage
  Arbeit-Fertig
  $y = 0
  $z = @()
  $z += @{ F = "gruen"; T = ("Rechner " + $l.rechner + ", angemeldet als " + $l.benutzer) }
  if ($l.istServer) {
    $z += @{ F = $(if ($l.admin) { "gruen" } else { "rot" }); T = $(if ($l.admin) { "Das ist der BTA-Server - als Administrator gestartet" } else { "Das ist der BTA-Server - aber NICHT als Administrator gestartet" }) }
    $z += @{ F = $(if ($l.dienstAntwortet) { "gruen" } else { "gelb" }); T = $(if ($l.dienstAntwortet) { "Dienst laeuft, Fassung " + $l.dienstFassung + " (der Stick bringt " + $DienstFassungStick + ")" } else { "Dienst antwortet nicht" }) }
    $z += @{ F = $(if ($l.dienstDateienDa) { "gruen" } else { "gelb" }); T = $(if ($l.dienstDateienDa) { "Dienst-Dateien liegen in " + $DienstOrdner } else { "Dienst noch nicht eingerichtet" }) }
    $kAdmin.Visible = (-not $l.admin); $kWeiter.Visible = $l.admin
  } else {
    $z += @{ F = $(if ($l.programmZipDa) { "gruen" } else { "rot" }); T = $(if ($l.programmZipDa) { "Programm-Paket auf dem Stick gefunden (" + $l.programmZipMB + " MB)" } else { "Programm-Paket fehlt auf dem Stick - unter Mehr... 'Programm laden'" }) }
    if ($l.verbindungswegStick -eq "server") { $z += @{ F = $(if ($l.serverAntwortet) { "gruen" } else { "rot" }); T = $(if ($l.serverAntwortet) { "BTA-Server " + $l.serverAdresse + " antwortet (Fassung " + $l.serverFassung + ")" } else { "BTA-Server " + $l.serverAdresse + " antwortet nicht - Netz pruefen" }) } }
    else { $z += @{ F = $(if ($l.wErreichbar) { "gruen" } else { "rot" }); T = $(if ($l.wErreichbar) { "Firmenlaufwerk W: erreichbar" } else { "Firmenlaufwerk W: NICHT erreichbar - Netz pruefen" }) } }
    if ($l.exe) { $z += @{ F = "gruen"; T = ("Cockpit ist hier schon eingerichtet (Stand " + $l.exeDatum + ") - Einrichten frischt nur auf") } }
    else { $z += @{ F = "gelb"; T = "Cockpit hier noch nicht eingerichtet" } }
    $z += @{ F = "grau"; T = ("Kein Server-Rechner - der Server-Teil bleibt verborgen. Verbindungsweg laut Stick: " + $l.verbindungswegStick) }
    $kAdmin.Visible = $false; $kWeiter.Visible = $true
  }
  foreach ($e in $z) { [void](Neue-Ampelzeile $fl1Zeilen $y $e.F $e.T); $y += 30 }
  Sag ("Lage: " + $(if ($l.istServer) { "Server" } else { "Rechner" }) + " " + $l.rechner + ", Weg laut Stick: " + $l.verbindungswegStick + $(if ($l.exe) { ", Cockpit da" } else { ", Cockpit fehlt" }))
}
$kNeuSchauen.Add_Click({ Fuelle-Schritt1 })
$kAdmin.Add_Click({
  try { Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", ('"' + (Join-Path $hier "bta-werkzeug.ps1") + '"')); $fenster.Close() }
  catch { Sag ("Neustart als Administrator abgebrochen: " + $_.Exception.Message) }
})
$kWeiter.Add_Click({ if ($script:lage.istServer) { Zeige $fl2 "Schritt 2 von 3 - Was soll am Server passieren?" } else { Zeige $fl2 "Schritt 2 von 3 - Eine Frage" } })

# =============================================================================
#  SCHRITT 2 - Eine Frage (Rechner) / Was soll passieren (Server)
# =============================================================================
$l2 = New-Object System.Windows.Forms.Label
$l2.Text = "SCHRITT 2 VON 3 - EINE FRAGE"; $l2.Location = New-Object System.Drawing.Point(30, 18); $l2.AutoSize = $true; $l2.ForeColor = $grau; $l2.Font = $fKlein
$frage = New-Object System.Windows.Forms.Label
$frage.Text = "Wofuer ist dieser Rechner?"; $frage.Location = New-Object System.Drawing.Point(30, 40); $frage.Size = New-Object System.Drawing.Size(640, 30); $frage.Font = $fFrage
$fl2Karten = New-Object System.Windows.Forms.Panel
$fl2Karten.Location = New-Object System.Drawing.Point(0, 76); $fl2Karten.Size = New-Object System.Drawing.Size($B, 270)
$lblStandort = New-Object System.Windows.Forms.LinkLabel
$lblStandort.Text = "Standort: Scheurich  (aendern)"; $lblStandort.Location = New-Object System.Drawing.Point(32, 348); $lblStandort.AutoSize = $true; $lblStandort.Font = $fKlein
$kZurueck2 = Weisser-Knopf "<  Zurueck" 30 380 150 44
$kLos = Gruener-Knopf "Einrichten" 190 380 350 44
$kVorschau = Weisser-Knopf "Nur pruefen (Vorschau)" 30 430 150 30
$kVorschau.Visible = $false
$fl2.Controls.AddRange(@($l2, $frage, $fl2Karten, $lblStandort, $kZurueck2, $kLos, $kVorschau))
$script:karten = @()

function Fuelle-Schritt2 {
  $fl2Karten.Controls.Clear(); $script:karten = @()
  if ($script:lage.istServer) {
    $frage.Text = "Was soll am Server passieren?"
    $lblStandort.Visible = $false; $kVorschau.Visible = $true; $kLos.Text = "Ausfuehren"
    $dienstText = $(if ($script:lage.dienstDateienDa) { "Dienst tauschen auf Fassung " + $DienstFassungStick + " (Datenbanken bleiben)" } else { "Dienst einrichten (Fassung " + $DienstFassungStick + ")" })
    $script:karten += Neue-Karte $fl2Karten 0   "[D]" $dienstText "Ordner, Gruppen, Node, Dienst-Dateien, Firewall, Aufgabe, Start - alles in einem" "server-einrichten"
    $script:karten += Neue-Karte $fl2Karten 64  "[A]" "App-Datei tauschen ..." "Neue Werkstatt_Kalender_TPM.html auf den Server legen, die alte wird aufgehoben" "app-tauschen"
    $script:karten += Neue-Karte $fl2Karten 128 "[S]" "Sicherung jetzt" "Datenbank-Kopie und Export nach C:\BTA\BTA-Sicherung" "sicherung"
    $script:karten += Neue-Karte $fl2Karten 192 "[R]" "Sicherung einspielen ... (Rueckweg)" "Der Dienst stoppt, die heutige Datenbank wird aufgehoben, die Sicherung kommt rein" "rueckweg"
    Markiere-Karte $script:karten $script:serverAktion
  } else {
    $frage.Text = "Wofuer ist dieser Rechner?"
    $lblStandort.Visible = $true; $kVorschau.Visible = $false; $kLos.Text = "Einrichten"
    $script:karten += Neue-Karte $fl2Karten 0   "[A]" "Arbeitsplatz in der Werkstatt" "Cockpit auf dem Desktop, normal bedienbar" "arbeitsplatz"
    $script:karten += Neue-Karte $fl2Karten 64  "[I]" "Info-Bildschirm (Morgenrunde)" "startet mit Windows, Vollbild, keine Bedienung" "info"
    $script:karten += Neue-Karte $fl2Karten 128 "[L]" "Nur ansehen" "wie Arbeitsplatz - das Leserecht erkennt die App selbst" "ansehen"
    Markiere-Karte $script:karten $script:zweck
  }
  foreach ($k in $script:karten) {
    $klick = { param($s, $e) $p = $s; while ($p -and -not ($p -is [System.Windows.Forms.Panel] -and $p.Tag)) { $p = $p.Parent }; if ($p) { if ($script:lage.istServer) { $script:serverAktion = [string]$p.Tag } else { $script:zweck = [string]$p.Tag }; Markiere-Karte $script:karten ([string]$p.Tag) } }
    $k.Add_Click($klick); foreach ($c in $k.Controls) { $c.Add_Click($klick) }
  }
  $lblStandort.Text = "Standort: " + (Pfade-Fuer $script:standort).Name + "  (aendern)"
}
$lblStandort.Add_LinkClicked({ $script:standort = $(if ($script:standort -eq "scheurich") { "soendgen" } else { "scheurich" }); $lblStandort.Text = "Standort: " + (Pfade-Fuer $script:standort).Name + "  (aendern)"; Sag ("Standort gewaehlt: " + (Pfade-Fuer $script:standort).Name) })
$kZurueck2.Add_Click({ Zeige $fl1 "Schritt 1 von 3 - Rechner erkennen" })

# =============================================================================
#  SCHRITT 3 - Ergebnis
# =============================================================================
$haken = New-Object System.Windows.Forms.Label
$haken.Location = New-Object System.Drawing.Point(300, 30); $haken.Size = New-Object System.Drawing.Size(100, 100); $haken.TextAlign = "MiddleCenter"; $haken.Font = $fHaken; $haken.ForeColor = $weiss; $haken.BackColor = $gruen
$ergTitel = New-Object System.Windows.Forms.Label
$ergTitel.Location = New-Object System.Drawing.Point(30, 142); $ergTitel.Size = New-Object System.Drawing.Size(640, 32); $ergTitel.TextAlign = "MiddleCenter"; $ergTitel.Font = $fFrage
$ergText = New-Object System.Windows.Forms.Label
$ergText.Location = New-Object System.Drawing.Point(60, 178); $ergText.Size = New-Object System.Drawing.Size(580, 120); $ergText.TextAlign = "TopCenter"; $ergText.ForeColor = [System.Drawing.Color]::FromArgb(91, 101, 114)
$kOeffnen = Gruener-Knopf "Cockpit jetzt oeffnen" 175 310 350 48
$kNochmal = Weisser-Knopf "<  Noch einmal" 30 380 150 36
$kFertig = Weisser-Knopf "Fenster schliessen" 520 380 150 36
$fl3.Controls.AddRange(@($haken, $ergTitel, $ergText, $kOeffnen, $kNochmal, $kFertig))
$kNochmal.Add_Click({ Fuelle-Schritt1; Zeige $fl1 "Schritt 1 von 3 - Rechner erkennen" })
$kFertig.Add_Click({ $fenster.Close() })
function Zeige-Ergebnis([bool]$gut, [string]$titel, [string]$text, [string]$knopf) {
  $haken.Text = $(if ($gut) { [string][char]0x2713 } else { "!" }); $haken.BackColor = $(if ($gut) { $gruen } else { $rot })
  $ergTitel.Text = $titel; $ergText.Text = $text
  $kOeffnen.Visible = [bool]$knopf; if ($knopf) { $kOeffnen.Text = $knopf }
  Zeige $fl3 "Schritt 3 von 3 - Ergebnis"
}
$kOeffnen.Add_Click({
  try {
    if ($script:lage.istServer) { Start-Process ("http://localhost:" + (Port-Lesen) + "/status"); Sag "Status-Seite geoeffnet." }
    else { $exe = Finde-Exe; if ($exe) { Start-Process -FilePath $exe.FullName -WorkingDirectory $exe.DirectoryName; Sag ("Cockpit gestartet: " + $exe.FullName) } }
  } catch { Sag ("Oeffnen: " + $_.Exception.Message) }
})

# ---- Dateidialoge fuer Server-Aktionen ----------------------------------------
function Waehle-Datei([string]$titel, [string]$filter, [string]$start) {
  $d = New-Object System.Windows.Forms.OpenFileDialog
  $d.Title = $titel; $d.Filter = $filter
  try { if ($start -and (Test-Path -LiteralPath $start)) { $d.InitialDirectory = $start } } catch { }
  if ($d.ShowDialog($fenster) -eq "OK") { return $d.FileName }
  return ""
}

# ---- Der eine Knopf: Einrichten / Ausfuehren ---------------------------------
function Fuehre-Aus([bool]$vorschau) {
  try {
    Arbeit-Beginnt
    if ($script:lage.istServer) {
      $id = $script:serverAktion
      $p = @{ Vorschau = $vorschau; Port = 0; MitSoendgen = $true }
      if ($id -eq "app-tauschen") { $p.Quelle = Waehle-Datei "Neue App-Datei (Werkstatt_Kalender_TPM.html)" "App-Datei (*.html)|*.html" (Join-Path $ServerOrdner "BTA-Programm\Update"); if (-not $p.Quelle) { Arbeit-Fertig; return } }
      if ($id -eq "rueckweg") { $p.Quelle = Waehle-Datei "Welche Sicherung einspielen?" "Datenbank-Kopie (*.sqlite)|*.sqlite" $SicherungOrdner; if (-not $p.Quelle) { Arbeit-Fertig; return } }
      $erg = Tue-Aktion $id $p
      Arbeit-Fertig
      $ok = $(if ($erg -is [hashtable]) { [bool]$erg.Ok } else { [bool]$erg })
      if ($vorschau) { Sag "Vorschau fertig - nichts veraendert."; return }
      $s = Dienst-Status (Port-Lesen)
      $stand = $(if ($s) { "Dienst " + $s.fassung + " antwortet auf Port " + (Port-Lesen) } else { "Dienst antwortet gerade nicht" })
      if ($ok) { Zeige-Ergebnis $true "Erledigt" ($stand + "`n`nEinzelheiten stehen im Protokoll unten.") "Status-Seite oeffnen" }
      else { Zeige-Ergebnis $false "Nicht erledigt" "Die Aktion wurde abgebrochen oder lief rot. Die Ursache steht im Protokoll unten - Protokoll speichern und an Roberto schicken." "" }
    } else {
      $erg = Tue-Aktion "einrichten" @{ Zweck = $script:zweck; Standort = $script:standort; Weg = "" }
      Arbeit-Fertig
      $t = "Programm: " + $erg.Exe + "`nVerbindung: " + $erg.Weg + "-Weg, " + $erg.Verbindung + "`nGetan: " + ($erg.Getan -join ", ") + "`n`nErster Start: Windows-SmartScreen meldet sich nur beim allerersten Mal - 'Weitere Informationen' -> 'Trotzdem ausfuehren'."
      Zeige-Ergebnis $true "Fertig eingerichtet" $t "Cockpit jetzt oeffnen"
    }
  } catch {
    Arbeit-Fertig
    Sag ("FEHLER: " + $_.Exception.Message)
    Zeige-Ergebnis $false "Das hat nicht geklappt" ($_.Exception.Message + "`n`nWas jetzt: Meldung lesen, ggf. beheben, dann 'Noch einmal'. Bleibt es rot: Protokoll speichern und an Roberto schicken.") ""
  }
}
$kLos.Add_Click({ Fuehre-Aus $false })
$kVorschau.Add_Click({ Fuehre-Aus $true })

# =============================================================================
#  DIE TAFEL (Mehr ...) - Ampel je Zeile, Reparatur je Zeile, ein Knopf fuer alles
# =============================================================================
$lT = New-Object System.Windows.Forms.Label
$lT.Text = "SO SIEHT DIESER RECHNER AUS"; $lT.Location = New-Object System.Drawing.Point(30, 14); $lT.AutoSize = $true; $lT.ForeColor = $grau; $lT.Font = $fKlein
$flTZeilen = New-Object System.Windows.Forms.Panel
$flTZeilen.Location = New-Object System.Drawing.Point(30, 36); $flTZeilen.Size = New-Object System.Drawing.Size(640, 240)
$kAlles = Gruener-Knopf "Alles einrichten, was fehlt" 30 282 400 40
$kNeuPruefen = Weisser-Knopf "Neu pruefen" 440 282 120 40
$flT.Controls.AddRange(@($lT, $flTZeilen, $kAlles, $kNeuPruefen))
# Fachknoepfe darunter (Rechner)
$gbFach = New-Object System.Windows.Forms.GroupBox
$gbFach.Text = " Fuer Roberto und Vertretung "; $gbFach.Location = New-Object System.Drawing.Point(30, 330); $gbFach.Size = New-Object System.Drawing.Size(640, 130)
$lblKey = New-Object System.Windows.Forms.Label
$lblKey.Text = "Werkstatt-Schluessel (Server-Weg, optional):"; $lblKey.Location = New-Object System.Drawing.Point(12, 24); $lblKey.Size = New-Object System.Drawing.Size(260, 22)
$txtKey = New-Object System.Windows.Forms.TextBox
$txtKey.UseSystemPasswordChar = $true; $txtKey.Location = New-Object System.Drawing.Point(276, 21); $txtKey.Size = New-Object System.Drawing.Size(350, 24)
$kSrvEin = Weisser-Knopf "Server-Weg einschalten" 12 54 200 30
$kSrvAus = Weisser-Knopf "Server-Weg aus (Datei-Weg)" 218 54 200 30
$kPfade  = Weisser-Knopf "Pfade neu speichern" 424 54 202 30
$kLaden  = Weisser-Knopf "Programm laden (Internet)" 12 90 200 30
$kOrdner = Weisser-Knopf "Datenordner oeffnen" 218 90 200 30
$kEntf   = Weisser-Knopf "Vom Rechner entfernen" 424 90 202 30
$kEntf.ForeColor = $rot
$gbFach.Controls.AddRange(@($lblKey, $txtKey, $kSrvEin, $kSrvAus, $kPfade, $kLaden, $kOrdner, $kEntf))
# Fachknoepfe (Server)
$gbSrv = New-Object System.Windows.Forms.GroupBox
$gbSrv.Text = " Dienst und Daten "; $gbSrv.Location = New-Object System.Drawing.Point(30, 330); $gbSrv.Size = New-Object System.Drawing.Size(640, 130)
$kDStart = Weisser-Knopf "Dienst starten" 12 24 150 30
$kDStopp = Weisser-Knopf "Dienst stoppen" 168 24 150 30
$kDNeu   = Weisser-Knopf "Dienst neu starten" 324 24 150 30
$kStatus = Weisser-Knopf "Status-Seite" 480 24 146 30
$kProtOrd = Weisser-Knopf "Protokoll-Ordner" 12 60 150 30
$kImport = Weisser-Knopf "Import von W: ..." 168 60 150 30
$kNode   = Weisser-Knopf "Node herunterladen" 324 60 150 30
$kSEntf  = Weisser-Knopf "Vom Server entfernen" 480 60 146 30
$kSEntf.ForeColor = $rot
$lblSrvHinweis = New-Object System.Windows.Forms.Label
$lblSrvHinweis.Text = "Import: liest Kalender- und Stoerungs-Datei von W: in die Datenbank (erst Vorschau, dann Import). Rueckfragen kommen als Fenster."; $lblSrvHinweis.Location = New-Object System.Drawing.Point(12, 96); $lblSrvHinweis.Size = New-Object System.Drawing.Size(614, 30); $lblSrvHinweis.ForeColor = $grau; $lblSrvHinweis.Font = $fKlein
$gbSrv.Controls.AddRange(@($kDStart, $kDStopp, $kDNeu, $kStatus, $kProtOrd, $kImport, $kNode, $kSEntf, $lblSrvHinweis))
$flT.Controls.AddRange(@($gbFach, $gbSrv))

$script:tafel = @()
function Fuelle-Tafel {
  $flTZeilen.Controls.Clear()
  Arbeit-Beginnt
  $script:lage = Erkenne-Lage
  $script:tafel = Tafel $script:lage $script:zweck
  Arbeit-Fertig
  $gbFach.Visible = (-not $script:lage.istServer); $gbSrv.Visible = $script:lage.istServer
  $lT.Text = $(if ($script:lage.istServer) { "SO SIEHT DER SERVER AUS" } else { "SO SIEHT DIESER RECHNER AUS - Rechner-Art: " + $script:zweck })
  $y = 0
  foreach ($z in $script:tafel) {
    $zeile = Neue-Ampelzeile $flTZeilen $y $z.Farbe ($z.Titel + "  -  " + $z.Text) 500
    if ($z.Reparatur -and $z.Farbe -ne "gruen") {
      $k = Weisser-Knopf $(switch ($z.Reparatur) { "einrichten" { "Einrichten" } "pfade" { "Einstellen" } "serverweg-ein" { "Einstellen" } "serverweg-aus" { "Umstellen" } "verknuepfung" { "Anlegen" } "autostart-ein" { "Einschalten" } "autostart-aus" { "Ausschalten" } "programm-laden" { "Laden" } "server-einrichten" { "Einrichten" } "dienst-start" { "Starten" } "sicherung" { "Sichern" } "node-laden" { "Laden" } "als-admin" { "Neu starten" } default { "Beheben" } }) 530 ($y - 2) 110 26
      $k.Tag = $z.Reparatur
      $k.Add_Click({ param($s, $e) Repariere ([string]$s.Tag) })
      $flTZeilen.Controls.Add($k)
    }
    $y += 32
  }
  $offen = @($script:tafel | Where-Object { $_.Reparatur -and $_.Farbe -in @("rot", "gelb") -and $_.Reparatur -ne "als-admin" -and $_.Reparatur -ne "serverweg-aus" -and $_.Reparatur -ne "autostart-aus" })
  $kAlles.Text = $(if ($offen.Count) { "Alles einrichten, was fehlt  (" + $offen.Count + " Punkte)" } else { "Alles gruen - nichts zu tun" })
  $kAlles.Enabled = ($offen.Count -gt 0)
}
function Repariere([string]$id) {
  try {
    Arbeit-Beginnt
    if ($id -eq "als-admin") { $kAdmin.PerformClick(); return }
    $p = @{ Zweck = $script:zweck; Standort = $script:standort; Weg = ""; Vorschau = $false; Port = 0; MitSoendgen = $true; Schluessel = $txtKey.Text.Trim() }
    [void](Tue-Aktion $id $p)
  } catch { Sag ("FEHLER: " + $_.Exception.Message) }
  finally { Arbeit-Fertig; Fuelle-Tafel }
}
$kAlles.Add_Click({
  $getan = @()
  foreach ($z in $script:tafel) {
    if (-not $z.Reparatur -or $z.Farbe -eq "gruen" -or $z.Reparatur -in @("als-admin", "serverweg-aus", "autostart-aus")) { continue }
    if ($getan -contains $z.Reparatur) { continue }
    $getan += $z.Reparatur
    Sag ("Tafel: " + $z.Titel + " -> " + $z.Reparatur)
    try { Arbeit-Beginnt; [void](Tue-Aktion $z.Reparatur @{ Zweck = $script:zweck; Standort = $script:standort; Weg = ""; Vorschau = $false; Port = 0; MitSoendgen = $true; Schluessel = $txtKey.Text.Trim() }) } catch { Sag ("FEHLER: " + $_.Exception.Message) } finally { Arbeit-Fertig }
  }
  Fuelle-Tafel
})
$kNeuPruefen.Add_Click({ Fuelle-Tafel })
$kSrvEin.Add_Click({ Repariere "serverweg-ein" })
$kSrvAus.Add_Click({ Repariere "serverweg-aus" })
$kPfade.Add_Click({ Repariere "pfade" })
$kLaden.Add_Click({ Repariere "programm-laden" })
$kEntf.Add_Click({ Repariere "entfernen" })
$kOrdner.Add_Click({ try { $o = ((Pfade-Fuer $script:standort).Update -replace "/", "\"); if (Test-Path -LiteralPath $o) { Start-Process "explorer.exe" $o } else { Melde ("Der Datenordner ist nicht erreichbar:`n" + $o) } } catch { Sag ("FEHLER: " + $_.Exception.Message) } })
$kDStart.Add_Click({ Repariere "dienst-start" })
$kDStopp.Add_Click({ Repariere "dienst-stopp" })
$kDNeu.Add_Click({ Repariere "dienst-neustart" })
$kStatus.Add_Click({ Start-Process ("http://localhost:" + (Port-Lesen) + "/status"); Sag "Status-Seite geoeffnet." })
$kProtOrd.Add_Click({ $p = Join-Path $DienstOrdner "protokoll"; if (Test-Path -LiteralPath $p) { Start-Process explorer.exe $p } else { Melde "Es gibt noch keinen Protokoll-Ordner - der Dienst ist noch nicht eingerichtet." } })
$kNode.Add_Click({ Repariere "node-laden" })
$kSEntf.Add_Click({ Repariere "server-entfernen" })
$kImport.Add_Click({
  try {
    $w = ($WerkstattOrdnerVorgabe -replace "/", "\")
    $kal = Waehle-Datei "Kalender-Datei (werkstatt-kalender-daten.json)" "JSON-Datei (*.json)|*.json" $w; if (-not $kal) { return }
    $stoer = Waehle-Datei "Stoerungs-Datei (werkstatt-stoerungen.json)" "JSON-Datei (*.json)|*.json" (Split-Path -Parent $kal); if (-not $stoer) { return }
    $standortId = $(if ($kal -like "*soendgen*") { "soendgen" } else { "scheurich" })
    Arbeit-Beginnt
    [void](Tue-Aktion "import" @{ Standort = $standortId; Kalender = $kal; Stoerungen = $stoer; Fotos = $true; Vorschau = $true })
    Arbeit-Fertig
    if (Frage-JaNein ("Vorschau steht im Protokoll. Jetzt wirklich importieren (" + $standortId + ")?") "Import") { Arbeit-Beginnt; [void](Tue-Aktion "import" @{ Standort = $standortId; Kalender = $kal; Stoerungen = $stoer; Fotos = $true; Vorschau = $false }); Arbeit-Fertig }
  } catch { Arbeit-Fertig; Sag ("FEHLER beim Import: " + $_.Exception.Message) }
})

# ---- Mehr ... / Protokoll speichern ------------------------------------------
$kMehr.Add_Click({ if ($flT.Visible) { Zeige $fl1 "Schritt 1 von 3 - Rechner erkennen" } else { Fuelle-Tafel; Zeige $flT "Die Tafel - jede Zeile eine Ampel" } })
$kProtokoll.Add_Click({
  try {
    $d = New-Object System.Windows.Forms.SaveFileDialog
    $d.Filter = "Textdatei (*.txt)|*.txt"
    $d.FileName = "BTA-Werkzeug-Protokoll-" + $env:COMPUTERNAME + "-" + (Get-Date).ToString("yyyy-MM-dd_HHmm") + ".txt"
    try { $d.InitialDirectory = [Environment]::GetFolderPath("Desktop") } catch { }
    if ($d.ShowDialog($fenster) -eq "OK") {
      $kopf = "BTA-Cockpit - Werkzeug-Protokoll (Stand " + $WerkzeugStand + ")" + [Environment]::NewLine + "Rechner: " + $env:COMPUTERNAME + "   Benutzer: " + $env:USERNAME + "   Zeit: " + (Get-Date).ToString("dd.MM.yyyy HH:mm") + [Environment]::NewLine
      $zeilen = ""; if ($script:tafel) { $zeilen = ($script:tafel | ForEach-Object { "[" + $_.Farbe + "] " + $_.Titel + " - " + $_.Text }) -join [Environment]::NewLine }
      Schreibe-OhneBom $d.FileName ($kopf + ("-" * 60) + [Environment]::NewLine + $zeilen + [Environment]::NewLine + [Environment]::NewLine + $logFeld.Text)
      Sag ("Protokoll gespeichert: " + $d.FileName)
    }
  } catch { Sag ("FEHLER beim Speichern: " + $_.Exception.Message) }
})

# =============================================================================
#  Start
# =============================================================================
Sag ("BTA-Werkzeug (Stand " + $WerkzeugStand + ") gestartet vom Stick " + $paket)
Fuelle-Schritt1
Fuelle-Schritt2
Zeige $fl1 "Schritt 1 von 3 - Rechner erkennen"
if ($AutoSchliessen -gt 0) {
  # Pruefstand: alle Flaechen einmal fuellen (Fehler wuerden hier knallen), dann zu.
  Fuelle-Tafel
  $uhr = New-Object System.Windows.Forms.Timer
  $uhr.Interval = $AutoSchliessen * 1000
  $uhr.Add_Tick({ $uhr.Stop(); [System.IO.File]::WriteAllText((Join-Path $hier "bta-werkzeug-selbsttest.txt"), "Fenster offen, Schritt 1-3 und Tafel gefuellt: " + $script:tafel.Count + " Tafelzeilen, " + $script:karten.Count + " Karten", (New-Object System.Text.UTF8Encoding($false))); $fenster.Close() })
  $uhr.Start()
}
[void]$fenster.ShowDialog()
