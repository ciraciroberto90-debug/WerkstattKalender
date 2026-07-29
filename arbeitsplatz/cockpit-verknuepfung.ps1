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
  [string]$Symbol = "",        # leer = $SymbolVorgabe weiter unten
  [switch]$MitAutostart,       # zusaetzlich in den Autostart legen
  [switch]$OhneNachfrage
)

$ErrorActionPreference = "Stop"

# Das Symbol der Verknuepfung. Eine Zeile, damit es fuer alle gleich ist -
# vorher musste es jeder von Hand auswaehlen, und dann sieht der Desktop bei
# jedem anders aus.
#
# Die Zahl hinter dem Komma ist die Nummer des Symbols in der Datei. Sie laesst
# sich nicht erraten - der Dialog "Anderes Symbol" zeigt Bilder, keine Nummern.
# Wer das Symbol aendern will, waehlt es einmal von Hand an einer Verknuepfung
# aus und liest den Wert danach so aus:
#
#   (New-Object -ComObject WScript.Shell).CreateShortcut(
#     "$env:USERPROFILE\Desktop\Werkstatt-Cockpit.lnk").IconLocation
#
# Der ausgegebene Text kommt genau hier hinein - dann sieht es bei allen gleich
# aus, ohne dass jemand klicken muss.
$SymbolVorgabe = "%SystemRoot%\System32\shell32.dll,46"

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

# Symbol festlegen und pruefen, dass die Datei ueberhaupt da ist. Zeigt eine
# Verknuepfung ins Leere, nimmt Windows stillschweigend das Symbol des Ziels -
# hier also das schwarze Fenster von cmd.exe. Dann sieht es bei einem Kollegen
# anders aus als bei den anderen, und niemand weiss warum.
$symbolWert = $Symbol
if (-not $symbolWert) { $symbolWert = $SymbolVorgabe }
$symbolDatei = [Environment]::ExpandEnvironmentVariables(($symbolWert -split ",")[0])
Write-Host "  Symbol:   $symbolWert"
if (-not (Test-Path -LiteralPath $symbolDatei)) {
  Write-Host ("  Symboldatei nicht gefunden: " + $symbolDatei) -ForegroundColor Yellow
  Write-Host "  Die Verknuepfung bekommt das Standardsymbol von cmd.exe." -ForegroundColor Yellow
}

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
  $v.IconLocation = $symbolWert
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

# Gemessen: liefert GetFolderPath einen leeren Text, wirft Join-Path. Das
# passiert hier nicht, kann es aber auf einem Rechner mit ungewoehnlichem
# Profil - und dann waere das Desktop-Symbol schon angelegt und der Abbruch
# umso verwirrender.
$startordner = [Environment]::GetFolderPath("Startup")
$autostartDatei = ""
if ($startordner) { $autostartDatei = Join-Path $startordner "Werkstatt-Cockpit.lnk" }
if ($autostart -and -not $startordner) {
  Write-Host "  Autostart-Ordner nicht gefunden - Autostart wurde nicht eingerichtet." -ForegroundColor Yellow
  Write-Host "  Das Desktop-Symbol funktioniert davon unabhaengig." -ForegroundColor Gray
} elseif ($autostart) {
  $a = Lege-Verknuepfung $startordner "Werkstatt-Cockpit"
  Write-Host ("  Autostart eingerichtet: " + $a) -ForegroundColor Green
} else {
  # "nein" muss auch ein frueheres "ja" zuruecknehmen koennen. Sonst waere die
  # Frage beim zweiten Durchlauf eine Luege: Man antwortet nein, der Autostart
  # bleibt trotzdem stehen, und niemand findet den Grund.
  if ($autostartDatei -and (Test-Path -LiteralPath $autostartDatei)) {
    try {
      Remove-Item -LiteralPath $autostartDatei -Force -ErrorAction Stop
      Write-Host "  Autostart wieder entfernt." -ForegroundColor Green
    } catch {
      Write-Host ("  Autostart konnte nicht entfernt werden: " + $autostartDatei) -ForegroundColor Yellow
    }
  }
  Write-Host "  Kein Autostart - das Cockpit wird ueber das Desktop-Symbol geoeffnet." -ForegroundColor Gray
}

Write-Host ""
Write-Host "  Fertig. Auf dem Desktop liegt jetzt 'Werkstatt-Cockpit'." -ForegroundColor Green
Write-Host ""
if (-not $OhneNachfrage) { Read-Host "  Mit Eingabetaste schliessen" }
