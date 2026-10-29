# Wenn wir heute neu anfingen – Auswertung mit allen Erkenntnissen

Robertos Frage vom 29.10.2026: „Wenn wir heute neu anfangen müssten, mit allen
Erkenntnissen und mit heutigem Stand – alle Funktionen, Go von unserer IT,
Server, Claude Code auf meinem Firmen-PC – auf welche Bauabschnitte würdest
du von vornherein verzichten? Was würden wir sinnvoller und einfacher in der
Struktur umsetzen?“

Alle Zahlen sind am 29.10. aus dem Repo gemessen (Zeilen = `wc -l`).
Aufwandsschätzungen sind als solche gekennzeichnet und **ungemessen**.

---

## 0. Die eine Erkenntnis über allen

Jeder Störfall seit Juli hatte dieselbe Ursache: **viele Rechner schreiben
eine gemeinsame Datei.** Halbe Dateien, 0-KB-Reste, EPERM, „Datei belegt“,
Fassung veraltet, 5-MB-Grenze des Browsers, 30-Sekunden-Abgleich, 4,6 MB
Lesen bei jedem Start. Rund die Hälfte des Codes und der Tests existiert nur,
um diese eine Entscheidung erträglich zu machen.

Mit heutigem Wissen ist der Server (Etappe A, seit 30.09. gemessen stabil)
**Tag 1**, nicht Monat 3. Alles Weitere folgt daraus.

---

## 1. Was wir weglassen würden – und was das wiegt

| Bauabschnitt | Umfang heute (gemessen) | Warum gebaut | Warum heute überflüssig |
|---|---|---|---|
| **Datei-Weg über `W:`** (`sharedfile.js`, Konflikt-Wächter, Tages-Sicherung, Zwischendateien, Merkliste, Schreibprobe, Kollisions-Heilung, Programm-Stand-Meldung, Verbinden-Dialoge) | 2.657 Zeilen Speicherschicht + 120 Stellen im Cockpit + `storage.js` 208 | Es gab keinen Server; Grundregel „Keine IT nötig“ | Der Dienst ist der einzige Schreiber. Jede Änderung eine Transaktion. Alles davon fällt ersatzlos weg. |
| **Programm-Hülle (Electron)** mit Brücke, ZIP-Tausch, Update-Ordner, `standard-einstellungen.json`, Desktop-Verknüpfung | `programm/` 696 Zeilen + Chromium 33 ohne Sicherheitsupdates | Browser durfte nicht zuverlässig auf `W:` schreiben; Dateien per Klick öffnen | Die App kommt vom Server (`/app/`). Ein Browser-Lesezeichen genügt; Edge „Als App installieren“ läuft ohne Admin. Keine veraltete Chromium-Fassung mehr im Haus. |
| **Arbeitsplatz-Skripte** (`cockpit-server.ps1`, `cockpit-sicherung.ps1`, Verknüpfung, Selbsttest, Startpaket) | `arbeitsplatz/` 3.130 Zeilen + `startpaket-bauen.js` | Lokaler Dienst am PC für Dateiverweise, Sicherung je Rechner | Sicherung macht der Server (geübter Rückweg 6 s). Nichts läuft mehr am PC. |
| **USB-Stick für PCs** (`cockpit-werkzeug.ps1`, Ampeln, Einrichten, Server-Weg umschalten) | 1.046 Zeilen + Stick-Bauer | Jeder Rechner brauchte Programm, Pfade, Rechte | Ein PC braucht nur die Adresse. Der Stick bleibt nur für den **Server** (siehe 2.6), ein Drittel so groß. |
| **Browser-Speicher-Modus** (Ganzbestand in localStorage, 5-MB-Grenze, „Browser-Reserve“-Tests, IndexedDB-Ausschnitt-Logik, Umstieg Datei→Browser→Programm) | quer durch das Cockpit, 5 Reserve-Tests | Dritter Weg für Rechner ohne Programm | Ein Weg: Server. Der Rechner hält einen Cache, nicht den Bestand. |
| **Benutzerkonten mit Kennwort** (`sha256.js`, Benutzerwechsel-Dialoge, Rechte-Entzug-Wächter) | 68 Zeilen + Dialoge + harte-42 (38 Prüfungen) | Keine Anmeldung ohne Server möglich | **Windows-Konto = Anmeldung.** Der Dienst kennt den Benutzer vom Rechner, Rollen weiter aus der Liste im Zahnrad. Keine Kennwörter im Cockpit. |
| **Excel über Brücke und Zubringer** (`xlsx.js` im Browser, Programm-Brücke, Zubringer, Server-Kopie) | 555 Zeilen + Wege `/quellen` + 2 Prüfstände | Browser kam nicht an die Excel auf `W:` | Der **Server** liest die Excel-Quellen vom Laufwerk und liefert fertige Zahlen. Kein Excel-Parser im Browser. |
| **OneDrive-/Begleitdatei-Weg des Zettels** (Teilen an OneDrive, `.json` neben dem Bild, Eingangsordner mit Downloads-Überwachung, Einzug) | `eingangsordner.js` 297 Zeilen + harte-109 | Zwischenlösung vor Server-Upload und Briefkasten | Zettel → Briefkasten/Server von Tag 1. Für WhatsApp-Bilder am PC genügt **Ziehen ins Cockpit**, keine Ordner-Überwachung. |
| **Drei Speicherschichten nebeneinander** (`storage.js`, `sharedfile.js`, `server-client.js`) | 3.516 Zeilen, jede Stelle im Cockpit muss alle drei bedienen | Historisch gewachsen | **Eine:** `server-client.js` (651 Zeilen, gemessen unter Last). |
| **Eine Quelldatei mit 20.621 Zeilen** | `WerkstattKalender.jsx` | Single-File-Start, nie aufgeteilt (Punkt 49: Vertreter kann so kaum einspringen) | Module je Bereich von Tag 1 (siehe 2.3). Die Auslieferung bleibt eine HTML-Datei, nur die Quelle wird aufgeteilt. |
| **Doku-Vielfalt** (BACKEND-KONZEPT, BAUPLAN, SERVER-AUFBAU, ENTSCHEIDUNGSVORLAGE, IT-ANFRAGE, Prüfbericht, 5 PDFs, 3 PPTX) | 5.830 Zeilen Markdown + Binärdateien | Jede Phase bekam ein eigenes Papier | **Vier Dateien:** `CLAUDE.md`, `ROLLOUT-LISTE.md`, `ANLEITUNG.md`, `BAUPLAN.md`. Präsentationen außerhalb des Repos. |

**Summe des Verzichts, grob:** rund 8.000 Zeilen Code (Speicherschichten,
Hülle, Arbeitsplatz, PC-Stick, Excel im Browser, Eingangsordner), dazu die
Hälfte der Dialoge im Zahnrad (Verbinden, Umstieg, Programm-Updates, Dieser
Rechner) und schätzungsweise 20–30 der 103 Härtetests, die nur Datei-,
Browser-Speicher- oder Hüllen-Situationen prüfen (zwischendateien,
konfliktkopien, kaputte-datei, voller-zwischenspeicher, leser-immer-sicher,
zwei-fenster, feindlicher-browser, umstieg, programm, mehrbenutzer-*,
stress-*, …). **Ungemessen:** die genaue Zahl, weil fast jeder Test seinen
Aufbau über den Datei-/Browser-Modus macht und erst bei der Umstellung klar
wird, was Oberfläche prüft und was Datei.

### Was wir NICHT weglassen würden

- **Die Oberfläche selbst.** Kacheln, Planung mit Ziehen, Schichtbericht,
  Störungsliste nach Schichttag, Übergabe-Mappe, To-dos in der Planung,
  Aufnahme, Zahnrad „Regeln & Listen“ – alles ist mit Roberto am echten
  Alltag entstanden und mit Bildern bestätigt. Das ist der Wert des Projekts.
- **Der Server-Kern** `dienst.js` + `db.js` (1.050 Zeilen, SQLite/WAL, SSE,
  Sicherung, Import/Export, unter Last mit 31.845 Einträgen gemessen).
- **Der Briefkasten** (Kern 165, Worker 246, Zettel 539 Zeilen) mit Marke
  statt Liste – die einzige Lösung für Handys ohne Firmen-WLAN, 40 s
  gemessen, kostenlos im Kontingent.
- **Die Hausregeln:** Messen statt behaupten, Rot-Nachweis-Test für alles am
  Speichern, ein Schritt je Nachricht am Server, Roll-out-Liste als
  Gedächtnis. Sie haben jeden Fehler gefunden, bevor Kollegen ihn sahen.

---

## 2. Was wir sinnvoller und einfacher bauen würden

### 2.1 Eine Wahrheit, ein Weg

```
Browser (PC, Monitor, Handy im WLAN)  ──HTTP/SSE──▶  Dienst auf v-btacockpit-01  ──▶  SQLite je Standort
Handy ohne WLAN  ──▶  Briefkasten (Cloudflare)  ──▶  Dienst holt ab (Marke)
Excel-Quellen auf W:  ◀──  Dienst liest sie selbst (Zeitplan), nie der Browser
```

Kein zweiter Weg, kein Umschalter „Server-Weg EIN/AUS“, kein Umschalttag:
Der erste Rechner, der die Adresse öffnet, ist umgestellt.

### 2.2 Datenmodell: Tabellen statt eines Eintrags-Arrays

Heute: zwölf Kategorien (`ARBEIT, AUFNAHME, NOTIZ, PLANNOTIZ, RI, SCHICHT,
SCHICHTNOTIZ, TERMIN, TODO, TPM, UEBERGABE, ZEIT`) in **einem** Array plus
eine getrennte Störungsdatei plus Konfiguration – jede Funktion filtert
dasselbe Array. Neu: **eine Tabelle je Art** (Arbeiten, Störungen, To-dos,
Termine/PitStop/R+I, Notizen, Aufnahmen, Übergaben, Schichten) mit
gemeinsamem Kopf (id, standort, wer, wann, geändertVon, geändertAm) und einem
**Ereignis-Protokoll** (wer hat wann was geändert). Daraus ergeben sich
Verlauf, Sicherung, „Neu dazugekommen“ in der Übergabe und die
Nachweis-Archive ohne Sonderbau. JSON-Export bleibt für Excel und Archiv.

### 2.3 Quelle in Modulen, Auslieferung weiter eine Datei

```
app/src/
  api/            server-client.js (einzige Speicherschicht), sse.js
  kern/           datum.js (Schichttag, KW, Zeitzone), rechte.js, regeln.js
  bereiche/       kalender/  planung/  stoerungen/  berichte/  aufnahme/  uebergabe/  zahnrad/
  druck/          eine Druckmaschine mit Vorlagen (heute 6 Blätter als 6 HTML-Strings + Quell-Wache harte-65)
  ui/             Dialog, Kachel, Chip, Tabelle (heute 234 Modal/Dialog-Stellen von Hand)
```

Vite baut daraus wie heute eine `Werkstatt_Kalender_TPM.html`. Der Vertreter
findet einen Bereich in seinem Ordner statt in Zeile 14.000.

### 2.4 Anmeldung ohne Kennwort

Der Dienst nimmt den Windows-Benutzernamen des Rechners (Programm-Hülle
entfällt, also über eine kleine Anmeldeseite mit Namensvorschlag vom
Rechner oder, mit IT-Go, Windows-Anmeldung am Dienst). Rollen
(Verwalter/Bearbeiter/Leser) weiter aus der Liste im Zahnrad. Keine
Kennwörter, keine Hash-Funktion, keine Benutzerwechsel-Dialoge.

### 2.5 Tests, die überall laufen und schnell sind

- Pfade relativ zum Repo (`__dirname`), Chromium über Playwright-Vorgabe,
  Suite als `node tests/alle.js` – **läuft auf dem Firmen-PC ohne Admin.**
- Jeder Test läuft gegen einen **Test-Dienst mit leerer Datenbank** statt
  gegen localStorage-Attrappen. Damit testet jeder Test den echten Weg.
- Ziel: volle Suite **unter 20 Minuten** (heute 1,5–2 Stunden in der Cloud,
  ungemessen auf dem Laptop). Weniger Tests, weil die Datei-Situationen
  fehlen; Rot-Nachweis-Regel bleibt.

### 2.6 Einspielen in einem Befehl

- **PC:** nichts. Adresse `http://v-btacockpit-01:8765/app/` als Lesezeichen
  oder „Als App installieren“. Monitore: Browser im Kiosk-Modus (Verknüpfung
  mit `--kiosk`, kein Admin).
- **Server:** `node tools/einspielen.js` vom Firmen-PC aus kopiert die
  gebaute HTML nach `\\v-btacockpit-01\BTA\BTA-Programm\App`, prüft Größe
  und Merkmal, und fragt den Dienst `/status`. Dienst-Updates ebenso
  (Kopie + Neustart der Aufgabe). Das Server-Werkzeug schrumpft auf:
  Einrichten, Sicherung jetzt, Sicherung einspielen, Status.
- **Keine Stick-Logik für PCs, kein Update-Ordner, keine Fassungs-Tabelle.**

### 2.7 Was wir mit dem IT-Go als Erstes verlangen würden (genau drei Dinge)

1. **DNS-Name und HTTPS-Zertifikat** für den Server (z. B.
   `cockpit.scheurich.intern`). Damit: Handy-Zettel als echte Web-App mit
   Offline-Speicher und Nachsenden im WLAN (Stufe 3 aus Roll-out 61), keine
   Browser-Warnungen, Kamera-Zugriff ohne Ausnahmen.
2. **Den Dienst als Windows-Dienst** registrieren statt über die
   Aufgabenplanung (startet vor der Anmeldung, Neustart bei Absturz).
3. **Firewall-Regel 8765/443** zentral, damit kein Rechner-Werkzeug nötig ist.

Alles andere (Nutzer, Rollen, Sicherung, Updates) bleibt bei Roberto – die
Grundregel „Keine IT nötig“ gilt weiter für den Alltag, die IT liefert nur
die drei Fundamente einmalig.

### 2.8 Entwicklung vom Firmen-PC aus

Claude Code in der Desktop-App, Arbeitsordner = Repo-Klon auf dem Firmen-PC.
Bauen, Tests (2.5), Einspielen (2.6) aus derselben Unterhaltung, direkt auf
den Server. Keine Dateianhänge, kein Downloads-Ordner, keine
Cloud-Unterhaltung nötig. **Gemessen 29.10.:** Die Cloud-Sitzung kann
Robertos Windows-Laptop nicht ankoppeln (die Rechner-Anbindung nennt keine
Ordner; sie gilt für Mac/Linux). Deshalb ist die lokale Unterhaltung der Weg.

---

## 3. Der ehrliche Weg von heute aus: Abriss statt Neubau

Ein Neubau der Oberfläche (20.000 Zeilen, hunderte abgestimmte Details)
würde Monate kosten und nichts verbessern, was Roberto sieht. Die Erkenntnisse
aus Abschnitt 1 lassen sich **durch Entfernen** einlösen, Etappe für Etappe,
jede mit Rot-Nachweis und jederzeit lieferfähig:

| Etappe | Was | Kontrolle | Aufwand (ungemessen) |
|---|---|---|---|
| **R0 Umschalttag** (Roll-out 46/47/50/51) | Alle PCs auf die Server-Adresse; `W:`-Ordner umbenennen, zwei Wochen aufheben | Erste Schicht ohne Meldung; Status-Seite zeigt alle Rechner | 1 Tag + 2 Wochen Beobachtung |
| **R1 Testsuite tragbar** (Roll-out 73) | Pfade relativ, Chromium über Playwright, Lauf-Skript in Node | Suite läuft auf dem Firmen-PC | 1–2 Sitzungen |
| **R2 Datei-Weg entfernen** | `sharedfile.js`, `storage.js`, 120 Stellen im Cockpit, Verbinden-/Umstieg-Dialoge, Browser-Reserve, zugehörige Tests | Suite grün; `grep showOpenFilePicker` = 0; App läuft nur noch über `server-client.js` | 2–3 Sitzungen |
| **R3 Hülle und PC-Stick entfernen** | `programm/`, `arbeitsplatz/`, `cockpit-werkzeug.ps1`, Startpaket, Update-Ordner-Logik; Server-Werkzeug einkürzen | Ein PC wird nur über das Lesezeichen eingerichtet | 1 Sitzung |
| **R4 Anmeldung ohne Kennwort** | Name vom Rechner/Dienst, `sha256.js` weg, harte-42 neu | Rechte-Entzug wirkt live | 1 Sitzung |
| **R5 Excel am Server** | Dienst liest Quellen selbst, `xlsx.js` aus dem Browser | OEE-Zahlen gleich wie heute (Vergleichstest) | 1 Sitzung |
| **R6 Quelle in Module** | `WerkstattKalender.jsx` in Bereiche aufteilen, keine Funktionsänderung | Gebaute HTML verhält sich gleich (Suite) | 2–3 Sitzungen, in Scheiben |
| **R7 Tabellen + Ereignis-Protokoll** | Datenmodell im Dienst, Export unverändert | Import alter Daten verlustfrei (Vergleichstest) | 2 Sitzungen |
| **R8 HTTPS + Web-App-Zettel** (nach IT) | Zertifikat, Service Worker, Nachsenden | Foto ohne Netz, kommt im WLAN an (Messung) | 1 Sitzung nach IT |

Reihenfolge ist bewusst: Erst der Umschalttag (dann ist der Datei-Weg
Rückfallebene, nicht Betrieb), dann die Tests auf den Laptop (sonst kann die
lokale Unterhaltung R2–R7 nicht mit Rot-Nachweis machen), dann Abriss.

---

## 4. Was wir beim Vorgehen anders machen würden

- **Server zuerst, Oberfläche darauf.** Nicht umgekehrt.
- **Einen Weg je Aufgabe.** Nie drei Speicherwege, zwei Zettel-Wege, vier
  Einrichtungswege parallel pflegen.
- **Die IT früh um genau drei Dinge bitten** (2.7), statt monatelang ohne
  Zertifikat zu bauen.
- **Module ab der ersten Woche.** Die Einzeldatei war bequem, bis sie es
  nicht mehr war.
- **Tests ortsunabhängig ab Test 1.** Sonst klebt die Entwicklung an einer
  Umgebung (wie jetzt an der Cloud).
- **Weniger Papier.** Vier Dateien, die immer stimmen, statt zwölf, die sich
  überholen.
- **Beibehalten:** Messen statt behaupten, Rot-Nachweis, ein Schritt je
  Nachricht am Server, Vorlagen vor dem Bau, Roll-out-Liste, Deutsch.
