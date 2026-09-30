# Server-Aufbau BTA-Cockpit (v-btacockpit-01)

Stand: 29.09.2026 – wird Schritt für Schritt mit Roberto ergänzt. Der Server
ist ein Windows Server (Rolle Datei-/Speicherdienste), Roberto ist dort Admin.
Freigabe: `\\v-btacockpit-01\BTA` (im Explorer auch als `M:` über die IP).

## WO WIR STEHEN (Stand 29.09. abends – Robertos Entscheidung)

**Entscheidung (29.09. abends):** Der Betrieb bleibt auf dem Firmenlaufwerk
`W:` mit dem heutigen Programm, bis auf dem eigenen Server das neue System
(Backend + Frontend) komplett gebaut und getestet ist – „diesmal aus allen
gelernten Erkenntnissen von Anfang an und richtig“. Dann: Daten importieren,
testen, umschalten; das Programm auf `W:` verschwindet. **Kein Datei-Umzug.**
Die Schritte 7–11 unten sind damit gestrichen; Stick, Werkzeug und
Aufsetz-PDF zeigen wieder auf `W:` (Rückbau 29.09. abends).

**Was bleibt und weiter gilt:** Schritte 1–6 (Ordner, fünf Gruppen, Rechte,
Freigabe, 12 Konten, Zugriffstest) sind die Grundlage des neuen Systems. Die
Ordner bekommen dann ihre Rolle: `BTA-Scheurich`/`BTA-Soendgen` = Datenbank
und Dateien je Standort, `BTA-Programm` = Dienst und ausgelieferte App,
`BTA-Sicherung` = Sicherungen.

**Bauplan freigegeben (30.09.), Etappe A läuft.** Dienst-Kern gebaut und
gemessen (`server/`, Prüfstände 23/23 und 5/5). **BTA-Server-Werkzeug gebaut**
(`BTA-Server-Werkzeug.cmd` auf dem Stick, Bauplan Abschnitt 11) – auf Windows
noch **ungemessen**.

**Nächster Schritt (Roberto, einzeln):** Stick-Ordner mit der neuen ZIP
aktualisieren, dann **auf dem Server** `BTA-Server-Werkzeug.cmd` per Rechtsklick
„Als Administrator ausführen" → Reiter **Prüfen** → „Jetzt prüfen" → Bild der
acht Ampeln schicken. Erwartung: Admin grün, Ordner grün, Gruppen grün, Node
gelb oder rot (node.exe liegt nicht in der Chat-ZIP – „Node herunterladen"
holt es, wenn der Server ins Internet darf), Dienst-Dateien gelb („noch nicht
kopiert"), Aufgabe/Firewall/Dienst rot (noch nichts eingerichtet). Das
Werkzeug ändert in diesem Schritt **nichts**.

**Daneben offen (unverändert):** Release v1.2 (Robertos Handgriff), heutige
HTML in den Update-Ordner auf `W:`, doppelte Störberichte über die ⚙-Karte,
Rückmeldung vom Rechner, der hing, Stick auf `D:` ist mit dem Stand vom
29.09. Vormittag (W:-Pfade) weiterhin richtig.

Grundregeln, die hier gelten:

- **Eine Quelle.** Nach dem Umzug gibt es die Daten nur noch auf dem Server;
  der alte Ordner auf `W:` wird umbenannt, nicht gelöscht, und nach zwei
  ruhigen Wochen entfernt.
- **Rechte über lokale Server-Gruppen**, nicht über einzelne Ordner-Einträge.
  Als Admin des Servers legt Roberto die Gruppen selbst an und trägt die
  Windows-Konten der Kollegen ein – dafür braucht es keine IT. Ein Kollege
  kommt dazu = ein Eintrag in einer Gruppe.
- **Eine App-Datei für alle Standorte.** Der Update-Ordner ist für Scheurich
  und Soendgen derselbe (Entscheidung vom 17.09.). Daten sind je Standort
  getrennt.
- **Die App regelt Verwalter/Bearbeiter/Leser** (Benutzerliste im ⚙). Die
  Ordner-Rechte sind die Leitplanke darunter: Wer Störungen melden soll,
  braucht Schreibrecht auf den Datenordner – die App-Rolle entscheidet dann,
  was er sonst darf.

## 1. Ordnerstruktur

```
\\v-btacockpit-01\BTA\
   BTA-Scheurich\        Datenordner Scheurich: werkstatt-kalender-daten.json,
                         werkstatt-stoerungen.json, Fotos, Konflikt-Wächter,
                         Tages-Sicherungen der App
   BTA-Soendgen\         Datenordner Soendgen Keramik: soendgen-kalender-daten.json,
                         soendgen-stoerungen.json, …
   BTA-Programm\
      Update\            Werkstatt_Kalender_TPM.html – der grüne Balken auf allen
                         Rechnern beider Standorte
      Installation\      BTA-Cockpit-Komplettpaket.zip + Stick-Ordner
   BTA-Sicherung\        nächtliche Kopien der JSON-Dateien (Aufgabenplanung),
                         nur Roberto
```

`BTA-Formwerk` (angelegt 28.09.) wird nicht gebraucht – löschen.

## 2. Gruppen (lokal auf dem Server) und wer hineingehört

| Gruppe | Wer | Bekommt |
|---|---|---|
| `BTA-Verwalter` | Roberto, Vertreter | Vollzugriff überall |
| `BTA-Scheurich-Werkstatt` | alle Scheurich-Kollegen, die im Cockpit arbeiten oder Störungen melden | Ändern auf `BTA-Scheurich`, Lesen auf `BTA-Programm` |
| `BTA-Scheurich-Ansehen` | Monitor-/Kiosk-Konten und reine Zuschauer, die nie schreiben sollen | Lesen auf `BTA-Scheurich` und `BTA-Programm` |
| `BTA-Soendgen-Werkstatt` | alle Soendgen-Kollegen | Ändern auf `BTA-Soendgen`, Lesen auf `BTA-Programm` |
| `BTA-Soendgen-Ansehen` | Monitor-/Kiosk-Konten Soendgen | Lesen auf `BTA-Soendgen` und `BTA-Programm` |

Ehrlich dazu: Wer nur in einer **Ansehen**-Gruppe ist, kann in der App keine
Störung melden (Schreibschutz auf der Störungs-Datei) – für Monitore richtig,
für Kollegen nicht. Kollegen gehören in die Werkstatt-Gruppe; ob sie in der
App Leser oder Bearbeiter sind, entscheidet die Benutzerliste im ⚙.

## 3. Rechte je Ordner (NTFS)

| Ordner | BTA-Verwalter | …-Werkstatt (eigener Standort) | …-Ansehen (eigener Standort) | anderer Standort |
|---|---|---|---|---|
| `BTA` (nur dieser Ordner) | Vollzugriff | Ordnerinhalt anzeigen | Ordnerinhalt anzeigen | Ordnerinhalt anzeigen |
| `BTA-Scheurich` | Vollzugriff | Ändern | Lesen | kein Zugriff |
| `BTA-Soendgen` | Vollzugriff | Ändern | Lesen | kein Zugriff |
| `BTA-Programm\Update` | Vollzugriff | Lesen | Lesen | Lesen |
| `BTA-Programm\Installation` | Vollzugriff | Lesen | Lesen | Lesen |
| `BTA-Sicherung` | Vollzugriff | kein Zugriff | kein Zugriff | kein Zugriff |

Freigabe-Berechtigung auf `BTA`: „Authentifizierte Benutzer" = Ändern. Die
Feinarbeit machen die NTFS-Rechte oben (wirksam ist immer das strengere).

## 4. Die Schritte (jeder wird abgehakt, wenn Roberto ihn bestätigt)

- [x] **Schritt 1** – Ordnerstruktur anlegen, `BTA-Formwerk` löschen – **erledigt 29.09., 09:00** (über die Eingabeaufforderung als Administrator; im Explorer ließ sich auf `C:\BTA` nichts anlegen)
- [x] **Schritt 2** – die fünf Gruppen anlegen – **erledigt 29.09.** (`BTA-Verwalter` mit rciraci, serviceBTA, thomas.smarsly; die vier Standort-Gruppen noch leer)
- [x] **Schritt 3** – NTFS-Rechte gesetzt – **erledigt 29.09.** per `icacls` als Administrator: `BTA-Verwalter (OI)(CI)F` auf `C:\BTA`; je Standort-Ordner `…-Werkstatt (OI)(CI)M` und `…-Ansehen (OI)(CI)RX`; `BTA-Programm` RX für alle vier Standort-Gruppen. Erster Anlauf ohne Administrator-Fenster scheiterte mit „Zugriff verweigert“ auf den IT-Ordnern (Eigentümer Administrator). Die IT-Einträge (`BTA_Cockpit_write` M, `_read` RX, vererbt) bleiben – solange nur Roberto/Chef/serviceBTA in `write` sind, ist das gleichbedeutend mit Verwalter.
- [x] **Schritt 3c** – Standort-Gruppen dürfen `C:\BTA` selbst auflisten (RX nur auf diesen Ordner) – **erledigt 29.09.**
- [x] **Schritt 4** – Mitglieder eingetragen – **erledigt 29.09.** `BTA-Scheurich-Werkstatt`: andreas.ecke, aradke, ciraci, Elektro, elektroabt, elektroazubi, Jaeger, kczoczek, mwerkstatt, PBaier, rciraci, thomas.smarsly (12 Konten, über die Domänen-Suche im Dialog gewählt). `BTA-Scheurich-Ansehen` vorerst leer (kein eigenes Monitor-Konto). Soendgen leer, bis die Domänen-Frage geklärt ist. Neue Rechte gelten je Kollege ab dem nächsten Anmelden.
- [x] **Schritt 5a** – Freigabe-Berechtigung geprüft (`net share BTA`): Administratoren FULL, Jeder FULL – das übliche Muster „Freigabe offen, NTFS regelt“; bleibt so, die NTFS-Rechte aus Schritt 3 sind die Grenze. Zwischenspeichern steht auf „Manuell“ (Offlinedateien nur auf Wunsch) – gut so, sonst arbeitet ein Rechner mit einer alten Offline-Kopie.
- [x] **Schritt 6** – Zugriff getestet – **erledigt 29.09.**: Werkstatt-Konto am Werkstatt-PC schreibt in `BTA-Scheurich`, bekommt „Zugriff verweigert“ auf `BTA-Soendgen`, `BTA-Programm\Update` (Schreiben) und `BTA-Sicherung`; rciraci überall Schreiben.
- [ ] ~~**Schritt 7** – Daten kopieren~~ – **gestrichen 29.09.** (Entscheidung: kein Datei-Umzug, der Server bekommt das neue System)
- [ ] ~~**Schritt 8** – je Rechner „Pfade speichern“~~ – gestrichen (Server-Pfade wieder aus Werkzeug/Stick/PDF entfernt)
- [ ] ~~**Schritt 9** – alten Ordner umbenennen~~ – gestrichen
- [ ] **Schritt 10** – Schattenkopien + nächtliche Sicherungsaufgabe – kommt mit dem neuen System (Sicherung der Datenbank; der Dienst legt sie um 02:00 nach `BTA-Sicherung`, der geübte Rückweg ist „Sicherung einspielen" im Werkzeug)
- [ ] **Schritt 11** – Komplettpaket nach `BTA-Programm\Installation` – entfällt voraussichtlich: das neue System liefert die App selbst aus
- [ ] **Schritt 12 (Etappe A, Werkzeug)** – `BTA-Server-Werkzeug.cmd` auf dem Server als Administrator → Prüfen → Bild der Ampeln (ändert nichts). **Erster Anlauf 30.09.: Fenster blitzte auf, nichts öffnete sich** – Laufzeitfehler in der Startzeile (`(if …)` statt `$(if …)`), behoben; seitdem schreibt das Werkzeug jeden Abbruch nach `werkzeug\server-werkzeug-fehler.txt` und die `.cmd` öffnet die Datei im Editor. **Dritter Anlauf 30.09., 15:26 (als serviceBTA): ERLEDIGT** – acht Ampeln wie erwartet (Admin, Ordner, Gruppen grün; Node rot; Dateien, Aufgabe, Firewall, Antwort gelb). Nebenbefund: der Server kommt ins Internet (Roberto hat den Chat dort offen).
- [x] **Schritt 12b** – „Node herunterladen“ – **erledigt 30.09., 15:31** (gemessen: 35 MB in 36 s über `curl.exe`, Entpacken 6 s; Prüfen zeigt Node grün „im Dienst-Ordner: v22.23.3“). Der Server kommt ins Internet.
- [x] **Schritt 13a** – Vorschau – **erledigt 30.09., 15:37** (Protokoll liegt vor): vier Ordner würden angelegt (`Dienst\protokoll`, `App`, `BTA-Scheurich\fotos`, `BTA-Soendgen\fotos`), **1b: SYSTEM hat Schreibrecht auf `C:\BTA` – nichts zu tun**, Node liegt schon da, dienst.js/db.js würden kopiert, Schritte 3–6 wie geplant. Nichts verändert.
- [x] **Schritt 13b** – **„Einrichten“ – ERLEDIGT 30.09., 15:43** (Protokoll liegt vor): sechs Schritte in 3 s, Dienst antwortete 1 s nach dem Start – „Fassung 0.1.0 - scheurich: Version 0 | soendgen: Version 0“, Status-Seite im Browser, keine Fehler. **Der Dienst läuft auf `v-btacockpit-01` und startet ab jetzt mit dem Server.** Nebenfund: Status-Seite zeigte Weltzeit (13:43) – Dienst zeigt jetzt Serverzeit, kommt mit dem nächsten „Einrichten“ auf den Server. Noch offen aus 13b: Kontrolle in der Aufgabenplanung (Zeitlimit).
  Ursprünglicher Plan: **„Einrichten“** → Rückfrage mit Ja → am Ende „Fertig eingerichtet.“ und die Status-Seite `http://localhost:8765/status` im Browser. Kontrolle danach in der Aufgabenplanung: Aufgabe `bta-cockpit-dienst`, Zustand „Wird ausgeführt“, Reiter Einstellungen: „Aufgabe beenden, falls sie länger läuft als“ **nicht** angehakt (das Werkzeug setzt `PT0S`; bekannter Windows-Haken mit der Null-Zeitspanne).
- [x] **Schritt 14** – Status-Seite von Robertos eigenem PC – **erledigt 30.09., 15:48**: `http://v-btacockpit-01:8765/status` kommt im Chrome (Firewall-Regel und Namensauflösung nachgewiesen; „Nicht sicher“ = HTTP ohne Zertifikat, im Firmennetz so entschieden, Bauplan Entscheidung 4). Werkstatt-PC folgt bei Gelegenheit.
- [x] **Schritt 14b** – Aufgabenplanung – **erledigt 30.09., 15:55** (Bild): Status „Wird ausgeführt“, letzte Laufzeit 15:43:23, „Aufgabe beenden, falls Ausführung länger als“ **ohne Haken** (`PT0S` greift), Neustart alle 1 Minute bis 3-mal, Konto SYSTEM, unabhängig von der Anmeldung, höchste Berechtigungen, „Keine neue Instanz starten“.
- [x] **Schritt 15a** – Wartung → „Sicherung jetzt" – **erledigt 30.09., 15:57**: je Standort `.sqlite` (64 kB) + 2 Exporte in `C:\BTA\BTA-Sicherung`, sechs Dateien im Explorer. Nebenfund: Dateiname trug die Weltzeit (`…-13-57_…`) – Dienst stempelt jetzt in Serverzeit (auch Protokollzeilen und Tageswechsel der 02:00-Sicherung), A12 prüft es; kommt mit dem nächsten „Einrichten“ mit.
- [x] **Schritt 15b – RÜCKWEG GEÜBT 30.09., 16:01** (Roberto wählte die Soendgen-Sicherung `2026-09-30-13-57_soendgen.sqlite`). Protokoll wörtlich:
  ```
  16:01:26  Rueckweg Soendgen Keramik: C:\BTA\BTA-Sicherung\2026-09-30-13-57_soendgen.sqlite
  16:01:26  Dienst stoppen ...
  16:01:31  Dienst gestoppt.
  16:01:31    Heutige Datenbank aufgehoben: cockpit.vor-rueckweg-2026-09-30-16-01.sqlite
  16:01:31    Sicherung eingespielt.
  16:01:32  Dienst starten ...
  16:01:32  Dienst laeuft (Fassung 0.1.0).
  16:01:32    Stand jetzt: Version 0, 0 Eintraege, 0 Stoerberichte.
  ```
  **Gemessen: 6 s vom Klick bis zum laufenden Dienst** (Stopp 5 s, Einspielen unter 1 s, Start unter 1 s). `BTA-Scheurich` unberührt (Bild: `cockpit.sqlite` von 15:43, WAL 125 KB, daneben Robertos Ordner „Bilder Scheurich“ vom 29.09.). Die Kopie `cockpit.vor-rueckweg-2026-09-30-16-01.sqlite` liegt in `BTA-Soendgen` und kann irgendwann weg (leer, 64 kB).
- [ ] **Schritt 16** – Status-Seite von einem Werkstatt-PC öffnen (`http://v-btacockpit-01:8765/status`), bei Gelegenheit – Nachweis, dass auch ein Werkstatt-Konto durch die Firewall kommt.

- [x] **Schritt 16** – Status-Seite vom Werkstatt-PC – **erledigt 30.09.** (Roberto: „am Werkstatt-PC sieht es gut aus“).

## Etappe B – Import (ab 30.09. nachmittags)

- [ ] **Schritt 17a** – Stick-ZIP vom 30.09. abends über den Stick-Ordner, dann Reiter Einrichten → **„Einrichten“** noch einmal (tauscht `dienst.js`/`db.js` auf dem Server, startet den Dienst neu; Datenbanken bleiben). Kontrolle: Prüfen → letzte Ampel „ja, Port 8765, **Fassung 0.2.0**“.
- [ ] **Schritt 17b** – Reiter Import → Standort Scheurich, beide W:-Pfade stehen vorbelegt → **„Nur pruefen (Vorschau)“**. Erwartet je Datei: Datei-Kopf (format, standort=scheurich, gespeichert …), Zählung „N gelesen – N neu, 0 geändert, 0 unverändert, … Löschliste, … Einstellungen, 0 ohne Kennung“, Fotos-Zeile, „VORSCHAU fertig“. **N muss zur Kennkarte im Cockpit passen** (29.09.: 7.285 Einträge / 2.908 Störberichte). Kommt „Zugriff verweigert“ auf W:, beide Dateien auf den Server-Desktop kopieren und über „…“ wählen.
- [ ] **Schritt 17c** – **„Import“** → Ja. Erwartet: Zählung wie in der Vorschau, „NACHWEIS OK – N Eintraege zurueckgelesen, 0 Abweichungen“ je Datei, „Datenbank Scheurich vorher 0/0 → nachher N/M“, Fotos kopiert, Meldung mit den Zahlen. Danach Status-Seite: Scheurich mit N Einträgen, M Störberichten. Protokoll speichern und schicken.
- [ ] **Schritt 17d** – Wiederholung: „Import“ noch einmal → alles „unveraendert“, Version bleibt (Nachweis der Wiederholbarkeit mit echten Daten).

**Etappe A ist damit auf dem Server durch** (Bauplan Abschnitt 8: Prüfstände grün 24/24 + 5/5, `/status` von Robertos PC erreichbar, Rückweg protokolliert). Es folgt **Etappe B – Import** (Reiter Import im Werkzeug, Testimport mit dem echten Abendstand von `W:`).

## Befunde vom 29.09. (Prüfungen 1–3)

- Die Freigabe `BTA` liegt lokal unter **`C:\BTA`** (einziges Laufwerk, 224 GB frei).
- Die IT hat zwei **Domänen-Gruppen** angelegt und auf `C:\BTA` eingetragen:
  `SCHEURICH\BTA_Cockpit_write` (Ändern; Mitglieder: rciraci, serviceBTA,
  thomas.smarsly) und `SCHEURICH\BTA_Cockpit_read` (leer). Domäne
  `scheurich.local`. Diese Gruppen bleiben unangetastet; die Kollegen kommen
  in die lokalen Server-Gruppen (Robertos Handgriff ohne IT).
- Lokale Gruppe `Administratoren` auf dem Server: Administrator, Domain
  Admins, `SCHEURICH\rciraci`, `SCHEURICH\serviceBTA` – Roberto ist mit
  beiden Konten Admin.

## Schritt 7 im Detail – der Umzug (GESTRICHEN 29.09., bleibt als Nachschlag für den Import-Tag)

Von Robertos PC aus (Konto `rciraci` hat auf `W:` und auf dem Server alle
Rechte), Eingabeaufforderung **als Administrator**:

1. Alle Cockpit-Fenster auf allen Rechnern schließen (Abend nach der
   Spätschicht oder morgens vor 06:00).
2. Kopieren mit Protokoll (nichts wird auf `W:` verändert):

   ```
   robocopy "\\SCHEUDC1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender" "\\v-btacockpit-01\BTA\BTA-Scheurich" /E /COPY:DAT /R:2 /W:5 /XF Werkstatt_Kalender_TPM*.html /LOG:%USERPROFILE%\Desktop\umzug-daten.txt
   robocopy "\\SCHEUDC1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender" "\\v-btacockpit-01\BTA\BTA-Programm\Update" Werkstatt_Kalender_TPM.html /COPY:DAT /R:2 /W:5 /LOG:%USERPROFILE%\Desktop\umzug-update.txt
   ```

   Die erste Zeile nimmt alles außer der App-HTML (Daten, Fotos, Sicherungen,
   Konflikt-Wächter) nach `BTA-Scheurich`; die zweite legt nur die HTML nach
   `BTA-Programm\Update`.
3. Kontrolle: Am Ende jeder robocopy-Ausgabe steht eine Tabelle „Dateien:
   Kopiert / Übersprungen / FEHLER“ – FEHLER muss 0 sein. Dann Byte-Vergleich
   der zwei Datendateien:

   ```
   dir "\\SCHEUDC1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender\werkstatt-*.json"
   dir "\\v-btacockpit-01\BTA\BTA-Scheurich\werkstatt-*.json"
   ```

   Beide Ausgaben müssen dieselben Größen zeigen.
4. **Noch nichts auf `W:` umbenennen.** Erst Schritt 8 (alle Rechner auf die
   Server-Pfade), dann Schritt 9.

## Offene Fragen

- Sind die Soendgen-Rechner und -Kollegen in **derselben Windows-Domäne** wie
  Scheurich? Nur dann können sie sich am Server anmelden, ohne dass die IT
  eine Vertrauensstellung einrichtet. (Hinweis vom 10.09.: „alle Standorte
  nutzen dasselbe Firmenlaufwerk" – spricht dafür.)
- Wer ist Robertos Vertreter (zweites Konto in `BTA-Verwalter`)?
