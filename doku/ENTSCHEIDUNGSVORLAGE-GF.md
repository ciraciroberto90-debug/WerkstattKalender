# Entscheidungsvorlage: Freigabe „Werkstatt-Cockpit"

**An:** Geschäftsführung
**Von:** R. Ciraci, Werkstattleiter
**Datum:** 10.08.2026
**Entscheidung:** Freigabe des Werkstatt-Cockpits als offizielles Arbeitsmittel
der Instandhaltung – mit den unten genannten vier Auflagen.

---

## 1. Worum es geht

Die Werkstatt (8 Mitarbeiter + Leitung) arbeitet seit mehreren Wochen produktiv
mit einer selbst aufgebauten Planungs- und Dokumentations-Software: Schichtplan,
Arbeitsplanung, digitales Schichtbuch (Störberichte), Wartungs- und
Inspektionsplanung (TPM/R+I) mit druckfertigem Prüfnachweis, OEE-Anzeige live
aus der bestehenden Excel-Auswertung, Pinnwand und Hallenmonitor. Seit dem
10.08. läuft sie auf allen Werkstatt-Rechnern als eigenständiges Programm, die
Daten liegen ausschließlich auf dem Firmenlaufwerk (OneDrive wurde abgelöst),
der Zugriff ist über eine Benutzerverwaltung mit Rollen (Verwalter /
Bearbeiter / Leser) geregelt.

Diese Vorlage beantragt die formale Freigabe und benennt ehrlich Kosten,
Einsparung, Risiken und die Grenze, ab der eine Kauf-Software die bessere
Wahl wäre.

## 2. Was die Software kann – und was nicht

**Kann sie (im Tagesbetrieb bewährt):**

| Funktion | Ersetzt bisher | Reife |
|---|---|---|
| Schichtplan (Monatsmatrix, Feiertage, Aushang-Druck je KW) | Excel-Blatt | hoch |
| Arbeitsplanung je Tag/Person inkl. Wartungsplan | Excel + Zuruf | hoch |
| Störberichte/Schichtbuch (Nummern, Suche, Historie je Anlage, A4-Druck, Ausfallzeiten-Auswertung) | Papier-Schichtbuch | hoch |
| TPM/R+I mit Terminlogik und **druckfertigem Jahres-Prüfnachweis** | Hand-Nachweise | hoch – Kernstärke |
| OEE live aus der bestehenden Pivot-Excel, mit Monats-/Jahresverlauf | manuelles Nachschauen | neu, an der echten Tabelle nachgewiesen |
| Pinnwand (Übergaben), Werkstatt-Monitor für den Hallenbildschirm | Zettel | hoch |
| Benutzerrollen, gemeinsame Datei mit Eintrag-für-Eintrag-Zusammenführung, automatische lokale Sicherungen | – | hoch, außergewöhnlich intensiv getestet |

**Kann sie nicht (bewusst, siehe Abschnitt 6):** Ersatzteil-Lager mit
Bestellwesen, mobile Erfassung per QR-Code, echter Mehr-Standort-Betrieb,
revisionssicherer (unveränderbarer) Audit-Trail. Die Benutzerrechte sind eine
Leitplanke gegen Versehen, kein kryptografisches Schloss – echte
Zugriffskontrolle leisten die Laufwerksrechte der IT.

**Qualitätsstand (gemessen, nicht behauptet):** 41 automatische Testsuiten mit
rund 700 Einzelprüfungen laufen vor jeder Auslieferung, zusätzlich 18 Prüfungen
gegen das echte installierte Programm – inklusive Härtefällen wie beschädigter
Datei, falsch gehender Rechneruhr, zwei gleichzeitig offenen Fenstern und
sieben Jahrgängen Testdaten (16 951 Einträge). Stand 10.08.: alles fehlerfrei.

## 3. Was es bis heute gekostet hat

| Posten | Betrag |
|---|---|
| Software-Lizenzen | **0 €** |
| Server / Hardware / IT-Aufwand | **0 €** (läuft auf vorhandenen PCs und dem vorhandenen Laufwerk) |
| KI-Werkzeug (Monats-Abo, 2 Monate) | ca. ____ € *(Abo-Preis eintragen; Größenordnung unter 100 €/Monat)* |
| Arbeitszeit Werkstattleiter über 5 Wochen (Anforderungen, Tests am echten System, Einführung) | geschätzt ca. 50 h ≈ **2 500 €** *(bei 50 €/h internem Satz; Schätzung)* |
| **Summe bis heute** | **≈ 2 500–2 700 €** |

Umfang des Ergebnisses zur Einordnung: ca. 25 500 Zeilen Programmcode – davon
9 700 Zeilen automatische Tests –, vollständige Anleitung, Prüfbericht,
Betriebs-Merkzettel; entstanden in 5 Wochen (261 dokumentierte
Entwicklungsschritte). Extern beauftragt entspräche das grob 40–60
Personentagen Individualentwicklung, also einem **Ersatzwert von rund
40 000 €** *(Marktschätzung bei 900 €/Personentag, ungemessen)*.

## 4. Was es spart

**„Mit diesem Programm haben wir im ersten Jahr rund 20 000 € gespart."**
Herleitung – bewusst konservativ, alle Annahmen offen:

1. **Vermiedene Kauf-Software:** Ein Instandhaltungssystem (CMMS) für ~10
   Nutzer kostet marktüblich 30–60 €/Nutzer/Monat plus Einführung. Angesetzt:
   4 200 €/Jahr Lizenz + ~8 000 € einmalige Einführung/Schulung →
   **≈ 12 000 € im ersten Jahr** (danach ≈ 4 200 €/Jahr wiederkehrend).
2. **Zeitgewinn im Betrieb:** Wegfall von Zettelsuche, Doppel-Erfassung,
   Übergabe-Telefonaten; Prüfnachweis entsteht nebenbei statt als
   Jahresend-Aktion. Konservativ 5–10 Minuten je Person und Arbeitstag
   (9 Personen, 220 Tage, 45 €/h interner Satz) →
   **≈ 7 500–15 000 €/Jahr**. *(Annahme – nach 3 Monaten Betrieb mit echten
   Zahlen nachschärfen.)*

Konservative Summe Jahr 1: 12 000 € + 7 500 € ≈ **20 000 €**, bei Kosten von
unter 3 000 €. Ab Jahr 2 wiederkehrend ≈ 12 000–19 000 €/Jahr (Lizenzverzicht
+ Zeitgewinn). Dazu kommt der einmalige Ersatzwert der Entwicklung (~40 000 €)
als geschaffener Vermögenswert – die Daten liegen offen lesbar im Haus, ein
späterer Umstieg auf ein Kaufsystem verliert nichts.

## 5. Risiken – ehrlich benannt, mit Gegenmaßnahme

| Risiko | Einordnung | Gegenmaßnahme (= Auflage) |
|---|---|---|
| **Personenabhängigkeit:** Pflege und Weiterentwicklung hängen am Werkstattleiter | größtes Einzelrisiko; die Software läuft aber auch „eingefroren" unbegrenzt weiter (kein Server, nichts läuft ab) | Auflage 3: Vertreter einweisen, Betriebshandbuch für die IT erstellen |
| Kein Hersteller-Support, keine Gewährleistung | strukturell; gemildert durch Testabdeckung und offene Datenhaltung | Auflagen 1–3 |
| Update-Ordner verteilt Programmstände an alle Rechner | mächtigster interner Hebel | Auflage 2: Schreibrecht eng fassen, EXE durch IT signieren |
| Benutzerrechte sind Leitplanke, kein Schloss | bekannt und dokumentiert | Laufwerksrechte der IT bleiben maßgeblich (Auflage 1) |
| Datenverlust | tägliche Server-Sicherung + automatische lokale Sicherungen je Gerät (14 Tage) | Auflage 1: IT bestätigt Sicherung des Ordners |

Von außen (Internet) ist die Anwendung praktisch nicht angreifbar – es gibt
keinen Server und keine offenen Ports; Details stehen im Sicherheitsabschnitt
der Roll-out-Liste.

## 6. Warum (noch) keine Kauf-Software – und wann doch

Der teuerste Teil jeder Instandhaltungs-Software ist nicht die Lizenz, sondern
Anpassung und Akzeptanz. Beides ist hier bereits vorhanden: Die Software
bildet exakt unsere Abläufe ab und wird von der gesamten Mannschaft täglich
benutzt. Ein Kaufsystem würde heute Geld kosten, Monate Einführung brauchen
und genau dieses Akzeptanzrisiko neu eröffnen.

**Definierte Kaufen-Grenze** (Teil des Beschlusses): Sobald eine der folgenden
Anforderungen real wird, wird die CMMS-Frage neu bewertet – die offene
Datenhaltung macht eine Migration jederzeit möglich:
Ersatzteil-Lager/Bestellwesen · mobile Erfassung mit QR-Codes ·
zweiter Standort im Echtbetrieb · behördlich geforderter revisionssicherer
Audit-Trail · dauerhaft mehr als ~20 Nutzer.

## 7. Beschlussvorschlag

Die Geschäftsführung gibt das Werkstatt-Cockpit als Arbeitsmittel der
Instandhaltung frei, unter vier Auflagen:

1. **IT bestätigt die tägliche Sicherung** des Datenordners auf dem
   Firmenlaufwerk und behält die Ordner-Zugriffsrechte bei sich.
2. **IT signiert die Programm-EXE** und fasst das Schreibrecht auf den
   App-/Update-Ordner eng (Werkstattleiter, Vertreter, IT).
3. **Vertretungsregel:** Der Vertreter wird in Einrichtung und
   Wiederherstellung eingewiesen; ein Betriebshandbuch für die IT wird bis
   ____ erstellt (Punkt existiert bereits in der Roll-out-Liste).
4. **Jährliche Überprüfung** (oder bei Erreichen der Kaufen-Grenze aus
   Abschnitt 6): Nutzen, Kosten und CMMS-Frage werden neu bewertet.

<br>

| | |
|---|---|
| Ort, Datum: ____________________ | Ort, Datum: ____________________ |
| **Geschäftsführung** | **Werkstattleitung** |
| Unterschrift: ____________________ | Unterschrift: ____________________ |

---

*Alle mit „Schätzung/Annahme" gekennzeichneten Zahlen sind als solche zu
lesen; die gemessenen Angaben (Testumfang, Codeumfang, Laufzeit, Betrieb)
stammen aus dem Projekt selbst und sind im Repository nachvollziehbar
(README, Roll-out-Liste, Prüfbericht).*
