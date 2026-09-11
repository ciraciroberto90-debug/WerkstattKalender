# Roll-out-Prüfbericht

**Stand:** 11. September 2026
**Geprüfter Bestand:** BTA-Cockpit (App), Ausliefer-Dienst, Programm-Fassung, Datenhaltung auf dem Firmenlaufwerk, Synchronisation, Standort-Trennung

> Dieser Bericht ersetzt den Stand vom 28.07.2026. Die dort beschriebene
> OneDrive-Welt ist Geschichte: Seit dem 10.08.2026 liegen App, Datendateien
> und Störungs-Datei auf dem Firmenlaufwerk; OneDrive wird nirgends mehr
> verwendet. Seit dem 11.09. heißt das Programm BTA-Cockpit und trägt die
> Werkstatt-Wahl (Scheurich / Soendgen Keramik) mit komplett getrennten
> Datenbeständen je Standort.

---

## 1. Was geprüft wurde

| Bereich | Umfang |
|---|---|
| Härtetests | **68 Suiten** (harte-1 … harte-69), zuletzt kompletter Volllauf grün |
| Weitere Suiten | Smoke, Sync-Fokus, Rollout, Veröffentlichung, Diagnose-Ablauf, Programm-Prüfung, Leistung |
| **15 Jahre Betrieb, 71.084 Einträge** | Messfahrt vom 11.09. – Zahlen unten |
| Standort-Trennung | harte-68 (20 Prüfungen) + Nachweis: ohne Trennung 13/20 rot |
| Notbremse Massenlöschung | harte-69 (8 Prüfungen) + Nachweis: ohne Bremse 5/8 rot |
| Ausliefer-Dienst | Auslieferung, Inhaltstypen, Ausbruchsversuch, Portsuche, Versionswechsel |
| Programm-Fassung | pruefe-programm (Brücke, Zwischendatei-Endung fürs Laufwerk, Update-Rahmen) |

## 2. Der Langzeitbestand (Robertos Ansage: 70.000, ordentlich aufgeteilt)

Erzeugt von `tools/langzeit-daten.js`: jeder Arbeitstag von Juli 2011 bis
September 2026 – Schichteinträge für acht Leute, monatliche TPM- und
R+I-Nachweise, Arbeiten (Planung), To-dos, Zeiterfassungs-Buchungen,
Übergabe-Notizen und mehrere Störberichte pro Woche. Ohne Zufall: derselbe
Aufruf liefert denselben Bestand, damit ein Fehlschlag nachstellbar bleibt.
Die Jahresrate (4.500, Robertos Zahl vom 07.09.) verteilt sich seit dem
11.09. auf die Eintragsarten, wie der Bestand seit dem Berichte-Umbau
wirklich wächst.

```
GESAMT:            71.084 Einträge über 15 Jahrgänge · 15,2 MB
davon  SCHICHT     31.728     (Schichtplan, 8 Personen je Arbeitstag)
       ARBEIT      11.654     (Backlog / Planung)
       TODO        10.660     (To-dos aus dem Bereich Berichte)
       ZEIT        10.648     (Zeiterfassung auf Kostenstellen)
       TPM          1.647     (monatliche Wartungsnachweise)
       R+I          1.647     (Rundgänge und Inspektionen)
       NOTIZ          396     (Übergaben)
       STÖRBERICHT  2.704     (eigene Störungs-Datei, 20 offen)
```

### Gemessene Zeiten (Messfahrt 11.09.2026, `tests/stress-15-jahre.js`)

Jede Zeit gehört zu genau einer von drei „Verbindungen" – so ist ablesbar,
WO die Zeit entsteht:

| Verbindung | Was dahintersteckt |
|---|---|
| **A · Hauptdatei** | `werkstatt-kalender-daten.json` (13,8 MB bei 68.380 Einträgen): Kalender, Schichten, Planung, To-dos, Zeiterfassung. Jeder Vorgang liest die GANZE Datei, führt Eintrag für Eintrag zusammen und schreibt sie in einem Zug zurück – so kann sich nichts halb überschreiben. |
| **B · Störungs-Datei** | `werkstatt-stoerungen.json` (1,4 MB, 2.704 Berichte): die eigene, für alle beschreibbare Datei des Schichtbuchs. |
| **C · Keine Datei** | Reine Anzeige aus dem Arbeitsspeicher – es wird nichts gelesen oder geschrieben. Diese Zeiten hängen NUR am Rechner, nie am Laufwerk. |

**Ehrlich dazugesagt:** Die Messfahrt stellt die Dateien im Speicher des
Test-Rechners nach. Gemessen ist also die **Arbeit der App** (rund 14 MB Text
lesen, 68.000 Einträge vergleichen und zusammenführen, zurückschreiben) –
**nicht** die Netz-Geschwindigkeit des echten Firmenlaufwerks. Am Laufwerk
kommt je nach Netz etwas obendrauf; das ist dort bislang ungemessen.

#### A · Vorgänge an der Hauptdatei (bei 68.380 Einträgen)

| Vorgang | Zeit | Was genau gemessen wird |
|---|---|---|
| Verbinden | 5,9 s | Vom Klick „Vorhandene Datei öffnen" bis alles steht: Datei komplett lesen, alle 68.380 Einträge prüfen und mit dem örtlichen Stand zusammenführen, Übersicht aufbauen. Fällt einmal an – beim Einrichten oder nach dem Browser-Neustart. |
| Gleichzeitiges Speichern, zwei Bearbeiter | 12,8 s | Zwei Fenster speichern im selben Moment je einen Eintrag. Jeder Speichervorgang liest erst die volle Datei, führt zusammen, schreibt zurück und liest zur Kontrolle nochmal – bei einer Kollision wartet einer kurz und versucht es erneut (deshalb ≈ zwei volle Durchgänge nacheinander). Beide Änderungen standen danach in der Datei. |
| Neuladen (F5) | 6,1 s | Seite neu laden bei voller Menge: die App kommt hoch und holt sich den Bestand erneut aus der Datei. |
| Wiederverbinden danach | 6,2 s | Oberhalb der ~5-MB-Grenze gibt es keine örtliche Zweitschrift mehr – nach jedem Neuladen wird die volle Datei neu eingelesen. Zusammen mit dem Neuladen: ~12 s, einmal pro Browser-Neustart. |

#### B · Vorgänge an der Störungs-Datei (2.704 Berichte)

| Vorgang | Zeit | Was genau gemessen wird |
|---|---|---|
| Störungs-Datei verbinden | 6,0 s | Wie A/Verbinden, nur für die Schichtbuch-Datei: komplett lesen, alle Berichte zusammenführen, Liste aufbauen. Fällt ebenfalls nur beim Einrichten bzw. nach Neustart an. |

#### C · Bedienung ohne Dateizugriff (alles schon im Arbeitsspeicher)

| Vorgang | Zeit | Was genau gemessen wird |
|---|---|---|
| App-Start (leer) | 0,16 s | Aufruf der HTML bis zur bedienbaren Oberfläche, noch ohne Verbinden. |
| Reiterwechsel Schichtplan / Planung / Backlog | 1,5 / 0,6 / 0,9 s | Klick auf den Bereich bis die Ansicht steht – die App zeichnet die jeweilige Ansicht aus 68.380 Einträgen im Speicher neu (der Schichtplan ist die dichteste, daher der höchste Wert). |
| Volltextsuche im Schichtbuch | < 0,1 s | Tippen im Suchfeld bis die Treffer über alle 15 Jahrgänge dastehen. |
| Störungs-Auswertung | 0,4 s | Klick auf „Auswertung" bis Ausfallzeiten/Anteile über 15 Jahrgänge gerechnet und gezeichnet sind. |
| Prüfnachweis (R+I) öffnen | 2,7 s | Druckansicht des Nachweises: über den ganzen Zeitraum rechnen und das Druckfenster aufbauen. |
| Reiterwechsel bei 6-fach gedrosselter CPU | 3,8 s | Derselbe Reiterwechsel wie oben, aber mit künstlich auf ein Sechstel gebremstem Prozessor – der schwächste denkbare Werkstatt-PC. |
| Tipp-Verzug, 18 Zeichen, 6-fach-Drossel | 0,3 s | Wie weit das Suchfeld beim schnellen Tippen hinterherhängt. Unter einer Drittelsekunde = fühlt sich flüssig an. |

Kein Eintrag ging bei irgendeinem dieser Vorgänge verloren; Stichproben von
2011, 2018 und 2026 waren nach jedem Schritt einzeln vorhanden, und die
Änderungen beider Bearbeiter überlebten Neuladen + Wiederverbinden
(68.381 → 68.384 Einträge: Bestand + 2 Bearbeiter-Änderungen + Verlauf).

### Einordnung: Was die Zahlen bedeuten

- **Die 70.000 sind ein STRESSTEST, kein Betriebszustand.** Gemessen wird
  absichtlich weit jenseits des Alltags – rund 15 Jahre ohne jedes
  Aufräumen –, damit belegt ist, dass die App auch dann bedienbar bleibt
  und nichts verliert (Suche, Auswertung, Tippen flüssig; Verbinden und
  Speichern im Sekundenbereich). So voll wird der Bestand im normalen
  Betrieb nie, siehe nächster Punkt.
- **Ab etwa 5–8 MB Altbestand wird archiviert – nach Auswahl.** Die App
  meldet sich ab drei Jahrgängen von selbst mit der Karte „Aufräumen
  empfohlen" (in der Messfahrt erschien sie zuverlässig). Dort wählt man
  selbst das Stichjahr („Auslagern bis einschließlich Jahr …", Vorschlag
  der App: die letzten zwei vollen Jahre behalten), lädt ZUERST die
  Archivdatei herunter, erst danach werden die ausgewählten alten
  Einträge aus dem laufenden Bestand entfernt – nichts geht verloren,
  das Archiv bleibt als Datei lesbar. Seit dem 11.09. auch von Hand
  aufrufbar (⚙ → Verlauf & Sicherung → „Jahres-Archiv öffnen …") -
  der Zwei-Schritt-Schutz gilt dort genauso. **Und: OFFENES wird nie
  archiviert.** Offene Backlog-Arbeiten, offene To-dos und unerledigte
  Termine bleiben im laufenden Bestand, egal wie alt - nichts gerät in
  Vergessenheit (Robertos Ansage vom 11.09.; Wache harte-22 Abschnitt I,
  gemessen: ohne den Schutz wurden offene Arbeit und offenes To-do mit
  ausgelagert - 4 Prüfungen rot, mit Schutz 34/34).
- **Oberhalb von ~5 MB passt der Bestand nicht mehr in den örtlichen
  Browser-Zwischenspeicher.** Die Datei auf dem Laufwerk bleibt der
  maßgebliche Bestand (dafür ist sie gebaut); es wird nur das Neuladen
  träger (~12 s) – auch deshalb ist das Archivieren ab 5–8 MB der
  vorgesehene Weg.

## 3. Fund der Messfahrt – gefunden und behoben am selben Tag

### Massenlöschung bei vollem Zwischenspeicher (behoben, harte-69)

**Gemessen am 11.09., VOR dem Fix:** Oberhalb der Speichergrenze bleibt der
örtliche Spiegel leer, der Vergleichsstand des Fensters kennt aber den
vollen Bestand. Ein Speichervorgang auf Basis des leeren Spiegels wertete
die Differenz als *gewolltes Löschen*: Von 68.380 Einträgen überlebten
**20**, die Datei füllte sich mit 68.380 Verlaufszeilen „gelöscht: …".

**Der Fix (Notbremse):** Eine Löschmenge über 1.000 bei weniger als 100
verbleibenden Einträgen ist ein kaputter Vergleichsstand, kein Wille – die
Löschungen werden verworfen, der Bestand bleibt vollständig, die neuen
Änderungen kommen an, und eine Meldung erklärt es laut. Die gewollte
Jahres-Archiv-Räumung (viele alte Jahrgänge weg, tausende aktuelle bleiben)
läuft unverändert durch – eigens gegengeprüft.

**Nachweis nach Hausregel** (der Test schlägt ohne die Änderung fehl):
harte-69 gegen einen Bau ohne Bremse = **5/8 rot** (von 1.500 Einträgen
überlebt genau 1, 1.500 „gelöscht"-Zeilen); mit Bremse = 8/8, und die
Messfahrt zeigt 68.381 → 68.384 statt der vorherigen Verdopplung auf
136.781 (Bestand + Löschzeilen-Flut).

## 4. Standort-Trennung (Etappe 2, harte-68)

- Scheurich behält alle alten Schlüssel und Datenbanknamen (Bestandsschutz:
  laufende Rechner bekommen keine Frage, verlieren nichts); Soendgen läuft
  in einem eigenen Namensraum mit eigenen Datendateien und Sicherungen und
  startet blanko.
- Die Datendateien tragen eine Standort-Kennung; der **Standort-Wächter**
  weist die Datei der falschen Werkstatt mit klarer Meldung ab. Alt-Dateien
  ohne Kennung gelten als Scheurich und verbinden normal.
- **Nachweis:** Gegen einen Bau ohne Trennung ist harte-68 **13/20 rot** –
  alle sieben Trennungs- und Wächter-Prüfungen schlagen fehl.
- Feiertage folgen dem Bundesland des Standorts (Scheurich Bayern,
  Soendgen NRW) – die Rotation rechnet damit.

## 5. Geprüft und in Ordnung befunden

- **Kein-Verlust-Prüfung:** Nach jedem Schreiben wird zurückgelesen und
  geprüft, ob etwas unerwartet verschwunden ist.
- **Optimistische Sperre:** Zwei Bearbeiter gleichzeitig bei voller
  Datenmenge – beide Änderungen stehen hinterher in der Datei (12,8 s).
- **Zwischenspeicher als Zweitschrift:** Die Datei ist der Bestand. Läuft
  der Zwischenspeicher voll, schneidet das den Weg in die Datei nicht ab –
  und löscht seit dem 11.09. auch nichts mehr (Notbremse).
- **Halb geschriebene / leere Datei:** Torso wird nicht durch einen
  kleineren Bestand ersetzt; Selbstheilung repariert automatisch
  (harte-35). Häufigste Ursache heute: kurzer Netzwerk-Aussetzer am
  Laufwerk – die Meldungen nennen das Laufwerk, nicht mehr OneDrive.
- **Ausliefer-Dienst:** hört nur auf 127.0.0.1, liefert nur aus dem
  Cockpit-Ordner, weist Ausbruchsversuche mit 403 ab.
- **Programm-Fassung:** schreibt über eine Zwischendatei mit Ziel-Endung
  (Dateityp-Prüfung des Servers umgangen, am echten Laufwerk bewiesen).

## 6. Bekannte Grenzen

- **Zwischenspeicher:** Bei Robertos Rate (4.500 Einträge/Jahr) ist die
  ~5-MB-Grenze des Browsers nach gut 4–5 Jahren erreicht. Oberhalb arbeitet
  die App nur noch direkt mit der Datei: alles bleibt korrekt (Messfahrt),
  aber jedes Neuladen braucht das Wiederverbinden (~6 s) und die örtliche
  Zweitschrift entfällt. Der vorgesehene Ausweg ist das Jahres-Archiv; die
  Erinnerung kommt ab drei Jahrgängen von selbst.
- **Ein Klick nach dem Browser-Neustart:** Die Rechtefreigabe verlangt
  einen Menschen. Das lässt sich nicht automatisieren und soll es nicht.
- **Schwacher PC:** Bei 6-fach gedrosselter CPU und vollem Bestand dauert
  ein Reiterwechsel bis ~4 s; Tippen bleibt flüssig.

## 7. Ergebnis

Alle 68 Härtetest-Suiten grün, Messfahrt 17/17 ohne Verlust. Die
70.000er-Fahrt hat einen ernsten, vorher von keiner Wache abgedeckten
Fehler gefunden (Massenlöschung bei vollem Zwischenspeicher) – er wurde am
selben Tag behoben, mit rot/grün-Nachweis und dauerhafter Wache (harte-69).
