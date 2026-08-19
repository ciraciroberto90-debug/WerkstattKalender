# Vorgemerkte Updates

Robertos Vormerk-Liste: Verbesserungen, die **besprochen und für gut befunden**
sind, aber noch nicht gebaut werden. Zum Reinschauen und Wiederfinden – was
hier steht, ist nicht vergessen, nur noch nicht dran.

Beauftragt Roberto einen Punkt, wandert er in die Umsetzung und danach in die
„Erledigt"-Liste der [ROLLOUT-LISTE](ROLLOUT-LISTE.md). Neue Vorschläge, die
Roberto sehen wollte, aber noch nicht ausgewählt hat, stehen unten unter
„Zur Auswahl".

---

## Vorgemerkt (von Roberto am 19.08.2026 zurückgestellt)

### 1. Papierkorb „Kürzlich gelöscht"

**Warum:** Heute gibt es bei einem versehentlich gelöschten Eintrag nur das
grobe Werkzeug: eine ganze Sicherung einspielen, die **alles** ersetzt – und
dabei zwischenzeitliche Änderungen der Kollegen überschreiben kann.

**Wie:** Gelöschte Einträge bleiben 30 Tage in der gemeinsamen Datei (samt
Inhalt, nicht nur als Löschmarke) und lassen sich einzeln zurückholen –
für alle Geräte, nicht nur das eigene. Vorlage liegt vor (Dialog
„Kürzlich gelöscht" mit „Zurückholen"-Knopf je Eintrag).

**Aufwand/Vorsicht:** Mittel. Greift in die Zusammenführ- und
Lösch-Logik der gemeinsamen Datei → braucht nach Hausregel einen
Härtetest, der ohne die Änderung fehlschlägt. Als eigene, sorgfältige
Runde bauen, nicht nebenbei.

### 2. Jahres-Archiv gegen die 5-MB-Grenze

**Warum:** Der Zwischenspeicher des Browsers fasst ~5 MB – bei laufendem
Betrieb etwa sieben Jahre. Die App **warnt** ab drei Jahren Bestand, aber es
gibt bislang keinen Weg, etwas dagegen zu tun.

**Wie:** Ein „Jahresabschluss"-Schritt lagert abgeschlossene Jahre in eine
eigene Datei aus (`werkstatt-archiv-JAHR.json` im selben Ordner). Das
Register kann Archiv-Jahre weiterhin lesen; der laufende Bestand bleibt
klein und schnell.

**Aufwand/Vorsicht:** Der größte Brocken der Liste. Gleiche Test-Pflicht
wie beim Papierkorb. Nicht akut – es sind noch Jahre Luft –, aber ohne
diesen Weg läuft die Werkstatt irgendwann gegen die Wand.

---

## Zur Auswahl (vorgeschlagen, noch nicht entschieden)

*Wird gefüllt, sobald neue Vorschläge mit Vorlagen vorliegen und Roberto
noch nicht ausgewählt hat.*

---

## Bereits umgesetzt aus früheren Vorschlagsrunden

- **19.08.2026:** Lösch-Rückfrage im Termin-Dialog, Ein-Klick-Abhaken auf
  der Plan-Kachel, „Heute"-Knopf in Monats-/Jahresnavigation,
  Überfällig-Badge am TPM-Reiter (harte-46, 19/19).
