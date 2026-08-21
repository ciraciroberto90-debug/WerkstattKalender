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

### 3. Foto zur Störung **und zur Backlog-Arbeit** (am 21.08. um den Backlog erweitert)

**Warum:** Ein Foto vom Schaden sagt der nächsten Schicht mehr als drei
Sätze. Gilt genauso für Backlog-Arbeiten – wer die Arbeit übernimmt, sieht
sofort, worum es geht (Robertos Nachfrage vom 21.08.).

**Wie:** Bilder als Dateien im Datenordner (`Fotos/…`), im Eintrag nur der
Verweis – **bewusst nicht in der gemeinsamen JSON**, sonst
wäre die 5-MB-Grenze in Wochen erreicht. Braucht die Ordner-Freigabe, die
für den Konflikt-Wächter schon besteht. Störbericht und Arbeit-Dialog
bekommen dasselbe Foto-Feld (gleicher Unterbau, eine Runde). Ausführliche
Vorlagen vom 21.08. liegen vor: 📷-Kennzeichen in der Backlog-Zeile,
Mini-Vorschau unter der Zeile, Foto-Bereich in beiden Dialogen,
Großansicht mit Blättern und Löschen.

**Aufwand/Vorsicht:** Mittel bis groß; berührt die Datei-Ablage → braucht
nach Hausregel einen Test, der ohne die Änderung fehlschlägt.

---

## Zur Auswahl (vorgeschlagen, noch nicht entschieden)

*Zurzeit nichts - neue Vorschläge landen hier.*

---

## Bereits umgesetzt aus früheren Vorschlagsrunden

- **19.08.2026 (Runde 1):** Lösch-Rückfrage im Termin-Dialog, Ein-Klick-
  Abhaken auf der Plan-Kachel, „Heute"-Knopf in Monats-/Jahresnavigation,
  Überfällig-Badge am TPM-Reiter (harte-46, 19/19). *Das Badge wurde am
  20.08. auf Robertos Wunsch wieder entfernt.*
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
- **19.08.2026 (Kreativ-Runde, Robertos „einführen"):** Eigener
  Werkstatt-Name (⚙ → Team & Schichten; Kopfzeile + Druckköpfe),
  Voller-Monat-Fest (einmal je Monat, sperrt nichts), Kennfarbe je
  Anlage (Kachel-Kante + Register-Punkt), Heute-Spalte im Plan-Kalender,
  Schicht-Fortschrittsbalken unter der Kopfleiste *(am 20.08. auf
  Robertos Wunsch wieder entfernt)*, Störungs-Laufband im
  Vollbild-Monitor, Tastatur-Kürzel (N/D/S/H/W/T, ? = Spickzettel),
  Wochen-Rückblick freitags ab 12 Uhr (harte-49, 27/27).
- **20.08.2026 (Robertos Wahl „A"):** Geburtstags-Erinnerung - freiwilliges
  🎂-Feld je Person (⚙ → Team & Schichten, TT.MM. oder TT.MM.JJJJ; mit Jahr
  steht am Tag das Alter). Am Tag selbst eine dezente 🎂-Karte auf der
  Übersicht (wegklickbar je Tag und Gerät) mit „demnächst"-Vorschau der
  nächsten 7 Tage; 29.02.-Geborene werden in Nicht-Schaltjahren am 28.02.
  erinnert. Leeres oder unlesbares Feld bleibt komplett stumm. *Bewusst nur
  Variante A gebaut - der 🎂-Kringel im Schichtplan und bei „Heute da"
  (Variante C) blieb auf Robertos Wahl hin weg* (harte-50, 19/19).
