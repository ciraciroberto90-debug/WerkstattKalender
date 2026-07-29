# Werkstatt-Cockpit: Selbsttest
# =============================
#
# Fuer den Anruf "bei mir geht das Cockpit nicht". Statt durch die Werkstatt zu
# laufen und zu raten, laesst man diesen Test laufen und schaut auf die Zeilen,
# die rot sind.
#
# Der Test veraendert nichts. Er liest, misst und schreibt am Ende einen
# Bericht in die Zwischenablage und in eine Datei.

param(
  [string]$Ordner = "\\scheudc1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender",
  [int]$Port = 8765
)

$ErrorActionPreference = "Continue"
$bericht = New-Object System.Collections.ArrayList

function Groesse($bytes) {
  if ($bytes -lt 1024) { return "$bytes Bytes" }
  return ([math]::Round($bytes / 1KB)).ToString() + " KB"
}
function Zeile($name, $wert, $art = "info") {
  $farbe = switch ($art) { "gut" { "Green" } "schlecht" { "Red" } "warn" { "Yellow" } default { "Gray" } }
  $zeichen = switch ($art) { "gut" { "  OK  " } "schlecht" { "  !!  " } "warn" { "  ??  " } default { "      " } }
  Write-Host ($zeichen + $name.PadRight(42) + "  " + $wert) -ForegroundColor $farbe
  [void]$bericht.Add(($zeichen.Trim().PadRight(4) + " " + $name.PadRight(42) + "  " + $wert))
}
function Ueberschrift($t) {
  Write-Host ""
  Write-Host ("  " + $t) -ForegroundColor White
  Write-Host ("  " + ("-" * $t.Length)) -ForegroundColor DarkGray
  [void]$bericht.Add(""); [void]$bericht.Add($t); [void]$bericht.Add(("-" * $t.Length))
}

Write-Host ""
Write-Host "  WERKSTATT-COCKPIT - SELBSTTEST" -ForegroundColor White
[void]$bericht.Add("WERKSTATT-COCKPIT - SELBSTTEST")
[void]$bericht.Add((Get-Date -Format "dd.MM.yyyy HH:mm") + "   Rechner: $env:COMPUTERNAME   Benutzer: $env:USERNAME")
Write-Host ("  " + (Get-Date -Format "dd.MM.yyyy HH:mm") + "   " + $env:COMPUTERNAME + " / " + $env:USERNAME) -ForegroundColor DarkGray

# ---------------------------------------------------------------- Umgebung
Ueberschrift "Rechner"
Zeile "Windows" ([System.Environment]::OSVersion.VersionString)
Zeile "PowerShell" ($PSVersionTable.PSVersion.ToString())
try {
  $frei = (Get-PSDrive -Name ($env:SystemDrive.TrimEnd(":")) -ErrorAction Stop).Free
  Zeile "Freier Platz auf $env:SystemDrive" ([math]::Round($frei / 1GB, 1).ToString() + " GB") $(if ($frei -lt 1GB) { "schlecht" } else { "gut" })
} catch { Zeile "Freier Platz" "nicht ermittelbar" "warn" }

# ---------------------------------------------------------------- Ordner
Ueberschrift "Datenordner"
Zeile "Pfad" $Ordner
if (-not (Test-Path -LiteralPath $Ordner)) {
  Zeile "Erreichbar" "NEIN - das ist die Ursache" "schlecht"
  Write-Host ""
  Write-Host "  Das Netzlaufwerk ist nicht verbunden. Im Explorer einmal oeffnen," -ForegroundColor Yellow
  Write-Host "  dann das Cockpit neu starten." -ForegroundColor Yellow
  Read-Host "  Mit Eingabetaste schliessen"
  exit 1
}
Zeile "Erreichbar" "ja" "gut"

$app = Get-ChildItem -LiteralPath $Ordner -Filter "Werkstatt_Kalender_TPM*.html" -File -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending
if ($app) {
  Zeile "Programmdatei" ($app[0].Name + "  (" + (Groesse $app[0].Length) + ", " + $app[0].LastWriteTime.ToString("dd.MM.yyyy HH:mm") + ")") "gut"
  if ($app.Count -gt 1) { Zeile "Weitere Fassungen" ((($app.Count - 1).ToString()) + " aeltere liegen daneben") "warn" }
} else {
  Zeile "Programmdatei" "KEINE Werkstatt_Kalender_TPM*.html gefunden" "schlecht"
}

# ---------------------------------------------------------------- Datendateien
Ueberschrift "Datendateien"
$dateien = Get-ChildItem -LiteralPath $Ordner -Filter "*.json" -File -ErrorAction SilentlyContinue |
           Where-Object { $_.Name -notlike "*vor-wiederherstellung*" }
if (-not $dateien) { Zeile "Gefunden" "KEINE JSON-Datei im Ordner" "schlecht" }

$konflikte = @()
foreach ($d in $dateien) {
  # Konfliktkopien von OneDrive heissen "<Datenname>-RECHNERNAME.json" - also
  # der Name einer der beiden Datendateien, ein BINDESTRICH, dann der Rechner.
  # Genau diese Regel benutzt auch der Konflikt-Waechter in der App.
  #
  # Wichtig ist der Bindestrich: Von Hand angelegte Sicherungen heissen
  # ueblicherweise "werkstatt-kalender-daten_2026-07-28.json" mit UNTERSTRICH.
  # Eine frueher hier stehende Fassung pruefte nur "endet auf -irgendwas" und
  # haette solche Sicherungen als Konfliktkopien gemeldet - ein Fehlalarm, der
  # jemanden dazu bringen koennte, seine Sicherung wegzuwerfen.
  if ($d.BaseName -match "^(werkstatt-kalender-daten|werkstatt-stoerungen)-.+$") {
    $konflikte += $d
  }
  $roh = ""
  try { $roh = [System.IO.File]::ReadAllText($d.FullName) } catch { }
  $t = $roh.Trim()
  $vollstaendig = $t.Length -gt 0 -and (($t[0] -eq "{" -and $t[-1] -eq "}") -or ($t[0] -eq "[" -and $t[-1] -eq "]"))
  $anzahl = "?"
  if ($vollstaendig) {
    try { $obj = $roh | ConvertFrom-Json; if ($null -ne $obj.entries) { $anzahl = @($obj.entries).Count } } catch { $vollstaendig = $false }
  }
  $text = "{0}, geaendert {1}, {2} Eintraege" -f (Groesse $d.Length), $d.LastWriteTime.ToString("dd.MM. HH:mm"), $anzahl
  if (-not $vollstaendig) { $text = "{0} - UNVOLLSTAENDIG oder kein JSON" -f (Groesse $d.Length) }
  Zeile $d.Name $text $(if ($vollstaendig) { "gut" } else { "schlecht" })
}
if ($konflikte.Count -gt 0) {
  Zeile "Konfliktkopien" ($konflikte.Count.ToString() + " gefunden: " + (($konflikte | Select-Object -First 3).Name -join ", ")) "warn"
}

# ---------------------------------------------------------------- Sicherungen
Ueberschrift "Sicherungen"
$sicherOrt = Join-Path $Ordner "Sicherungen"
if (-not (Test-Path -LiteralPath $sicherOrt)) {
  $heimOrt = $env:USERPROFILE
  if (-not $heimOrt) { $heimOrt = $HOME }
  $sicherOrt = Join-Path $heimOrt "Cockpit-Sicherungen"
}
if (Test-Path -LiteralPath $sicherOrt) {
  $staende = Get-ChildItem -LiteralPath $sicherOrt -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
  if ($staende) {
    $alter = ((Get-Date) - [datetime]::ParseExact($staende[0].Name.Substring(0, 10), "yyyy-MM-dd", $null)).Days
    Zeile "Vorhandene Staende" $staende.Count.ToString() "gut"
    Zeile "Neueste Sicherung" ($staende[0].Name + "  (vor " + $alter + " Tagen)") $(if ($alter -le 7) { "gut" } else { "warn" })
    Zeile "Ablage" $sicherOrt
  } else { Zeile "Vorhandene Staende" "keine" "warn" }
} else {
  Zeile "Sicherungen" "noch keine angelegt" "warn"
}

# ---------------------------------------------------------------- Dienst
Ueberschrift "Ausliefer-Dienst"
$laeuft = $false
try {
  $k = [System.Net.Sockets.TcpClient]::new()
  if ($k.ConnectAsync("127.0.0.1", $Port).Wait(800)) {
    $s = $k.GetStream(); $s.ReadTimeout = 1500
    $anfrage = [System.Text.Encoding]::ASCII.GetBytes("GET /__cockpit HTTP/1.1`r`nHost: localhost`r`nConnection: close`r`n`r`n")
    $s.Write($anfrage, 0, $anfrage.Length); $s.Flush()
    $antwort = ([System.IO.StreamReader]::new($s)).ReadToEnd()
    $laeuft = $antwort -match "werkstatt-cockpit-dienst"
  }
  $k.Close()
} catch { }
Zeile "Port $Port" $(if ($laeuft) { "Dienst laeuft" } else { "kein Dienst erreichbar" }) $(if ($laeuft) { "gut" } else { "warn" })
if (-not $laeuft) {
  Zeile "Naechster Schritt" "Cockpit starten.cmd doppelklicken" "warn"
}

# ---------------------------------------------------------------- Browser
Ueberschrift "Browser"
$chrome = @("${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe") |
          Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($chrome) {
  $v = (Get-Item -LiteralPath $chrome).VersionInfo.ProductVersion
  Zeile "Chrome" $v "gut"
} else { Zeile "Chrome" "nicht am Standardort gefunden" "warn" }
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (Test-Path -LiteralPath $edge) { Zeile "Edge" (Get-Item -LiteralPath $edge).VersionInfo.ProductVersion }

# ---------------------------------------------------------------- Abschluss
$text = ($bericht -join "`r`n")
$heim = $env:USERPROFILE
if (-not $heim) { $heim = $HOME }
if (-not $heim) { $heim = [System.IO.Path]::GetTempPath() }
$datei = Join-Path $heim ("Cockpit-Selbsttest-" + (Get-Date -Format "yyyy-MM-dd_HHmm") + ".txt")
try {
  [System.IO.File]::WriteAllText($datei, $text)
  try { Set-Clipboard -Value $text; $abl = " und in der Zwischenablage" } catch { $abl = "" }
  Write-Host ""
  Write-Host ("  Bericht gespeichert" + $abl + ":") -ForegroundColor White
  Write-Host ("  " + $datei) -ForegroundColor DarkGray
} catch {
  Write-Host ""
  Write-Host "  Bericht konnte nicht gespeichert werden - bitte den Text oben abfotografieren." -ForegroundColor Yellow
}
Write-Host ""
Read-Host "  Mit Eingabetaste schliessen"
