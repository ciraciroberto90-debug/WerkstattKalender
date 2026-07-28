# Roll-out-Prüfbericht

**Stand:** 28. Juli 2026
**Geprüfter Bestand:** App, Ausliefer-Dienst, Starter, Datenhaltung, Synchronisation

---

## 1. Was geprüft wurde

| Bereich | Umfang |
|---|---|
| Bestandssuiten | 34 Härtetests, Smoke, Sync-Fokus, Rollout, Veröffentlichung, Diagnose-Ablauf |
| **Sieben Jahre Betrieb** | 16 951 Kalendereinträge, 1 260 Störberichte, 3,4 MB – neu |
| **Voller Zwischenspeicher** | Grenze des Browsers künstlich erreicht – neu |
| **Halb geschriebene Datei** | Torso, 0 Bytes, Reparatur – neu |
| Ausliefer-Dienst | Auslieferung, Inhaltstypen, Ausbruchsversuch, Portsuche, Versionswechsel |
| Starter (.cmd) | Skriptsuche, fehlende Dateien, Sonderzeichen im Pfad |

## 2. Der Langzeitbestand

Erzeugt wird er von `tools/langzeit-daten.js` – jeder Arbeitstag von Juli 2019
bis Juli 2026 mit Schichteinträgen für acht Leute, monatliche TPM- und
R+I-Nachweise, Backlog-Arbeiten, Übergabe-Notizen und mehrere Störberichte pro
Woche. Ohne Zufall: derselbe Aufruf liefert denselben Bestand, damit ein
Fehlschlag nachstellbar bleibt.

```
Einträge gesamt:  16 951     davon SCHICHT 14 776 · TPM 765 · RI 765 · ARBEIT 461 · NOTIZ 184
Störberichte:      1 260     davon offen 10
Zwischenspeicher:  3 413 KB  von etwa 5 120 KB
Datei:              3,72 MB  (mit Einrückung)
```

### Gemessene Zeiten

| Vorgang | Dauer |
|---|---|
| App starten | 0,14 s |
| Verbinden mit 17 000 Einträgen | 3,2 s |
| Gleichzeitiges Speichern, zwei Bearbeiter | 7,6 s |
| Störungen-Datei mit 1 260 Berichten verbinden | 6,0 s |
| Suche über sieben Jahrgänge | 2,1 s |
| Auswertung über sieben Jahrgänge | 3,1 s |
| **Neuladen mit vollem Bestand** | **5,2 s** |

Kein Eintrag ging bei irgendeinem dieser Vorgänge verloren. Nachgeprüft wurde
nicht nur die Anzahl, sondern auch, dass Stichproben vom Anfang, aus der Mitte
und vom Ende des Zeitraums noch einzeln vorhanden sind.

### Was der Langzeitlauf zusätzlich belegt

Bei sieben Jahrgängen greift die **Archiv-Erinnerung** wie vorgesehen: Sie nennt
Zeitraum und Menge, verlangt vor dem Entfernen erst das Herunterladen der
Archivdatei, und „Später erinnern" schließt sie, ohne etwas zu löschen.

## 3. Neu geprüfte Grenzfälle

### 3.1 Voller Zwischenspeicher (`harte-34`, 10/10)

Der Browser gibt jeder Herkunft nur etwa 5 MB. Sieben Jahre belegen 3,4 MB –
der Rand ist in Sicht.

- **Mit verbundener Datei:** Die Änderung landet trotzdem in der Datei, der
  Altbestand bleibt unangetastet, und der Bediener bekommt eine Warnung, die
  ausdrücklich sagt, dass nichts verloren ist.
- **Ohne verbundene Datei:** Das Speichern scheitert **laut** – mit einer
  Meldung, die Ursache und Ausweg nennt. Es wird nichts als gespeichert
  ausgegeben, was nicht gespeichert ist.

### 3.2 Halb geschriebene und leere Datei (`harte-35`, 16/16)

Der gefährlichste denkbare Fall: OneDrive synchronisiert mitten im Schreiben,
oder ein Rechner wird hart ausgeschaltet.

- Der Torso wird **nicht** durch einen kleineren Bestand ersetzt – weder beim
  Verbinden noch bei einem Speicherversuch.
- Eine plötzlich **leere** Datei löscht weder Anzeige noch Bestand: Der örtliche
  Stand trägt sie wieder auf, samt der Arbeit der Kollegen.
- Nach der Reparatur läuft alles weiter, ohne dass etwas fehlt.

## 4. Behobene Fehler

### 4.1 Rohe Browsertexte in Fehlermeldungen

**Vorher:** `Gemeinsame Datei: Expected double-quoted property name in JSON at
position 182 (line 9 column 2)`

Der rohe Text des JavaScript-Lesers, auf Englisch, ohne Handlungsanweisung.

**Jetzt:** „Die gemeinsame Datei ist unvollständig (393 Zeichen gelesen, Ende
fehlt). Das passiert, wenn ein Abgleich mitten im Schreiben abbricht … Es wurde
nichts überschrieben, deine Arbeit ist lokal gesichert. Meist ist die Datei nach
dem nächsten OneDrive-Abgleich wieder vollständig – kurz warten und erneut
speichern. Bleibt es dabei: ⚙ → Sicherungen."

Zusätzlich wird die Ursache nicht mehr in eine zweite Meldung geschachtelt.

### 4.2 Ausliefer-Dienst merkte sich die Startseite nur beim Start

**Gefunden beim Durchlesen, nicht durch einen Fehlschlag.** Der Dienst suchte
die Cockpit-Datei einmalig beim Start. Wird die HTML im laufenden Betrieb
ausgetauscht und heißt die neue Fassung anders – `(29)` statt `(28)` –, zeigte
`http://localhost:8765/` weiter auf die alte Datei; nach dem Löschen der alten
ins Leere. Genau der Ablauf, den die Werkstatt ständig hat.

**Jetzt** wird bei jedem Aufruf nachgesehen, der Wechsel im Fenster protokolliert,
und fehlt die Datei ganz, kommt ein verständlicher Hinweis statt einer leeren
Seite. Nachgemessen: Wechsel von `(28)` auf `(29)` im laufenden Betrieb wird
ohne Neustart übernommen.

### 4.3 Starter gegen Sonderzeichen im Pfad gehärtet

Pfadausgaben in Klammerblöcken stehen jetzt in Anführungszeichen. Ein Ordner
wie `Desktop (alt)` oder ein `&` im Namen hätte die Zeile sonst zerlegt.

## 5. Geprüft und in Ordnung befunden

- **Kein-Verlust-Prüfung:** Nach jedem Schreiben wird zurückgelesen und geprüft,
  ob etwas unerwartet verschwunden ist. Greift in allen Grenzfällen.
- **Optimistische Sperre:** Zwei Bearbeiter gleichzeitig, bei voller Datenmenge –
  beide Änderungen stehen hinterher in der Datei.
- **Zwischenspeicher als Zweitschrift:** Die Datei ist der Bestand. Läuft der
  Zwischenspeicher voll, schneidet das den Weg in die Datei nicht ab.
- **Ausliefer-Dienst:** hört nur auf 127.0.0.1, liefert nur aus dem Cockpit-Ordner
  aus, weist Ausbruchsversuche mit 403 ab, startet keinen zweiten Dienst auf
  anderem Port.

## 6. Bekannte Grenzen

- **Zwischenspeicher:** Der Bestand wächst um etwa 480 KB je Jahr. Bei rund
  10 Jahren wäre die Grenze des Browsers erreicht. Die Archiv-Erinnerung meldet
  sich lange vorher – ab drei Jahren.
- **Ein Klick nach dem Browser-Neustart:** Die Rechtefreigabe verlangt einen
  Menschen. Das lässt sich nicht automatisieren und soll es auch nicht.
- **PowerShell-Sperre:** Wo Skripte verboten sind, bleibt nur das direkte Öffnen
  der Datei – dann mit erneutem Verbinden nach jedem Neuladen.

## 7. Ergebnis

Alle Suiten ohne Fehlschlag. Die drei neuen Härtetests decken die Bereiche ab,
die vorher ungeprüft waren: Langzeitbestand, volle Speichergrenze und beschädigte
Datei. Drei Fehler wurden dabei gefunden und behoben – zwei davon beim Durchlesen,
nicht durch einen Fehlschlag.
