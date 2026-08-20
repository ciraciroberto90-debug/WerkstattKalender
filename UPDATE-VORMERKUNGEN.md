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

### 3. Foto zur Störung (von Roberto am 19.08. zurückgestellt)

**Warum:** Ein Foto vom Schaden sagt der nächsten Schicht mehr als drei
Sätze.

**Wie:** Bilder als Dateien im Datenordner (`Stoerungsfotos/…`), in der
Störung nur der Verweis – **bewusst nicht in der gemeinsamen JSON**, sonst
wäre die 5-MB-Grenze in Wochen erreicht. Braucht die Ordner-Freigabe, die
für den Konflikt-Wächter schon besteht. Vorlage liegt vor.

**Aufwand/Vorsicht:** Mittel bis groß; berührt die Datei-Ablage → braucht
nach Hausregel einen Test, der ohne die Änderung fehlschlägt.

---

## Zur Auswahl (Kreativ-Runde „Gimmicks & Layout", 19.08., noch nicht entschieden)

Acht Ideen auf Robertos „sei kreativ" - Feinschliff statt Funktionen,
Vorlagen liegen vor.

**G1. Eigener Werkstatt-Name** - „Werkstatt Scheurich" statt
„Werkstatt-Cockpit" in Kopfzeile UND auf allen Druckköpfen; frei
einstellbar im ⚙. *Klein.*

**G2. Voller Monat = kleines Fest** - hakt jemand den letzten Termin des
Monats ab, gibt es einmal Konfetti und „Alle 14 Termine erledigt - 100 %".
Danach Ruhe. *Klein.*

**G3. Eigene Farbe je Anlage** - jede Anlage bekommt eine feste Kennfarbe
(linke Kante an Kacheln, Matrix, Störungen). Man erkennt „seine" Maschine
ohne zu lesen. *Klein bis mittel.*

**G4. Heute-Spalte im Kalender** - der heutige Wochentag läuft als dezent
getönte Spalte durch den Plan-Kalender. Das Auge findet „heute" sofort.
*Klein.*

**G5. Schicht-Fortschrittsbalken** - dünner Balken unter der Kopfleiste,
füllt sich über die laufende Schicht; beim Draufzeigen „Frühschicht ·
52 % · noch 3 h 48 min bis zur Übergabe". *Klein.*

**G6. Störungs-Laufband im Vollbild-Monitor** - offene Störungen laufen
unten als Band durch, von der anderen Hallenseite lesbar. *Klein bis
mittel.*

**G7. Tastatur-Kürzel** - N Nachtmodus, D Drucken, S Störbericht,
H Heute; Taste ? zeigt den Spickzettel. Greift nie, wenn ein Eingabefeld
den Fokus hat. *Klein.*

**G8. Wochen-Rückblick** - freitags eine wegklickbare Karte auf der
Übersicht: erledigte Termine, Termintreue, behobene Störungen, stärkster
Tag, Sorgenkind der Woche. *Mittel.*

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
- **19.08.2026 (Runde 3, Robertos „alles bis auf 8"):** Anlagen-Steckbrief
  im Register (samt ℹ-Zeile im Störungs-Dialog), Wartungs-Checkliste je
  Anlage im Termin-Dialog, Nachbestell-Übersicht mit „eingetroffen"-Haken,
  Schichtübergabe-Blatt als Druckvorlage, Anlage außer Betrieb (Rotation
  setzt aus, Plan nennt den Grund), Störungs-Häufungs-Hinweis (3. Störung
  in 30 Tagen), CSV-Herausgabe für Excel (harte-48, 31/31).
