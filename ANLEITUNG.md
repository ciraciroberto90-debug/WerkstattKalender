# Werkstatt-Kalender – Zusammenfassung & Anleitung

Stand: Juli 2026

Dieses Dokument fasst zusammen, **was die App kann**, **wie sie technisch aufgebaut ist**
und **wie man sie einrichtet und benutzt** – für Roberto (Werkstattleiter), den
Vertreter und alle, die mitlesen oder mitarbeiten.

---

## Inhalt

1. [Was ist die App?](#1-was-ist-die-app)
2. [Wie ist sie aufgebaut? (Technik in Kürze)](#2-wie-ist-sie-aufgebaut-technik-in-kürze)
3. [Einrichtung](#3-einrichtung)
4. [Rollen & Rechte](#4-rollen--rechte)
5. [Die Bereiche im Detail](#5-die-bereiche-im-detail)
6. [Störungen (Schichtbuch)](#6-störungen-schichtbuch)
7. [Datensicherheit – warum nichts verloren geht](#7-datensicherheit--warum-nichts-verloren-geht)
8. [Updates einspielen](#8-updates-einspielen)
9. [Alte und neue Version gleichzeitig](#9-alte-und-neue-version-gleichzeitig)
10. [Grenzen](#10-grenzen)
11. [Häufige Fragen](#11-häufige-fragen)

---

## 1. Was ist die App?

Der **Werkstatt-Kalender** (`Werkstatt_Kalender_TPM.html`) ist ein einziges HTML-Programm,
das komplett **im Browser** läuft – ohne Installation, ohne Anmeldung, ohne eigenen Server.
Es bündelt die tägliche Werkstattorganisation an einem Ort:

- **Übersicht (Cockpit)** – Kennzahlen, was heute ansteht, offene Störungen, Pinnwand
- **Schichtplan** – Früh/Spät/Nacht je Person, Monatsmatrix
- **Planung** – Arbeitsverteilung je Tag/Person (Excel-KW-Stil)
- **Backlog** – Sammlung offener Arbeiten mit Prioritäten
- **TPM-Plan & R+I** – wiederkehrende Wartungen und Inspektionen
- **Pinnwand** – Notizen für alle (z. B. Übergabe an den Vertreter)
- **Störberichte** – digitales Schichtbuch Instandhaltung / Nachdokumentation (siehe Kapitel 6)
- **Werkstatt-Monitor** – Vollbild-Anzeige für einen Hallenbildschirm
- **Auswertung** – Ausfallzeiten, Störungshäufigkeit, Mechanik/Elektrik, Fehlerart

---

## 2. Wie ist sie aufgebaut? (Technik in Kürze)

Die App ist **serverless / lokal-first**:

| Teil | Was es ist | Wo es liegt |
|------|-----------|-------------|
| **App** | Oberfläche **und** die ganze Logik | `Werkstatt_Kalender_TPM.html` (Laufwerk oder OneDrive) |
| **Daten** | die eigentlichen Einträge (Kalender, Schicht, Backlog …) | `werkstatt-kalender-daten.json` auf **OneDrive** |
| **Störungen** | eigene, für alle beschreibbare Datei | `werkstatt-stoerungen.json` auf **OneDrive** |
| **Sync** | verteilt die Dateien auf alle Geräte | **OneDrive** (Explorer-Synchronisation) |

Es gibt **keinen Backend-Server**. Die JSON-Dateien sind der gemeinsame Datenspeicher
(quasi eine einfache „Datenbank in Dateiform"), OneDrive ist der „Fileserver", der sie
synchronisiert. Die gesamte Zusammenführungs- und Sicherheitslogik steckt in der App.

> **Voraussetzung:** Die gemeinsame Nutzung braucht **Microsoft Edge oder Google Chrome**
> (Desktop). In Firefox/Safari funktioniert die Datei-Anbindung nicht.

---

## 3. Einrichtung

### 3.1 App-Datei bereitstellen (einmalig)

Die `Werkstatt_Kalender_TPM.html` an einen Ort legen, den alle öffnen können – entweder
im gemeinsamen OneDrive-Ordner oder auf dem Firmenlaufwerk. Auf jedem PC eine
**Desktop-Verknüpfung** darauf anlegen. (Die HTML wird nur *geöffnet/gelesen*, nie
beschrieben – deshalb ist das Laufwerk hier unproblematisch.)

### 3.2 Daten-Datei verbinden (einmalig pro Gerät)

1. App öffnen → oben rechts das **Ordner-Symbol** → **„Vorhandene Datei öffnen …"**
2. Die `werkstatt-kalender-daten.json` im gemeinsamen OneDrive-Ordner auswählen.
3. Der Browser merkt sich die Datei. Nach einem Browser-Neustart einmal auf
   **„Jetzt verbinden"** klicken – ein Klick, fertig.

Gibt es noch keine Daten-Datei, legt der erste Nutzer sie über **„Neue Datei anlegen …"**
im selben Ordner an.

### 3.3 Störungen-Datei verbinden (einmalig, eigene Datei)

Die Störungen liegen **bewusst in einer eigenen Datei**, die **alle** bearbeiten dürfen –
auch reine Leser der Hauptdaten.

1. **Einmal anlegen (macht Roberto):** Reiter **Störungen** → **„neu anlegen …"** →
   im **selben OneDrive-Ordner** als `werkstatt-stoerungen.json` speichern.
2. **In OneDrive freigeben:** diese Datei **mit „Bearbeiten" an alle** teilen (auch an die,
   die die Hauptdaten nur ansehen dürfen).
3. **Auf jedem Gerät verbinden:** Reiter **Störungen** → **„Störungen-Datei öffnen …"** →
   die Datei auswählen. Wird danach dauerhaft gemerkt.

> Diese Datei nur **ein einziges Mal** anlegen. Bei App-Updates nichts neu machen.

### 3.4 Konflikt-Wächter (optional, empfohlen)

OneDrive legt bei zeitgleichen Änderungen manchmal „Konfliktkopien" an
(`…-PCNAME.json`). Der **Konflikt-Wächter** sammelt solche Kopien automatisch ein und
führt ihren Inhalt zusammen. Einrichtung: im Dialog **Gemeinsame Datei** den
OneDrive-Ordner einmalig freigeben. Danach läuft es von selbst.

---

## 4. Rollen & Rechte

Die App unterscheidet automatisch anhand der **OneDrive-/Laufwerks-Rechte**:

- **Bearbeiter** (Schreibrecht auf die Daten-Datei): sehen und ändern alles.
- **Nur-Leser** (nur Ansehen-Recht): sehen Übersicht, Schichtplan, Planung, Störungen und
  den TPM-Plan – können die **Hauptdaten aber nicht ändern** (blaue „Schreibschutz"-Leiste).

**Wichtige Ausnahme – Störungen:** Die Störungen-Datei ist für **alle** freigegeben.
Deshalb dürfen **auch Leser** Störungen anlegen, bearbeiten und löschen – aber nur die
Störungen, nicht den Rest.

---

## 5. Die Bereiche im Detail

- **Übersicht / Cockpit:** Kennzahlen (heute fällig, erledigt, überfällig, Monats-/Jahresquote),
  „Heute da" (aktuelle Schicht), **offene Störungen als Gedankenstütze**, Tagesliste und
  **Pinnwand**. Neue Pinnwand-Notizen über das **+**; Notizen lassen sich **anheften** (📌),
  auf den **Monitor** legen (📺) und **veröffentlichen** (🌐, dann auch für Nur-Leser sichtbar).
- **Schichtplan:** Monatsmatrix, je Person und Tag eine Schicht (Früh/Spät/Nacht u. a.).
- **Planung:** Tage untereinander, je Person die eingeplanten Arbeiten/Notizen; springt beim
  Öffnen direkt zum heutigen Tag.
- **Backlog:** offene Arbeiten mit Gewerk, Priorität, Anlage, Zuständigem; filter- und durchsuchbar.
- **TPM → Übersicht:** ein digitales **TPM-Board**, das beim Klick auf **TPM** zuerst öffnet.
  Holt das Team ab und erklärt kurz, **was** TPM und R+I sind und **warum** sie wichtig sind
  (Sicherheit, Verfügbarkeit, Nachweis). Darunter jeder **R+I-Punkt aufklappbar** mit
  **Info-Text, Rechtsgrundlage und Link** – ein Nachschlagewerk für die Werkstatt.
- **TPM → Plan / R+I:** wiederkehrende Wartungen und Inspektionen mit Terminlogik.
- **Einstellungen (⚙ oben rechts):** Anlagen, R+I-Punkte (inkl. **Info / Rechtsgrundlage / Link**
  je Punkt für die TPM-Übersicht), **Team**, **Schichtarten**, **Anlagenteile** (für Störberichte)
  und die **lokalen Sicherungen** dieses Geräts.
  → **Grundeinstellungen immer aus der aktuellen App-Version pflegen** (siehe Kapitel 9).

---

## 6. Störberichte (Schichtbuch)

Der Reiter **Störungen** ist euer digitales Schichtbuch Instandhaltung.

> **Wichtig – es ist eine Nachdokumentation, kein Melde-Tool:** Mechaniker und
> Elektriker halten hier **nach der Behebung** fest, was war und was getan wurde.
> Das eigentliche *Melden* einer Störung läuft bei euch über einen anderen Weg.
> Deshalb heißt die Aktion **„Störbericht erfassen"**, nicht „melden".

### Aufbau der Liste
- **Nach Datum gruppiert**, aufklappbar. Jeder Tag zeigt die **Ausfallzeit-Summe** (in
  Minuten) und die Zahl der offenen Berichte.
- Tag aufklappen → **Schichten Früh/Spät/Nacht** als eigene aufklappbare Zeilen (je mit
  ihrer Ausfallzeit-Summe).
- Schicht aufklappen → **kompakte Zeilen**: Uhrzeit + Anlage (· Anlagenteil) links,
  Beschreibung rechts, Ausfallzeit (**Minuten**) und Status (offen / behoben).

### Suche
Ein **🔍 Suchfeld** über der Liste durchsucht **alle** Berichte quer durch die Historie
(Anlage, Anlagenteil, Beschreibung, Ursache, Maßnahme, Bearbeiter, Fehlerart) und zeigt
die Treffer als flache Liste.

### Störbericht öffnen, ansehen, bearbeiten
- **Klick auf eine Zeile** öffnet den kompletten Bericht als **Popout – zunächst nur lesend.**
- Im Popout siehst du zusätzlich **♻️ frühere Berichte derselben Anlage** (Wiederholungsfehler
  auf einen Blick).
- Erst der Knopf **🔓 Bearbeiten** „entsichert" den Bericht und zeigt alle Möglichkeiten
  (Felder ändern, Status, **Löschen**).
- **🖨 Drucken** erzeugt ein sauberes **A4-Blatt** (eigenes Druckfenster, mit
  Unterschriftszeilen). Hinweis: im Browser ggf. einmal Popups für die Seite erlauben.
- **→ Backlog** übernimmt eine offene *Zu Planende Maßnahme* als Backlog-Aufgabe
  (nur mit Schreibrecht auf die Hauptdaten).

### Einen Störbericht erfassen
Über **„📝 Störbericht erfassen"**. Felder (**\*** = Pflicht):
- **Status \*** Offen / Erledigt – **nicht vorausgewählt**, muss aktiv gewählt werden.
- **Datum** (Vorgabe heute) und **Schicht \*** Früh/Spät/Nacht.
- **Anlage \*** und **Anlagenteil** (Teile werden im ⚙-Dialog gepflegt).
- **Gewerk** 🔧 Mechanik / ⚡ Elektrik / 🔧⚡ Beide und **Fehlerart**
  (Hydraulisch, Elektrisch, Pneumatisch, Verschleiß, Steuerung/Software …).
- **⏱ Ausfallzeit** in Minuten (orange) – bei *Erledigt* zusätzlich **✓ Behoben am** (frei setzbar).
- **Störungs Beschreibung \***, **Störungs Ursache**, **Sofort Maßnahme**.
- **🧩 Ersatzteile / Material** (+ Haken „nachbestellt").
- bei Status *Offen* zusätzlich **Zu Planende Maßnahme**.
- **Bearbeiter (Kürzel)** – wird für das nächste Mal gemerkt.

Bei Status **Erledigt** sind **Ursache** und **Sofort Maßnahme** Pflicht, damit die
Dokumentation vollständig ist.

### Auswertung
Umschalter **Liste | Auswertung**, Zeitraum wählbar (Monat / Jahr / Alle):
- Kennzahlen: Anzahl, offen, **Ausfallzeit gesamt**, Ø je Störung (alles in Minuten).
- **Ausfallzeit je Anlage** und **Anzahl Störungen je Anlage** (Balken).
- **Ausfallzeit je Monat** (Säulenverlauf).
- **Mechanik / Elektrik** (Verteilung nach Gewerk).
- **Fehlerart** (Verteilung nach Fehlerbild).

---

## 7. Datensicherheit – warum nichts verloren geht

Die App ersetzt einen Backend-Server durch mehrere Schutzmechanismen:

- **Zusammenführen pro Eintrag** statt „Datei ersetzen": Beim Speichern wird der aktuelle
  Dateistand gelesen und Eintrag für Eintrag gemerged (neuerer Zeitstempel gewinnt).
- **Optimistische Sperre + Kontroll-Lesung:** Nach dem Schreiben wird zurückgelesen und
  geprüft, ob die eigene Änderung wirklich drinsteht.
- **Selbstheilung:** Ein Hintergrund-Check gleicht sehr seltene Zeitfenster automatisch aus.
- **Tombstones:** Absichtlich Gelöschtes wird nicht durch alte Kopien wiederbelebt.
- **Konflikt-Wächter:** OneDrive-Konfliktkopien werden automatisch eingesammelt.
- **Lokale Sicherungen:** je Gerät die letzten 30 Stände (⚙ → Sicherungen).
- **OneDrive-Versionsverlauf:** zusätzlicher Rettungsanker in OneDrive selbst.

Zwei getrennte Dateien (Hauptdaten + Störungen) nutzen **denselben** erprobten Sync-Code.

---

## 8. Updates einspielen

Da alle **eine** App-Datei öffnen, ist ein Update denkbar einfach:

1. Neue `Werkstatt_Kalender_TPM.html` an den bekannten Ort legen (**gleicher Dateiname**,
   „Ersetzen" bestätigen).
2. Beim Laufwerk/OneDrive den Sync-Haken abwarten.
3. Alle haben die neue Version beim nächsten Öffnen oder mit **F5**.

Die Verbindungen zu den Daten-Dateien bleiben dabei erhalten – niemand muss etwas neu auswählen.

---

## 9. Alte und neue Version gleichzeitig

Wenn jemand kurzzeitig mit einer **alten** und ein anderer mit einer **neuen** Version arbeitet:

- **Tägliche Daten (Kalender, Schicht, Backlog, Notizen) und Störungen: kein Verlust.**
  Das Zusammenführen arbeitet pro Eintrag, und unbekannte Felder werden beim Bearbeiten
  mitkopiert. Störungen liegen in einer eigenen Datei, die eine alte Version gar nicht anfasst.
- **Einzige Ausnahme – die ⚙ Einstellungen:** Anlagen/Team/Schichtarten/Anlagenteile werden
  als ganzer Block gespeichert. Speichert jemand mit einer **alten** Version im ⚙-Dialog,
  kann er neuere Felder (z. B. Anlagenteile) überschreiben.
  → **Regel:** Grundeinstellungen immer aus der **aktuellen** Version pflegen.

Deshalb kann Roberto gefahrlos ständig weiterentwickeln und live testen.

---

## 10. Grenzen

- **Handy/Tablet:** Die gemeinsame-Datei-Technik gibt es nur in **Desktop-Edge/Chrome**.
  Auf iPhone/den meisten Handy-Browsern funktioniert sie **nicht** – echte mobile Nutzung
  mit Sync bräuchte einen echten Server.
- **Sehr viele gleichzeitige Bearbeiter:** ausgelegt auf eine Handvoll; bei dutzenden
  Gleichzeitig-Schreibern gäbe es mehr Konfliktkopien.
- **Kein Echtzeit-Sekundentakt:** Änderungen erscheinen in Sekunden bis ~½ Minute.

Für Werkstatt-PCs mit ein paar Bearbeitern und Lesern sind das keine spürbaren Nachteile.

---

## 11. Häufige Fragen

**Brauche ich noch das Firmenlaufwerk?**
Für den Kalender nicht – OneDrive übernimmt Teilen, Sync und Rechte. Das Laufwerk kann für
die App-Datei genutzt werden (nur Lesen), muss aber nicht.

**Muss ich die Störungen-Datei neu anlegen?**
Nur **einmalig**, weil sie neu ist. Danach nie wieder – auch nicht bei App-Updates.

**Nach dem Browser-Neustart steht „getrennt".**
Einmal auf **„Jetzt verbinden"** klicken. Aus Sicherheitsgründen fragt der Browser einmal nach.

**Ein Leser sieht die vollen Bearbeiter-Tabs nicht.**
Richtig so – das ist der Schreibschutz. Störungen darf er trotzdem pflegen.

**Es erscheinen `…-PCNAME.json`-Dateien in OneDrive.**
Das sind Konfliktkopien. Mit eingerichtetem Konflikt-Wächter verschwinden sie automatisch.

---

*Technische Details zur Sync-Logik stehen im Quellcode unter `app/src/sharedfile.js`.
Automatisierte Härtetests liegen unter `tests/hardness/`.*
