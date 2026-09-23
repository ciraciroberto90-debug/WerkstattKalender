# Werkstatt-Cockpit – Zusammenfassung & Anleitung

Stand: 28. Juli 2026

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
6. [Störberichte (Schichtbuch)](#6-störberichte-schichtbuch)
7. [Nachweise, Verlauf und Archiv](#7-nachweise-verlauf-und-archiv)
8. [Datensicherheit – warum nichts verloren geht](#8-datensicherheit--warum-nichts-verloren-geht)
9. [Updates einspielen](#9-updates-einspielen)
10. [Alte und neue Version gleichzeitig](#10-alte-und-neue-version-gleichzeitig)
11. [Grenzen](#11-grenzen)
12. [Häufige Fragen](#12-häufige-fragen)

---

## 1. Was ist die App?

Das **Werkstatt-Cockpit** (`Werkstatt_Kalender_TPM.html`) ist ein einziges HTML-Programm,
das komplett **im Browser** läuft – ohne Installation, ohne Anmeldung, ohne eigenen Server.
Es bündelt die tägliche Werkstattorganisation an einem Ort:

- **Übersicht (Cockpit)** – Kennzahlen, Uhr mit Schichtanzeige, was heute ansteht,
  offene Störungen, Pinnwand
- **Schichtplan** – Früh/Spät/Nacht je Person, Monatsmatrix
- **Planung** – Arbeitsverteilung je Tag/Person (Excel-KW-Stil)
- **Backlog** – Sammlung offener Arbeiten mit Prioritäten
- **TPM-Plan & R+I** – wiederkehrende Wartungen und Inspektionen
- **Prüfnachweis** – druckfertiger Jahresnachweis der R+I-Punkte zum Vorlegen
- **Pinnwand** – Notizen für alle (z. B. Übergabe an den Vertreter)
- **Störberichte** – digitales Schichtbuch Instandhaltung / Nachdokumentation (Kapitel 6)
- **Werkstatt-Monitor** – Vollbild-Anzeige für einen Hallenbildschirm
- **Auswertung** – Ausfallzeiten, Störungshäufigkeit, Mechanik/Elektrik, Fehlerart,
  **Trend der Termintreue über zwölf Monate**
- **Verlauf** – wer hat wann was geändert (letzte 90 Tage)

---

## 2. Wie ist sie aufgebaut? (Technik in Kürze)

Die App ist **serverless / lokal-first**:

| Teil | Was es ist | Wo es liegt |
|------|-----------|-------------|
| **App** | Oberfläche **und** die ganze Logik | `Werkstatt_Kalender_TPM.html` auf dem **Firmenlaufwerk** |
| **Daten** | die eigentlichen Einträge (Kalender, Schicht, Backlog …) | `werkstatt-kalender-daten.json` auf dem **Firmenlaufwerk** |
| **Störungen** | eigene, für alle beschreibbare Datei | `werkstatt-stoerungen.json` auf dem **Firmenlaufwerk** |
| **Sync** | alle greifen direkt auf denselben Ordner zu | das **Firmenlaufwerk** (`\\SCHEUDC1\…`) – kein Abgleich nötig |

Es gibt **keinen Backend-Server**. Die JSON-Dateien sind der gemeinsame Datenspeicher
(quasi eine einfache „Datenbank in Dateiform"), das Firmenlaufwerk ist der „Fileserver".
Die gesamte Zusammenführungs- und Sicherheitslogik steckt in der App.

> **Voraussetzung:** Die gemeinsame Nutzung braucht **Microsoft Edge oder Google Chrome**
> (Desktop). In Firefox/Safari funktioniert die Datei-Anbindung nicht.

---

## 3. Einrichtung

### 3.1 App-Datei bereitstellen (einmalig)

Die `Werkstatt_Kalender_TPM.html` an einen Ort legen, den alle öffnen können – den
gemeinsamen Ordner auf dem Firmenlaufwerk. (Die HTML wird nur
*geöffnet/gelesen*, nie beschrieben – deshalb ist das Laufwerk hier unproblematisch.)

**Geöffnet wird sie nicht mehr direkt per Doppelklick, sondern über einen kleinen
Ausliefer-Dienst auf dem eigenen Rechner.** Grund: Chrome merkt sich seit Version 147
den Dateizugriff nicht mehr, wenn eine Seite als Datei (`file://…`) geöffnet wird – die
Daten-Datei müsste dann nach jedem Neuladen neu herausgesucht werden. Über
`http://localhost:8765/` bleibt die Verbindung erhalten wie früher.

Einrichtung je Arbeitsplatz, etwa fünf Minuten:

1. `arbeitsplatz/Werkstatt-Cockpit-Start.zip` entpacken, Ordner `Cockpit` auf den Rechner legen
   (Desktop oder `C:\Werkstatt`) – **nicht** in den Netzwerkordner, dort sind keine
   Rechte nötig.
2. Doppelklick auf `Cockpit starten.cmd`.
3. Desktop-Verknüpfung darauf anlegen, umbenennen in „Werkstatt-Cockpit",
   unter Eigenschaften → *Ausführen* auf **Minimiert** stellen.
4. Dieselbe Verknüpfung nach `shell:startup` kopieren, dann startet der Dienst
   beim Anmelden von allein.
5. **Alte Verknüpfung auf die HTML-Datei löschen**, sonst öffnet jemand versehentlich
   wieder die Variante, die sich nichts merkt.

Vollständige Beschreibung samt Fehlerbildern: `arbeitsplatz/Anleitung-Arbeitsplatz.md`.

> **Beim ersten Start über die neue Adresse ist der lokale Speicher leer.** Das ist
> harmlos – erst die Dateien verbinden (3.2 und 3.3), dann steht alles wieder da.
> Nur der **eigene Name** muss neu eingetragen werden (3.4): Er ist absichtlich
> geräteweise gespeichert und kommt nicht aus der gemeinsamen Datei.

### 3.2 Daten-Datei verbinden (einmalig pro Gerät)

1. App öffnen → oben rechts das **Ordner-Symbol** → **„Vorhandene Datei öffnen …"**
2. Die `werkstatt-kalender-daten.json` im gemeinsamen Werkstatt-Ordner auf dem Laufwerk auswählen.
3. Der Browser merkt sich die Datei. Nach einem Browser-Neustart einmal auf
   **„Jetzt verbinden"** klicken – ein Klick, fertig.

Gibt es noch keine Daten-Datei, legt der erste Nutzer sie über **„Neue Datei anlegen …"**
im selben Ordner an.

> **Rote Leiste: „Dieser Browser gibt die gemerkte Datei nicht mehr frei"**
>
> Diese Leiste erscheint nur, wenn die App noch **direkt als Datei** geöffnet wird
> (`file://…`) – auf einem Arbeitsplatz, der nach 3.1 eingerichtet ist, kommt sie
> nicht vor. Ab Chrome 147 ist ein gemerkter Dateiverweis dort unbrauchbar: Der
> Browser antwortet auf ihn überhaupt nicht mehr, weder mit einer Freigabe noch mit
> einer Ablehnung.
>
> - **Sofort weiterarbeiten:** in der roten Leiste auf **„Datei auswählen …"** klicken
>   und dieselbe Datei erneut wählen. Es geht nichts verloren.
> - Steht danach *Schreibschutz*, den zweiten Knopf **„Mit Schreibrecht verbinden …"**
>   nehmen: dieselbe Datei wählen, **„Ersetzen"** bestätigen. Der Inhalt wird vorher
>   gelesen und zusammengeführt, nicht überschrieben.
> - **Dauerhaft behoben** ist es mit dem Ausliefer-Dienst aus 3.1.
>
> Beide Öffnungsarten dürfen nebeneinander laufen – sie lesen und schreiben dieselben
> Dateien. Wo PowerShell gesperrt ist, bleibt der alte Weg also benutzbar, nur mit dem
> zusätzlichen Klick nach jedem Neuladen.

### 3.3 Störungen-Datei verbinden (einmalig, eigene Datei)

Die Störungen liegen **bewusst in einer eigenen Datei**, die **alle** bearbeiten dürfen –
auch reine Leser der Hauptdaten.

1. **Einmal anlegen (macht Roberto):** Reiter **Störungen** → **„neu anlegen …"** →
   im **selben Werkstatt-Ordner** als `werkstatt-stoerungen.json` speichern.
2. **Rechte prüfen (IT-Freigabe):** diese Datei braucht **Schreibrecht für alle** (auch für die,
   die die Hauptdaten nur ansehen dürfen).
3. **Auf jedem Gerät verbinden:** Reiter **Störungen** → **„Störungen-Datei öffnen …"** →
   die Datei auswählen. Wird danach dauerhaft gemerkt.

> Diese Datei nur **ein einziges Mal** anlegen. Bei App-Updates nichts neu machen.

Seit dem 21.09. stehen dieselben Wege auch in der **Dateiverwaltung** (Ordner-Symbol
oben rechts → Dialog „Gemeinsame Datei"), im Abschnitt **Störberichte-Datei**:
neu anlegen, vorhandene öffnen (auch zum Wechseln auf eine andere Datei), mit
Schreibrecht verbinden und trennen – mit Kennkarte der verbundenen Datei
(Einträge, Größe, letzte Änderung). Der Abschnitt steht auch Lesern offen.

### 3.4 Namen eintragen (einmalig pro Gerät, wichtig)

**⚙ → „Dein Name (dieses Gerät)"**, z. B. `R. Ciraci`.

Der Name wird als Urheber in den **Verlauf** geschrieben und bei Störberichten als
Bearbeiter vorgeschlagen. Er bleibt auf dem jeweiligen Gerät und wandert nicht in die
gemeinsame Datei. **Wer keinen Namen einträgt, erscheint im Verlauf als „Unbekannt"** –
damit ist der Verlauf für diesen Arbeitsplatz wertlos. Zwei Minuten Aufwand pro PC.

> Ist die **Benutzerliste** eingerichtet (Kapitel 4), entfällt dieser Schritt:
> Die Anmeldung trägt den Benutzernamen automatisch als Gerätenamen ein.

### 3.5 Konflikt-Wächter (optional, empfohlen)

Nur relevant, falls die Datei je in einem per Cloud synchronisierten Ordner liegt –
auf dem Firmenlaufwerk entstehen keine Konfliktkopien. Sync-Programme legen bei
zeitgleichen Änderungen Kopien an (`…-PCNAME.json`). Der **Konflikt-Wächter** sammelt
solche Kopien automatisch ein und führt ihren Inhalt zusammen. Einrichtung: im Dialog
**Gemeinsame Datei** den Ordner einmalig freigeben. Danach läuft es von selbst.

### 3.6 OEE aus einer Excel-Tabelle (optional)

Auf der Übersicht kann eine Kachel den **OEE-Wert direkt aus einer
Excel-Tabelle** anzeigen. Einmal eingerichtet, gilt das für alle – die
Einrichtung steht in der gemeinsamen Datei.

**Einrichten:** ⚙ → Reiter **OEE** → **„Ordner wählen …"** (der Ordner auf
dem Firmenlaufwerk, in dem die Tabelle liegt – oder den Pfad einfach in die
Zeile einfügen) → Datei und Tabellenblatt wählen → **„OEE-Quelle übernehmen"**.

Zwei Dinge sind dabei getrennt:

- Der **Ordner** gilt für *dieses Gerät*. Ein Ordnerzugriff lässt sich nicht
  weitergeben – er gilt nur in dem Browser, der ihn erteilt bekommen hat.
  Jeder Arbeitsplatz wählt ihn also einmal selbst; nach einem Browser-Neustart
  genügt ein Klick auf „wieder freigeben".
- **Dateiname und Spaltenzuordnung** stehen in der gemeinsamen Datei und
  gelten *für alle*. Das wird einmal eingerichtet, nicht an jedem Rechner.

Liegt die Tabelle ausnahmsweise im Datenordner, genügt dessen Freigabe – dann
wird dort gesucht, und der zweite Ordner entfällt.

Die Spalten erkennt die App an den Überschriften (*Datum, Uhrzeit, Anlage,
Schicht, OEE, Verfügbarkeit, Leistung, Qualität*); jede Zuordnung lässt sich
darunter von Hand ändern. **Auch Pivot-Tabellen werden verstanden:** Ein über
mehrere Zeilen verteilter Kopf wird zusammengesetzt („Gesamt:" über „OEE%n"
ergibt *Gesamt: OEE%n*), bei mehreren OEE-Spalten gewinnt die Gesamt-Spalte,
und Zwischenzeilen (FRÜH/MITTAG/NACHT) zählen nicht doppelt. **Hat die
Tabelle eine GES-/Gesamtergebnis-Zeile, zeigt die Kachel genau diese Zahl** –
das ist die Zahl, die zählt; der Zeitraum ist dann der in Excel gefilterte.
Der jüngste Tag steht zur Einordnung im Tooltip und in der Übersicht.

**Was die Kachel zeigt:** ohne Summenzeile das Mittel über **alle Anlagen der
letzten 24 Stunden**, dazu den Pfeil zum Vergleich mit den 24 Stunden davor.
Ein **Klick auf die Kachel** öffnet die Auswertung: **Monatsverlauf**
(Tageswerte des jüngsten Monats) und **Jahresverlauf** (Monatsmittel) als
Punkt-Linien-Kurve wie bei der TPM-Termintreue, die Punkte in Ampelfarben
– und darunter, sofern die Tabelle je Anlage
liefert, jede Anlage mit ihrem Wert, die schlechteste oben, denn die ist der
Grund hinzuschauen. Steht der Pivot-Filter nur auf einem Monat, ist der
Jahresverlauf entsprechend kurz – für das volle Bild in Excel den Filter auf
das ganze Jahr stellen.

Für „letzte 24 Stunden" braucht jede Zeile einen Zeitpunkt. Die App nimmt in
dieser Reihenfolge: eine **Uhrzeitspalte**, eine **Uhrzeit im Datum**, sonst
den Beginn der genannten **Schicht** (6 / 14 / 22 Uhr, dieselben Grenzen wie
im Schichtplan). Steht in der Tabelle nur ein Datum, wäre ein
24-Stunden-Fenster geraten – dann zeigt die Kachel den jüngsten Tag und
schreibt den Tag auch dazu.

Fehlt eine OEE-Spalte, wird sie aus *Verfügbarkeit × Leistung × Qualität*
gerechnet. Gemittelt wird **ungewichtet** über die Anlagen – ohne Laufzeit
oder Stückzahl je Zeile wäre jede Gewichtung erfunden.

- **Gelesen** wird jede Minute und immer, wenn man aus Excel in die App
  zurückklickt – aber nur, wenn Excel die Datei wirklich geändert hat.
- **Geschrieben wird nie.** Die Tabelle gehört jemand anderem; der Ordner wird
  ausdrücklich nur *lesend* angefragt, die App kann auf dem Laufwerk nichts
  verändern.
- **Hinkt die Tabelle hinterher** – steht in den letzten 24 Stunden nichts
  darin –, sagt die Kachel das („veraltet") und nennt in der Übersicht, wie
  viele Stunden der jüngste Eintrag zurückliegt. Eine alte Zahl darf nicht wie
  eine frische aussehen.
- Fehlt die Datei oder passt die Zuordnung nicht, sagt die Kachel das
  ausdrücklich. Es erscheint **nie** eine erfundene Zahl.
- Prozente dürfen als `0,87` oder als `87` in der Tabelle stehen, Datumsangaben
  als echtes Datum oder als Text (`05.08.2026`, `2026-08-05`).

---

## 4. Rollen & Rechte

Es gibt **zwei Ebenen**, und beide müssen schreiben erlauben:

**Ebene 1 – die Datei-Rechte** (Laufwerksrechte der IT).
Wer die Daten-Datei nur ansehen darf, kann auch mit Tricks nichts speichern –
das ist das echte Schloss.

**Ebene 2 – die Benutzerliste in der App** (⚙ → **Benutzer & Rechte**, eigener
Reiter seit dem 21.09., nur für Verwalter). Sie ist freiwillig: Solange keine Benutzer angelegt sind, verhält
sich die App wie immer. Legt der Werkstattleiter Benutzer an, fragt die App
auf jedem Gerät **einmal** nach dem Benutzernamen (plus Kennwort, falls
vergeben) und merkt sich die Wahl. Drei Rollen:

- **Verwalter** – schreiben und die Benutzerliste pflegen (Werkstattleiter + Vertreter).
- **Bearbeiter** – schreiben.
- **Leser** – nur ansehen (blaue „Schreibschutz"-Leiste).

**Ohne Anmeldung ist die App grundsätzlich Nur-Leser** – im Anmelde-Fenster
führt „Nur ansehen (ohne Anmeldung)" direkt in die Ansicht (wie ein Aushang),
oben rechts steht dann ein blauer **Anmelden**-Knopf für später. Schreiben
gibt es nie ohne Anmeldung.

Die Anmeldung ist ein **Schreibfeld, keine Auswahlliste** – der Dialog verrät
die Benutzernamen nicht, und bei falschem Namen oder Kennwort kommt bewusst
dieselbe Meldung. Groß-/Kleinschreibung des Namens ist egal.

Die Liste liegt in der gemeinsamen Datei: Eine Rechteänderung im ⚙ gilt sofort
für alle. Kennwörter stehen nie im Klartext in der Datei. Der letzte Verwalter
kann nicht gelöscht oder herabgestuft werden – sonst könnte danach niemand mehr
Benutzer pflegen. **Abmelden:** der Knopf oben rechts (Tür-Symbol) – für alle
Angemeldeten, auch Leser. Danach lässt sich im Anmelde-Fenster ein anderer
Benutzer eintragen oder über **„Gemeinsame Datei verbinden / wechseln …"**
eine andere JSON-Datei anwählen. Der Sinn der Liste: Die Rechtevergabe hängt
damit **nicht an den Datei-Freigaben des Laufwerks** – alle bekommen dieselbe Datei, wer
was darf, steht in der App.

**Ansichts-Schalter (seit dem 21.09.).** Für den Verwalter ist das Auge oben
rechts ein Schalter: **Cockpit ansehen als Verwalter / Bearbeiter / Leser**.
Damit prüft er in Sekunden, was eine Gruppe nach der Rechte-Tabelle sieht und
darf – eine orange Leiste erinnert daran, „Zurück zur Verwalter-Ansicht" holt
ihn zurück. Der Nachtschicht-Modus steckt im selben Menü. Bearbeiter und Leser
behalten das Auge als Nachtschicht-Modus.

**Gruppen-Verwalter (seit dem 21.09.).** Wer sich in der Leit-Werkstatt
(Scheurich) als **Verwalter** anmeldet, bekommt auf diesem Rechner einen
Gruppen-Pass: In der Kopfzeile erscheint neben dem Standort der Knopf
**„⇄ Soendgen Keramik"**, ein Klick lädt die App mit dem Soendgen-Bestand. Dort
gilt er als Verwalter – ohne in der Soendgen-Benutzerliste zu stehen; Soendgen
sieht davon in seinen Einstellungen nichts (Kopfzeile: „Gruppen-Verwalter").
Zurück geht es genauso. **Abmelden** (auch in Soendgen) nimmt den Pass vom
Rechner. Die Datendateien der anderen Werkstatt müssen auf dem Rechner einmal
verbunden werden (Ordner-Symbol), danach merkt er sie sich je Werkstatt.

**Klar getrennt bleibt alles andere:** Mitarbeiter, Anlagen, Benutzerliste,
Rechte, Regeln, Schichtplan, Störberichte und Zeiterfassung liegen je Werkstatt
in eigenen Dateien; Browser-Zwischenspeicher und Sicherungen sind je Werkstatt
getrennt. Gemeinsam sind nur die Programmdatei und der Update-Ordner.

**Rechte je Gruppe frei einstellen (⚙ → Benutzer & Rechte, nur Verwalter).**
Seit dem 21.09. legt der Verwalter je Bereich fest, was Bearbeiter und Leser
dürfen: **ausgeblendet** (der Reiter fehlt), **nur ansehen** oder
**bearbeiten** – für Schichtplan, Planung, To-do, Störungen, Backlog,
Zeiterfassung, TPM, Pinnwand und Linkstreifen. Aktionen (Drucken,
Werkstatt-Monitor, Datensicherung, Zahnrad, Störung melden) sind je Gruppe
gesperrt oder erlaubt. Der Verwalter selbst ist nie eingeschränkt. Ein Leser
bleibt Nur-Leser (Höchststufe „nur ansehen"); die eine Ausnahme sind
Störberichte, die laut Grundregel auch Leser schreiben dürfen. Die Matrix liegt
in der gemeinsamen Datei und gilt beim nächsten Abgleich auf jedem Rechner.
Ohne eigene Einstellung gilt genau das bisherige Verhalten.

**Schichtplan-Notizen je Gruppe.** An jeder Zellen-Notiz im Schichtplan steht
„Sichtbar für": **Alle** (auch Leser), **Bearbeiter und Verwalter** oder **Nur
Verwalter**. Wer die Notiz nicht sehen darf, sieht weder das rote Eck noch den
gelben Kasten. Bestehende Notizen gelten weiter für alle; der Verwalter sieht
an eingeschränkten Notizen ein kleines Schloss.

**Übersicht je Rechner zusammenstellen (⚙ → Personalisieren, nur Verwalter).**
Welche Bausteine die Übersicht zeigt und in welcher Reihenfolge, wird **je
Rechner** gespeichert – der Morgenrunden-Rechner darf anders aussehen als der
am Schreibtisch. Fünf Layout-Vorlagen (Standard, Morgenrunde, Leitstand,
Planung, Schlank) als Einstieg, danach jeder Baustein einzeln an/aus
(Hinweisleisten, Kennzahlen, TPM-Quote, OEE, Uhr, Heute da, offene Störungen,
Tagesliste, Pinnwand, Linkstreifen) und die vier Abschnitte in der Reihenfolge
tauschbar. „Auf Standard zurücksetzen" holt die gewohnte Übersicht zurück.

**Dieser Rechner (⚙ → Personalisieren, unten).** Startansicht beim Öffnen
(Übersicht, Schichtplan, Berichte, TPM), Zoom 80–150 % für den Hallenbildschirm,
Nachtmodus automatisch in einem Zeitfenster (z. B. 20–6 Uhr) und der
Leser-Rücksprung zur Übersicht in Minuten. Gilt sofort und nur auf diesem Rechner.

**Regeln & Listen (⚙ → Regeln & Listen, für alle Rechner).** Was je Werkstatt
anders ist: das **Bundesland** für die gesetzlichen Feiertage und **eigene freie
Tage** (Betriebsferien, Brückentage – zählen wie Feiertage), die Auswahllisten
**Fehlerart** und **Abwesenheitsgrund**, die **Gewerk-Namen**, **Schwellen und
Ziele** (Störung „lang" ab X Minuten, To-do-Vorwarnung X Tage vor der Frist,
TPM-Quote-Ziel, OEE-Farbgrenzen, Archiv-Erinnerung ab X Jahren),
**Textbausteine** für Pinnwand und Störbericht sowie zusätzliche
**Pflichtfelder** im Störbericht. Übernommen wird mit „Speichern"; ohne eigene
Einstellung gilt der bisherige Stand.

Der direkte Weg: **„Übersicht direkt anordnen"** (oben im Reiter) friert die
Übersicht ein. Jede Kachel bekommt einen orangen Rahmen mit Griff – am Griff
ziehen oder mit den Pfeilen schieben, **✕** blendet aus, **⇄** tauscht
Tagesliste und Pinnwand die Seiten, Ausgeblendetes steht oben in der Leiste
als „+"-Chip zum Zurückholen. Solange der Modus an ist, nimmt der Inhalt
keine Klicks an. **Fertig** oder **Esc** beendet ihn; jede Änderung ist sofort
gespeichert.

> **Ehrlich gesagt:** Die Benutzerliste ist eine **Leitplanke gegen Versehen,
> kein Schloss.** Die App liegt offen auf dem Laufwerk; wer den Datenordner
> öffnen darf, kommt an ihr vorbei, und ohne Kennwort kann jeder jeden Namen
> wählen. Echtes Sperren leisten nur die Datei-Rechte (Ebene 1). Für den
> Werkstattalltag ist das dasselbe Vertrauensmodell wie beim Papier-Schichtbuch.

**Wichtige Ausnahme – Störungen:** Die Störungen-Datei ist für **alle** freigegeben.
Deshalb dürfen **auch Leser** Störungen anlegen, bearbeiten und löschen – aber nur die
Störungen, nicht den Rest.

---

## 5. Die Bereiche im Detail

- **Kachelreihe der Übersicht:** sieben Kacheln in einer Zeile, alle gleich
  groß – *Heute fällig, Heute erledigt, Überfällig, Diesen Monat, Wartung &
  R+I, OEE* und die *Uhr* (Uhrzeit, laufende Schicht, Zeitpunkt der Übergabe).
  Ein Klick auf die OEE-Kachel führt in die Einrichtung (Abschnitt 3.6).
- **Linkstreifen (nur für Bearbeiter):** eine Zeile direkt unter der Menüleiste,
  **auf der Übersicht**. Ein Klick auf einen Chip öffnet die Datei oder die Seite.
  Über **RC/AR** wird zwischen der eigenen Sammlung und der der Vertretung
  umgeschaltet; hinter **🔗 Links** stecken Anlegen, Ändern, Sortieren und Löschen.
  **Ans Benutzerkonto gebunden (seit dem 21.09.):** Im Zahnrad unter
  **Benutzer & Rechte** hat jeder Benutzer das Feld **Link-Sammlung** (Kürzel,
  z. B. RC). Steht dort ein Kürzel, sieht der Benutzer im Streifen **nur diese
  Sammlung** – der Umschalter verschwindet. Ein neues Kürzel legt eine leere
  Sammlung an, die mit dem ersten Link entsteht. Leer = alle Sammlungen mit
  Umschalter, wie bisher.
  Die Sammlung liegt in der gemeinsamen Datei – die Vertretung hat dieselbe Liste
  vor sich. Laufwerks- und Netzwerkpfade öffnen sich direkt, wenn das Cockpit über
  das Desktop-Symbol gestartet wurde; sonst wird der Pfad in die Zwischenablage
  gelegt und im Explorer eingefügt.
- **Störungen:** links die Filterleiste mit denselben Begriffen wie im alten
  Schichtbuch (*nach Datum und Schicht*, *nach Anlage*, *nach Nummer*, *nach
  Status*, *nach Gewerk*), dazu Zeitraum und Schnellzugriff mit Zählern. Jeder
  Störbericht trägt eine **Nummer** aus Jahr und laufender Zahl (`2026-0214`);
  in der Liste steht der hintere Teil. Offene Berichte haben links eine rote
  Kante. Tragen zwei Berichte dieselbe Nummer – möglich, wenn zwei Leute in
  derselben Sekunde melden –, meldet die App das und bereinigt es auf Klick.
  Ganz unten in der Leiste steht **Alle Berichte löschen** für den einen Fall,
  für den es gedacht ist: Testdaten vor dem Roll-out wegräumen.
- **Wer war das?** Jeder Eintrag trägt seinen letzten Urheber mit sich
  (`geaendertVon`), zusätzlich zum Verlauf im ⚙-Dialog. Der Verlauf altert
  nach 90 Tagen heraus und fasst ab vier Änderungen zusammen – am Eintrag
  selbst bleibt der Name dauerhaft. Im Störbericht steht er unten:
  „… · zuletzt geändert von T. Klein". Den eigenen Namen setzt man einmalig
  im ⚙ unter **Dein Name (dieses Gerät)**.
- **Schreibschutz, obwohl du Rechte hast?** Ein Schreibversuch kann auch
  fehlschlagen, weil die Datei gerade **belegt** ist – etwa weil das Cockpit
  in einem zweiten Fenster offen ist oder gerade kopiert wird. Die App meldet
  das, stuft aber nicht mehr dauerhaft auf „nur ansehen" zurück; das tut sie
  nur noch bei einer echten Ablehnung durch Browser oder Laufwerk.

  **Wenn ein Gerät trotzdem im Schreibschutz feststeckt** – etwa noch aus der
  Zeit vor diesem Stand –, gibt es einen Notausgang, der bewusst nicht in der
  Oberfläche steht: Die App über die **Verknüpfung** öffnen (also
  `localhost:8765`, nicht per Doppelklick) und in der Adresszeile
  **`?verwalten=1`** anhängen:

  > `http://localhost:8765/?verwalten=1`

  Im gelben Balken erscheinen dann zwei Knöpfe: **„Schreibzugriff erneut
  versuchen"** und **„Mit Schreibrecht verbinden …"** (dieselbe Datei wählen,
  „Ersetzen" bestätigen – der Inhalt bleibt erhalten, er wird vorher gelesen
  und zusammengeführt). Versteckt sind sie deshalb, weil „Andere Datei
  wählen" für einen echten Nur-Leser zu verlockend wäre.

  **Wichtig: immer über die Verknüpfung arbeiten, nie per Doppelklick.** Der
  Browser führt für `localhost:8765` und `file://` getrennte Merklisten –
  Dateiverweis, Zugriffsmodus, Zwischenspeicher. Per Doppelklick geöffnet
  läuft die App zwar, kennt aber keine Verbindung und verlangt jedes Mal ein
  neues Anwählen der Datei. Genau dabei ist am 03.08. die falsche Datei
  erwischt worden.
- **Welche Datei ist eigentlich verbunden?** Der Browser gibt keinen Pfad
  heraus – zwei Dateien gleichen Namens sind am Namen allein nicht zu
  unterscheiden. Statt eines Pfades zeigt die App deshalb eine **Kennkarte**:
  Name, Zahl der Einträge, Größe und letzte Änderung. Zu sehen im
  Ordner-Symbol (Mauszeiger) und im Teilen-Dialog. Ist der Werkstatt-Ordner
  über den Konflikt-Wächter freigegeben, steht dort zusätzlich der Ordnername.
- **Warnung beim Widerspruch:** Stehen auf dem Rechner Einträge und in der
  eben gewählten Datei **keiner**, fragt die App nach – mit den Kenndaten
  daneben und „Andere Datei wählen …" als erstem Knopf. Genau das hat am
  03.08. gefehlt. Beim Neuanlegen oder beim allerersten Start kommt die Frage
  nicht: Dort ist eine leere Datei zu Recht leer, und eine Rückfrage, die
  jedes Mal erscheint, klickt man irgendwann weg, ohne hinzusehen. Dass eine
  Datei leer ist, steht ohnehin dauerhaft in der Kennkarte. Nur-Leser bekommen
  die Frage nicht – ihnen „Andere Datei wählen" anzubieten wäre dieselbe
  Einladung, die im Schreibschutz-Balken bewusst versteckt ist.
- **Zwei Fenster derselben App:** Sie teilen sich den Zwischenspeicher des
  Browsers. Damit das zweite Fenster nicht die frischen Einträge des ersten
  als „gelöscht" meldet, merkt sich jedes Fenster seinen **eigenen** letzten
  Stand – gelöscht wird nur, was dieses Fenster selbst entfernt hat.
- **Falsche Uhrzeit:** Geht die Uhr eines Rechners nach, tragen seine
  Änderungen ältere Zeitstempel als die der anderen – beim Zusammenführen
  entscheidet aber genau dieser Stempel. Damit dabei nichts verlorengeht,
  bekommt eine Änderung immer einen Stempel **über** dem der Fassung, auf der
  sie beruht. Zusätzlich erscheint ein Hinweis, wenn die Zeitangaben in der
  Datei mehr als drei Minuten in der Zukunft liegen – die Uhrzeiten selbst
  (auch im Prüfnachweis) sind dann nämlich falsch, und das kann nur die
  Windows-Zeit richten.
- **Zwei an einem Bericht:** Ändert jemand anderes einen Störbericht, während
  deine Bearbeiten-Maske offen ist, fragt die App beim Speichern nach – mit
  Namen, Uhrzeit und dem, was in der anderen Fassung steht. Zur Wahl stehen
  **„Andere Fassung übernehmen"** (deine Eingabe wird verworfen) und
  **„Meine Fassung speichern"** (ersetzt die andere). Ohne diese Rückfrage
  würde beim Zusammenführen einfach der spätere Zeitstempel gewinnen – und
  niemand erführe davon.
- **Übersicht / Cockpit:** Kennzahlen (heute fällig, erledigt, überfällig, Monats- und
  Jahresquote als Halbkreis **mit ausgeschriebenem Monatsnamen**), eine **analoge Uhr**
  mit der laufenden Schicht (z. B. *Do., 23.07. · Spät ab 14:00*), „Heute da",
  **offene Störungen als Gedankenstütze**, Tagesliste und **Pinnwand**.
  Neue Pinnwand-Notizen über das **+**; Notizen lassen sich **anheften** (📌)
  und auf den **Monitor** legen (📺, läuft nur bei Zetteln für „Alle").
- **Kennzahlen-Kacheln selbst zusammenstellen (seit dem 23.09.):** Im
  Anordnen-Modus (⚙ → Personalisieren → „Übersicht direkt anordnen") hat
  jede Kachel der Kennzahlen-Reihe ein **▾** im Griff. Es öffnet die Liste
  aller Kennzahlen, die das Cockpit rechnet, nach Themen gruppiert: Termine,
  Quoten, Störungen, To-dos & Team, Einkauf, Sonstiges (auch ein freier
  Text). Oben im Menü wählst du die **Darstellung** – Zahl, Halbkreis,
  Verlauf (6 Monate bzw. Wochen), Ampel oder Top 3 – und den **Zeitraum**
  (Monat, Jahr, 30 Tage, Woche). „+ Kachel hinzufügen" legt weitere Kacheln
  an, ✕ entfernt eigene und blendet feste aus. Dieselbe Wahl gibt es als
  **Tabelle im Zahnrad** (Personalisieren → „Kennzahlen-Kacheln") mit den
  Reitern **Dieser Rechner / Leser-Übersicht / Bearbeiter-Übersicht**: Die
  beiden Gruppen-Reiter sind Vorlagen in der gemeinsamen Datei – jeder
  Leser- oder Bearbeiter-Rechner ohne eigene Anordnung übernimmt sie von
  selbst; das Auge („Ansicht als Leser") zeigt dem Verwalter genau diese
  Vorlage. Ampel und Halbkreis lesen das Quoten-Ziel aus „Schwellen &
  Ziele"; ohne Ziel gilt grün ab 90 %, gelb ab 75 %.
- **Überschneidung: zwei Kollegen ändern denselben Eintrag (seit dem 23.09.):**
  Beim Zusammenführen gewinnt die zuletzt gespeicherte Fassung den ganzen
  Eintrag, es gibt keine Sperre beim Tippen. Wer dabei unterliegt, bekommt
  jetzt oben einen **gelben Hinweis**: wer gewonnen hat, welcher Eintrag,
  und Feld für Feld „dein Wert · jetzt". Zwei Knöpfe: **Meine Fassung
  wiederherstellen** schreibt die eigenen Felder zurück (dann bekommt der
  Kollege denselben Hinweis), **Verstanden** räumt ihn weg. Kein Hinweis,
  wenn ein Kollege auf deiner Fassung weiterarbeitet und nur andere Felder
  ändert. Bei verschiedenen Einträgen geht ohnehin nichts verloren.
- **Pinnwand: wer sieht den Zettel? (seit dem 23.09.):** Beim Schreiben wählt
  das Dropdown **„Sichtbar für"** – 🛡 **Nur Verwalter** (Standard),
  ✏️ Bearbeiter & Verwalter, 👥 Alle (auch Leser), 🔒 Nur ich oder
  👤 Bestimmte Personen (die Benutzer aus „Benutzer & Rechte" zum Ankreuzen).
  Gruppen gelten nach oben: Was Bearbeiter sehen, sieht auch der Verwalter.
  „Nur ich" und „Bestimmte Personen" sind persönlich – außer dem Verfasser und
  den Angekreuzten sieht sie niemand, auch kein Verwalter. Dazu die
  **Zettel-Farbe** (7 Töne) und **„Gültig bis"**: Nach dem Tag hängt sich der
  Zettel selbst ab und bleibt über „abgelaufene Zettel · anzeigen" erreichbar.
  Jeder Zettel zeigt oben rechts sein Schild (z. B. „👤 Max"). Alle
  Bearbeiter-Funktionen stecken hinter dem **⋯** rechts neben dem Verfasser:
  Zur Arbeit machen, Anheften, Monitor, Entfernen sowie Sichtbarkeit und
  Farbe nachträglich ändern (Letzteres nur Verfasser oder Verwalter). Ein
  angehefteter Zettel zeigt ein kleines 📌, einer im Laufband ein 📺.
  Das Auge (Ansicht als Leser/Bearbeiter) zeigt genau, was diese Gruppe sieht.
- **Tagesliste mit „Anwesende"-Menü (seit dem 21.09.):** Rechts im Kopf der
  Tagesliste steht der Knopf **👷 Anwesende** mit der Zahl der Kollegen und der
  offenen Punkte. Sein Menü listet die **heute Anwesenden** nach Früh / Spät /
  Nacht (die laufende Schicht heißt „jetzt") mit Fortschritt „erledigt / gesamt";
  oben steht **Termine** (= die gewohnte Tagesliste). Wer fehlt (Schule, Krank,
  Urlaub), ist kein Eintrag, sondern steht grau unter „Nicht da". Die Wahl einer
  Person zeigt in der Kachel, was für sie **heute** eingeplant ist: Backlog-
  Arbeiten (Person + „geplant für" = heute), fällige To-dos (Frist bis heute oder
  ohne Frist; spätere nur als Zeile) und die Planungs-Notizen des Tages. Das
  Kästchen hakt direkt ab (und wieder auf) – **auch Notizen**, abgehakt heißt
  erledigt und bleibt durchgestrichen stehen (in der Planung mit ✓); der Stift
  öffnet den gewohnten Dialog. Störungen haben keine Person – ihre Restarbeit
  erscheint erst, wenn sie als Arbeit eingeplant ist. Rechte wie in den
  Bereichen: Arbeiten/Notizen nach „Planung", To-dos nach „To-dos"; Leser sehen
  nur, was ihre Gruppe sehen darf. „← zurück zu den Terminen" oder der
  Menüpunkt **Termine** führen zurück.
- **Schichtplan:** Monatsmatrix, je Person und Tag eine Schicht (Früh/Spät/Nacht u. a.).
  Zwei Ausdrucke: **Monat** (die Matrix, quer) und **Wochen** – je Kalenderwoche
  ein Blatt im Querformat, gedacht fürs Schwarze Brett.
- **Drucken:** In jedem Bereich, in dem es etwas zu drucken gibt, sitzt der
  Knopf **Drucken** an derselben Stelle – **oben rechts** in der Kopfleiste.
  Ein Klick fragt erst, was aufs Papier soll, und zeigt **daneben eine
  Vorschau des Blattes** – verkleinert, aber die echte Vorlage, nicht ein
  nachgebautes Bildchen. Was zur Wahl steht, hängt vom Bereich ab:
  - **Schichtplan:** der ganze Monat (A4 quer) oder wochenweise, je KW ein
    Blatt (A4 quer, fürs Schwarze Brett).
  - **Planung:** die Arbeitswoche **Montag bis Freitag** im Zeilen-Layout des
    Bildschirms, **A4 hoch, immer eine Seite**.
  - **TPM · Übersicht:** der **Prüfnachweis** mit Jahresauswahl.
  - **TPM · Plan / Register:** die Liste, so wie sie am Bildschirm steht.
  - **TPM · Auswertung:** hier kommt zum Blatt noch der **Umfang**
    (Beide / Nur TPM / Nur R+I) dazu:
    - **Jahreskalender** – ein gewöhnlicher Wandkalender in **A3 quer**: die
      zwölf Monate stehen oben als Spalten, darunter die Tage 1 bis 31.
      Tageszahl und Wochentag stehen **in jedem Tag** (z. B. „12 Do"), nicht
      in einer Spalte am Rand – sonst schaut man im Dezember quer über das
      ganze Blatt zurück. Der
      Name der Anlage bzw. des R+I-Punktes steht **waagrecht im Tag**; ist er
      zu lang, wird er hinten mit „…" gekürzt und steht vollständig im
      Mauszeiger-Hinweis. Blau = TPM, violett = R+I, grün = erledigt;
      Wochenenden und Feiertage sind hinterlegt.
    - **Einzelner Monat** – dieselben Termine für einen Monat, die Tage
      untereinander, **A4 hoch**. Für den Schrank oder zum Mitnehmen.
    - **Liste wie am Bildschirm** – die Auswertung, so wie sie gerade dasteht.
- **Planung:** Tage untereinander, je Person die eingeplanten Arbeiten/Notizen; springt beim
  Öffnen direkt zum heutigen Tag. **Drucken** gibt die Woche im **Hochformat** aus –
  im selben Zeilen-Layout wie am Bildschirm (ein Block je Tag, Spalten Person ·
  Schicht · Arbeiten & Notizen), **Montag bis Freitag**. Der Ausdruck passt
  **immer auf eine A4-Seite**: das Blatt misst sich selbst und verkleinert
  sich nur so weit, wie es nötig ist (bei sechs Personen gar nicht).
- **Backlog:** offene Arbeiten mit Gewerk, Priorität, Anlage, Zuständigem; filter- und durchsuchbar.
- **TPM → Übersicht:** ein digitales **TPM-Board**, das beim Klick auf **TPM** zuerst öffnet.
  Oben die **Monats- und Jahresquote als Halbkreise**. Es holt das Team ab und erklärt kurz,
  **was** TPM und R+I sind und **warum** sie wichtig sind (Sicherheit, Verfügbarkeit, Nachweis).
  Darunter jeder **R+I-Punkt aufklappbar** mit **Info-Text, Rechtsgrundlage und Link** –
  ein Nachschlagewerk für die Werkstatt. Rechts daneben Jahresauswahl und
  **🖨 Prüfnachweis** (siehe Kapitel 7).
- **TPM → Plan / R+I:** wiederkehrende Wartungen und Inspektionen mit Terminlogik.
- **Auswertung (Monat/Jahr):** unter den Zahlen der **Trend der Termintreue** – zwölf Monate
  als Kurve. Monate ohne fällige Termine bleiben bewusst leer, statt als 0 % zu erscheinen.
- **Einstellungen (⚙ oben rechts):** aufgeteilt in vier Reiter –
  **Anlagen & R+I** (Anlagen, R+I-Punkte inkl. **Info / Rechtsgrundlage / Link**,
  Anlagenteile für Störberichte), **Team & Schichten** (Team, Schichtarten,
  dein Name), **OEE** (Excel-Anbindung, Abschnitt 3.6) und
  **Verlauf & Sicherung** (Änderungsverlauf, Programm-Updates, lokale
  Sicherungen dieses Geräts).
  → **Grundeinstellungen immer aus der aktuellen App-Version pflegen** (siehe Kapitel 10).

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

## 7. Nachweise, Verlauf und Archiv

### 7.1 Prüfnachweis (R+I) ausdrucken

**TPM → Übersicht → Jahr wählen → 🖨 Prüfnachweis.**

Es entsteht ein A4-Blatt „**Nachweis wiederkehrender Prüfungen**" mit je Prüfpunkt:
**Rechtsgrundlage**, alle **erledigten Termine mit Datum**, die **versäumten** Termine
und dem Stand als Quote. Unten stehen Unterschriftszeilen für Werkstattleitung und Prüfer.

Drei Dinge, die man beim Vorlegen wissen sollte:

- **Die Soll-Termine werden aus dem Rhythmus gerechnet, nicht aus dem Bestand gezählt.**
  Ein Nachweis, der nur zählt, was jemand eingetragen hat, meldete sonst „vollständig",
  obwohl gar nichts gemacht wurde.
- **Künftige Termine zählen nicht als versäumt**, sondern werden getrennt ausgewiesen
  („im Zeitraum noch nicht fällig").
- **Lücken werden gezeigt, nicht verschwiegen.** Ein Nachweis, der beschönigt, ist wertlos.
  Wenn etwas fehlt, steht es rot im Blatt.

> Wenn nichts passiert: im Browser einmal **Popups für diese Seite erlauben** – der Nachweis
> öffnet sich in einem eigenen Fenster.

### 7.2 Verlauf – wer hat wann was geändert

**⚙ → Reiter „Verlauf & Sicherung" → „Verlauf (wer hat was geändert)"** listet die Änderungen der **letzten 90 Tage**
aus der gemeinsamen Datei: Zeitpunkt, Name, was geschah.

- Es wird nur mitgeschrieben, solange eine **gemeinsame Datei verbunden** ist.
- Als Name erscheint, was unter **⚙ → Dein Name** eingetragen ist – sonst „Unbekannt"
  (siehe 3.4).
- Einträge älter als 90 Tage verschwinden von selbst. Es wird **nach Alter** aufgeräumt,
  nicht nach Anzahl – damit alle Arbeitsplätze denselben Verlauf sehen.

### 7.3 Archiv-Erinnerung nach drei Jahren

Der Zwischenspeicher des Browsers fasst rund **5 MB** – bei eurer Größenordnung etwa
**sieben Jahre**. Damit es nie eng wird, meldet sich die App **ab drei Jahren Bestand**
einmal von selbst und schlägt vor, die ältesten Jahrgänge auszulagern.

Der Ablauf ist bewusst zweistufig:

1. **Herunterladen** – die alten Jahrgänge werden als `werkstatt-archiv-bis-JAHR.json`
   gespeichert. Diese Datei an einen sicheren Ort legen.
2. **Erst dann auslagern** – die Einträge werden aus dem laufenden Bestand entfernt.
   Das wirkt **auf allen Arbeitsplätzen**, deshalb kommt vorher eine ausdrückliche Abfrage.

**„Später erinnern"** verschiebt die Frage. Es passiert nichts automatisch, und ohne
Schritt 1 lässt sich Schritt 2 nicht auslösen. Nur-Leser bekommen die Frage nicht.

---

## 8. Datensicherheit – warum nichts verloren geht

Die App ersetzt einen Backend-Server durch mehrere Schutzmechanismen:

- **Zusammenführen pro Eintrag** statt „Datei ersetzen": Beim Speichern wird der aktuelle
  Dateistand gelesen und Eintrag für Eintrag gemerged (neuerer Zeitstempel gewinnt).
- **Grundeinstellungen Feld für Feld:** Anlagen, R+I-Punkte, Team, Schichtarten und
  Anlagenteile werden **einzeln** abgelegt. Wer das Team pflegt, überschreibt damit nicht
  mehr die Anlagenteile eines Kollegen.
- **Optimistische Sperre + Kontroll-Lesung:** Nach dem Schreiben wird zurückgelesen und
  geprüft, ob die eigene Änderung wirklich drinsteht.
- **Selbstheilung:** Ein Hintergrund-Check gleicht sehr seltene Zeitfenster automatisch aus.
- **Abgleich-Kurzblick (seit 21.09.):** Der 30-Sekunden-Abgleich sieht zuerst nur auf
  Größe und Änderungszeit der Datei und liest den Inhalt nur, wenn eine davon abweicht.
  Zwei Vorsichtsregeln: ohne bekannten Stand wird immer gelesen, und eine Datei, die vor
  weniger als fünf Sekunden geändert wurde, wird immer gelesen (manche Laufwerke führen die
  Änderungszeit nur sekundengenau). Eine beschädigte Datei bleibt erkennbar, weil ihre
  Kennkarte nie als „bekannt" übernommen wird. In der Programm-Fassung braucht der
  Kurzblick die Brücken-Funktion `stat` – ältere Programm-ZIPs lesen bis zum Update weiter
  wie bisher.
- **Tombstones:** Absichtlich Gelöschtes wird nicht durch alte Kopien wiederbelebt.
  Die Lösch-Merkliste gilt 180 Tage und altert **nicht** nach der Uhr eines einzelnen
  Rechners – sonst könnte ein Gerät mit falschem Jahr sie für alle leeren.
- **Konflikt-Wächter:** Sync-Konfliktkopien werden automatisch eingesammelt.
  Erkannt wird nur, was wie ein Gerätename aussieht (`…-L-RCIRACI.json`).
  Selbst angelegte Sicherungen mit Datum im Namen (`…-2026-08-05.json`) oder mit
  Wörtern wie „Sicherung"/„Kopie" bleiben unangetastet – eine erkannte Kopie wird
  nach dem Einsammeln gelöscht, deshalb im Zweifel lieber liegen lassen.
- **Lokale Sicherungen:** je Gerät die 30 jüngsten Stände **und zusätzlich je
  Kalendertag der letzte Stand der vergangenen 14 Tage** (⚙ → Reiter „Verlauf & Sicherung").
  Der Tagesspeicher ist wichtig, weil die 30 jüngsten Plätze an einem normalen
  Arbeitstag gemessen nur ~58 Minuten zurückreichen – ein Fehler, der erst am
  nächsten Morgen auffällt, hätte sonst kein Netz mehr.
- **Sicherung des Firmenlaufwerks:** zusätzlicher Rettungsanker über die IT-Datensicherung des Laufwerks.
- **Voller Zwischenspeicher wird ehrlich gemeldet:** Ist der lokale Speicher des Browsers
  voll, die gemeinsame Datei aber erreichbar, sagt die App ausdrücklich, dass die Änderung
  **in der gemeinsamen Datei steht und nicht verloren ist**. Ist gar nichts erreichbar,
  meldet sie einen echten Fehler – statt „gespeichert" anzuzeigen, wenn nichts gespeichert wurde.

Zwei getrennte Dateien (Hauptdaten + Störungen) nutzen **denselben** erprobten Sync-Code.

---

## 9. Updates einspielen

Da alle **eine** App-Datei öffnen, ist ein Update denkbar einfach:

1. Neue `Werkstatt_Kalender_TPM.html` an den bekannten Ort legen, „Ersetzen" bestätigen.
2. Fertig – auf dem Laufwerk gibt es keinen Abgleich, die Datei ist sofort für alle da.
3. Alle haben die neue Version beim nächsten Öffnen oder mit **F5**.

Die Verbindungen zu den Daten-Dateien bleiben dabei erhalten – niemand muss etwas neu auswählen.

Zwei frühere Stolpersteine sind mit dem Ausliefer-Dienst (3.1) entfallen:

- **Der Dateiname spielt keine Rolle mehr.** Ausgeliefert wird immer die neueste
  `Werkstatt_Kalender_TPM*.html` aus dem Ordner. Ob `(28)`, `(29)` oder ganz ohne
  Nummer – die Adresse bleibt `http://localhost:8765/`. Niemand arbeitet mehr
  versehentlich weiter mit der alten Version, weil seine Verknüpfung auf den alten
  Namen zeigte.
- **Kein Strg+F5 mehr nötig.** Der Dienst untersagt dem Browser das Zwischenspeichern;
  ein gewöhnliches Neuladen holt immer die aktuelle Fassung.

Wer das Cockpit während des Austauschs offen hat, arbeitet bis zum nächsten Neuladen
mit der alten Version weiter – das war schon immer so und ist unkritisch, weil beide
Fassungen dieselben Dateien lesen und schreiben.

---

## 10. Alte und neue Version gleichzeitig

Wenn jemand kurzzeitig mit einer **alten** und ein anderer mit einer **neuen** Version arbeitet:

- **Tägliche Daten (Kalender, Schicht, Backlog, Notizen) und Störungen: kein Verlust.**
  Das Zusammenführen arbeitet pro Eintrag, und unbekannte Felder werden beim Bearbeiten
  mitkopiert. Störungen liegen in einer eigenen Datei, die eine alte Version gar nicht anfasst.
- **Der Rückweg ist offen.** Die neue Fassung schreibt die Grundeinstellungen **zusätzlich**
  weiterhin im alten Format. Wer auf einem Rechner noch die alte Version hat, sieht
  Anlagen, Team und R+I-Punkte ganz normal – und wer zurückmuss, verliert nichts.
- **Verwaltungs-Einträge stören die alte Fassung nicht.** Sie kennt Verlauf und die neue
  Einstellungsform zwar nicht, trägt sie aber unverändert mit und zeigt sie **nicht** als
  Termine an.

**Die eine Regel, die bleibt:**

> **Grundeinstellungen immer aus der aktuellen Version pflegen.**

Der Grund hat sich geändert: Früher konnte eine alte Version neuere Felder *überschreiben*.
Das kann sie heute nicht mehr. Stattdessen wird eine Einstellungs-Änderung, die jemand aus
der **alten** Version speichert, von den neuen Versionen **ignoriert** – sie lesen die
Feld-für-Feld-Form, die die alte Version nicht mitschreibt. Es geht also nichts kaputt,
aber die Änderung kommt bei niemandem an. Nachgemessen am 27.07.2026.

Solange alle dieselbe Version haben, spielt das keine Rolle.

---

## 10a. Die App als installierbares Programm (Probelauf)

Neben der HTML-Fassung gibt es die App als **eigenständiges Programm**
(Ordner `programm/`, ausgeliefert als `Werkstatt-Cockpit-Programm-win64.zip`).
Es ist dieselbe App mit derselben Sync-Logik – nur die Verbindungsschicht ist
eine andere: Dateien werden über **echte Pfade** angesprochen statt über
Browser-Verweise.

**Was dadurch entfällt:**

- das „Jetzt verbinden" nach jedem Browser-Neustart – der gemerkte Pfad ist
  schlichter Text und geht nie verloren; das Programm verbindet sich von selbst
- die Rechtefragen des Browsers und der ganze Schreibschutz-Komplex
  (03.–05.08.) – ob geschrieben werden darf, entscheidet das Laufwerk
- der Ausliefer-Dienst (`cockpit-server.ps1`) samt localhost-Verknüpfung
- die Gefahr eines zweiten Fensters: ein zweiter Start holt das vorhandene
  Fenster nach vorn

**Ausprobieren:** ZIP entpacken (Desktop genügt, keine Adminrechte),
`Werkstatt-Cockpit.exe` doppelklicken. Windows-SmartScreen warnt beim ersten
Start vor dem unbekannten Herausgeber → „Weitere Informationen" → „Trotzdem
ausführen" (die Signatur gehört zur IT-Übergabe). Beide Fassungen arbeiten
auf **denselben Datendateien** und können nebeneinander laufen – zum Üben
trotzdem erst eine Kopie der Daten nehmen. Der eigene Name (⚙) muss im
Programm einmal neu eingetragen werden, er ist geräte- bzw. programmweise
gespeichert.

**Updates im Programm:** einmal in ⚙ → Reiter **Verlauf & Sicherung** → **Programm-Updates** den Netzwerkordner
angeben, in dem die App-HTML liegt (Pfad einfügen oder Ordner wählen). Das
Programm schaut alle 5 Minuten nach; liegt dort eine neuere
`Werkstatt_Kalender_TPM*.html`, erscheint oben **„Neue Version verfügbar"** –
ein Klick übernimmt sie und lädt neu. Der Update-Ablauf der Werkstatt bleibt
derselbe: neue HTML in den Netzwerkordner legen. Eine unvollständig kopierte
Datei wird nie übernommen (Inhalt wird vor der Übernahme geprüft; bei einem
Fehler läuft die bisherige Version unverändert weiter).

**Außerdem im Programm:** Laufwerks-Links im Linkstreifen öffnen sich direkt
im Explorer (ohne Ausliefer-Dienst), und der OEE-Ordner lässt sich auch durch
**Einfügen eines Pfads** setzen – zeigt der Pfad direkt auf die `.xlsx`,
werden Ordner und Datei in einem Rutsch übernommen.

Geprüft wird die Programm-Fassung doppelt: harte-41 fährt die App mit der
Programm-Brücke gegen ein echtes Verzeichnis (20 Prüfungen),
`tests/pruefe-programm.js` startet das echte Electron-Programm, schreibt durch
es hindurch auf die Platte und spielt den kompletten Update-Kreislauf durch –
einschließlich einer halben HTML, die liegen bleibt (12 Prüfungen).

---

## 11. Grenzen

**Technisch:**

- **Handy/Tablet:** Die Oberfläche ist inzwischen bis hinunter zu **540 Pixel** Breite
  bedienbar – auf einem Telefon lässt sich also alles erreichen und antippen. Die
  **gemeinsame-Datei-Technik** gibt es aber weiterhin nur in **Desktop-Edge/Chrome**.
  Auf dem iPhone und den meisten Handy-Browsern kann man die App öffnen, aber **nicht mit
  der gemeinsamen Datei verbinden**. Echte mobile Nutzung mit Sync bräuchte einen Server.
- **Sehr viele gleichzeitige Bearbeiter:** ausgelegt auf eine Handvoll; bei dutzenden
  Gleichzeitig-Schreibern gäbe es mehr Konfliktkopien.
- **Kein Echtzeit-Sekundentakt:** Änderungen erscheinen in Sekunden bis ~½ Minute.

**Fachlich – was die App (noch) nicht kann.** Ehrlich benannt, damit bei einer Prüfung
niemand überrascht wird:

- **Kein „wer hat es erledigt" am Wartungshaken.** Ein erledigter TPM- oder R+I-Punkt
  speichert Datum, Anlage, Status und Bemerkung – **keinen Namen**. Belegen lässt sich
  damit *dass* etwas gemacht wurde, nicht *von wem*. (Bei Backlog-Arbeiten und
  Störberichten steht der Name sehr wohl drin, und der **Verlauf** zeigt, wer wann
  gespeichert hat – aber das ist kein Ersatz für ein Feld am Eintrag selbst.)
- **Abgeschlossene Zeiträume lassen sich nachträglich ändern.** Nichts hindert daran, im
  Oktober noch einen Haken für den Juli zu setzen.
- **Kein geführtes Befund-Feld.** Es gibt die freie Bemerkung, aber keine Auswahl
  „in Ordnung / Auffälligkeit / Mangel" – freier Text lässt sich nicht auswerten.
- **Keine Wiedervorlage für Maßnahmen.** Eine Maßnahme aus einem Störbericht landet im
  Backlog; ob sie gewirkt hat, fragt niemand nach.
- **Kein CSV-Export.** Wer die Zahlen in Excel weiterrechnen will, muss abtippen.

Für Werkstatt-PCs mit ein paar Bearbeitern und Lesern sind die technischen Punkte keine
spürbaren Nachteile. Die fachlichen Punkte sind bewusste Auslassungen, keine Fehler –
sie sind nachrüstbar.

---

## 12. Häufige Fragen

**Brauche ich noch OneDrive?**
Nein – seit dem 10.08.2026 liegt alles auf dem Firmenlaufwerk: App, Daten und
Störungs-Datei. Teilen, Zugriff und Rechte regelt die IT-Freigabe des Ordners.

**Muss ich die Störungen-Datei neu anlegen?**
Nur **einmalig**, weil sie neu ist. Danach nie wieder – auch nicht bei App-Updates.

**Nach dem Browser-Neustart steht „getrennt".**
Einmal auf **„Jetzt verbinden"** klicken. Aus Sicherheitsgründen fragt der Browser einmal nach.
Die Datei muss dabei **nicht** neu herausgesucht werden – ein Klick genügt.

**Muss ich das schwarze Fenster offen lassen?**
Ja, das ist der Ausliefer-Dienst (3.1). Minimieren reicht. Wird es geschlossen, ist das
Cockpit nicht mehr erreichbar – den Daten passiert nichts, sie liegen in der Datei.

**Ich habe versehentlich zweimal auf „Cockpit starten" geklickt.**
Unkritisch. Der Dienst erkennt, dass er schon läuft, öffnet nur den Browser und beendet
sich wieder. Er weicht bewusst **nicht** auf einen anderen Port aus – das wäre für den
Browser eine andere Adresse, und die verbundene Datei wäre wieder vergessen.

**Nach der Umstellung auf den Ausliefer-Dienst ist alles leer.**
Für den Browser ist `http://localhost:8765` eine andere Seite mit eigenem lokalem
Speicher. Erst die beiden Dateien verbinden (3.2 und 3.3) – dann steht alles wieder da.
Nur der eigene Name muss neu eingetragen werden (3.4).

**Ein Leser sieht die vollen Bearbeiter-Tabs nicht.**
Richtig so – das ist der Schreibschutz. Störungen darf er trotzdem pflegen.

**Es erscheinen `…-PCNAME.json`-Dateien im Datenordner.**
Das sind Konfliktkopien. Mit eingerichtetem Konflikt-Wächter verschwinden sie automatisch.

**Im Verlauf steht überall „Unbekannt".**
Auf den betreffenden Geräten wurde kein Name hinterlegt: **⚙ → Dein Name** (siehe 3.4).

**Der Prüfnachweis / das Drucken tut nichts.**
Beides öffnet ein eigenes Fenster. Im Browser einmal **Popups für diese Seite erlauben**.

**Die App fragt nach dem Auslagern alter Jahre – muss ich das sofort machen?**
Nein. „Später erinnern" verschiebt die Frage, es passiert nichts automatisch. Siehe 7.3.

**Im Trend fehlen einzelne Monate.**
Absicht: Monate ohne fällige Termine erscheinen leer statt als 0 % – sonst sähe ein
ruhiger Monat aus wie ein versäumter.

**Beim Aktualisieren bewegt sich das Zeichen neben „Werkstatt-Cockpit" nicht.**
Dann ist auf dem Gerät „Bewegung reduzieren" eingeschaltet (Bedienungshilfen bzw.
Energiesparmodus). Das Bild wird dann sofort fertig angezeigt – gewollt, kein Fehler.

---

*Technische Details zur Sync-Logik stehen im Quellcode unter `app/src/sharedfile.js`.
Automatisierte Härtetests liegen unter `tests/hardness/`. Die verbindlichen Regeln,
nach denen die App gebaut ist, stehen im `Werkstatt-Cockpit-Regelwerk.pdf`.*
