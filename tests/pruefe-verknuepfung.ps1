# Prueft den Autostart-Zweig von arbeitsplatz/cockpit-verknuepfung.ps1.
#
# Der Abschnitt wird aus der echten Datei geschnitten und ausgefuehrt - nicht
# nachgebaut. Nachgebauter Code prueft nur, ob ich zweimal dasselbe denke.
# Ersetzt werden nur die beiden Stellen, die Windows brauchen: der Aufruf von
# GetFolderPath und das Anlegen der Verknuepfung ueber WScript.Shell.

$quelle = Join-Path $PSScriptRoot "../arbeitsplatz/cockpit-verknuepfung.ps1"
$alle = Get-Content -LiteralPath $quelle
$von = ($alle | Select-String -Pattern '^# Gemessen: liefert GetFolderPath' | Select-Object -First 1).LineNumber
if (-not $von) { throw "Anfang des Autostart-Abschnitts nicht gefunden" }
$bis = ($alle | Select-String -Pattern '^\}$' | Where-Object { $_.LineNumber -gt $von } | Select-Object -First 1).LineNumber
if (-not $bis) { throw "Ende des Autostart-Abschnitts nicht gefunden" }

$abschnitt = ($alle[($von - 1)..($bis - 1)] -join "`n")
foreach ($muss in @("Autostart wieder entfernt", "Lege-Verknuepfung", "GetFolderPath")) {
  if ($abschnitt -notmatch [regex]::Escape($muss)) { throw "Falscher Abschnitt geschnitten - '$muss' fehlt" }
}
# Einzige Aenderung am echten Text: den Windows-Aufruf durch die Testvorgabe
# ersetzen. Alles andere - die Bedingungen, das Loeschen, die Meldungen -
# laeuft so, wie es auf dem Rechner der Kollegen laufen wird.
$abschnitt = $abschnitt -replace '\[Environment\]::GetFolderPath\("Startup"\)', '$global:TestStartup'

function Lege-Verknuepfung($zielOrdner, $name) {
  $p = Join-Path $zielOrdner ($name + ".lnk")
  Set-Content -LiteralPath $p -Value "verknuepfung"
  return $p
}

$gut = 0; $schlecht = 0
function Pruefe($was, $bedingung) {
  if ($bedingung) { $script:gut++; Write-Host ("  OK   " + $was) -ForegroundColor Green }
  else { $script:schlecht++; Write-Host ("  !!   " + $was) -ForegroundColor Red }
}
function Lauf($startupOrdner, $antwort) {
  $global:TestStartup = $startupOrdner
  $autostart = $antwort
  return (Invoke-Expression $abschnitt 4>&1 6>&1 | Out-String)
}

Write-Host ""
Write-Host "  VERKNUEPFUNG - AUTOSTART-ZWEIG" -ForegroundColor White
Write-Host ""

$basis = Join-Path ([System.IO.Path]::GetTempPath()) ("verkn-" + [guid]::NewGuid())
$sp = Join-Path $basis "Autostart"
New-Item -ItemType Directory -Path $sp -Force | Out-Null
$lnk = Join-Path $sp "Werkstatt-Cockpit.lnk"

$a = Lauf $sp $true
Pruefe "ja legt die Autostart-Verknuepfung an" (Test-Path -LiteralPath $lnk)
Pruefe "ja meldet das auch" ($a -match "Autostart eingerichtet")

# Der eigentliche Punkt: Die Anleitung sagt den Kollegen, sie koennten sich
# jederzeit umentscheiden. Ohne diesen Zweig waere das eine Falschaussage.
$a = Lauf $sp $false
Pruefe "nein nimmt einen frueheren Autostart zurueck" (-not (Test-Path -LiteralPath $lnk))
Pruefe "nein meldet das Entfernen" ($a -match "Autostart wieder entfernt")

$a = Lauf $sp $false
Pruefe "nein ohne vorhandenen Autostart laeuft still durch" (($a -notmatch "wieder entfernt") -and ($a -match "Kein Autostart"))

# Ein Rechner mit ungewoehnlichem Profil liefert einen leeren Ordner. Frueher
# lief die Zeile nur im ja-Fall; jetzt laeuft sie immer und darf nicht werfen.
$a = Lauf "" $true
Pruefe "ja ohne Autostart-Ordner bricht nicht ab" ($a -match "Autostart-Ordner nicht gefunden")
$a = Lauf "" $false
Pruefe "nein ohne Autostart-Ordner bricht nicht ab" ($a -match "Kein Autostart")

# Fremde Dateien im Autostart bleiben unangetastet.
Set-Content -LiteralPath (Join-Path $sp "Etwas-anderes.lnk") -Value "fremd"
[void](Lauf $sp $false)
Pruefe "fremde Autostart-Eintraege bleiben liegen" (Test-Path -LiteralPath (Join-Path $sp "Etwas-anderes.lnk"))

Remove-Item -LiteralPath $basis -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host ("  " + $gut + " von " + ($gut + $schlecht) + " Pruefungen bestanden")
Write-Host ""
if ($schlecht -gt 0) { exit 1 }
