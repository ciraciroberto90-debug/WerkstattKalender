# 🔧 Werkstatt-Kalender

TPM-Wartungs- und R+I-Kalender für die Werkstatt – als Programm, das komplett
im Browser läuft: **ohne Installation, ohne Internet, ohne Anmeldung**.

## So startest du das Programm

1. Die Datei **`Werkstatt_Kalender_TPM.html`** herunterladen (Code → Download ZIP, oder nur die Datei).
2. Doppelklick auf `Werkstatt_Kalender_TPM.html` – der Kalender öffnet sich im Browser. Fertig.

Alle Einträge werden **lokal im Browser gespeichert** und bleiben nach dem
Schließen erhalten – solange derselbe Browser auf demselben Rechner verwendet
wird. Für Sicherungen oder den Wechsel auf einen anderen Rechner gibt es die
**Export/Import**-Knöpfe oben rechts.

> **Tipp:** Über GitHub Pages (Settings → Pages → Branch auswählen) lässt sich
> der Kalender auch als Webseite aufrufen, z. B. vom Tablet aus.

## Gemeinsame Nutzung (Firmenlaufwerk / OneDrive)

Mehrere Personen können denselben Datenstand nutzen – über eine gemeinsame
JSON-Datei auf einem Netzlaufwerk oder in einem per Explorer synchronisierten
OneDrive-Ordner. Benötigt wird **Microsoft Edge oder Google Chrome**.

**Wer bearbeiten darf, bestimmen die Datei-Rechte auf dem Laufwerk** (von der
IT vergeben): Bearbeiter bekommen Schreibrechte auf die Datei, alle anderen
nur Leserechte. Die App erkennt das automatisch – ohne Schreibrechte schaltet
sie auf „nur ansehen" um (blaue Hinweisleiste).

**Einrichtung (einmalig):**

1. **IT:** Ordner auf dem Firmenlaufwerk freigeben – Chef + Vertreter mit
   Schreibrechten, alle anderen nur mit Leserechten.
2. **Chef:** In der App oben auf **„Teilen"** klicken → „Neue gemeinsame Datei
   anlegen" → als Speicherort diesen Ordner wählen (z. B.
   `W:\Werkstatt\werkstatt-kalender-daten.json`). Die vorhandenen Einträge
   werden automatisch in die Datei übernommen.
3. **Alle anderen (Vertreter wie Zuschauer):** „Teilen" → „Vorhandene Datei
   öffnen" → dieselbe Datei auswählen. Wer Schreibrechte hat, kann bearbeiten
   (Änderungen werden Eintrag für Eintrag zusammengeführt, niemand
   überschreibt den anderen); alle übrigen sehen den aktuellen Stand
   (automatische Aktualisierung alle 30 Sekunden).

**Gut zu wissen:**

- Nach einem Browser-Neustart fragt der Browser aus Sicherheitsgründen einmal
  nach: Oben erscheint eine gelbe Leiste mit **„Jetzt verbinden"** – ein Klick
  genügt. (Edge/Chrome bieten nach mehrmaligem Erlauben an, sich die Freigabe
  dauerhaft zu merken.)
- Ist das Laufwerk kurz nicht erreichbar, wird lokal weitergespeichert und
  eine Meldung angezeigt; beim nächsten Speichern/Verbinden wird wieder
  zusammengeführt.
- Die Absicherung über Laufwerks-Rechte gilt auf Betriebssystem-Ebene und ist
  nicht austricksbar – ohne Schreibrecht landet nie eine Änderung in der Datei,
  egal was in der App angeklickt wird.
- Löschungen werden über eine interne Merkliste (180 Tage) zwischen den
  Bearbeitern abgeglichen.

## Funktionen

- **Monatsansicht** mit Kalenderwochen, bayerischen Feiertagen und
  Wochenend-Markierung; Einträge direkt per ＋ am Tag anlegen
  (TPM-Anlage oder R+I-Punkt, Status ✓ Gemacht / ✕ Offen, Notiz)
- **Monats-Matrix**: pro Anlage/R+I-Punkt auf einen Blick, was an welchem Tag
  gemacht bzw. offen ist
- **Jahresübersicht**: pro Anlage und Monat „x gemacht / y offen"
- **Plan**: automatischer Wartungsplan mit fortlaufender Montags-Rotation
  (Referenz 05.01.2026), Taktstraße, B1 und flexiblen 2-Monats-Gruppen –
  Feiertage werden übersprungen, R+I-Punkte nach Rhythmus eingeplant.
  Per „Plan in Kalender übernehmen" landen alle Termine als offene Einträge
  im Kalender.
- **Register**: alle Anlagen und R+I-Punkte mit kompletter Historie
- **Verwalten**: Anlagen und R+I-Punkte umbenennen, hinzufügen, löschen,
  Rollen und Rhythmen ändern – Umbenennungen übertragen sich auf bestehende
  Einträge
- **Drucken**: fertige Druckvorlagen (A4 quer für Kalender/Matrix, Notizen
  auf eigener Hochformat-Seite)
- **Arbeitsplanung mit Werkstattschichtplan** (Cockpit → Planung):
  Kalenderwochen direkt anklickbar oder per „📅 KW wählen" weit
  vorausspringen; pro Person und Tag steht oben in der Zelle die Schicht
  (Früh/Spät/Spät mit B/Nacht/Bereitschaft/Schule/Krank/Urlaub/Mainsite) –
  Klick auf die Schicht ändert sie für die ganze Woche oder nur einen Tag;
  das ＋ in der Zelle trägt eine Arbeit aus dem Backlog **oder eine freie
  Notiz** (gelb, z. B. „ab 8:30 Zahnarzt") ein; wer Urlaub/Krank/Schule hat,
  bekommt kein ＋
- **Export/Import** aller Einträge als JSON-Datei; der Import versteht auch
  Migrationsdateien mit Team-Liste (`{ "team": [...], "entries": [...] }`)

## Für Entwickler: selbst bauen

Der Quellcode liegt in [`app/`](app/) (React + Vite + Tailwind). Die
Kalender-Logik steckt unverändert in
[`app/src/WerkstattKalender.jsx`](app/src/WerkstattKalender.jsx); nur der
Speicher der Claude-Artifact-Umgebung (`window.storage`) ist in
[`app/src/storage.js`](app/src/storage.js) durch `localStorage` ersetzt.

```bash
cd app
npm install
npm run build   # baut alles in eine Datei und legt sie als ../Werkstatt_Kalender_TPM.html ab
npm run dev     # Entwicklungs-Server mit Live-Reload
```
