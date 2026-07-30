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
#
# WICHTIG: bei JEDEM Aufruf neu nachsehen, nicht einmal beim Start. Sonst zeigt
# die Adresse nach einem Versionswechsel weiter auf die alte Datei - und wenn
# die geloescht wurde, ins Leere. Genau der Ablauf, den die Werkstatt staendig
# hat: neue HTML in den Ordner, alte weg, Seite neu laden.
function Hole-Startseite {
  Get-ChildItem -LiteralPath $Ordner -Filter "Werkstatt_Kalender_TPM*.html" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

$start = Hole-Startseite
if (-not $start) {
  # Wie bei der Sicherung: App und Daten liegen nicht zwingend beieinander.
  # Bevor abgebrochen wird, im eigenen Ordner und im Elternordner nachsehen.
  $skriptOrdner = Split-Path -Parent $MyInvocation.MyCommand.Path
  foreach ($k in @($skriptOrdner, (Split-Path -Parent $skriptOrdner))) {
    if ($k -and (Test-Path -LiteralPath $k)) {
      $treffer = Get-ChildItem -LiteralPath $k -Filter "Werkstatt_Kalender_TPM*.html" -File -ErrorAction SilentlyContinue |
                 Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($treffer) {
        Schreibe ("  Programmdatei nicht im angegebenen Ordner - gefunden in: " + $k) "Yellow"
        $Ordner = $k
        $start = $treffer
        break
      }
    }
  }
}
if (-not $start) {
  Schreibe "  FEHLER: Die Programmdatei wurde nicht gefunden." "Red"
  Schreibe "" 
  Schreibe "  Gesucht wurde nach 'Werkstatt_Kalender_TPM*.html' in:" "Yellow"
  Schreibe ("    " + $Ordner) "Yellow"
  Schreibe ("    " + (Split-Path -Parent $MyInvocation.MyCommand.Path)) "Yellow"
  Schreibe ""
  Schreibe "  Meist ist das Netzlaufwerk nicht verbunden. Im Explorer einmal" "Gray"
  Schreibe "  oeffnen, dann erneut starten." "Gray"
  Read-Host "  Mit Eingabetaste schliessen"
  exit 1
}

# Laeuft an diesem Port schon unser eigener Dienst? Das ist keine Feinheit:
# Wuerde bei belegtem Port einfach der naechste genommen, waere das fuer den
# Browser eine ANDERE Adresse - und damit waere die gemerkte Datei wieder weg.
# Genau der Fehler, dessentwegen es dieses Skript ueberhaupt gibt.
function Ist-Unserer($p) {
  try {
    $k = [System.Net.Sockets.TcpClient]::new()
    $verbunden = $k.ConnectAsync("127.0.0.1", $p).Wait(700)
    if (-not $verbunden) { $k.Close(); return $false }
    $s = $k.GetStream(); $s.ReadTimeout = 1500
    $anfrage = [System.Text.Encoding]::ASCII.GetBytes("GET /__cockpit HTTP/1.1`r`nHost: localhost`r`nConnection: close`r`n`r`n")
    $s.Write($anfrage, 0, $anfrage.Length); $s.Flush()
    $leser = [System.IO.StreamReader]::new($s)
    $antwort = $leser.ReadToEnd()
    $k.Close()
    return ($antwort -match "werkstatt-cockpit-dienst")
  } catch { return $false }
}

$zuhoerer = $null
for ($p = $Port; $p -lt ($Port + 20); $p++) {
  try {
    $z = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
    $z.Start()
    $zuhoerer = $z; $Port = $p
    break
  } catch {
    if (Ist-Unserer $p) {
      $laufend = "http://localhost:$p/"
      Schreibe ""
      Schreibe "  Der Dienst laeuft bereits auf $laufend" "Green"
      Schreibe "  Es wird kein zweiter gestartet - die Adresse muss dieselbe bleiben," "Gray"
      Schreibe "  sonst vergisst der Browser die verbundene Datei." "Gray"
      Schreibe ""
      if (-not $KeinBrowser) { Start-Process $laufend | Out-Null }
      Start-Sleep -Seconds 3
      exit 0
    }
  }
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
      # Kopfzeilen einsammeln. Frueher wurden sie weggeworfen - fuer das
      # Oeffnen von Dateien wird "Sec-Fetch-Site" gebraucht, siehe unten.
      $kopfzeilen = @{}
      while ($true) {
        $k = $leser.ReadLine()
        if ($null -eq $k -or $k -eq "") { break }
        $doppel = $k.IndexOf(":")
        if ($doppel -gt 0) {
          $kopfzeilen[$k.Substring(0, $doppel).Trim().ToLowerInvariant()] = $k.Substring($doppel + 1).Trim()
        }
      }

      $teile = $zeile -split " "
      $methode = $teile[0]
      $rohPfad = if ($teile.Length -gt 1) { $teile[1] } else { "/" }
      $abfrage = ""
      $fragezeichen = $rohPfad.IndexOf("?")
      if ($fragezeichen -ge 0) { $abfrage = $rohPfad.Substring($fragezeichen + 1) }
      $pfad = ($rohPfad -split "\?")[0]
      $pfad = [System.Uri]::UnescapeDataString($pfad)

      if ($methode -ne "GET" -and $methode -ne "HEAD") {
        Antworte $strom 405 "Method Not Allowed" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Nur GET."))
        $kunde.Close(); continue
      }

      # 127.0.0.1 auf localhost umleiten.
      #
      # Fuer den Browser sind das ZWEI verschiedene Herkuenfte, obwohl derselbe
      # Rechner gemeint ist. Wer die Seite einmal ueber 127.0.0.1 aufruft - ein
      # alter Favorit, eine abgetippte Adresse -, landet in einem eigenen
      # Gedaechtnis: kein gemerkter Dateiverweis, die JSON muss neu ausgewaehlt
      # werden. Genau das soll nie wieder vorkommen, deshalb kommt jede Anfrage
      # zurueck auf dieselbe Adresse.
      $wirt = $kopfzeilen["host"]
      if ($wirt -and $wirt -notlike "localhost*") {
        $ziel302 = "http://localhost:$Port$rohPfad"
        $kopf302 = "HTTP/1.1 302 Found`r`nLocation: $ziel302`r`nContent-Length: 0`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
        $b302 = [System.Text.Encoding]::ASCII.GetBytes($kopf302)
        $strom.Write($b302, 0, $b302.Length); $strom.Flush()
        Schreibe ("  302  " + $wirt + $rohPfad + "  ->  " + $ziel302) "DarkYellow"
        $kunde.Close(); continue
      }

      # Erkennungszeichen: Daran erkennt ein zweiter Start, dass hier schon
      # unser Dienst laeuft - und startet dann keinen zweiten auf anderem Port.
      if ($pfad -eq "/__cockpit") {
        Antworte $strom 200 "OK" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("werkstatt-cockpit-dienst"))
        $kunde.Close(); continue
      }

      # Eine Datei oder einen Ordner im Explorer oeffnen.
      #
      # Der Browser selbst darf das nicht - ein Netzwerkpfad laesst sich aus
      # einer Webseite heraus nicht oeffnen. Der Dienst laeuft ohnehin auf
      # diesem Rechner und mit den Rechten des angemeldeten Benutzers, also
      # kann er es uebernehmen.
      #
      # Das ist die einzige Stelle, an der dieser Dienst etwas TUT statt nur
      # auszuliefern. Deshalb drei Sperren:
      #
      #  1. "Sec-Fetch-Site: same-origin". Diese Kopfzeile setzt der Browser
      #     selbst, eine Seite kann sie nicht faelschen. Ohne sie kaeme jede
      #     beliebige Webseite im Netz an diesen Zugang - sie muesste nur
      #     http://localhost:8765/__oeffne?... aufrufen. Fehlt die Kopfzeile,
      #     wird abgelehnt (nicht durchgelassen).
      #  2. Nur echte Pfade: Netzwerkfreigabe oder Laufwerksbuchstabe, nichts
      #     mit Anfuehrungszeichen oder Zeilenumbruechen darin.
      #  3. Programme werden nicht gestartet. Zeigt der Pfad auf eine .exe,
      #     .cmd, .ps1 und dergleichen, wird der Ordner geoeffnet statt der
      #     Datei. Ein Eintrag in einer Linkliste soll ein Weg zu einer Datei
      #     sein und kein Startknopf fuer ein Programm.
      if ($pfad -eq "/__oeffne") {
        $herkunft = $kopfzeilen["sec-fetch-site"]
        if ($herkunft -ne "same-origin") {
          Antworte $strom 403 "Forbidden" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Nur aus dem Cockpit heraus."))
          Schreibe ("  403  /__oeffne  (Herkunft: " + $(if ($herkunft) { $herkunft } else { "keine Angabe" }) + ")") "DarkYellow"
          $kunde.Close(); continue
        }
        $wunsch = ""
        foreach ($paar in ($abfrage -split "&")) {
          $g = $paar.IndexOf("=")
          if ($g -gt 0 -and $paar.Substring(0, $g) -eq "pfad") {
            $wunsch = [System.Uri]::UnescapeDataString($paar.Substring($g + 1).Replace("+", " "))
          }
        }
        # Zeichenklasse bewusst mit \r\n\t geschrieben, NICHT mit `r`n`t: In
        # einfachen Anfuehrungszeichen bleibt das Gegenzeichen stehen, und die
        # Klasse haette die Buchstaben r, n und t verboten - also so gut wie
        # jeden Pfad.
        $sauber = ($wunsch -notmatch '["\r\n\t]') -and ($wunsch -match '^\\\\[^\\]' -or $wunsch -match '^[A-Za-z]:\\')
        if (-not $sauber) {
          Antworte $strom 400 "Bad Request" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Kein gueltiger Pfad."))
          Schreibe "  400  /__oeffne  (kein gueltiger Pfad)" "DarkYellow"
          $kunde.Close(); continue
        }
        if (-not (Test-Path -LiteralPath $wunsch)) {
          Antworte $strom 404 "Not Found" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Nicht gefunden oder nicht erreichbar."))
          Schreibe ("  404  /__oeffne  " + $wunsch) "DarkYellow"
          $kunde.Close(); continue
        }
        $starten = $wunsch
        $gefaehrlich = @(".exe", ".com", ".bat", ".cmd", ".ps1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".msi", ".scr", ".lnk", ".reg", ".hta")
        if ($gefaehrlich -contains [System.IO.Path]::GetExtension($wunsch).ToLowerInvariant()) {
          $starten = Split-Path -Parent $wunsch
          Schreibe ("  Programmdatei - es wird der Ordner geoeffnet: " + $starten) "Yellow"
        }
        try {
          Start-Process -FilePath $starten -ErrorAction Stop | Out-Null
          Antworte $strom 200 "OK" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("geoeffnet"))
          Schreibe ("  200  /__oeffne  " + $starten) "DarkGray"
        } catch {
          $m = "Konnte nicht geoeffnet werden: " + $_.Exception.Message
          Antworte $strom 500 "Internal Server Error" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes($m))
          Schreibe ("  500  /__oeffne  " + $_.Exception.Message) "DarkYellow"
        }
        $kunde.Close(); continue
      }

      if ($pfad -eq "/" -or $pfad -eq "") {
        $jetzt = Hole-Startseite
        if (-not $jetzt) {
          $t = "Im Ordner liegt derzeit keine Datei Werkstatt_Kalender_TPM*.html.`r`nOrdner: $Ordner"
          Antworte $strom 404 "Not Found" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes($t))
          Schreibe "  404  /  (keine Cockpit-Datei im Ordner)" "DarkYellow"
          $kunde.Close(); continue
        }
        if ($jetzt.Name -ne $start.Name) {
          Schreibe ("  Neue Fassung erkannt: " + $jetzt.Name) "Green"
          $start = $jetzt
        }
        $pfad = "/" + $jetzt.Name
      }
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
