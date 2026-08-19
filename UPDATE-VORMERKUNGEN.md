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

## Zur Auswahl (vorgeschlagen am 19.08., noch nicht entschieden)

Acht Kandidaten der zweiten QoL-Runde. Alle am Code nachgemessen (nichts
davon existiert), Vorlagen liegen Roberto vor.

**A. Termin verschieben im Dialog** – Datumsfeld + „Verschieben"-Knopf im
Termin-Fenster. Heute geht Verschieben nur über Löschen und neu anlegen –
obwohl der Archiv-Hinweis das Verschieben längst verspricht. Notiz wandert
mit. *Kleiner Eingriff, hoher Alltagsnutzen.*

**B. Notiz-Zeichen auf der Plan-Kachel** – kleiner Stift-Punkt an Kacheln
mit Notiz, Notiztext beim Draufzeigen. Heute sieht man erst im Dialog, ob
eine Notiz existiert (die Matrix zeigt es längst an). *Klein.*

**C. Rückgängig-Leiste** – nach Abhaken oder Löschen unten kurz
„✓ TS480 abgehakt · RÜCKGÄNGIG (8 s)". Fängt Fehlklicks ab, ergänzt die
neue Lösch-Rückfrage. *Klein bis mittel.*

**D. Nachtschicht-Modus** – dunkle Darstellung, Schalter im ⚙, Gerät merkt
sich die Wahl. Für die Nachtschicht am Störungs-Bildschirm. Vorlage ist
eine Näherung (Farbumkehr); die echte Umsetzung bekommt saubere Farben.
*Mittel – jede Ansicht muss geprüft werden.*

**E. Register-Suche** – Suchfeld über den Anlagen-/R+I-Listen mit
Trefferzahl; Nicht-Treffer treten zurück. Lohnt, sobald die Listen länger
werden. *Klein.*

**F. „Seit deinem letzten Besuch"** – Leiste oben auf der Übersicht: was
sich seit dem letzten Öffnen getan hat (aus dem Verlauf, der heute im ⚙
versteckt ist). Wegklickbar. *Mittel.*

**G. Tages-Sicherung im Datenordner** – einmal täglich legt die App eine
Kopie in den Werkstatt-Ordner (nutzt die vorhandene Konflikt-Wächter-
Freigabe); dort greift auch die IT-Datensicherung. Heute liegen die
Sicherungen nur im Browser des einzelnen Rechners. *Mittel; berührt das
Speichern → Test-Pflicht nach Hausregel.*

**H. Feiertags-Hinweis beim Anlegen** – legt jemand einen Termin auf einen
Feiertag, sagt der Dialog es sofort („15.08. ist Mariä Himmelfahrt –
trotzdem anlegen?"). Passt zur Regel, dass der Plan Feiertage automatisch
herausrechnet. *Klein.*

---

## Bereits umgesetzt aus früheren Vorschlagsrunden

- **19.08.2026:** Lösch-Rückfrage im Termin-Dialog, Ein-Klick-Abhaken auf
  der Plan-Kachel, „Heute"-Knopf in Monats-/Jahresnavigation,
  Überfällig-Badge am TPM-Reiter (harte-46, 19/19).
