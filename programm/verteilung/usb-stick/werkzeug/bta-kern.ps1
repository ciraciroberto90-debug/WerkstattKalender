# BTA-Cockpit: KERN des Werkzeugs - alles ohne Fenster (Roll-out 79, 30.10.2026)
# ==================================================================================
#
# Warum ein Kern ohne Fenster: Das Werkzeug soll zweierlei koennen - als Fenster
# fuer Menschen (bta-fenster.ps1) und fensterlos fuer den Pruefstand
# (bta-werkzeug.ps1 -OhneFenster). Beides ruft dieselben Funktionen hier. So
# wird jede Aktion auf dem Laptop automatisch gemessen, bevor sie auf einen
# fremden Rechner darf.
#
# Hier stecken, zusammengefuehrt aus cockpit-werkzeug.ps1 (Rechner) und
# server-werkzeug.ps1 (Server):
#   1. Feste Werte und Stick-Vorgaben (verbindungsweg.txt, server-adresse.txt)
#   2. Orte (Desktop, Autostart, Profil) - ueber -Profil umlenkbar fuer Tests
#   3. Lage-Erkennung: Wo laeuft das Werkzeug, was ist schon da?
#   4. Ampel-Tafel: je Zeile Pruefung + passende Reparatur
#   5. Aktionen Rechner: Einrichten, Verknuepfung, Autostart, Server-Weg,
#      Pfade, Entfernen, Programm laden, Update nachsehen
#   6. Aktionen Server: Pruefen, Einrichten, Dienst, Sicherung, Rueckweg,
#      App-Datei, Import, Node laden, Entfernen
#
# Bewusst ohne Umlaute im Quelltext (PowerShell 5.1 liest die Datei sonst je
# nach Kodierung falsch). Geschriebene JSON-Dateien sind OHNE BOM.
#
# Erwartet vom Einbindenden: $paket (Stick-Wurzel) und optional
#   $script:Ausgabe   { param($text) }  - jede Protokollzeile
#   $script:Fragen    { param($text, $titel) -> $true/$false }
#   $script:Melden    { param($text, $titel) }
#   $script:Fortschritt { param($text) }
#   $script:Pump      { }               - laesst das Fenster atmen (DoEvents)
#   $script:ImmerJa   - fensterlos: Rueckfragen gelten als "Ja"
#   $script:ProfilOrdner - Tests: Desktop/Autostart/AppData darunter

# =============================================================================
#  1. Feste Werte
# =============================================================================
$WerkstattOrdnerVorgabe = "//SCHEUDC1/PSG_Gruppe/16_Technik/01_Scheurich/02_Werkstatt/Arbeitsplanung/Werkstatt_Kalender"
$DatenDateiName = "werkstatt-kalender-daten.json"
$StoerDateiName = "werkstatt-stoerungen.json"
$SK_DatenName   = "soendgen-kalender-daten.json"
$SK_StoerName   = "soendgen-stoerungen.json"
$ProgrammZipUrl = "https://github.com/ciraciroberto90-debug/WerkstattKalender/releases/latest/download/Werkstatt-Cockpit-Programm-win64.zip"
$TeilUrls = @(
  "https://github.com/ciraciroberto90-debug/WerkstattKalender/raw/claude/jolly-bell-qmnsv0/programm/verteilung/WC-Programm-1.teil",
  "https://github.com/ciraciroberto90-debug/WerkstattKalender/raw/claude/jolly-bell-qmnsv0/programm/verteilung/WC-Programm-2.teil"
)
# Server (aus server-werkzeug.ps1)
$ServerOrdner    = "C:\BTA"
$DienstOrdner    = Join-Path $ServerOrdner "BTA-Programm\Dienst"
$AppOrdner       = Join-Path $ServerOrdner "BTA-Programm\App"
$SicherungOrdner = Join-Path $ServerOrdner "BTA-Sicherung"
$PortVorgabe     = 8765
$AufgabeName     = "bta-cockpit-dienst"
$FirewallName    = "BTA-Cockpit-Dienst"
$Standorte = @(
  @{ Id = "scheurich"; Name = "Scheurich";        Ordner = (Join-Path $ServerOrdner "BTA-Scheurich") },
  @{ Id = "soendgen";  Name = "Soendgen Keramik"; Ordner = (Join-Path $ServerOrdner "BTA-Soendgen") }
)
$Gruppen = @("BTA-Verwalter", "BTA-Scheurich-Werkstatt", "BTA-Scheurich-Ansehen", "BTA-Soendgen-Werkstatt", "BTA-Soendgen-Ansehen")
$Domaene = "SCHEURICH"
$Mitglieder = @{
  "BTA-Verwalter"           = @("rciraci", "serviceBTA", "thomas.smarsly")
  "BTA-Scheurich-Werkstatt" = @("andreas.ecke", "aradke", "ciraci", "Elektro", "elektroabt", "elektroazubi", "Jaeger", "kczoczek", "mwerkstatt", "PBaier", "rciraci", "thomas.smarsly")
  "BTA-Scheurich-Ansehen"   = @()
  "BTA-Soendgen-Werkstatt"  = @()
  "BTA-Soendgen-Ansehen"    = @()
}
$FreigabeName = "BTA"
$NodeFassung = "v22.23.3"
$DienstFassungStick = "0.6.1"
# Programm-Fassung im ZIP auf dem Stick (programm/package.json). Aeltere Fassungen
# (31.08. = 1.1, 21.09. = 1.2) kennen den Server-Weg der Huelle nicht - solche
# Rechner erneuert "Einrichten" ueber das vorhandene Programm hinweg.
$ProgrammFassungStick = "1.3.0"
$NodeUrl = "https://nodejs.org/dist/$NodeFassung/node-$NodeFassung-win-x64.zip"
$WerkzeugStand = "30.10.2026"

# Stick-Orte
$programmZip = Join-Path $paket "01-Programm\Werkstatt-Cockpit-Programm-win64.zip"
$stickDienst = Join-Path $paket "05-Server\dienst"
$stickNode   = Join-Path $paket "05-Server\node\node.exe"
$adrDatei    = Join-Path $paket "05-Server\server-adresse.txt"
$wegDatei    = Join-Path $paket "02-Einstellungen\verbindungsweg.txt"
$nodeExe     = Join-Path $DienstOrdner "node\node.exe"
$dienstJs    = Join-Path $DienstOrdner "dienst.js"
$einstellungenPfad = Join-Path $DienstOrdner "einstellungen.json"

# =============================================================================
#  Rueckkanaele (Fenster oder Konsole)
# =============================================================================
if (-not $script:Ausgabe)     { $script:Ausgabe = { param($t) Write-Host $t } }
if (-not $script:Fragen)      { $script:Fragen = { param($t, $titel) return [bool]$script:ImmerJa } }
if (-not $script:Melden)      { $script:Melden = { param($t, $titel) & $script:Ausgabe ("MELDUNG: " + ($t -replace "`n", " | ")) } }
if (-not $script:Fortschritt) { $script:Fortschritt = { param($t) } }
if (-not $script:Pump)        { $script:Pump = { } }
function Sag([string]$text) { & $script:Ausgabe $text }
function Schreibe-Log([string]$text) { Sag $text }
function Frage-JaNein([string]$text, [string]$titel = "BTA-Cockpit") { return [bool](& $script:Fragen $text $titel) }
function Melde([string]$text, [string]$titel = "BTA-Cockpit") { & $script:Melden $text $titel }
function Zeige-Fortschritt([string]$text) { & $script:Fortschritt $text }
function Pump { & $script:Pump }

# =============================================================================
#  2. Orte - fuer Tests ueber $script:ProfilOrdner umlenkbar
# =============================================================================
function Ort([string]$was) {
  if ($script:ProfilOrdner) {
    $o = Join-Path $script:ProfilOrdner $was
    if (-not (Test-Path -LiteralPath $o)) { New-Item -ItemType Directory -Path $o -Force | Out-Null }
    return $o
  }
  switch ($was) {
    "Desktop"      { try { return [Environment]::GetFolderPath("Desktop") } catch { return $null } }
    "Startup"      { try { return [Environment]::GetFolderPath("Startup") } catch { return $null } }
    "StartMenu"    { try { return [Environment]::GetFolderPath("StartMenu") } catch { return $null } }
    "LocalAppData" { return $env:LOCALAPPDATA }
    "AppData"      { return $env:APPDATA }
  }
  return $null
}
$ZielVorgabe = Join-Path (Ort "LocalAppData") "Werkstatt-Cockpit"

function Schreibe-OhneBom([string]$pfad, [string]$inhalt) {
  [System.IO.File]::WriteAllText($pfad, $inhalt, (New-Object System.Text.UTF8Encoding($false)))
}
function Datenordner-Aus([string]$datenDatei) {
  $o = ($datenDatei -replace "\\", "/")
  $schnitt = $o.LastIndexOf("/")
  if ($schnitt -gt 0) { return $o.Substring(0, $schnitt) }
  return $o
}
function Ist-Admin {
  $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object System.Security.Principal.WindowsPrincipal($id)).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Lese-Text([string]$pfad) { try { if (Test-Path -LiteralPath $pfad) { return (Get-Content -LiteralPath $pfad -Raw).Trim() } } catch { }; return "" }

# Stick-Vorgaben
function Stick-Verbindungsweg { $w = (Lese-Text $wegDatei).ToLower(); if ($w -eq "server") { return "server" }; return "datei" }
function Stick-ServerAdresse { $a = Lese-Text $adrDatei; if ($a -match "^https?://") { return $a.TrimEnd("/") }; return "" }
function Stick-ServerName { $a = Stick-ServerAdresse; if ($a -match "^https?://([^:/]+)") { return $Matches[1].ToUpper() }; return "" }

# =============================================================================
#  Lage-Helfer Rechner (aus cockpit-werkzeug.ps1)
# =============================================================================
$script:exeMerker = $null
function Verknuepfungs-Ziel([string]$lnkPfad) {
  try { return [string]((New-Object -ComObject WScript.Shell).CreateShortcut($lnkPfad).TargetPath) } catch { return "" }
}
function Verknuepfungs-Argumente([string]$lnkPfad) {
  try { return [string]((New-Object -ComObject WScript.Shell).CreateShortcut($lnkPfad).Arguments) } catch { return "" }
}
function Finde-Verknuepfungen {
  $funde = @()
  foreach ($ort in @((Ort "Desktop"), (Ort "StartMenu"), (Ort "Startup"))) {
    if (-not ($ort -and (Test-Path -LiteralPath $ort))) { continue }
    foreach ($lnk in @(Get-ChildItem -LiteralPath $ort -Recurse -Depth 2 -Filter "*.lnk" -File -ErrorAction SilentlyContinue)) {
      $passt = ($lnk.BaseName -like "*Cockpit*")
      if (-not $passt) { $passt = ((Verknuepfungs-Ziel $lnk.FullName) -like "*Werkstatt-Cockpit.exe") }
      if ($passt) { $funde += $lnk }
    }
  }
  return @($funde | Sort-Object FullName -Unique)
}
function Finde-Exe-Alle {
  $treffer = @()
  foreach ($lnk in (Finde-Verknuepfungen)) {
    $zielPfad = Verknuepfungs-Ziel $lnk.FullName
    if ($zielPfad -and ($zielPfad -like "*Werkstatt-Cockpit.exe") -and ($zielPfad -notlike "\\*") -and ($zielPfad -notlike "//*")) {
      if (Test-Path -LiteralPath $zielPfad) { $treffer += @(Get-Item -LiteralPath $zielPfad) }
    }
  }
  foreach ($ort in @((Ort "Desktop"), (Ort "LocalAppData"), (Ort "AppData"))) {
    if ($ort -and (Test-Path -LiteralPath $ort)) {
      $treffer += @(Get-ChildItem -LiteralPath $ort -Recurse -Depth 3 -Filter "Werkstatt-Cockpit.exe" -File -ErrorAction SilentlyContinue)
    }
  }
  return @($treffer | Sort-Object FullName -Unique)
}
function Finde-Exe {
  if ($script:exeMerker -and (Test-Path -LiteralPath $script:exeMerker)) { return (Get-Item -LiteralPath $script:exeMerker) }
  $script:exeMerker = $null
  $treffer = Finde-Exe-Alle
  if ($treffer.Count -gt 0) {
    $beste = $treffer | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $script:exeMerker = $beste.FullName
    return $beste
  }
  return $null
}
function Finde-NetzStart {
  foreach ($lnk in (Finde-Verknuepfungen)) {
    $zielPfad = Verknuepfungs-Ziel $lnk.FullName
    if ($zielPfad -and ($zielPfad -like "*Werkstatt-Cockpit.exe") -and (($zielPfad -like "\\*") -or ($zielPfad -like "//*"))) { return $zielPfad }
  }
  return $null
}
function Finde-Einstellungen {
  foreach ($ordner in @("Werkstatt-Cockpit", "werkstatt-cockpit")) {
    $p = Join-Path (Join-Path (Ort "AppData") $ordner) "einstellungen.json"
    if (Test-Path -LiteralPath $p) { return $p }
  }
  return $null
}
function Lese-Einstellungen {
  # Gemerkte Einstellungen des Cockpits ODER die Vorbelegung neben der exe - als Hashtable.
  $h = @{}
  $quelle = Finde-Einstellungen
  if (-not $quelle) { $exe = Finde-Exe; if ($exe) { $p = Join-Path $exe.DirectoryName "standard-einstellungen.json"; if (Test-Path -LiteralPath $p) { $quelle = $p } } }
  if ($quelle) {
    try { $json = Get-Content -LiteralPath $quelle -Raw | ConvertFrom-Json; foreach ($p in $json.PSObject.Properties) { $h[$p.Name] = $p.Value } } catch { }
  }
  $h["_quelle"] = $quelle
  return $h
}
function Verknuepfung-Anlegen([string]$lnkPfad, [string]$exePfad, [string]$arg) {
  $schale = New-Object -ComObject WScript.Shell
  $v = $schale.CreateShortcut($lnkPfad)
  $v.TargetPath = $exePfad
  $v.WorkingDirectory = (Split-Path -Parent $exePfad)
  $v.IconLocation = $exePfad
  if ($arg) { $v.Arguments = $arg } else { $v.Arguments = "" }
  $v.Description = "BTA-Cockpit (Werkstatt-Cockpit) starten"
  $v.Save()
}
function Pfade-Fuer([string]$standort) {
  if ($standort -eq "soendgen") {
    return @{ Update = $WerkstattOrdnerVorgabe; Daten = ($WerkstattOrdnerVorgabe + "/" + $SK_DatenName); Stoer = ($WerkstattOrdnerVorgabe + "/" + $SK_StoerName); Name = "Soendgen Keramik" }
  }
  return @{ Update = $WerkstattOrdnerVorgabe; Daten = ($WerkstattOrdnerVorgabe + "/" + $DatenDateiName); Stoer = ($WerkstattOrdnerVorgabe + "/" + $StoerDateiName); Name = "Scheurich" }
}
function Server-Status([string]$url, [int]$sekunden = 3) {
  if (-not $url) { return $null }
  try { return Invoke-RestMethod -Uri ($url + "/api/status") -TimeoutSec $sekunden -ErrorAction Stop } catch { return $null }
}

# =============================================================================
#  Lage-Helfer Server (aus server-werkzeug.ps1)
# =============================================================================
function Native-Ruhig([string[]]$befehl) {
  $alt = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $exe = $befehl[0]
    $argumente = @()
    if ($befehl.Length -gt 1) { $argumente = $befehl[1..($befehl.Length - 1)] }
    $aus = @(& $exe @argumente 2>&1 | ForEach-Object { "$_" })
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $alt }
  return @{ Aus = $aus; Code = $code }
}
function Gruppe-Da([string]$name) {
  try { return [bool](Get-LocalGroup -Name $name -ErrorAction Stop) } catch { }
  try { $r = Native-Ruhig @("net", "localgroup", $name); return ($r.Code -eq 0) } catch { return $false }
}
function Aufgabe-Holen { try { return Get-ScheduledTask -TaskName $AufgabeName -ErrorAction Stop } catch { return $null } }
function Firewall-Da { try { return [bool](Get-NetFirewallRule -DisplayName $FirewallName -ErrorAction Stop) } catch { return $false } }
function Port-Lesen {
  try { if (Test-Path -LiteralPath $einstellungenPfad) { $e = Get-Content -LiteralPath $einstellungenPfad -Raw | ConvertFrom-Json; if ($e.port) { return [int]$e.port } } } catch { }
  return $PortVorgabe
}
function Dienst-Status([int]$port) { return (Server-Status ("http://localhost:" + $port) 3) }
function Dienst-Prozesse {
  try { return @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like "*dienst.js*" }) } catch { return @() }
}
function Warte-Auf-Dienst([int]$port, [int]$sekunden) {
  for ($i = 0; $i -lt ($sekunden * 2); $i++) {
    $s = Dienst-Status $port
    if ($s) { return $s }
    Pump
    Start-Sleep -Milliseconds 500
  }
  return $null
}

# =============================================================================
#  3. Lage-Erkennung
# =============================================================================
function Erkenne-Lage {
  $l = [ordered]@{}
  $l.werkzeugStand = $WerkzeugStand
  $l.rechner = $env:COMPUTERNAME
  $l.benutzer = $env:USERDOMAIN + "\" + $env:USERNAME
  $l.admin = (Ist-Admin)
  $l.stick = $paket
  $l.serverAdresse = Stick-ServerAdresse
  $l.serverName = Stick-ServerName
  # Server-Rechner: Name passt zur Adresse auf dem Stick ODER der Dienst-Ordner liegt hier.
  $l.istServer = (($l.serverName -and ($env:COMPUTERNAME.ToUpper() -eq $l.serverName)) -or (Test-Path -LiteralPath $dienstJs))
  if ($env:BTA_WERKZEUG_ROLLE -eq "server") { $l.istServer = $true }
  if ($env:BTA_WERKZEUG_ROLLE -eq "rechner") { $l.istServer = $false }
  $l.verbindungswegStick = Stick-Verbindungsweg
  # Programm-Paket
  $l.programmZipDa = (Test-Path -LiteralPath $programmZip)
  $l.programmZipMB = $(if ($l.programmZipDa) { [Math]::Round((Get-Item -LiteralPath $programmZip).Length / 1MB) } else { 0 })
  # Laufwerk
  $w = ($WerkstattOrdnerVorgabe -replace "/", "\")
  $l.wOrdner = $w
  $l.wErreichbar = $false
  try { $l.wErreichbar = [System.IO.Directory]::Exists($w) } catch { }
  # Server
  $s = Server-Status $l.serverAdresse 3
  $l.serverAntwortet = [bool]$s
  $l.serverFassung = $(if ($s) { [string]$s.fassung } else { "" })
  $l.serverAppBytes = $(if ($s -and $s.appDatei) { [int64]$s.appDatei.bytes } else { 0 })
  # Cockpit auf diesem Rechner
  $exe = Finde-Exe
  $l.exe = $(if ($exe) { $exe.FullName } else { "" })
  $l.exeDatum = $(if ($exe) { $exe.LastWriteTime.ToString("dd.MM.yyyy HH:mm") } else { "" })
  # Fassung aus der exe (Dateiversion, z. B. 1.3.0); leer = nicht lesbar (Attrappe, alte Bauweise)
  $l.exeFassung = ""
  if ($exe) { try { $l.exeFassung = [string]$exe.VersionInfo.FileVersion } catch { } }
  $l.exeZuAlt = $false
  if ($l.exeFassung -match "^\d+\.\d+") { try { $l.exeZuAlt = ([version]($l.exeFassung -replace "[^\d.].*$", "") -lt [version]$ProgrammFassungStick) } catch { } }
  $l.netzStart = Finde-NetzStart
  $desk = Ort "Desktop"
  $l.verknuepfungDesktop = $false; $l.vollbild = $false
  if ($desk) {
    $lnk = Join-Path $desk "Werkstatt-Cockpit.lnk"
    if (Test-Path -LiteralPath $lnk) { $l.verknuepfungDesktop = $true; $l.vollbild = ((Verknuepfungs-Argumente $lnk) -like "*--vollbild*") }
  }
  $start = Ort "Startup"
  $l.autostart = ($start -and (Test-Path -LiteralPath (Join-Path $start "Werkstatt-Cockpit.lnk")))
  $e = Lese-Einstellungen
  $l.einstellungenQuelle = [string]$e["_quelle"]
  $l.serverUrlGesetzt = [string]$e["programm:server-url"]
  $l.verbindungswegRechner = $(if ($l.serverUrlGesetzt) { "server" } elseif ($e["werkstatt-kalender-fs:handle"]) { "datei" } else { "" })
  $l.datenDatei = [string]$e["werkstatt-kalender-fs:handle"]
  $l.standort = $(if ($l.datenDatei -like "*soendgen*") { "soendgen" } else { "scheurich" })
  # Update-Ordner: juengste App-Datei
  $l.updateNeueste = ""; $l.updateNeuesteDatum = ""
  try {
    if ($l.wErreichbar) {
      $html = @(Get-ChildItem -LiteralPath $w -Filter "Werkstatt_Kalender_TPM*.html" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
      if ($html.Count -gt 0) { $l.updateNeueste = $html[0].Name; $l.updateNeuesteDatum = $html[0].LastWriteTime.ToString("dd.MM.yyyy HH:mm") }
    }
  } catch { }
  # Server-Teil (nur am Server sinnvoll, schadet sonst nicht)
  if ($l.istServer) {
    $l.dienstDateienDa = (Test-Path -LiteralPath $dienstJs)
    $aufgabe = Aufgabe-Holen
    $l.dienstAufgabe = $(if ($aufgabe) { [string]$aufgabe.State } else { "" })
    $ds = Dienst-Status (Port-Lesen)
    $l.dienstAntwortet = [bool]$ds
    $l.dienstFassung = $(if ($ds) { [string]$ds.fassung } else { "" })
  }
  return $l
}

# =============================================================================
#  4. Ampel-Tafel
#  Jede Zeile: Id, Titel, Farbe (gruen/gelb/rot/grau), Text, Reparatur (Aktions-Id oder "")
# =============================================================================
function Tafel-Rechner($lage, [string]$zweck) {
  $z = @()
  # 1 Paket
  if ($lage.programmZipDa) { $z += @{ Id = "paket"; Titel = "Programm-Paket"; Farbe = "gruen"; Text = ("auf dem Stick, " + $lage.programmZipMB + " MB"); Reparatur = "" } }
  else { $z += @{ Id = "paket"; Titel = "Programm-Paket"; Farbe = "rot"; Text = "fehlt auf dem Stick - 'Programm laden' holt es aus dem Internet"; Reparatur = "programm-laden" } }
  # 2 Programm auf dem Rechner
  if ($lage.exe -and $lage.exeZuAlt) { $z += @{ Id = "programm"; Titel = "Programm auf diesem Rechner"; Farbe = "gelb"; Text = ("Fassung " + $lage.exeFassung + " - zu alt fuer den Server-Weg, Einrichten erneuert auf " + $ProgrammFassungStick); Reparatur = "einrichten" } }
  elseif ($lage.exe) { $z += @{ Id = "programm"; Titel = "Programm auf diesem Rechner"; Farbe = "gruen"; Text = ("da, " + $(if ($lage.exeFassung) { "Fassung " + $lage.exeFassung + ", " } else { "" }) + "Stand " + $lage.exeDatum); Reparatur = "" } }
  elseif ($lage.netzStart) { $z += @{ Id = "programm"; Titel = "Programm auf diesem Rechner"; Farbe = "gelb"; Text = "startet vom Laufwerk (Verknuepfung) - besser lokal einrichten"; Reparatur = "einrichten" } }
  else { $z += @{ Id = "programm"; Titel = "Programm auf diesem Rechner"; Farbe = "rot"; Text = "fehlt"; Reparatur = "einrichten" } }
  # 3 Verbindung
  $soll = $lage.verbindungswegStick
  if ($soll -eq "server") {
    if ($lage.serverUrlGesetzt -and $lage.serverAntwortet) { $z += @{ Id = "verbindung"; Titel = "Verbindung zur Werkstatt"; Farbe = "gruen"; Text = ("Server-Weg, " + $lage.serverAdresse + " antwortet (Fassung " + $lage.serverFassung + ")"); Reparatur = "" } }
    elseif ($lage.serverUrlGesetzt) { $z += @{ Id = "verbindung"; Titel = "Verbindung zur Werkstatt"; Farbe = "gelb"; Text = "Server-Weg eingestellt, aber der Server antwortet gerade nicht"; Reparatur = "" } }
    elseif (-not $lage.serverAntwortet) { $z += @{ Id = "verbindung"; Titel = "Verbindung zur Werkstatt"; Farbe = "rot"; Text = ("Server " + $lage.serverAdresse + " antwortet nicht - Netz pruefen"); Reparatur = "" } }
    else { $z += @{ Id = "verbindung"; Titel = "Verbindung zur Werkstatt"; Farbe = "rot"; Text = "noch nicht eingestellt (Server antwortet)"; Reparatur = "serverweg-ein" } }
  } else {
    if ($lage.verbindungswegRechner -eq "datei" -and $lage.wErreichbar) { $z += @{ Id = "verbindung"; Titel = "Verbindung zur Werkstatt"; Farbe = "gruen"; Text = "Datei-Weg, Firmenlaufwerk erreichbar"; Reparatur = "" } }
    elseif ($lage.verbindungswegRechner -eq "server") { $z += @{ Id = "verbindung"; Titel = "Verbindung zur Werkstatt"; Farbe = "gelb"; Text = "dieser Rechner steht auf Server-Weg, der Stick sagt Datei-Weg"; Reparatur = "serverweg-aus" } }
    elseif (-not $lage.wErreichbar) { $z += @{ Id = "verbindung"; Titel = "Verbindung zur Werkstatt"; Farbe = "rot"; Text = "Firmenlaufwerk W: nicht erreichbar - Netz pruefen"; Reparatur = "" } }
    else { $z += @{ Id = "verbindung"; Titel = "Verbindung zur Werkstatt"; Farbe = "rot"; Text = "noch nicht eingestellt (W: erreichbar)"; Reparatur = "pfade" } }
  }
  # 4 Verknuepfung
  if ($lage.verknuepfungDesktop) { $z += @{ Id = "verknuepfung"; Titel = "Verknuepfung auf dem Desktop"; Farbe = "gruen"; Text = $(if ($lage.vollbild) { "da (Vollbild)" } else { "da" }); Reparatur = "" } }
  else { $z += @{ Id = "verknuepfung"; Titel = "Verknuepfung auf dem Desktop"; Farbe = $(if ($lage.exe) { "rot" } else { "grau" }); Text = $(if ($lage.exe) { "fehlt" } else { "kommt mit dem Einrichten" }); Reparatur = $(if ($lage.exe) { "verknuepfung" } else { "" }) } }
  # 5 Autostart und Vollbild
  if ($zweck -eq "info") {
    if ($lage.autostart -and $lage.vollbild) { $z += @{ Id = "autostart"; Titel = "Autostart und Vollbild"; Farbe = "gruen"; Text = "eingeschaltet (Info-Bildschirm)"; Reparatur = "" } }
    else { $z += @{ Id = "autostart"; Titel = "Autostart und Vollbild"; Farbe = "rot"; Text = "fuer einen Info-Bildschirm noetig, aber aus"; Reparatur = "autostart-ein" } }
  } else {
    if ($lage.autostart) { $z += @{ Id = "autostart"; Titel = "Autostart und Vollbild"; Farbe = "gelb"; Text = "eingeschaltet - fuer einen Arbeitsplatz meist nicht gewollt"; Reparatur = "autostart-aus" } }
    else { $z += @{ Id = "autostart"; Titel = "Autostart und Vollbild"; Farbe = "grau"; Text = "aus - nur fuer Info-Bildschirme"; Reparatur = "autostart-ein" } }
  }
  # 6 Neueste App-Fassung
  if ($lage.updateNeueste) { $z += @{ Id = "update"; Titel = "Neueste App-Fassung im Update-Ordner"; Farbe = "gruen"; Text = ($lage.updateNeueste + " (" + $lage.updateNeuesteDatum + ") - das Cockpit meldet sie beim Start"); Reparatur = "" } }
  elseif ($lage.wErreichbar) { $z += @{ Id = "update"; Titel = "Neueste App-Fassung im Update-Ordner"; Farbe = "gelb"; Text = "keine App-Datei im Update-Ordner"; Reparatur = "" } }
  else { $z += @{ Id = "update"; Titel = "Neueste App-Fassung im Update-Ordner"; Farbe = "grau"; Text = "Laufwerk nicht erreichbar"; Reparatur = "" } }
  # 7 Server
  if ($lage.serverAntwortet) { $z += @{ Id = "server"; Titel = "BTA-Server"; Farbe = "gruen"; Text = ($lage.serverAdresse + " antwortet, Dienst " + $lage.serverFassung); Reparatur = "" } }
  elseif ($lage.serverAdresse) { $z += @{ Id = "server"; Titel = "BTA-Server"; Farbe = $(if ($soll -eq "server") { "rot" } else { "gelb" }); Text = ($lage.serverAdresse + " antwortet nicht"); Reparatur = "" } }
  else { $z += @{ Id = "server"; Titel = "BTA-Server"; Farbe = "grau"; Text = "keine Adresse auf dem Stick (05-Server\server-adresse.txt)"; Reparatur = "" } }
  return $z
}
function Tafel-Server {
  # Die neun Fragen aus server-werkzeug.ps1 (Pruefe-Alles) als Tafelzeilen.
  $z = @()
  $admin = Ist-Admin
  $z += @{ Id = "admin"; Titel = "Als Administrator gestartet"; Farbe = $(if ($admin) { "gruen" } else { "rot" }); Text = $(if ($admin) { "ja" } else { "NEIN - Werkzeug neu starten: Rechtsklick -> Als Administrator ausfuehren" }); Reparatur = $(if ($admin) { "" } else { "als-admin" }) }
  $fehlend = @(); foreach ($o in @((Join-Path $ServerOrdner "BTA-Programm"), (Join-Path $ServerOrdner "BTA-Scheurich"), $SicherungOrdner, (Join-Path $ServerOrdner "BTA-Soendgen"))) { if (-not (Test-Path -LiteralPath $o)) { $fehlend += (Split-Path -Leaf $o) } }
  $z += @{ Id = "ordner"; Titel = "Ordner unter C:\BTA"; Farbe = $(if ($fehlend.Count -eq 0) { "gruen" } else { "rot" }); Text = $(if ($fehlend.Count -eq 0) { "alle vier da" } else { "fehlt: " + ($fehlend -join ", ") }); Reparatur = $(if ($fehlend.Count -eq 0) { "" } else { "server-einrichten" }) }
  $gFehlend = @(); foreach ($g in $Gruppen) { if (-not (Gruppe-Da $g)) { $gFehlend += $g } }
  $z += @{ Id = "gruppen"; Titel = "Fuenf BTA-Gruppen"; Farbe = $(if ($gFehlend.Count -eq 0) { "gruen" } else { "gelb" }); Text = $(if ($gFehlend.Count -eq 0) { "alle fuenf da" } else { "fehlt: " + ($gFehlend -join ", ") }); Reparatur = $(if ($gFehlend.Count -eq 0) { "" } else { "server-einrichten" }) }
  if (Test-Path -LiteralPath $nodeExe) { $z += @{ Id = "node"; Titel = "Node"; Farbe = "gruen"; Text = ("im Dienst-Ordner: " + (& $nodeExe -v)); Reparatur = "" } }
  elseif (Test-Path -LiteralPath $stickNode) { $z += @{ Id = "node"; Titel = "Node"; Farbe = "gelb"; Text = "auf dem Stick - Einrichten kopiert es"; Reparatur = "server-einrichten" } }
  else { $z += @{ Id = "node"; Titel = "Node"; Farbe = "rot"; Text = "fehlt - 'Node herunterladen'"; Reparatur = "node-laden" } }
  if ((Test-Path -LiteralPath $dienstJs) -and (Test-Path -LiteralPath (Join-Path $DienstOrdner "db.js")) -and (Test-Path -LiteralPath $einstellungenPfad)) {
    $f = ""; try { $f = ((Get-Content -LiteralPath $dienstJs -Raw) | Select-String -Pattern 'const FASSUNG = "([\d.]+)"').Matches[0].Groups[1].Value } catch { }
    $passt = ($f -eq $DienstFassungStick)
    $z += @{ Id = "dateien"; Titel = "Dienst-Dateien"; Farbe = $(if ($passt) { "gruen" } else { "gelb" }); Text = $(if ($passt) { "dienst.js " + $f + ", db.js, einstellungen.json" } else { "dienst.js " + $f + " - der Stick bringt " + $DienstFassungStick }); Reparatur = $(if ($passt) { "" } else { "server-einrichten" }) }
  } elseif (Test-Path -LiteralPath (Join-Path $stickDienst "dienst.js")) { $z += @{ Id = "dateien"; Titel = "Dienst-Dateien"; Farbe = "gelb"; Text = "noch nicht kopiert - Einrichten macht es"; Reparatur = "server-einrichten" } }
  else { $z += @{ Id = "dateien"; Titel = "Dienst-Dateien"; Farbe = "rot"; Text = "auch auf dem Stick fehlt 05-Server\dienst - Stick neu bespielen"; Reparatur = "" } }
  $aufgabe = Aufgabe-Holen
  $z += @{ Id = "aufgabe"; Titel = ("Aufgabe '" + $AufgabeName + "'"); Farbe = $(if ($aufgabe) { "gruen" } else { "gelb" }); Text = $(if ($aufgabe) { "da, Zustand " + $aufgabe.State } else { "noch nicht angelegt" }); Reparatur = $(if ($aufgabe) { "" } else { "server-einrichten" }) }
  $fw = Firewall-Da
  $z += @{ Id = "firewall"; Titel = ("Firewall-Regel '" + $FirewallName + "'"); Farbe = $(if ($fw) { "gruen" } else { "gelb" }); Text = $(if ($fw) { "da" } else { "noch nicht angelegt" }); Reparatur = $(if ($fw) { "" } else { "server-einrichten" }) }
  $port = Port-Lesen
  $s = Dienst-Status $port
  $z += @{ Id = "antwortet"; Titel = "Dienst antwortet (/api/status)"; Farbe = $(if ($s) { "gruen" } else { "gelb" }); Text = $(if ($s) { "ja, Port " + $port + ", Fassung " + $s.fassung } else { "nein (Port " + $port + ")" }); Reparatur = $(if ($s) { "" } else { "dienst-start" }) }
  if ($s -and $s.letzteSicherung -and $s.letzteSicherung.zeit) {
    try {
      $alter = (Get-Date) - ([DateTime]::Parse([string]$s.letzteSicherung.zeit).ToLocalTime()); $std = [Math]::Round($alter.TotalHours, 1)
      if ($alter.TotalHours -le 26) { $z += @{ Id = "sicherung"; Titel = "Letzte Sicherung"; Farbe = "gruen"; Text = ("vor " + $std + " h (" + $s.letzteSicherung.grund + ")"); Reparatur = "" } }
      else { $z += @{ Id = "sicherung"; Titel = "Letzte Sicherung"; Farbe = "rot"; Text = ("vor " + $std + " h - laenger als 26 h"); Reparatur = "sicherung" } }
    } catch { $z += @{ Id = "sicherung"; Titel = "Letzte Sicherung"; Farbe = "gelb"; Text = ("Zeit nicht lesbar: " + $s.letzteSicherung.zeit); Reparatur = "" } }
  } elseif ($s) { $z += @{ Id = "sicherung"; Titel = "Letzte Sicherung"; Farbe = "gelb"; Text = "noch keine - die erste kommt nachts um 02:00"; Reparatur = "sicherung" } }
  else { $z += @{ Id = "sicherung"; Titel = "Letzte Sicherung"; Farbe = "gelb"; Text = "Dienst antwortet nicht - keine Auskunft"; Reparatur = "" } }
  return $z
}
function Tafel($lage, [string]$zweck) { if ($lage.istServer) { return (Tafel-Server) } else { return (Tafel-Rechner $lage $zweck) } }

# =============================================================================
#  5. Aktionen Rechner
# =============================================================================
function Schreibe-Vorbelegung([string]$exeOrdner, [string]$weg, [string]$standort) {
  # standard-einstellungen.json neben die exe - das Programm uebernimmt nur Schluessel,
  # die auf dem Rechner noch nie gesetzt wurden. Beide Wege bekommen den Update-Ordner
  # und die Datei-Pfade (Rueckfallebene); der Server-Weg dazu die Server-Adresse.
  $p = Pfade-Fuer $standort
  $h = [ordered]@{
    "_was_ist_das" = "Vorbelegung fuer diesen Rechner - geschrieben vom BTA-Werkzeug am " + (Get-Date).ToString("dd.MM.yyyy HH:mm") + " (" + $weg + "-Weg). Es werden NUR Schluessel uebernommen, die auf dem Rechner noch nie gesetzt wurden."
    "programm:update-ordner" = $p.Update
    "werkstatt-kalender-fs:handle" = $p.Daten
    "werkstatt-kalender-fs:folder" = (Datenordner-Aus $p.Daten)
    "werkstatt-stoerungen-fs:handle" = $p.Stoer
  }
  if ($weg -eq "server") { $h["programm:server-url"] = (Stick-ServerAdresse) }
  $pfad = Join-Path $exeOrdner "standard-einstellungen.json"
  Schreibe-OhneBom $pfad (ConvertTo-Json $h -Depth 5)
  return $pfad
}
function Setze-GemerkteEinstellungen([hashtable]$paare, [string[]]$entfernen) {
  # Schreibt in die GEMERKTEN Einstellungen des Cockpits (falls vorhanden), mit Sicherung daneben.
  $einstellungen = Finde-Einstellungen
  if (-not $einstellungen) { return $false }
  $json = Get-Content -LiteralPath $einstellungen -Raw | ConvertFrom-Json
  foreach ($name in $paare.Keys) {
    $feld = $json.PSObject.Properties[$name]
    if ($feld) { $feld.Value = $paare[$name] } else { $json | Add-Member -NotePropertyName $name -NotePropertyValue $paare[$name] }
  }
  foreach ($name in $entfernen) { if ($json.PSObject.Properties[$name]) { $json.PSObject.Properties.Remove($name) } }
  Copy-Item -LiteralPath $einstellungen -Destination ($einstellungen + ".sicherung") -Force
  Schreibe-OhneBom $einstellungen (ConvertTo-Json $json -Depth 10)
  Sag ("Gemerkte Einstellungen geschrieben: " + $einstellungen + " (Sicherung daneben)")
  return $true
}
function Entpacke-Programm([string]$ziel) {
  if (-not (Test-Path -LiteralPath $programmZip)) { throw "Das Programm-Paket fehlt auf dem Stick (01-Programm\Werkstatt-Cockpit-Programm-win64.zip). Erst 'Programm laden'." }
  Sag ("Entpacke das Programm nach " + $ziel + " (ca. 110 MB, dauert einen Moment) ...")
  if (-not (Test-Path -LiteralPath $ziel)) { New-Item -ItemType Directory -Path $ziel -Force | Out-Null }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  # Eintrag fuer Eintrag - so bleibt das Fenster bedienbar und ein halb kopiertes ZIP faellt hier auf.
  $archiv = [System.IO.Compression.ZipFile]::OpenRead($programmZip)
  try {
    $n = 0; $gesamt = $archiv.Entries.Count
    foreach ($e in $archiv.Entries) {
      $n++
      $zielPfad = Join-Path $ziel $e.FullName
      if ($e.FullName.EndsWith("/")) { if (-not (Test-Path -LiteralPath $zielPfad)) { New-Item -ItemType Directory -Path $zielPfad -Force | Out-Null }; continue }
      $o = Split-Path -Parent $zielPfad
      if (-not (Test-Path -LiteralPath $o)) { New-Item -ItemType Directory -Path $o -Force | Out-Null }
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $zielPfad, $true)
      if ($n % 50 -eq 0) { Zeige-Fortschritt ([Math]::Round(100 * $n / $gesamt).ToString() + " %"); Pump }
    }
  } finally { $archiv.Dispose() }
  $exe = Get-ChildItem -LiteralPath $ziel -Recurse -Filter "Werkstatt-Cockpit.exe" | Select-Object -First 1
  if (-not $exe) { throw "Nach dem Entpacken wurde keine Werkstatt-Cockpit.exe gefunden." }
  $script:exeMerker = $exe.FullName
  Sag ("entpackt: " + $exe.FullName)
  return $exe
}
function Richte-Rechner-Ein([string]$zweck, [string]$standort, [string]$weg) {
  # zweck: arbeitsplatz | info | ansehen;  weg: datei | server (leer = Stick-Vorgabe)
  if (-not $weg) { $weg = Stick-Verbindungsweg }
  if (-not $standort) { $standort = "scheurich" }
  $lage = Erkenne-Lage
  $getan = @()
  if ($weg -eq "server" -and -not (Stick-ServerAdresse)) { throw "Der Stick sagt Server-Weg, aber 05-Server\server-adresse.txt fehlt." }
  # 1 Programm
  $exe = $null
  if ($lage.exe -and -not $lage.exeZuAlt) { $exe = Get-Item -LiteralPath $lage.exe; Sag ("Programm ist schon da: " + $exe.FullName + $(if ($lage.exeFassung) { " (Fassung " + $lage.exeFassung + ")" } else { "" })) }
  elseif ($lage.exe) {
    # Zu alt (vor 1.3): ueber dasselbe Verzeichnis hinweg erneuern - Verknuepfungen zeigen weiter dorthin.
    Sag ("Programm ist zu alt (Fassung " + $lage.exeFassung + ") - wird erneuert auf " + $ProgrammFassungStick + ".")
    $exe = Entpacke-Programm (Split-Path -Parent (Split-Path -Parent $lage.exe)); $getan += ("Programm erneuert von " + $lage.exeFassung)
  }
  else { $exe = Entpacke-Programm $ZielVorgabe; $getan += "Programm entpackt" }
  # 2 Vorbelegung + gemerkte Einstellungen
  $vorb = Schreibe-Vorbelegung $exe.DirectoryName $weg $standort
  Sag ("Vorbelegung geschrieben: " + $vorb + " (" + $weg + "-Weg, " + (Pfade-Fuer $standort).Name + ")")
  $getan += ("Verbindung: " + $weg + "-Weg")
  if (Finde-Einstellungen) {
    # Der Rechner lief hier schon: den Weg auch in den gemerkten Einstellungen setzen,
    # sonst gewinnt dort die alte Wahl (die Vorbelegung ueberschreibt nie).
    if ($weg -eq "server") { [void](Setze-GemerkteEinstellungen @{ "programm:server-url" = (Stick-ServerAdresse) } @()) }
    else { [void](Setze-GemerkteEinstellungen @{} @("programm:server-url")) }
  }
  # 3 Verknuepfungen
  $arg = $(if ($zweck -eq "info") { "--vollbild" } else { "" })
  $desk = Ort "Desktop"
  if ($desk) { Verknuepfung-Anlegen (Join-Path $desk "Werkstatt-Cockpit.lnk") $exe.FullName $arg; Sag ("Desktop-Verknuepfung angelegt" + $(if ($arg) { " (Vollbild)" } else { "" })); $getan += "Verknuepfung" }
  else { Sag "Desktop-Ordner nicht gefunden - Verknuepfung bitte von Hand anlegen." }
  $start = Ort "Startup"
  if ($start) {
    $lnk = Join-Path $start "Werkstatt-Cockpit.lnk"
    if ($zweck -eq "info") { Verknuepfung-Anlegen $lnk $exe.FullName $arg; Sag "Autostart eingerichtet (Vollbild beim Windows-Start)."; $getan += "Autostart" }
    elseif (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk -Force; Sag "Autostart entfernt (Arbeitsplatz)."; $getan += "Autostart aus" }
  }
  # 4 Verbindung pruefen
  $pruef = ""
  if ($weg -eq "server") { $s = Server-Status (Stick-ServerAdresse) 5; $pruef = $(if ($s) { "Server antwortet, Fassung " + $s.fassung } else { "Server antwortet gerade NICHT - das Cockpit zeigt beim Start die Warteseite" }) }
  else {
    $p = Pfade-Fuer $standort
    $daten = ($p.Daten -replace "/", "\")
    $pruef = $(if (Test-Path -LiteralPath $daten) { "Datendatei auf W: gefunden" } elseif ($lage.wErreichbar) { "W: erreichbar, Datendatei noch nicht da (beim ersten Rechner eines Standorts normal)" } else { "W: NICHT erreichbar - das Cockpit kann sich erst verbinden, wenn das Laufwerk da ist" })
  }
  Sag ("Verbindung: " + $pruef)
  return @{ Ok = $true; Exe = $exe.FullName; Weg = $weg; Zweck = $zweck; Standort = $standort; Getan = $getan; Verbindung = $pruef }
}
function Repariere-Verknuepfung {
  $exe = Finde-Exe
  if (-not $exe) { throw "Kein eingerichtetes Cockpit gefunden - erst Einrichten." }
  $desk = Ort "Desktop"
  $lnk = Join-Path $desk "Werkstatt-Cockpit.lnk"
  $arg = $(if ((Test-Path -LiteralPath $lnk) -and ((Verknuepfungs-Argumente $lnk) -like "*--vollbild*")) { "--vollbild" } else { "" })
  Verknuepfung-Anlegen $lnk $exe.FullName $arg
  Sag ("Verknuepfung neu angelegt -> " + $exe.FullName)
  return $true
}
function Setze-Autostart([bool]$ein) {
  $exe = Finde-Exe
  if (-not $exe) { throw "Kein eingerichtetes Cockpit gefunden - erst Einrichten." }
  $start = Ort "Startup"; $desk = Ort "Desktop"
  $lnkStart = Join-Path $start "Werkstatt-Cockpit.lnk"; $lnkDesk = Join-Path $desk "Werkstatt-Cockpit.lnk"
  if ($ein) {
    Verknuepfung-Anlegen $lnkStart $exe.FullName "--vollbild"
    Verknuepfung-Anlegen $lnkDesk $exe.FullName "--vollbild"
    Sag "Autostart und Vollbild eingeschaltet (Info-Bildschirm)."
  } else {
    if (Test-Path -LiteralPath $lnkStart) { Remove-Item -LiteralPath $lnkStart -Force }
    Verknuepfung-Anlegen $lnkDesk $exe.FullName ""
    Sag "Autostart ausgeschaltet, Desktop-Verknuepfung ohne Vollbild."
  }
  return $true
}
function Setze-ServerWeg([bool]$ein, [string]$schluessel) {
  $url = Stick-ServerAdresse
  if ($ein -and -not $url) { throw "Keine Server-Adresse auf dem Stick (05-Server\server-adresse.txt)." }
  if ($ein) {
    $s = Server-Status $url 5
    if ($s) { Sag ("Server antwortet: Fassung " + $s.fassung) }
    elseif (-not (Frage-JaNein ("Der Server " + $url + " antwortet gerade nicht.`n`nTrotzdem auf den Server-Weg stellen? (Das Programm zeigt dann beim Start die Warteseite, bis er da ist.)") "Server-Weg")) { Sag "Abgebrochen - nichts veraendert."; return $false }
  }
  $paare = @{}; $weg = @()
  if ($ein) { $paare["programm:server-url"] = $url; if ($schluessel) { $paare["bta-server:schluessel"] = $schluessel } }
  else { $weg = @("programm:server-url", "bta-server:schluessel") }
  $gemerkt = Setze-GemerkteEinstellungen $paare $weg
  $exe = Finde-Exe
  if ($exe) { $lage = Erkenne-Lage; [void](Schreibe-Vorbelegung $exe.DirectoryName $(if ($ein) { "server" } else { "datei" }) $lage.standort); Sag "Vorbelegung neben der exe angepasst." }
  elseif (-not $gemerkt) { throw "Kein eingerichtetes Cockpit auf diesem Rechner - erst Einrichten." }
  Sag $(if ($ein) { "Server-Weg EIN: " + $url + " - beim naechsten Start holt das Cockpit die App vom Server." } else { "Server-Weg AUS - beim naechsten Start laeuft das Cockpit wieder ueber die Datei." })
  return $true
}
function Speichere-Pfade([string]$standort) {
  $p = Pfade-Fuer $standort
  $paare = @{ "programm:update-ordner" = $p.Update; "werkstatt-kalender-fs:handle" = $p.Daten; "werkstatt-kalender-fs:folder" = (Datenordner-Aus $p.Daten); "werkstatt-stoerungen-fs:handle" = $p.Stoer }
  $gemerkt = Setze-GemerkteEinstellungen $paare @()
  $exe = Finde-Exe
  if ($exe) { [void](Schreibe-Vorbelegung $exe.DirectoryName "datei" $standort); Sag ("Vorbelegung neben der exe geschrieben (" + $p.Name + ").") }
  elseif (-not $gemerkt) { throw "Weder gemerkte Einstellungen noch ein eingerichtetes Cockpit gefunden - erst Einrichten." }
  return $true
}
function Entferne-Cockpit {
  Sag "Entfernen: suche alles vom Cockpit auf DIESEM Rechner ..."
  $exes = Finde-Exe-Alle; $verknuepfungen = Finde-Verknuepfungen; $einstellungen = Finde-Einstellungen
  $tabu = @(); foreach ($t in @((Ort "Desktop"), (Ort "LocalAppData"), (Ort "AppData"), $env:USERPROFILE)) { if ($t) { $tabu += $t.TrimEnd("\").ToLower() } }
  $ordnerListe = @(); $handarbeit = @()
  foreach ($exe in $exes) {
    $o = $exe.DirectoryName
    if ($o -like "\\*" -or $o -like "//*") { continue }
    if ($tabu -contains $o.TrimEnd("\").ToLower()) { $handarbeit += $exe.FullName; continue }
    $siehtRichtigAus = (Test-Path -LiteralPath (Join-Path $o "resources")) -or ((Split-Path -Leaf $o) -like "*Cockpit*")
    if (-not $siehtRichtigAus) { $handarbeit += $exe.FullName; continue }
    $ordnerListe += $o
  }
  $ordnerListe = @($ordnerListe | Sort-Object -Unique)
  if ((-not $ordnerListe) -and (-not $verknuepfungen) -and (-not $einstellungen)) { Sag "Hier gibt es nichts zu entfernen."; return $true }
  $liste = @()
  foreach ($o in $ordnerListe) { $liste += ("Programm-Ordner:  " + $o) }
  foreach ($v in $verknuepfungen) { $liste += ("Verknuepfung:     " + $v.FullName) }
  if ($einstellungen) { $liste += ("Gemerkte Pfade:   " + (Split-Path -Parent $einstellungen)) }
  foreach ($z in $liste) { Sag ("  gefunden: " + $z) }
  if (-not (Frage-JaNein ("Vom Rechner entfernen?`n`n" + ($liste -join "`n") + "`n`nDie gemeinsamen Dateien auf dem Firmenlaufwerk und der Server bleiben unberuehrt.") "Entfernen")) { Sag "Entfernen abgebrochen - nichts veraendert."; return $false }
  if ($ordnerListe.Count -gt 0 -and -not (Frage-JaNein ("Wirklich sicher? Es werden " + $ordnerListe.Count + " Programm-Ordner samt Inhalt geloescht.") "Entfernen")) { Sag "Entfernen abgebrochen - nichts veraendert."; return $false }
  foreach ($o in $ordnerListe) { Remove-Item -LiteralPath $o -Recurse -Force; Sag ("entfernt: " + $o) }
  foreach ($v in $verknuepfungen) { Remove-Item -LiteralPath $v.FullName -Force -ErrorAction SilentlyContinue; Sag ("entfernt: " + $v.FullName) }
  foreach ($h in $handarbeit) { Sag ("NICHT angefasst (liegt direkt in einem Grundordner - bitte von Hand): " + $h) }
  if ($einstellungen) {
    if (Frage-JaNein "Auch die gemerkten Einstellungen (Pfade) dieses Rechners loeschen?`n`n'Nein' behaelt sie - eine Neu-Einrichtung findet die Pfade dann sofort wieder." "Entfernen") { Remove-Item -LiteralPath (Split-Path -Parent $einstellungen) -Recurse -Force; Sag "Gemerkte Einstellungen entfernt." }
    else { Sag "Gemerkte Einstellungen bleiben." }
  }
  $script:exeMerker = $null
  Sag "Fertig - der Rechner ist sauber."
  return $true
}
function Lade-Datei([string]$url, [string]$ziel, [int]$mindestMB) {
  if (Test-Path -LiteralPath $ziel) { Remove-Item -LiteralPath $ziel -Force -ErrorAction SilentlyContinue }
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    $lauf = Start-Process -FilePath "curl.exe" -ArgumentList @("-L", "-f", "-sS", "--ssl-revoke-best-effort", "-o", ('"' + $ziel + '"'), $url) -WindowStyle Hidden -PassThru
    while (-not $lauf.HasExited) { if (Test-Path -LiteralPath $ziel) { Zeige-Fortschritt (([Math]::Round((Get-Item -LiteralPath $ziel).Length / 1MB)).ToString() + " MB") }; Pump; Start-Sleep -Milliseconds 250 }
  }
  $gut = (Test-Path -LiteralPath $ziel) -and ((Get-Item -LiteralPath $ziel).Length -gt ($mindestMB * 1MB))
  if (-not $gut) {
    # Zweiter Weg: Invoke-WebRequest nimmt die Windows-Proxy-Einstellung mit (Firmen-Proxy).
    Sag "  curl kam nicht durch - zweiter Weg ueber die Windows-Proxy-Einstellung ..."
    Remove-Item -LiteralPath $ziel -Force -ErrorAction SilentlyContinue
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
    $alt = $ProgressPreference; $ProgressPreference = "SilentlyContinue"
    try { Invoke-WebRequest -Uri $url -OutFile $ziel -UseBasicParsing -TimeoutSec 900 } catch { Sag ("  auch nicht: " + $_.Exception.Message) } finally { $ProgressPreference = $alt }
    $gut = (Test-Path -LiteralPath $ziel) -and ((Get-Item -LiteralPath $ziel).Length -gt ($mindestMB * 1MB))
  }
  if (-not $gut -and (Test-Path -LiteralPath $ziel)) { Remove-Item -LiteralPath $ziel -Force -ErrorAction SilentlyContinue }
  return $gut
}
function Lade-Programm {
  $zielOrdner = Split-Path -Parent $programmZip
  if (-not (Test-Path -LiteralPath $zielOrdner)) { New-Item -ItemType Directory -Path $zielOrdner -Force | Out-Null }
  Sag "Weg 1: Lade den neuesten Stand vom Release (ca. 110 MB) ..."
  $gut = Lade-Datei $ProgrammZipUrl $programmZip 10
  if (-not $gut) {
    Sag "Weg 1 nicht moeglich. Weg 2: zwei Teil-Dateien ..."
    $teile = @(); $nr = 0
    foreach ($url in $TeilUrls) { $nr++; $teilPfad = Join-Path $zielOrdner ("WC-Programm-" + $nr + ".teil"); Sag ("Teil " + $nr + " von " + $TeilUrls.Count); if (-not (Lade-Datei $url $teilPfad 10)) { $teile = @(); break }; $teile += $teilPfad }
    if ($teile.Count -eq $TeilUrls.Count) {
      $ausgabe = [System.IO.File]::Create($programmZip)
      try { foreach ($t in $teile) { $eingabe = [System.IO.File]::OpenRead($t); try { $eingabe.CopyTo($ausgabe) } finally { $eingabe.Close() } } } finally { $ausgabe.Close() }
      foreach ($t in $teile) { Remove-Item -LiteralPath $t -Force -ErrorAction SilentlyContinue }
      $gut = (Test-Path -LiteralPath $programmZip) -and ((Get-Item -LiteralPath $programmZip).Length -gt 100MB)
    }
  }
  if (-not $gut) { throw "Der Download hat nicht geklappt (kein Internet oder GitHub gesperrt). Ersatzweg: 04-Download-Links an einem Rechner mit Internet, die Datei dann in 01-Programm legen." }
  Sag ("Fertig: " + [Math]::Round((Get-Item -LiteralPath $programmZip).Length / 1MB) + " MB liegen in 01-Programm.")
  return $true
}

# =============================================================================
#  6. Aktionen Server (aus server-werkzeug.ps1, Protokoll ueber Sag)
# =============================================================================
function Baue-Einstellungen([int]$port, [bool]$mitSoendgen) {
  $p = { param($x) ($x -replace "\\", "/") }
  $standorte = [ordered]@{}
  $standorte["scheurich"] = [ordered]@{ name = "Scheurich"; datenOrdner = (& $p (Join-Path $ServerOrdner "BTA-Scheurich")) }
  if ($mitSoendgen) { $standorte["soendgen"] = [ordered]@{ name = "Soendgen Keramik"; datenOrdner = (& $p (Join-Path $ServerOrdner "BTA-Soendgen")) } }
  $e = [ordered]@{
    "_was_ist_das" = "Einstellungen des BTA-Cockpit-Dienstes - geschrieben vom BTA-Werkzeug am " + (Get-Date).ToString("dd.MM.yyyy HH:mm") + ". Aenderungen nur ueber das Werkzeug."
    port = $port; host = "0.0.0.0"
    appDatei = (& $p (Join-Path $AppOrdner "Werkstatt_Kalender_TPM.html"))
    protokollOrdner = (& $p (Join-Path $DienstOrdner "protokoll"))
    sicherungOrdner = (& $p $SicherungOrdner)
    sicherungUhrzeit = "02:00"; sicherungBehalten = 14
    standorte = $standorte
  }
  return ($e | ConvertTo-Json -Depth 6)
}
function Server-Einrichten([bool]$nurVorschau, [int]$port, [bool]$mitSoendgen) {
  if (-not $port) { $port = $PortVorgabe }
  $tu = -not $nurVorschau
  $praefix = if ($nurVorschau) { "VORSCHAU: " } else { "" }
  if (-not (Ist-Admin)) { throw "Das Werkzeug muss als Administrator laufen: Rechtsklick auf BTA-Werkzeug.cmd -> Als Administrator ausfuehren." }
  $nodeQuelle = $null
  if (Test-Path -LiteralPath $stickNode) { $nodeQuelle = $stickNode } elseif (Test-Path -LiteralPath $nodeExe) { $nodeQuelle = $nodeExe }
  if (-not $nodeQuelle) { throw "Node fehlt. Entweder liegt es auf dem Stick unter 05-Server\node\node.exe, oder 'Node herunterladen'." }
  if (-not (Test-Path -LiteralPath (Join-Path $stickDienst "dienst.js"))) { throw "Auf dem Stick fehlt der Ordner 05-Server\dienst mit dienst.js und db.js. Stick neu bespielen (node tools/stick-bauen.js --mit-server)." }
  if ($tu) {
    $frage = "So einrichten?`n`nDienst-Ordner:  $DienstOrdner`nPort:  $port`nStandorte:  Scheurich" + $(if ($mitSoendgen) { ", Soendgen Keramik" } else { "" }) + "`nAufgabe:  $AufgabeName (Beim Systemstart, Konto SYSTEM)`nFirewall:  $FirewallName (TCP $port eingehend)`n`nVorhandene Dienst-Dateien und Aufgabe werden ersetzt, Datenbanken bleiben."
    if (-not (Frage-JaNein $frage "Einrichten")) { Sag "Einrichten abgebrochen - nichts veraendert."; return $false }
  }
  Sag ($praefix + "Einrichten gestartet (Port $port).")
  Sag ($praefix + "0. Grundlage: Ordnerstruktur, fuenf Gruppen, Mitglieder, Rechte, Freigabe")
  foreach ($o in @($ServerOrdner, (Join-Path $ServerOrdner "BTA-Programm"), (Join-Path $ServerOrdner "BTA-Programm\Update"), (Join-Path $ServerOrdner "BTA-Programm\Installation"), (Join-Path $ServerOrdner "BTA-Scheurich"), (Join-Path $ServerOrdner "BTA-Soendgen"), $SicherungOrdner)) {
    if (-not (Test-Path -LiteralPath $o)) { Sag ($praefix + "   Ordner anlegen: " + $o); if ($tu) { New-Item -ItemType Directory -Path $o -Force | Out-Null } }
  }
  foreach ($g in $Gruppen) {
    if (Gruppe-Da $g) { continue }
    Sag ($praefix + "   Gruppe anlegen: " + $g)
    if ($tu) { try { New-LocalGroup -Name $g -Description "BTA-Cockpit (angelegt vom BTA-Werkzeug)" -ErrorAction Stop | Out-Null } catch { $null = Native-Ruhig @("net", "localgroup", $g, "/add") } }
  }
  foreach ($g in $Mitglieder.Keys) {
    foreach ($konto in $Mitglieder[$g]) {
      $voll = $Domaene + "\" + $konto
      $drin = $false
      try { $drin = @(Get-LocalGroupMember -Group $g -ErrorAction Stop | Where-Object { $_.Name -like ("*\" + $konto) }).Count -gt 0 } catch { $drin = $false }
      if ($drin) { continue }
      Sag ($praefix + "   " + $g + " + " + $voll)
      if ($tu) { try { Add-LocalGroupMember -Group $g -Member $voll -ErrorAction Stop } catch { Sag ("      nicht aufgenommen (" + $_.Exception.Message.Trim() + ") - Konto pruefen oder von Hand ueber lusrmgr.msc") } }
    }
  }
  $rechte = @(
    @($ServerOrdner, "BTA-Verwalter:(OI)(CI)F"),
    @((Join-Path $ServerOrdner "BTA-Scheurich"), "BTA-Scheurich-Werkstatt:(OI)(CI)M"),
    @((Join-Path $ServerOrdner "BTA-Scheurich"), "BTA-Scheurich-Ansehen:(OI)(CI)RX"),
    @((Join-Path $ServerOrdner "BTA-Soendgen"),  "BTA-Soendgen-Werkstatt:(OI)(CI)M"),
    @((Join-Path $ServerOrdner "BTA-Soendgen"),  "BTA-Soendgen-Ansehen:(OI)(CI)RX")
  )
  foreach ($g in @("BTA-Scheurich-Werkstatt", "BTA-Scheurich-Ansehen", "BTA-Soendgen-Werkstatt", "BTA-Soendgen-Ansehen")) {
    $rechte += ,@((Join-Path $ServerOrdner "BTA-Programm"), ($g + ":(OI)(CI)RX"))
    $rechte += ,@($ServerOrdner, ($g + ":RX"))
  }
  Sag ($praefix + "   Rechte setzen (icacls): " + $rechte.Count + " Eintraege")
  if ($tu) {
    $rechteFehler = 0
    foreach ($r in $rechte) { $ergebnis = Native-Ruhig @("icacls.exe", $r[0], "/grant", $r[1]); if ($ergebnis.Code -ne 0) { $rechteFehler++; Sag ("      icacls " + $r[0] + " " + $r[1] + ": " + (($ergebnis.Aus | Select-Object -Last 1) -join " ")) } }
    Sag ("      Rechte gesetzt: " + ($rechte.Count - $rechteFehler) + " von " + $rechte.Count)
  }
  $freigabeDa = $false
  try { $freigabeDa = @(Get-SmbShare -Name $FreigabeName -ErrorAction Stop).Count -gt 0 } catch { $freigabeDa = $false }
  if (-not $freigabeDa) {
    Sag ($praefix + "   Freigabe anlegen: \\" + $env:COMPUTERNAME + "\" + $FreigabeName + " -> " + $ServerOrdner)
    if ($tu) { try { New-SmbShare -Name $FreigabeName -Path $ServerOrdner -FullAccess "Jeder" -ErrorAction Stop | Out-Null } catch { try { New-SmbShare -Name $FreigabeName -Path $ServerOrdner -FullAccess "Everyone" -ErrorAction Stop | Out-Null } catch { Sag ("      Freigabe nicht angelegt: " + $_.Exception.Message.Trim()) } } }
  }
  Sag ($praefix + "0. Grundlage: fertig.")
  $ordner = @($DienstOrdner, (Join-Path $DienstOrdner "node"), (Join-Path $DienstOrdner "protokoll"), $AppOrdner, $SicherungOrdner, (Join-Path $ServerOrdner "BTA-Scheurich\fotos"))
  if ($mitSoendgen) { $ordner += (Join-Path $ServerOrdner "BTA-Soendgen\fotos") }
  foreach ($o in $ordner) { if (-not (Test-Path -LiteralPath $o)) { Sag ($praefix + "1. Ordner anlegen: " + $o); if ($tu) { New-Item -ItemType Directory -Path $o -Force | Out-Null } } }
  Sag ($praefix + "1. Ordner: fertig.")
  $systemHatRecht = $false
  try {
    $acl = Get-Acl -LiteralPath $ServerOrdner
    foreach ($r in $acl.Access) {
      $sid = $null; try { $sid = $r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { $sid = [string]$r.IdentityReference }
      if ($sid -eq "S-1-5-18" -and $r.AccessControlType -eq "Allow" -and (($r.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Modify) -eq [System.Security.AccessControl.FileSystemRights]::Modify)) { $systemHatRecht = $true }
    }
  } catch { Sag ($praefix + "1b. Rechte auf " + $ServerOrdner + " nicht lesbar: " + $_) }
  if ($systemHatRecht) { Sag ($praefix + "1b. SYSTEM hat Schreibrecht auf " + $ServerOrdner + " - nichts zu tun.") }
  else { Sag ($praefix + "1b. SYSTEM fehlt das Schreibrecht - wird gesetzt: icacls (OI)(CI)F fuer S-1-5-18"); if ($tu) { $ergebnis = Native-Ruhig @("icacls.exe", $ServerOrdner, "/grant", "*S-1-5-18:(OI)(CI)F"); Sag ("   icacls: " + (($ergebnis.Aus | Select-Object -Last 1) -join " ")) } }
  if ($nodeQuelle -ne $nodeExe) { Sag ($praefix + "2. Node kopieren: " + $nodeQuelle + " -> " + $nodeExe); if ($tu) { Copy-Item -LiteralPath $nodeQuelle -Destination $nodeExe -Force } }
  else { Sag ($praefix + "2. Node liegt schon im Dienst-Ordner.") }
  foreach ($datei in @("dienst.js", "db.js")) { Sag ($praefix + "2. Dienst-Datei kopieren: " + $datei); if ($tu) { Copy-Item -LiteralPath (Join-Path $stickDienst $datei) -Destination (Join-Path $DienstOrdner $datei) -Force } }
  if ($tu) { Sag ("   Node-Fassung: " + (& $nodeExe -v)) }
  $json = Baue-Einstellungen $port $mitSoendgen
  Sag ($praefix + "3. einstellungen.json schreiben: " + $einstellungenPfad)
  if ($tu) { Schreibe-OhneBom $einstellungenPfad $json }
  Sag ($praefix + "4. Firewall-Regel '" + $FirewallName + "' (TCP " + $port + ", eingehend, erlauben)")
  if ($tu) { try { Remove-NetFirewallRule -DisplayName $FirewallName -ErrorAction SilentlyContinue } catch { }; New-NetFirewallRule -DisplayName $FirewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Any -Description "BTA-Cockpit-Dienst (node.exe) - Cockpit-Programme im Firmennetz" | Out-Null }
  Sag ($praefix + "5. Aufgabe '" + $AufgabeName + "': Beim Systemstart, Konto SYSTEM, ohne Zeitlimit, Neustart bei Fehler (3x je 1 min)")
  if ($tu) {
    $alt = Aufgabe-Holen
    if ($alt) { try { Stop-ScheduledTask -TaskName $AufgabeName -ErrorAction SilentlyContinue } catch { }; Unregister-ScheduledTask -TaskName $AufgabeName -Confirm:$false }
    foreach ($pz in (Dienst-Prozesse)) { try { Stop-Process -Id $pz.ProcessId -Force -ErrorAction SilentlyContinue } catch { } }
    $aktion = New-ScheduledTaskAction -Execute $nodeExe -Argument ('--no-warnings "' + $dienstJs + '" "' + $einstellungenPfad + '"') -WorkingDirectory $DienstOrdner
    $ausloeser = New-ScheduledTaskTrigger -AtStartup
    $konto = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $regeln = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    $regeln.ExecutionTimeLimit = "PT0S"
    Register-ScheduledTask -TaskName $AufgabeName -Action $aktion -Trigger $ausloeser -Principal $konto -Settings $regeln -Description "BTA-Cockpit-Dienst: haelt die Datenbanken, beantwortet die Cockpit-Programme, sichert nachts. Eingerichtet vom BTA-Werkzeug." | Out-Null
  }
  Sag ($praefix + "6. Dienst starten und /api/status abfragen")
  if ($tu) {
    Start-ScheduledTask -TaskName $AufgabeName
    $s = Warte-Auf-Dienst $port 20
    if ($s) {
      $teile = @(); foreach ($p2 in $s.standorte.PSObject.Properties) { $teile += ($p2.Name + ": Version " + $p2.Value.version + ", " + $p2.Value.eintraege + " Eintraege, " + $p2.Value.stoerungen + " Stoerberichte") }
      Sag ("   Dienst antwortet: Fassung " + $s.fassung + " - " + ($teile -join " | "))
      try { Schreibe-OhneBom $adrDatei ("http://" + $env:COMPUTERNAME.ToLower() + ":" + $port); Sag ("   Server-Adresse auf den Stick geschrieben: " + $adrDatei) } catch { Sag ("   Hinweis: Adresse nicht auf den Stick geschrieben (" + $_.Exception.Message + ")") }
      Sag "Fertig eingerichtet."
      return $true
    } else { Sag ("   Der Dienst antwortet NICHT binnen 20 s. Protokoll-Ordner: " + (Join-Path $DienstOrdner "protokoll")); return $false }
  }
  Sag "VORSCHAU fertig - nichts veraendert."
  return $true
}
function Dienst-Starten {
  $aufgabe = Aufgabe-Holen
  if (-not $aufgabe) { Sag "Es gibt noch keine Aufgabe '$AufgabeName' - erst Einrichten."; return $false }
  Sag "Dienst starten ..."
  Start-ScheduledTask -TaskName $AufgabeName
  $s = Warte-Auf-Dienst (Port-Lesen) 20
  if ($s) { Sag ("Dienst laeuft (Fassung " + $s.fassung + ")."); return $true }
  Sag "Dienst antwortet nicht binnen 20 s - Protokoll-Ordner ansehen."; return $false
}
function Dienst-Stoppen {
  Sag "Dienst stoppen ..."
  try { Stop-ScheduledTask -TaskName $AufgabeName -ErrorAction SilentlyContinue } catch { }
  Start-Sleep -Milliseconds 800
  foreach ($pz in (Dienst-Prozesse)) { try { Stop-Process -Id $pz.ProcessId -Force -ErrorAction SilentlyContinue; Sag ("  node.exe (PID " + $pz.ProcessId + ") beendet.") } catch { } }
  for ($i = 0; $i -lt 10; $i++) { if (-not (Dienst-Status (Port-Lesen))) { break }; Start-Sleep -Milliseconds 300 }
  if (Dienst-Status (Port-Lesen)) { Sag "Der Dienst antwortet weiterhin - lief er von Hand gestartet?"; return $false }
  Sag "Dienst gestoppt."; return $true
}
function Sicherung-Jetzt {
  $port = Port-Lesen
  if (-not (Dienst-Status $port)) { throw "Der Dienst antwortet nicht - erst starten." }
  Sag "Sicherung angefordert ..."
  $r = Invoke-RestMethod -Method Post -Uri ("http://localhost:" + $port + "/api/scheurich/sicherung") -ContentType "application/json" -Body "{}" -TimeoutSec 120
  foreach ($e in $r.ergebnis) { if ($e.fehler) { Sag ("  " + $e.standort + ": FEHLER " + $e.fehler) } else { Sag ("  " + $e.standort + ": " + $e.datenbank + " (" + [Math]::Round($e.bytes / 1024) + " kB) + Export") } }
  Sag ("Sicherung fertig: " + $SicherungOrdner)
  return $true
}
function Rueckweg([string]$quelle) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($quelle)
  $standort = $null
  foreach ($st in $Standorte) { if ($name -like ("*_" + $st.Id)) { $standort = $st } }
  if (-not $standort) { throw "Aus dem Dateinamen ist der Standort nicht zu erkennen (erwartet: ..._scheurich.sqlite oder ..._soendgen.sqlite)." }
  $ziel = Join-Path $standort.Ordner "cockpit.sqlite"
  if (-not (Frage-JaNein ("Sicherung einspielen?`n`nQuelle:  $quelle`nZiel:  $ziel (" + $standort.Name + ")`n`nDer Dienst wird gestoppt, die heutige Datenbank wird vorher als Kopie 'cockpit.vor-rueckweg-<Zeit>.sqlite' aufgehoben, dann wird die Sicherung eingespielt und der Dienst neu gestartet.") "Sicherung einspielen")) { Sag "Rueckweg abgebrochen."; return $false }
  Sag ("Rueckweg " + $standort.Name + ": " + $quelle)
  if (-not (Dienst-Stoppen)) { throw "Der Dienst liess sich nicht stoppen - Rueckweg abgebrochen, nichts veraendert." }
  $stempel = (Get-Date).ToString("yyyy-MM-dd-HH-mm")
  if (Test-Path -LiteralPath $ziel) { Copy-Item -LiteralPath $ziel -Destination (Join-Path $standort.Ordner ("cockpit.vor-rueckweg-" + $stempel + ".sqlite")) -Force; Sag "  Heutige Datenbank aufgehoben: cockpit.vor-rueckweg-$stempel.sqlite" }
  foreach ($rest in @("cockpit.sqlite-wal", "cockpit.sqlite-shm")) { $r = Join-Path $standort.Ordner $rest; if (Test-Path -LiteralPath $r) { Remove-Item -LiteralPath $r -Force } }
  Copy-Item -LiteralPath $quelle -Destination $ziel -Force
  Sag "  Sicherung eingespielt."
  if (Dienst-Starten) { $s = Dienst-Status (Port-Lesen); $st2 = $s.standorte.($standort.Id); Sag ("  Stand jetzt: Version " + $st2.version + ", " + $st2.eintraege + " Eintraege, " + $st2.stoerungen + " Stoerberichte.") }
  return $true
}
function App-Tauschen([string]$quelle) {
  if (-not (Test-Path -LiteralPath $quelle)) { throw ("Datei nicht gefunden: " + $quelle) }
  $text = [System.IO.File]::ReadAllText($quelle)
  if ($text.Length -lt 200000 -or $text -notmatch "^\s*<!doctype html" -or $text -notmatch "</html>\s*$") { throw "Die gewaehlte Datei sieht nicht wie eine vollstaendige App-Datei aus (Anfang/Ende/Groesse)." }
  if (-not (Test-Path -LiteralPath $AppOrdner)) { New-Item -ItemType Directory -Path $AppOrdner -Force | Out-Null }
  $ziel = Join-Path $AppOrdner "Werkstatt_Kalender_TPM.html"
  if (Test-Path -LiteralPath $ziel) { $alt = Join-Path $AppOrdner ("Werkstatt_Kalender_TPM.vor-" + (Get-Date).ToString("yyyy-MM-dd-HH-mm") + ".html"); Copy-Item -LiteralPath $ziel -Destination $alt -Force; Sag ("  Alte App-Datei aufgehoben: " + (Split-Path -Leaf $alt)) }
  Copy-Item -LiteralPath $quelle -Destination $ziel -Force
  Sag ("App-Datei getauscht: " + $quelle + " -> " + $ziel + " (" + [Math]::Round((Get-Item -LiteralPath $ziel).Length / 1024) + " kB). Jeder Rechner hat sie beim naechsten Oeffnen.")
  return $true
}
function Datei-Lesbar([string]$pfad) {
  if (-not $pfad) { return "kein Pfad eingetragen" }
  try {
    if ([System.IO.File]::Exists($pfad)) { [void][System.IO.File]::OpenRead($pfad).Dispose(); return $null }
    try { $null = Get-Item -LiteralPath $pfad -ErrorAction Stop; return "ist keine Datei" }
    catch { if ($_.Exception -is [System.UnauthorizedAccessException] -or $_.Exception.Message -match "verweigert|denied") { return "Zugriff verweigert (das Server-Konto " + $env:USERDOMAIN + "\" + $env:USERNAME + " darf dort nicht lesen)" } else { return "nicht gefunden" } }
  } catch { return "Zugriff verweigert: " + $_.Exception.Message }
}
function Import-Sende([string]$standortId, [string]$bereich, [string]$pfad, [bool]$nurVorschau) {
  $port = Port-Lesen
  $weg = "http://localhost:" + $port + "/api/" + $standortId + "/import?bereich=" + $bereich + "&benutzer=" + $env:USERNAME
  if ($nurVorschau) { $weg += "&nurPruefen=1" }
  return Invoke-RestMethod -Method Post -Uri $weg -ContentType "application/json; charset=utf-8" -InFile $pfad -TimeoutSec 600
}
function Import-Laufen([string]$standortId, [string]$kal, [string]$stoer, [bool]$fotos, [bool]$nurVorschau) {
  $praefix = if ($nurVorschau) { "VORSCHAU: " } else { "" }
  $st = $Standorte | Where-Object { $_.Id -eq $standortId } | Select-Object -First 1
  if (-not $st) { throw ("Unbekannter Standort: " + $standortId) }
  foreach ($p in @($kal, $stoer)) { $grund = Datei-Lesbar $p; if ($grund) { throw ("Datei nicht lesbar: " + $p + " - " + $grund + ". Ersatzweg: die Dateien von einem PC aus nach \\" + $env:COMPUTERNAME + "\BTA\BTA-Programm\Installation kopieren.") } }
  $dienst = Dienst-Status (Port-Lesen)
  if (-not $dienst) { throw "Der Dienst antwortet nicht - erst starten." }
  if ([string]$dienst.fassung -ne $DienstFassungStick) { throw ("Der Dienst auf dem Server hat Fassung " + $dienst.fassung + ", dieser Stick bringt " + $DienstFassungStick + " - erst Einrichten.") }
  $kalMb = [Math]::Round((Get-Item -LiteralPath $kal).Length / 1MB, 1); $stoerMb = [Math]::Round((Get-Item -LiteralPath $stoer).Length / 1MB, 1)
  if (-not $nurVorschau) { if (-not (Frage-JaNein ("Import in die Datenbank " + $st.Name + "?`n`nKalender:  $kal ($kalMb MB)`nStoerungen:  $stoer ($stoerMb MB)`n`nW: wird nur gelesen. Was schon in der Datenbank steht, wird nicht doppelt angelegt.") "Import")) { Sag "Import abgebrochen - nichts veraendert."; return $false } }
  Sag ($praefix + "Import " + $st.Name + " gestartet - Kalender $kalMb MB, Stoerungen $stoerMb MB")
  $uhr = [System.Diagnostics.Stopwatch]::StartNew()
  $ergebnisse = @()
  foreach ($teil in @(@{ Bereich = "kalender"; Pfad = $kal; Titel = "Kalender" }, @{ Bereich = "stoerungen"; Pfad = $stoer; Titel = "Stoerungen" })) {
    Zeige-Fortschritt ($teil.Titel + " ..."); Pump
    $t0 = $uhr.ElapsedMilliseconds
    try { $r = Import-Sende $st.Id $teil.Bereich $teil.Pfad $nurVorschau }
    catch { $detail = ""; try { $detail = ($_.ErrorDetails.Message | ConvertFrom-Json).fehler } catch { $detail = [string]$_ }; throw ($teil.Titel + ": " + $detail) }
    $ms = $uhr.ElapsedMilliseconds - $t0
    Sag ($praefix + $teil.Titel + ": " + $r.gelesen + " gelesen - " + $r.neu + " neu, " + $r.geaendert + " geaendert, " + $r.unveraendert + " unveraendert, " + $r.geloescht + " geloescht, " + $r.konfig + " Einstellungen, " + $r.ohneId + " ohne Kennung  [" + $ms + " ms]")
    Sag ($praefix + $teil.Titel + ": davon " + $r.davon.fachlich + " FACHLICH (= Kennkarte), " + $r.davon.verlauf + " Verlauf, " + $r.davon.einstellungen + " Einstellungen")
    if (-not $nurVorschau) {
      $n = $r.nachweis
      Sag ("   " + $(if ($n.abweichungen -eq 0) { "NACHWEIS OK - " + $n.eintraegeVerglichen + " Eintraege zurueckgelesen, 0 Abweichungen" } else { "NACHWEIS ROT - " + $n.abweichungen + " Abweichungen: " + (($n.beispiele | Select-Object -First 3) -join "; ") }))
      Sag ("   Datenbank " + $st.Name + " vorher: " + $r.stand.vorher.eintraege + " / " + $r.stand.vorher.stoerungen + "  ->  nachher: " + $r.stand.nachher.eintraege + " / " + $r.stand.nachher.stoerungen + " (Version " + $r.version + ")")
    }
    $ergebnisse += $r
  }
  if ($fotos) {
    $fotoQuelle = Join-Path (Split-Path -Parent $kal) "Fotos"; $fotoZiel = Join-Path $st.Ordner "fotos"
    $fotoDa = $false; try { $fotoDa = [System.IO.Directory]::Exists($fotoQuelle) } catch { }
    if ($fotoDa) {
      $dateien = @(); try { $dateien = @(Get-ChildItem -LiteralPath $fotoQuelle -File -ErrorAction Stop) } catch { Sag ($praefix + "Fotos: Ordner nicht lesbar - " + $_.Exception.Message) }
      $kopiert = 0; $gleich = 0
      foreach ($f in $dateien) { $z = Join-Path $fotoZiel $f.Name; if ((Test-Path -LiteralPath $z) -and ((Get-Item -LiteralPath $z).Length -eq $f.Length)) { $gleich++; continue }; if (-not $nurVorschau) { if (-not (Test-Path -LiteralPath $fotoZiel)) { New-Item -ItemType Directory -Path $fotoZiel -Force | Out-Null }; Copy-Item -LiteralPath $f.FullName -Destination $z -Force }; $kopiert++ }
      Sag ($praefix + "Fotos: " + $dateien.Count + " Dateien - " + $kopiert + $(if ($nurVorschau) { " zu kopieren, " } else { " kopiert, " }) + $gleich + " schon da")
    } else { Sag ($praefix + "Fotos: kein Unterordner 'Fotos' neben der Kalender-Datei") }
  }
  $gesamt = [Math]::Round($uhr.ElapsedMilliseconds / 1000, 1)
  if ($nurVorschau) { Sag ("VORSCHAU fertig in $gesamt s - nichts veraendert.") }
  else { $rot = @($ergebnisse | Where-Object { $_.nachweis.abweichungen -gt 0 }).Count; Sag ("Import fertig in $gesamt s." + $(if ($rot -eq 0) { " Beide Nachweise OK." } else { " ACHTUNG: $rot Nachweis(e) rot - Protokoll speichern und schicken." })) }
  return $true
}
function Node-Laden {
  $zielOrdner = Join-Path $DienstOrdner "node"
  if (-not (Test-Path -LiteralPath $zielOrdner)) { New-Item -ItemType Directory -Path $zielOrdner -Force | Out-Null }
  $zip = Join-Path $env:TEMP ("node-" + $NodeFassung + ".zip")
  Sag ("Lade Node " + $NodeFassung + " (ca. 35 MB) von nodejs.org ...")
  if (-not (Lade-Datei $NodeUrl $zip 20)) { throw "Download fehlgeschlagen (kein Internet auf dem Server oder nodejs.org gesperrt)." }
  Sag "Entpacke node.exe ..."
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archiv = [System.IO.Compression.ZipFile]::OpenRead($zip)
  try { $eintrag = $archiv.Entries | Where-Object { $_.Name -eq "node.exe" } | Select-Object -First 1; if (-not $eintrag) { throw "node.exe nicht im Archiv gefunden." }; [System.IO.Compression.ZipFileExtensions]::ExtractToFile($eintrag, $nodeExe, $true) } finally { $archiv.Dispose() }
  Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
  Sag ("Node liegt im Dienst-Ordner: " + (& $nodeExe -v))
  return $true
}
function Entferne-Server {
  if (-not (Frage-JaNein "Den Dienst vom Server entfernen?`n`nEntfernt: Aufgabe, Firewall-Regel, Dienst-Ordner (Node, dienst.js, Einstellungen, Protokoll).`nBLEIBT: die Datenbanken in BTA-Scheurich/BTA-Soendgen, die App-Datei, die Sicherungen." "Entfernen")) { return $false }
  if (-not (Frage-JaNein "Wirklich? Das laesst sich mit 'Einrichten' jederzeit wieder aufbauen." "Entfernen - zweite Nachfrage")) { return $false }
  [void](Dienst-Stoppen)
  if (Aufgabe-Holen) { Unregister-ScheduledTask -TaskName $AufgabeName -Confirm:$false; Sag "  Aufgabe entfernt." }
  try { Remove-NetFirewallRule -DisplayName $FirewallName -ErrorAction SilentlyContinue; Sag "  Firewall-Regel entfernt." } catch { }
  if (Test-Path -LiteralPath $DienstOrdner) { Remove-Item -LiteralPath $DienstOrdner -Recurse -Force; Sag ("  Dienst-Ordner entfernt: " + $DienstOrdner) }
  Sag "Dienst vom Server entfernt. Datenbanken, App und Sicherungen sind unberuehrt."
  return $true
}

# =============================================================================
#  Aktion nach Kennung ausfuehren (Fenster und Konsole rufen dasselbe)
# =============================================================================
function Tue-Aktion([string]$id, [hashtable]$p) {
  if (-not $p) { $p = @{} }
  switch ($id) {
    "einrichten"       { return (Richte-Rechner-Ein $p.Zweck $p.Standort $p.Weg) }
    "verknuepfung"     { return (Repariere-Verknuepfung) }
    "autostart-ein"    { return (Setze-Autostart $true) }
    "autostart-aus"    { return (Setze-Autostart $false) }
    "serverweg-ein"    { return (Setze-ServerWeg $true $p.Schluessel) }
    "serverweg-aus"    { return (Setze-ServerWeg $false "") }
    "pfade"            { return (Speichere-Pfade $p.Standort) }
    "entfernen"        { return (Entferne-Cockpit) }
    "programm-laden"   { return (Lade-Programm) }
    "server-einrichten" { return (Server-Einrichten ([bool]$p.Vorschau) ([int]$p.Port) ($p.MitSoendgen -ne $false)) }
    "dienst-start"     { return (Dienst-Starten) }
    "dienst-stopp"     { return (Dienst-Stoppen) }
    "dienst-neustart"  { [void](Dienst-Stoppen); return (Dienst-Starten) }
    "sicherung"        { return (Sicherung-Jetzt) }
    "rueckweg"         { return (Rueckweg $p.Quelle) }
    "app-tauschen"     { return (App-Tauschen $p.Quelle) }
    "import"           { return (Import-Laufen $p.Standort $p.Kalender $p.Stoerungen ($p.Fotos -ne $false) ([bool]$p.Vorschau)) }
    "node-laden"       { return (Node-Laden) }
    "server-entfernen" { return (Entferne-Server) }
    default            { throw ("Unbekannte Aktion: " + $id) }
  }
}
