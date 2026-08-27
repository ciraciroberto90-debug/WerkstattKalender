# Vorgemerkte Updates

Robertos Vormerk-Liste: Verbesserungen, die **besprochen und für gut befunden**
sind, aber noch nicht gebaut werden. Zum Reinschauen und Wiederfinden – was
hier steht, ist nicht vergessen, nur noch nicht dran.

Beauftragt Roberto einen Punkt, wandert er in die Umsetzung und danach in die
„Erledigt"-Liste der [ROLLOUT-LISTE](ROLLOUT-LISTE.md). Neue Vorschläge, die
Roberto sehen wollte, aber noch nicht ausgewählt hat, stehen unten unter
„Zur Auswahl".

---

## Vorgemerkt

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

### Vorbelegung für neue Programm-Rechner

**Warum:** Ein frisch aufgesetzter Rechner braucht heute zwei Handgriffe im
⚙ (Update-Ordner, ggf. Datenpfad) - genau das fehlte auf dem Leser-Rechner
vom 26.08. wochenlang, ohne dass es jemand sah.

**Wie:** Der Programm-Rahmen liest beim ersten Start eine kleine
Standard-Einstellungsdatei NEBEN der EXE (liegt mit in der ZIP bzw. im
entpackten Ordner auf dem Laufwerk). Damit wäre „neuer Rechner" nur noch:
entpacken, starten, fertig - Update-Ordner und Pfade sitzen von selbst.

**Aufwand/Vorsicht:** Klein, aber eine Rahmen-Änderung → einmal ZIP
tauschen, plus Härtetest am echten Electron.

**Dazu besprochen und entschieden (26.08.):** Ein echter Installer
(Setup.exe, Benutzer-Variante ohne Adminrechte) wäre machbar, bringt aber
nur Komfort - Roberto: „Zip reicht aktuell". Bei Bedarf später, dann am
besten zusammen mit der IT-Signatur (SmartScreen).

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
- **21.08.2026 (Robertos „bauen", war Vormerkung 3):** Fotos zu Störungen
  und Backlog-Arbeiten. Die Bilder liegen als Dateien im Unterordner
  `Fotos/` des Datenordners (Freigabe des Konflikt-Wächters), im Eintrag
  steht nur der Verweis - die gemeinsame JSON bleibt klein. Handyfotos
  werden vor dem Speichern auf höchstens 1600 px Kante eingedampft.
  📷-Kennzeichen in der Backlog-Zeile mit aufklappbarer Vorschau,
  Foto-Bereich in Arbeit- und Störbericht-Dialog (Kamera am Handy,
  Dateiauswahl am Rechner), Großansicht mit Blättern (Pfeiltasten, Esc).
  Abbrechen hinterlässt keine Waisen, Eintrag-Löschen räumt die Dateien
  mit weg (harte-51, inkl. Gegenprobe: gegen den Build ohne die Änderung
  schlägt der Test fehl). *Nachtrag 24.08.: Ohne Ordner-Freigabe war der
  Foto-Bereich komplett unsichtbar - Roberto fand die Funktion nicht.
  Jetzt zeigt der Bearbeiten-Dialog dort immer den Bereich - und die
  Freigabe ist EIN Klick direkt im Dialog: „Werkstatt-Ordner
  freigeben …" (nie freigegeben) bzw. „Freigabe jetzt bestätigen"
  (nach Browser-Neustart fragt der Browser einmal nach - dieser
  Zustand sah vorher wie „gibt es nicht" aus); harte-51 jetzt 32/32.
  Nachtrag 26.08.: Fotos gehen jetzt auch in der PROGRAMM-Fassung - der
  Rahmen kann Unterordner anlegen und Bilddateien schreiben (braucht die
  ZIP vom 26.08.; ältere ZIPs sagen ehrlich „Programm-ZIP zu alt");
  harte-57 12/12, pruefe-programm 24 Prüfungen am echten Electron.*
- **24.08.2026 (Robertos Wünsche aus dem laufenden Betrieb):**
  Schwebe-Fenster (verschiebbar + Größe änderbar, Lage wird je Gerät
  gemerkt): 📅-Wartungskalender direkt auf der Übersicht und
  „📋 Backlog" in der Planung - Arbeiten per Ziehen auf Person + Tag
  zuweisen, Chips im Plan zum Umplanen ziehen, zurück ins Fenster =
  ausplanen (harte-52, 21/21).
- **24.08.2026 (Robertos „gehe es an", war Vormerkung 0):** ALLE 21
  klassischen Dialoge (Termin, Arbeit, Störbericht, ⚙, Register,
  Druckwahl, Nachbestellungen …) sind jetzt verschiebbar - über die
  kleine ⠿-Lasche über dem Dialogkopf - und an der Ecke unten rechts in
  der Größe änderbar. Sie öffnen bewusst weiterhin MITTIG (kein
  Lage-Merken - anders als die Schwebe-Fenster, die Werkzeuge sind).
  Die Lasche liegt außerhalb der Karte und überdeckt keinen einzigen
  Knopf; Ziehen in Eingabefeldern bleibt Text-Markieren; der
  Loslass-Klick nach dem Ziehen schließt den Dialog nicht versehentlich
  (harte-53, 14/14).
- **24.08.2026 (Robertos Wünsche, zweite Runde):** Regeltermine als eigene
  Kategorie „Termin" (lila) - freier Titel, Wiederholung wöchentlich /
  2-wöchentlich / 4-wöchentlich mit „bis"-Datum, auf Wunsch ein
  veröffentlichter Pinnwand-Zettel je Reihe. Sie informieren wie R+I
  (Tagesliste, Plan-Kalender, Kalender-Fenster), zählen aber in KEINE
  Wartungs-Quote; „Ganze Reihe löschen" im Termin-Dialog. Dazu: das
  Termin-Archiv ist jetzt auch für LESER sichtbar (nur ansehen), und
  nach 30 Tagen ist im Archiv Schluss - vergangene Regeltermine werden
  wirklich gelöscht (einmal täglich, nur mit Schreibrecht), versäumte
  TPM/R+I verschwinden nur aus der Archiv-Anzeige und zählen in
  Auswertung, Trend und Druckblättern weiter als versäumt
  („nachvollziehbar unter TPM", nachgemessen) (harte-55, 26/26, inkl.
  Gegenprobe gegen den Build ohne die Änderung).
