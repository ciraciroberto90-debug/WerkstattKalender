# 🔧 Werkstatt-Kalender

TPM-Wartungs- und R+I-Kalender für die Werkstatt – als Programm, das komplett
im Browser läuft: **ohne Installation, ohne Internet, ohne Anmeldung**.

## So startest du das Programm

1. Die Datei **`index.html`** herunterladen (Code → Download ZIP, oder nur die Datei).
2. Doppelklick auf `index.html` – der Kalender öffnet sich im Browser. Fertig.

Alle Einträge werden **lokal im Browser gespeichert** und bleiben nach dem
Schließen erhalten – solange derselbe Browser auf demselben Rechner verwendet
wird. Für Sicherungen oder den Wechsel auf einen anderen Rechner gibt es die
**Export/Import**-Knöpfe oben rechts.

> **Tipp:** Über GitHub Pages (Settings → Pages → Branch auswählen) lässt sich
> der Kalender auch als Webseite aufrufen, z. B. vom Tablet aus.

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
- **Export/Import** aller Einträge als JSON-Datei

## Für Entwickler: selbst bauen

Der Quellcode liegt in [`app/`](app/) (React + Vite + Tailwind). Die
Kalender-Logik steckt unverändert in
[`app/src/WerkstattKalender.jsx`](app/src/WerkstattKalender.jsx); nur der
Speicher der Claude-Artifact-Umgebung (`window.storage`) ist in
[`app/src/storage.js`](app/src/storage.js) durch `localStorage` ersetzt.

```bash
cd app
npm install
npm run build   # baut alles in eine Datei und legt sie als ../index.html ab
npm run dev     # Entwicklungs-Server mit Live-Reload
```
