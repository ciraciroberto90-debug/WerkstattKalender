# Vorstellung BTA-Cockpit und Claude – Soendgen Keramik, 22.09.2026

Die fertige Präsentation liegt als `doku/BTA-Cockpit-Vorstellung-SK.pptx`
(42 Folien, 7 Kapitel). Hier liegen die Bauskripte, damit das Deck nach
einer Änderung neu erzeugt werden kann.

## Warum Skripte statt Handarbeit

Das Deck wird mit `pptxgenjs` aus `build.js` (Kapitel 1–2, Helfer) und
`teil2.js` (Kapitel 3–7) gebaut. So lässt sich eine Zahl oder ein Satz an
einer Stelle ändern und das ganze Deck bleibt einheitlich.

## Bildschirmbilder

Die Screenshots sind **nicht** im Git – sie werden aus Beispieldaten in einem
echten Chromium erzeugt (`shots/`):

| Skript | Erzeugt |
| --- | --- |
| `shots/saat.js` | Beispiel-Datenplatte (Team, Anlagen, Störungen, R+I, Pinnwand) |
| `shots/screenshots.js` | die Bereichs-Screenshots 01–14 (3000×1880) |
| `shots/drucke.js` | Prüfnachweis und Schichtplan-Ausdruck |
| `shots/schichtbericht-druck.js` | Schichtbericht über den echten Druckweg |
| `shots/werkzeug-shots.js` | die drei Werkzeug-Fenster aus der HTML-Vorlage (Attrappen) |

Die Pfade `SHOTS` (Bilder) und `LOGOS` (`doku/logos`) oben in `build.js`
müssen auf die eigene Umgebung zeigen. Die Werkzeug-Bilder sind gezeichnete
Vorlagen, keine Windows-Screenshots – ein echtes Bild vom Rechner kann
1:1 eingetauscht werden (`30-…`, `31-…`, `32-werkzeug-*.png`).

## Bauen und prüfen

```bash
node build.js                                   # schreibt BTA-Cockpit-Vorstellung-SK.pptx
python3 <pptx-skill>/scripts/office/validate.py BTA-Cockpit-Vorstellung-SK.pptx
```

Stand 18.09.2026: 42 Folien, Validierung „All validations PASSED", alle
Folien als Bild gesichtet (Ersatzschrift in der Vorschau; in PowerPoint
sitzt Calibri etwas enger).
