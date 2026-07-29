# Werkstatt-Cockpit: Desktop-Verknuepfung anlegen
# ===============================================
#
# Fuer die Ablage, bei der Starter und Dienst auf dem Firmenlaufwerk liegen
# und die Kollegen sich nur eine Verknuepfung holen.
#
# Warum ein Skript und nicht "Rechtsklick - Verknuepfung erstellen":
#
#  1. cmd.exe unterstuetzt keine UNC-Pfade als Arbeitsverzeichnis. Wird die
#     .cmd direkt von der Freigabe gestartet, erscheint jedes Mal die Meldung
#     "UNC-Pfade werden nicht unterstuetzt. Stattdessen wird das
#     Windows-Verzeichnis verwendet." Die Verknuepfung ruft deshalb
#     cmd.exe /c mit einem oertlichen Arbeitsverzeichnis auf - dann bleibt es
#     still.
#  2. Fenster minimiert, ordentliches Symbol, richtiger Name: von Hand sind
#     das vier Handgriffe in drei Dialogen, hier ist es ein Doppelklick.

param(
  [string]$Starter = "",       # leer = "Cockpit starten.cmd" neben diesem Skript
  [switch]$MitAutostart,       # zusaetzlich in den Autostart legen
  [switch]$OhneNachfrage
)

$ErrorActionPreference = "Stop"

$hier = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Starter) { $Starter = Join-Path $hier "Cockpit starten.cmd" }

Write-Host ""
Write-Host "  Werkstatt-Cockpit - Verknuepfung anlegen" -ForegroundColor White
Write-Host "  ---------------------------------------"
Write-Host ""

if (-not (Test-Path -LiteralPath $Starter)) {
  Write-Host "  FEHLER: Der Starter wurde nicht gefunden:" -ForegroundColor Red
  Write-Host "  $Starter" -ForegroundColor Red
  Write-Host ""
  Write-Host "  Erwartet wird 'Cockpit starten.cmd' neben diesem Skript." -ForegroundColor Yellow
  if (-not $OhneNachfrage) { Read-Host "  Mit Eingabetaste schliessen" }
  exit 1
}
Write-Host "  Starter:  $Starter"

function Lege-Verknuepfung($zielOrdner, $name) {
  $pfad = Join-Path $zielOrdner ($name + ".lnk")
  $schale = New-Object -ComObject WScript.Shell
  $v = $schale.CreateShortcut($pfad)
  $v.TargetPath = Join-Path $env:SystemRoot "System32\cmd.exe"
  # Die doppelten Anfuehrungszeichen sind Absicht: cmd /c braucht sie, wenn
  # der Pfad Leerzeichen enthaelt - und "Cockpit starten.cmd" enthaelt eins.
  $v.Arguments = '/c ""' + $Starter + '""'
  $v.WorkingDirectory = $env:SystemRoot     # NICHT der UNC-Pfad, sonst meckert cmd
  $v.WindowStyle = 7                        # minimiert
  $v.IconLocation = (Join-Path $env:SystemRoot "System32\shell32.dll") + ",46"
  $v.Description = "Werkstatt-Cockpit starten (Ausliefer-Dienst und Browser)"
  $v.Save()
  return $pfad
}

$desktop = [Environment]::GetFolderPath("Desktop")
$erstellt = Lege-Verknuepfung $desktop "Werkstatt-Cockpit"
Write-Host ("  angelegt: " + $erstellt) -ForegroundColor Green

$autostart = $MitAutostart
if (-not $MitAutostart -and -not $OhneNachfrage) {
  Write-Host ""
  Write-Host "  Soll das Cockpit beim Anmelden von allein starten?" -ForegroundColor Yellow
  Write-Host "  (Dann laeuft der Dienst im Hintergrund und der Browser oeffnet sich.)"
  $antwort = Read-Host "  Autostart einrichten? (ja/nein)"
  $autostart = ($antwort -eq "ja")
}

if ($autostart) {
  $startordner = [Environment]::GetFolderPath("Startup")
  $a = Lege-Verknuepfung $startordner "Werkstatt-Cockpit"
  Write-Host ("  Autostart eingerichtet: " + $a) -ForegroundColor Green
} else {
  Write-Host "  Kein Autostart - das Cockpit wird ueber das Desktop-Symbol geoeffnet." -ForegroundColor Gray
}

Write-Host ""
Write-Host "  Fertig. Auf dem Desktop liegt jetzt 'Werkstatt-Cockpit'." -ForegroundColor Green
Write-Host ""
if (-not $OhneNachfrage) { Read-Host "  Mit Eingabetaste schliessen" }
