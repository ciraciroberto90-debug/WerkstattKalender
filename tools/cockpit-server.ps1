# Werkstatt-Cockpit: kleiner Ausliefer-Dienst für den eigenen Rechner
# ==================================================================
#
# Warum es das gibt
# -----------------
# Gemessen am Arbeitsplatz: Wird das Cockpit als Datei geöffnet
# (file://scheudc1/...), kann Chrome sich den Zugriff auf die Datendatei nicht
# mehr merken. Ein Dateiverweis, der durch die IndexedDB geht, antwortet danach
# auf gar nichts mehr - keine Freigabe, keine Ablehnung, kein Fehler.
# Über eine echte Adresse funktioniert derselbe Vorgang in einer Millisekunde.
#
# "localhost" zählt für den Browser als sichere Herkunft - ohne Zertifikat,
# ohne Server im Netz, ohne die IT. Dieses Skript liefert die vorhandene
# HTML-Datei genau dort aus.
#
# Was sich dadurch NICHT ändert
# -----------------------------
# Die Daten bleiben, wo sie sind. Neue Versionen werden weiterhin einfach als
# Datei in den Ordner kopiert - dieses Skript liest bei jedem Aufruf frisch von
# dort. Es wird nichts installiert und nichts in der Registrierung geändert.
#
# Absichtlich einfach gehalten: ein Zuhörer auf 127.0.0.1, nur Lesen, nur GET.
# Von außen ist nichts erreichbar.

param(
  # Ordner, aus dem ausgeliefert wird. Standard: die Netzwerkfreigabe.
  [string]$Ordner = "\\scheudc1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender",
  [int]$Port = 8765,
  [switch]$KeinBrowser
)

$ErrorActionPreference = "Stop"

function Schreibe($text, $farbe = "Gray") { Write-Host $text -ForegroundColor $farbe }

Schreibe ""
Schreibe "  Werkstatt-Cockpit - Ausliefer-Dienst" "White"
Schreibe "  ------------------------------------"
Schreibe ""

if (-not (Test-Path -LiteralPath $Ordner)) {
  Schreibe "  FEHLER: Der Ordner ist nicht erreichbar:" "Red"
  Schreibe "  $Ordner" "Red"
  Schreibe ""
  Schreibe "  Bitte pruefen, ob das Laufwerk verbunden ist." "Yellow"
  Read-Host "  Mit Eingabetaste schliessen"
  exit 1
}

# Startseite bestimmen: die Cockpit-Datei, egal wie die Nummer dahinter lautet.
$start = Get-ChildItem -LiteralPath $Ordner -Filter "Werkstatt_Kalender_TPM*.html" -File |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $start) {
  Schreibe "  FEHLER: Keine Datei 'Werkstatt_Kalender_TPM*.html' im Ordner gefunden." "Red"
  Read-Host "  Mit Eingabetaste schliessen"
  exit 1
}

# Einen freien Port suchen. Ist einer belegt (Dienst laeuft schon), einfach den
# naechsten nehmen, statt mit einer Fehlermeldung abzubrechen.
$zuhoerer = $null
for ($p = $Port; $p -lt ($Port + 20); $p++) {
  try {
    $z = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
    $z.Start()
    $zuhoerer = $z; $Port = $p
    break
  } catch { }
}
if (-not $zuhoerer) {
  Schreibe "  FEHLER: Kein freier Port zwischen $Port und $($Port + 19)." "Red"
  Read-Host "  Mit Eingabetaste schliessen"
  exit 1
}

$adresse = "http://localhost:$Port/"
Schreibe "  Ordner:     $Ordner"
Schreibe "  Startseite: $($start.Name)"
Schreibe "  Adresse:    $adresse" "Green"
Schreibe ""
Schreibe "  Dieses Fenster offen lassen. Zum Beenden: Strg+C." "Yellow"
Schreibe ""

if (-not $KeinBrowser) { Start-Process $adresse | Out-Null }

$typen = @{
  ".html" = "text/html; charset=utf-8"
  ".htm"  = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".woff2"= "font/woff2"
}

function Antworte($strom, $code, $text, $typ, [byte[]]$koerper) {
  $kopf = "HTTP/1.1 $code $text`r`n" +
          "Content-Type: $typ`r`n" +
          "Content-Length: $($koerper.Length)`r`n" +
          "Cache-Control: no-store`r`n" +
          "Connection: close`r`n`r`n"
  $kopfBytes = [System.Text.Encoding]::ASCII.GetBytes($kopf)
  $strom.Write($kopfBytes, 0, $kopfBytes.Length)
  if ($koerper.Length -gt 0) { $strom.Write($koerper, 0, $koerper.Length) }
  $strom.Flush()
}

try {
  while ($true) {
    $kunde = $zuhoerer.AcceptTcpClient()
    try {
      $kunde.ReceiveTimeout = 5000
      $kunde.SendTimeout = 15000
      $strom = $kunde.GetStream()
      $leser = [System.IO.StreamReader]::new($strom, [System.Text.Encoding]::ASCII, $false, 8192, $true)

      $zeile = $leser.ReadLine()
      if (-not $zeile) { $kunde.Close(); continue }
      # Kopfzeilen bis zur Leerzeile wegwerfen - gebraucht wird nur der Pfad.
      while ($true) { $k = $leser.ReadLine(); if ($null -eq $k -or $k -eq "") { break } }

      $teile = $zeile -split " "
      $methode = $teile[0]
      $pfad = if ($teile.Length -gt 1) { $teile[1] } else { "/" }
      $pfad = ($pfad -split "\?")[0]
      $pfad = [System.Uri]::UnescapeDataString($pfad)

      if ($methode -ne "GET" -and $methode -ne "HEAD") {
        Antworte $strom 405 "Method Not Allowed" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Nur GET."))
        $kunde.Close(); continue
      }

      if ($pfad -eq "/" -or $pfad -eq "") { $pfad = "/" + $start.Name }
      $relativ = $pfad.TrimStart("/").Replace("/", "\")

      # Ausbruch aus dem Ordner unterbinden. Der Dienst laeuft mit den Rechten
      # des angemeldeten Benutzers - er soll trotzdem nur das ausliefern, wofuer
      # er gedacht ist.
      $ziel = Join-Path $Ordner $relativ
      $vollZiel = $null
      try { $vollZiel = [System.IO.Path]::GetFullPath($ziel) } catch { }
      $vollOrdner = [System.IO.Path]::GetFullPath($Ordner)
      if (-not $vollZiel -or -not $vollZiel.StartsWith($vollOrdner, [System.StringComparison]::OrdinalIgnoreCase)) {
        Antworte $strom 403 "Forbidden" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Nicht erlaubt."))
        $kunde.Close(); continue
      }

      if (-not (Test-Path -LiteralPath $vollZiel -PathType Leaf)) {
        $meldung = "Nicht gefunden: $pfad"
        Antworte $strom 404 "Not Found" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes($meldung))
        Schreibe ("  404  " + $pfad) "DarkGray"
        $kunde.Close(); continue
      }

      $endung = [System.IO.Path]::GetExtension($vollZiel).ToLowerInvariant()
      $typ = if ($typen.ContainsKey($endung)) { $typen[$endung] } else { "application/octet-stream" }
      $inhalt = if ($methode -eq "HEAD") { [byte[]]@() } else { [System.IO.File]::ReadAllBytes($vollZiel) }
      Antworte $strom 200 "OK" $typ $inhalt
      Schreibe ("  200  " + $pfad + "  (" + $inhalt.Length + " Bytes)") "DarkGray"
    } catch {
      Schreibe ("  Fehler bei einer Anfrage: " + $_.Exception.Message) "DarkYellow"
    } finally {
      try { $kunde.Close() } catch { }
    }
  }
} finally {
  $zuhoerer.Stop()
}
