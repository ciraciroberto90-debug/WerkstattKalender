# BTA-Cockpit: DAS Werkzeug - ein Einstieg fuer Rechner UND Server (Roll-out 79, 30.10.2026)
# ============================================================================================
#
# Doppelklick auf BTA-Werkzeug.cmd startet diese Datei mit Fenster: der
# Assistent (Vorlage A) mit der Ampel-Tafel (Vorlage C) dahinter - siehe
# bta-fenster.ps1. Alles, was das Werkzeug tut, steht in bta-kern.ps1.
#
# Fensterlos fuer den Pruefstand (tests/pruefe-werkzeug.js) und fuer Roberto in
# der Konsole:
#   bta-werkzeug.ps1 -OhneFenster                      -> Lage + Tafel als JSON
#   bta-werkzeug.ps1 -OhneFenster -Tue einrichten -Zweck arbeitsplatz -Ja
#   bta-werkzeug.ps1 -OhneFenster -Tue server-einrichten -Vorschau
# Schalter:
#   -Profil <Ordner>   Desktop/Autostart/AppData liegen fuer den Lauf darunter (Tests)
#   -Stick <Ordner>    anderer Stick-Ordner als der, in dem das Skript liegt
#   -Rolle rechner|server   Erkennung uebersteuern (Tests auf dem Laptop)
#   -Ja                Rueckfragen gelten als "Ja" (nur fensterlos)
#   -AutoSchliessen N  Fenster schliesst sich nach N Sekunden von selbst (Pruefstand:
#                      zeigt, dass das Fenster aufgeht und alle Schritte sich fuellen)
# Rueckgabe fensterlos: Exit 0 = gut, 1 = Aktion rot, 2 = Aufruf falsch.
#
# Bewusst ohne Umlaute im Quelltext (PowerShell 5.1 liest die Datei sonst je
# nach Kodierung falsch).
param(
  [switch]$OhneFenster,
  [string]$Tue = "",
  [string]$Zweck = "arbeitsplatz",
  [string]$Standort = "",
  [string]$Weg = "",
  [string]$Quelle = "",
  [string]$Kalender = "",
  [string]$Stoerungen = "",
  [string]$Schluessel = "",
  [int]$Port = 0,
  [switch]$Vorschau,
  [switch]$OhneSoendgen,
  [switch]$OhneFotos,
  [switch]$Ja,
  [string]$Profil = "",
  [string]$Stick = "",
  [string]$Rolle = "",
  [int]$AutoSchliessen = 0
)
$ErrorActionPreference = "Stop"

$hier  = Split-Path -Parent $MyInvocation.MyCommand.Path
$paket = $(if ($Stick) { $Stick } else { Split-Path -Parent $hier })
if ($Profil) { $script:ProfilOrdner = $Profil }
if ($Rolle) { $env:BTA_WERKZEUG_ROLLE = $Rolle }

if ($OhneFenster) {
  # Konsole: Protokoll als Zeilen, am Ende JSON mit Ergebnis.
  $script:ImmerJa = [bool]$Ja
  $script:Protokoll = New-Object System.Collections.ArrayList
  $script:Ausgabe = { param($t) [void]$script:Protokoll.Add($t); [Console]::Error.WriteLine($t) }
  . (Join-Path $hier "bta-kern.ps1")
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [Console]::OutputEncoding = $utf8
  try {
    if (-not $Tue) {
      $lage = Erkenne-Lage
      $tafel = Tafel $lage $Zweck
      $aus = [ordered]@{ lage = $lage; tafel = $tafel }
      Write-Output (ConvertTo-Json $aus -Depth 6)
      exit 0
    }
    $p = @{ Zweck = $Zweck; Standort = $Standort; Weg = $Weg; Quelle = $Quelle; Kalender = $Kalender; Stoerungen = $Stoerungen; Schluessel = $Schluessel; Port = $Port; Vorschau = [bool]$Vorschau; MitSoendgen = (-not $OhneSoendgen); Fotos = (-not $OhneFotos) }
    $ergebnis = Tue-Aktion $Tue $p
    $ok = $true
    if ($ergebnis -is [hashtable]) { $ok = [bool]$ergebnis.Ok } elseif ($null -ne $ergebnis) { $ok = [bool]$ergebnis }
    Write-Output (ConvertTo-Json ([ordered]@{ aktion = $Tue; ok = $ok; ergebnis = $ergebnis; protokoll = @($script:Protokoll) }) -Depth 6)
    exit $(if ($ok) { 0 } else { 1 })
  } catch {
    Write-Output (ConvertTo-Json ([ordered]@{ aktion = $Tue; ok = $false; fehler = $_.Exception.Message; protokoll = @($script:Protokoll) }) -Depth 6)
    exit 1
  }
}

# Mit Fenster: Abbrueche VOR dem Fenster landen in einer Datei (die .cmd oeffnet sie),
# weil das Konsolenfenster versteckt ist (gelernt am 30.09. auf dem Server).
trap {
  $meldung = "BTA-Werkzeug abgebrochen`r`n`r`n" + $_.Exception.Message + "`r`n`r`nStelle: " + $_.InvocationInfo.PositionMessage
  try { [System.IO.File]::WriteAllText((Join-Path $hier "bta-werkzeug-fehler.txt"), (Get-Date).ToString("dd.MM.yyyy HH:mm:ss") + "`r`n" + $meldung) } catch { }
  try { [void][System.Windows.Forms.MessageBox]::Show($meldung, "BTA-Cockpit Werkzeug", "OK", "Error") } catch { }
  exit 1
}
. (Join-Path $hier "bta-fenster.ps1")
