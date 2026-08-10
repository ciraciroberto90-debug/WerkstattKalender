# Werkstatt-Cockpit

Instandhaltungsplanung, Schichtbuch und Störungserfassung für die Werkstatt.
Eine einzige HTML-Datei, kein Server, keine Datenbank, keine Installation.
Die Daten liegen in zwei JSON-Dateien im gemeinsamen Ordner.

---

## Was muss ich herunterladen?

### Neuer Arbeitsplatz einrichten → **eine Datei**

**[`arbeitsplatz/Werkstatt-Cockpit-Start.zip`](arbeitsplatz/Werkstatt-Cockpit-Start.zip)**

Entpacken, Ordner `Cockpit` auf den Rechner legen (Desktop genügt), Doppelklick
auf `Cockpit starten.cmd`. Der Rest steht in der `LIESMICH.txt` im Paket.

Im Paket steckt außerdem `Selbsttest.cmd` (zeigt in zehn Sekunden, warum etwas
nicht geht) und `Sicherung zurueckholen.cmd` (spielt einen früheren Stand
zurück). Die Datendateien werden beim Öffnen automatisch gesichert.

Sonst braucht ein Arbeitsplatz **nichts** – die App selbst liegt im
Netzwerkordner und wird von dort ausgeliefert.

**Alternative:** Die Dateien aus dem Paket können auch alle im App-Ordner auf
dem Firmenlaufwerk liegen. Die Kollegen rufen dort einmal
`Verknuepfung anlegen.cmd` auf und haben ihr Desktop-Symbol – danach nie wieder
in den Netzwerkordner. Eine Verbesserung an den Skripten wird dann an einer
Stelle eingespielt und gilt sofort für alle. Beide Ablagen sind in
[`arbeitsplatz/Anleitung-Arbeitsplatz.md`](arbeitsplatz/Anleitung-Arbeitsplatz.md)
beschrieben; die Starter erkennen selbst, wo sie liegen.

### Neue Programmversion verteilen → **eine Datei**

**[`Werkstatt_Kalender_TPM.html`](Werkstatt_Kalender_TPM.html)**

In den Netzwerkordner kopieren, alte überschreiben. Fertig – kein Arbeitsplatz
muss angefasst werden. Der Dateiname ist gleichgültig, der Dienst liefert immer
die neueste `Werkstatt_Kalender_TPM*.html` aus.

### Alles von Grund auf neu aufsetzen → **drei Dinge**

1. `Werkstatt_Kalender_TPM.html` → in den gemeinsamen Ordner
2. `arbeitsplatz/Werkstatt-Cockpit-Start.zip` → auf jeden Rechner
3. Beim ersten Start in der App die beiden Datendateien anlegen bzw. verbinden
   (`werkstatt-kalender-daten.json`, `werkstatt-stoerungen.json`)

Ausführlich: **[doku/ANLEITUNG.md](doku/ANLEITUNG.md)**, Kapitel 3.

---

## Warum ein Ausliefer-Dienst?

Bis Juli 2026 wurde die HTML-Datei direkt per Doppelklick geöffnet. Seit
Chrome 147 merkt sich der Browser dabei den Zugriff auf die Datendatei nicht
mehr – gemessen antwortet ein gemerkter Dateiverweis überhaupt nicht mehr, weder
mit einer Freigabe noch mit einer Ablehnung. Über `http://localhost:8765/`
funktioniert alles wieder wie zuvor.

Der Dienst ist ein kleines PowerShell-Skript, das nur auf dem eigenen Rechner
horcht. Keine Installation, keine Adminrechte, aus dem Netz nicht erreichbar.
Messwerte und Begründung stehen im
**[Prüfbericht](doku/ROLLOUT-PRUEFBERICHT.md)**.

---

## Was liegt wo

| Ordner | Inhalt | Für wen |
|---|---|---|
| **`arbeitsplatz/`** | Startpaket, Starter, Ausliefer-Dienst, Kurzanleitung | Werkstatt |
| **`doku/`** | Anleitung, Prüfbericht, IT-Anfrage, PDFs | Werkstatt & Führungskreis |
| `Werkstatt_Kalender_TPM.html` | die fertige App | Werkstatt |
| `app/` | Quellcode (React, Vite) | Entwicklung |
| `tests/` | 41 Härtetests und acht weitere Suiten | Entwicklung |
| `programm/` | die App als installierbares Programm (Electron, Probelauf) | Werkstatt & IT |
| `tools/` | Diagnose-Seite, Testdaten, PDF-Erzeugung | Entwicklung |
| `archiv/` | frühere Entwürfe, Beispieldaten | Nachschlagen |

### Die wichtigsten Einzeldateien

| Datei | Wozu |
|---|---|
| [`ROLLOUT-LISTE.md`](ROLLOUT-LISTE.md) | **was noch zu tun ist** – offene Punkte, Entscheidungen, Erledigtes |
| [`doku/Werkstatt-Cockpit-Einrichtung.pdf`](doku/Werkstatt-Cockpit-Einrichtung.pdf) | **Klickanleitung für die Kollegen** – eine Seite, an die E-Mail hängen |
| [`doku/ANLEITUNG.md`](doku/ANLEITUNG.md) | vollständige Bedienungs- und Einrichtungsanleitung |
| [`doku/Entscheidungsvorlage-Werkstatt-Cockpit.pdf`](doku/Entscheidungsvorlage-Werkstatt-Cockpit.pdf) | **Freigabe-Vorlage für die Geschäftsführung** – Nutzen, Kosten, Risiken, Auflagen |
| [`arbeitsplatz/Anleitung-Arbeitsplatz.md`](arbeitsplatz/Anleitung-Arbeitsplatz.md) | nur die Einrichtung eines Rechners, mit Fehlerbildern |
| [`doku/ROLLOUT-PRUEFBERICHT.md`](doku/ROLLOUT-PRUEFBERICHT.md) | was geprüft wurde, mit Messwerten |
| [`doku/IT-ANFRAGE.md`](doku/IT-ANFRAGE.md) | fertige Anfrage, falls doch eine zentrale Lösung gewünscht wird |
| [`tools/Werkstatt_Diagnose.html`](tools/Werkstatt_Diagnose.html) | geführte Umgebungsprüfung, wenn ein Rechner zickt |

---

## Wie die gemeinsame Nutzung funktioniert

Alle arbeiten auf **einer** Datei im OneDrive- oder Netzwerkordner. Wer
bearbeiten darf, bestimmen die Datei-Rechte des Laufwerks – ohne Schreibrecht
schaltet die App von selbst auf „nur ansehen" um.

- Änderungen werden **Eintrag für Eintrag zusammengeführt**, niemand
  überschreibt den anderen. Vor jedem Speichern wird der aktuelle Dateiinhalt
  gelesen, danach wird zurückgelesen und geprüft, ob nichts verschwunden ist.
- Fremde Änderungen erscheinen **automatisch alle 30 Sekunden** – Neuladen ist
  dafür nicht nötig.
- Löschungen werden über eine Merkliste (180 Tage) zwischen den Bearbeitern
  abgeglichen.
- Ist das Laufwerk kurz nicht erreichbar, wird lokal weitergespeichert und eine
  Meldung angezeigt; beim nächsten Speichern wird wieder abgeglichen.
- Nach einem Browser-Neustart genügt ein Klick auf **„Jetzt verbinden"**. Die
  Datei muss dabei nicht neu herausgesucht werden.

---

## Für die Entwicklung

```bash
cd app && npm install && npm run build     # erzeugt Werkstatt_Kalender_TPM.html
bash tests/run-hardness-tests.sh           # 41 Härtetests
node tests/pruefe-programm.js              # echtes Electron-Programm (braucht programm/npm install)
node tests/smoke-test.js                   # Grundfunktionen
node tests/sync-fokus-test.js              # Zusammenführen und Sperren
node tests/rollout-test.js                 # Verteilung: Paket, Dienst, Doku, Versionswechsel
node tests/veroeffentlichungs-test.js      # Veröffentlichung
node tests/hardness/diagnose-ablauf.js     # die Diagnose-Seite selbst
bash tests/pruefe-sicherung.sh             # Sicherungsskript (braucht PowerShell)
pwsh -File tests/pruefe-verknuepfung.ps1   # Autostart-Zweig der Verknüpfung
pwsh -File tests/pruefe-oeffnen.ps1        # Datei öffnen über den Dienst
node tools/startpaket-bauen.js --pruefen   # ist die Start-ZIP noch aktuell?
```

Nach jeder Änderung an `arbeitsplatz/` gehört `node tools/startpaket-bauen.js`
dazu – sonst verteilt die ZIP weiter den alten Stand.

Stand der letzten vollständigen Prüfung (10.08.2026, Day-of-Release):
**41/41 Härtetests, 699 Einzelprüfungen, kein Fehlschlag** – inklusive sieben
Jahrgängen Betriebsdaten (16 951 Einträge, 1 260 Störberichte, 3,4 MB), voller
Speichergrenze, beschädigter Datei, falsch gehender Uhr, zwei gleichzeitig
offenen Fenstern, einer echten Excel-Tabelle, der Benutzergruppen-Anmeldung
samt Rechte-Entzug und Wächtern (harte-42, 38 Prüfungen) und der
Programm-Fassung (harte-41 mit der Desktop-Brücke, 25 Prüfungen; dazu
`pruefe-programm.js` gegen das echte Electron-Programm samt Update-Kreislauf
und ZIP-gegen-Profil-Vorrang: 18/18). Dazu am selben Tag: Smoke 28/28,
Sync-Fokus 17/17, Rollout 71/71, Veröffentlichung 10/10, Diagnose 48/48,
Startpaket aktuell (die PowerShell-Suiten brauchen einen Windows-Rechner).
