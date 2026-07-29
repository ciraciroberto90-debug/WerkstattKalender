# Prueft den Zugang /__oeffne des Ausliefer-Dienstes.
#
# Das ist die einzige Stelle, an der der Dienst etwas TUT statt nur Dateien
# auszuliefern - also die einzige, an der ein Fehler mehr kostet als eine leere
# Seite. Geprueft wird die Entscheidungslogik aus der echten Datei: Wer darf
# fragen, welche Pfade sind gueltig, und was passiert bei einer Programmdatei.
#
# Ausgefuehrt wird der Abschnitt aus cockpit-server.ps1 selbst; ersetzt sind
# nur die drei Stellen, die einen laufenden Dienst braeuchten (Antworten,
# Protokollzeile, Start-Process).

$quelle = Join-Path $PSScriptRoot "../arbeitsplatz/cockpit-server.ps1"
$alle = Get-Content -LiteralPath $quelle
$von = ($alle | Select-String -Pattern '^      if \(\$pfad -eq "/__oeffne"\) \{' | Select-Object -First 1).LineNumber
if (-not $von) { throw "Abschnitt /__oeffne nicht gefunden" }
$bis = ($alle | Select-String -Pattern '^      \}$' | Where-Object { $_.LineNumber -gt $von } | Select-Object -First 1).LineNumber
if (-not $bis) { throw "Ende des Abschnitts nicht gefunden" }
$abschnitt = ($alle[($von - 1)..($bis - 1)] -join "`n")
foreach ($muss in @("sec-fetch-site", "Start-Process", "gefaehrlich", "Test-Path")) {
  if ($abschnitt -notmatch [regex]::Escape($muss)) { throw "Falscher Abschnitt - '$muss' fehlt" }
}

# Ersatz fuer die drei Stellen, die einen echten Dienst braeuchten.
$abschnitt = $abschnitt -replace 'Antworte \$strom (\d+) "[^"]*" "[^"]*" \(\[System\.Text\.Encoding\]::UTF8\.GetBytes\(([^\n]*?)\)\)', '$global:Code = $1; $global:Text = ($2)'
$abschnitt = $abschnitt -replace 'Schreibe \(([^\n]*?)\) "[A-Za-z]+"', '$null = ($1)'
$abschnitt = $abschnitt -replace 'Schreibe "[^"]*" "[A-Za-z]+"', ''
$abschnitt = $abschnitt -replace 'Start-Process -FilePath \$starten -ErrorAction Stop \| Out-Null', '$global:Gestartet = $starten'
$abschnitt = $abschnitt -replace '\$kunde\.Close\(\); continue', 'return'
# Die aeussere if-Bedingung faellt weg - der Abschnitt wird direkt aufgerufen.
$abschnitt = $abschnitt -replace '(?s)^\s*if \(\$pfad -eq "/__oeffne"\) \{', ''
$abschnitt = $abschnitt -replace '(?s)\}\s*$', ''

$gut = 0; $schlecht = 0
function Pruefe($was, $bedingung, $zusatz) {
  if ($bedingung) { $script:gut++; Write-Host ("  OK   " + $was) -ForegroundColor Green }
  else { $script:schlecht++; Write-Host ("  !!   " + $was + $(if ($zusatz) { "   (" + $zusatz + ")" } else { "" })) -ForegroundColor Red }
}
function Anfrage($herkunft, $pfadWunsch) {
  $global:Code = 0; $global:Text = ""; $global:Gestartet = ""
  $kopfzeilen = @{}
  if ($herkunft) { $kopfzeilen["sec-fetch-site"] = $herkunft }
  $abfrage = "pfad=" + [System.Uri]::EscapeDataString([string]$pfadWunsch)
  $strom = $null
  & ([scriptblock]::Create($abschnitt))
  return [pscustomobject]@{ Code = $global:Code; Text = $global:Text; Gestartet = $global:Gestartet }
}

Write-Host ""
Write-Host "  AUSLIEFER-DIENST - DATEI OEFFNEN" -ForegroundColor White
Write-Host ""

# Damit hier echte Windows-Pfade geprueft werden koennen, wird ein Laufwerk C
# angelegt, das auf einen Testordner zeigt. So laeuft die Pfadpruefung des
# Dienstes unveraendert - inklusive Test-Path - und nicht gegen eine Attrappe.
$echt = Join-Path ([System.IO.Path]::GetTempPath()) ("oeffne-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $echt -Force | Out-Null
New-PSDrive -Name C -PSProvider FileSystem -Root $echt -Scope Global -ErrorAction SilentlyContinue | Out-Null
$basis = "C:\"
$datei = "C:\Anleitung.pdf"
$programm = "C:\Start.exe"
Set-Content -LiteralPath $datei -Value "pdf"
Set-Content -LiteralPath $programm -Value "exe"

# --- Herkunft ---------------------------------------------------------------
# Der wichtigste Punkt: Ohne diese Sperre koennte JEDE Webseite im Netz eine
# Datei auf dem Rechner oeffnen lassen - sie muesste nur localhost aufrufen.
$a = Anfrage "cross-site" "\\server\freigabe\datei.pdf"
Pruefe "Eine fremde Webseite wird abgewiesen" ($a.Code -eq 403 -and -not $a.Gestartet) $a.Code
$a = Anfrage "" "\\server\freigabe\datei.pdf"
Pruefe "Fehlt die Herkunftsangabe, wird ebenfalls abgewiesen" ($a.Code -eq 403 -and -not $a.Gestartet) $a.Code
$a = Anfrage "same-site" "\\server\freigabe\datei.pdf"
Pruefe "'same-site' genuegt nicht - nur 'same-origin'" ($a.Code -eq 403) $a.Code

# --- Pfadpruefung -----------------------------------------------------------
foreach ($schlimm in @("", "javascript:alert(1)", "http://example.com", "..\..\windows", 'C:\ok" & calc')) {
  $a = Anfrage "same-origin" $schlimm
  Pruefe ("Abgelehnt: '" + $schlimm + "'") ($a.Code -eq 400 -and -not $a.Gestartet) $a.Code
}

# --- Gueltige Pfade ---------------------------------------------------------
$a = Anfrage "same-origin" "\\scheudc1\PSG_Gruppe\gibt-es-nicht.pdf"
Pruefe "Ein gueltiger, aber nicht erreichbarer Pfad ergibt 404" ($a.Code -eq 404) $a.Code

# Ein Pfad mit r, n und t darin - genau der Fall, den die erste Fassung der
# Zeichenklasse faelschlich abgelehnt haette.
$a = Anfrage "same-origin" $datei
Pruefe "Eine vorhandene Datei wird geoeffnet" ($a.Code -eq 200 -and $a.Gestartet -eq $datei) ($a.Code.ToString() + " " + $a.Gestartet)
Pruefe "Buchstaben wie r, n, t im Pfad sind kein Hindernis" ($datei -match "[rnt]" -and $a.Code -eq 200)

# --- Programmdateien --------------------------------------------------------
$a = Anfrage "same-origin" $programm
Pruefe "Eine Programmdatei wird NICHT gestartet" ($a.Gestartet -ne $programm) $a.Gestartet
# Split-Path liefert auf Linux "C:/" statt "C:\" - der Schraegstrich ist eine
# Eigenheit dieser Testumgebung, nicht des Dienstes. Deshalb vor dem Vergleich
# angleichen, statt die Pruefung zu streichen.
$ordnerRaus = ([string]$a.Gestartet).Replace("/", "\")
Pruefe "Stattdessen oeffnet sich der Ordner" ($a.Code -eq 200 -and $ordnerRaus -eq $basis) $a.Gestartet

# --- Ordner -----------------------------------------------------------------
$a = Anfrage "same-origin" $basis
Pruefe "Ein Ordner laesst sich oeffnen" ($a.Code -eq 200 -and $a.Gestartet -eq $basis) $a.Gestartet

Remove-PSDrive -Name C -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $echt -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host ("  " + $gut + " von " + ($gut + $schlecht) + " Pruefungen bestanden")
Write-Host ""
if ($schlecht -gt 0) { exit 1 }
