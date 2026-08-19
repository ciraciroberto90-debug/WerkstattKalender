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

## Zur Auswahl (Runde 3, vorgeschlagen am 19.08., noch nicht entschieden)

Acht Kandidaten, alle am Code nachgemessen (nichts davon existiert),
Vorlagen liegen Roberto vor. Nicht mehr dabei: Urlaub/Krank im Schichtplan
- gibt es längst.

**1. Anlagen-Steckbrief im Register** - Hersteller, Typ/Baujahr, Serien-
nummer, Standort, Wartungspartner, wichtige Ersatzteile; frei belegbare
Felder, sichtbar auch im Störungs-Dialog. *Mittel.*

**2. Wartungs-Checkliste je Anlage** - feste Prüfpunkte im Abhaken-Dialog
("2 von 4"), gepflegt vom Verwalter im ⚙. Macht aus "Gemacht" ein
nachvollziehbares Gemacht. *Mittel.*

**3. Nachbestell-Übersicht** - alle Störungs-Ersatzteile mit "nachbestellt"
gesammelt an einer Stelle, mit Wartedauer und "eingetroffen"-Haken. Die
Felder existieren längst, nur die Sammel-Sicht fehlt. *Klein bis mittel.*

**4. Schichtübergabe-Blatt** - eine Druckvorlage: offene Störungen (mit
"was muss die nächste Schicht tun"), heutige Termine, Pinnwand - A4,
Stand auf die Minute. *Klein bis mittel.*

**5. Anlage außer Betrieb** - Zeitraum + Grund je Anlage; die Rotation
lässt sie aus, der Plan zeigt den Grund, der Nachweis zählt die Zeit
nicht als versäumt. *Mittel; berührt die Plan-Rechnung → Test-Pflicht.*

**6. Störungs-Häufungs-Hinweis** - beim Erfassen: "3. Störung an TS320
in 30 Tagen (Nr. ...)" - Blick auf die Ursache statt nur aufs Symptom.
*Klein.*

**7. CSV-Herausgabe für Excel** - Termine und Störungen als CSV; bisher
gibt es nur JSON, und genau das mahnt der Rollout-Test seit jeher als
HINWEIS an. *Klein.*

**8. Foto zur Störung** - Bilder als Dateien im Datenordner
(Stoerungsfotos/...), Verweis in der Störung; bewusst NICHT in der
gemeinsamen JSON (5-MB-Grenze). Braucht die Konflikt-Wächter-Freigabe.
*Mittel bis groß; berührt Datei-Ablage → Test-Pflicht.*

---

## Bereits umgesetzt aus früheren Vorschlagsrunden

- **19.08.2026 (Runde 1):** Lösch-Rückfrage im Termin-Dialog, Ein-Klick-
  Abhaken auf der Plan-Kachel, „Heute"-Knopf in Monats-/Jahresnavigation,
  Überfällig-Badge am TPM-Reiter (harte-46, 19/19).
- **19.08.2026 (Runde 2, komplett auf Robertos „setze ruhig alles um"):**
  Termin verschieben im Dialog (mit Rückgängig), Notiz-Zeichen ✎ auf der
  Plan-Kachel, Rückgängig-Leiste nach Abhaken/Löschen/Verschieben,
  Nachtschicht-Modus über den Auge-Knopf oben rechts, Register-Suche,
  „Seit deinem letzten Besuch" auf der Übersicht, Tages-Sicherung im
  Datenordner (Unterordner „Sicherungen", 14 Stände, nutzt die
  Konflikt-Wächter-Freigabe), Feiertags-Hinweis beim Anlegen
  (harte-47, 36/36).
