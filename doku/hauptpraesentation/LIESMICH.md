# Hauptpräsentation BTA-Cockpit – firmenneutral (Scheurich und Soendgen Keramik)

Die fertige Präsentation liegt als `doku/BTA-Cockpit-Hauptpraesentation.pptx`
(23 Folien). Sie löst die „Vorstellung für die Betriebsleitung" vom 08.09.2026
(`Werkstatt-Cockpit-Vorstellung.pptx`, 17 Folien) ab – Robertos Auftrag vom
21.09.: auf den heutigen Stand bringen, Bildschirmfotos erneuern und als
**Hauptpräsentation für beide Firmen** führen. Deshalb kein Adressat, kein
Termin und kein Bundesland im Text; beide Logos auf Titel und Schlussfolie.

Daneben bleibt `BTA-Cockpit-Vorstellung.pptx` (42 Folien, Bauskripte in
`../vorstellung-bta-cockpit/`) als lange Fassung für die Vorstellung bei
Soendgen Keramik am 22.09. – sie zeigt den Stand vom 19.09.

## Bauen

```bash
cd doku/hauptpraesentation
node shots.js      # Bildschirmfotos aus Beispieldaten in einem echten Chromium (nicht im Git)
node build.js      # schreibt ../BTA-Cockpit-Hauptpraesentation.pptx
python3 <pptx-skill>/scripts/office/validate.py ../BTA-Cockpit-Hauptpraesentation.pptx
```

`build.js` braucht `pptxgenjs` (per `NODE_PATH` oder `npm install pptxgenjs`).
`shots.js` nutzt die Saat der SK-Vorstellung (`../vorstellung-bta-cockpit/shots/saat.js`,
Stichtag 18.09.2026 09:30, Beispiel-Team mit Benutzerliste) und legt die Bilder in
`../vorstellung-bta-cockpit/shots/` ab – die Bereichsbilder 01–14 werden dabei
mit dem aktuellen Programmstand überschrieben, dazu kommen:

| Bild | Inhalt |
| --- | --- |
| `15-benutzer-rechte.png` | Zahnrad → Benutzer & Rechte (Liste, Link-Kürzel, Rechte-Tabelle) |
| `16-personalisieren.png`, `16b-anordnen.png` | Zahnrad → Personalisieren, Anordnen-Modus auf der Übersicht |
| `17-ansicht-menue.png`, `17b-ansicht-leser.png` | Ansichts-Schalter (Auge) und die simulierte Leser-Ansicht |
| `18-termin-anwesende.png`, `18b-termin-person.png` | Termin-Kachel mit „Anwesende"-Menü und Personen-Liste |
| `19-regeln-listen.png` | Zahnrad → Regeln & Listen |
| `20-kopfzeile-wechsel.png` | Kopfzeile mit Werkstatt-Wechsel des Gruppen-Verwalters |

Der Prüfnachweis-Druckdialog (`20-druck-pruefnachweis-dialog.png`) kommt aus
`../vorstellung-bta-cockpit/shots/drucke.js`.

## Zahlen im Deck

Alle Messwerte stehen oben in `build.js` im Objekt `Z` mit Quelle: 79 Härtetests
(Dateien in `tests/hardness/`, Suite 21.09. 79/79), 1.400+ Einzelprüfungen
(PASS-Zeilen im Suitenlauf: 1.416), Stress-Messfahrt 71.084 Einträge (11.09.).
Bei einer neuen Messung nur dort ändern und neu bauen.

Stand 21.09.2026: 23 Folien, Validierung „All validations PASSED", alle Folien
als Bild gesichtet (Ersatzschrift in der Vorschau; in PowerPoint sitzt Calibri
etwas enger).
