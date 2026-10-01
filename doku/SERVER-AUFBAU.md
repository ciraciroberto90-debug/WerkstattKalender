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

## 01.10.: UMZUG AUF EINEN NEUEN SERVER (Robertos Nachricht: „ich bekomme einen anderen Server, andere Adresse; einmalig, der neue bleibt meiner“)

**Was sich ändert:** nur die Maschine und ihr Name. Dienst, App, Werkzeuge und Datenformat sind
unabhängig vom Servernamen; der Name steht nirgends mehr fest (seit 01.10. schreibt das
Server-Werkzeug ihn beim Einrichten nach `05-Server\server-adresse.txt`, das Rechner-Werkzeug und
der Notfallzettel lesen ihn von dort).

**Was NICHT mitkopiert werden kann** (hängt am Server, nicht an Dateien): die fünf lokalen Gruppen
samt Mitgliedern, die NTFS-Rechte, die Aufgabe `bta-cockpit-dienst`, die Firewall-Regel, die
Freigabe. **Deshalb legt „Einrichten“ seit 01.10. als Schritt 0 die Grundlage selbst an**
(Ordner, Gruppen, Mitglieder aus Schritt 4, Rechte aus Schritt 3/3c, Freigabe `BTA`).

**Was nicht gebraucht wird:** die kopierte Datenbank. Auf dem alten Server lag nur der Import vom
30.09. plus ein Test-Zettel – der Import ist wiederholbar und nimmt den aktuellen W:-Stand. Eine
während des Laufens kopierte `cockpit.sqlite` ohne `-wal` wäre außerdem unvollständig.

**Stand 01.10. nachmittags (IT-Nachricht an Roberto):** neuer Server **`V-BTACOCKPIT-1`**, IP
**`10.253.64.131`**, Benutzer und Kennwort wie bisher, Remotedesktop von Robertos PC eingerichtet,
der alte Server ist heruntergefahren. Auf dem neuen Server liegen nur die Windows-Standardordner;
`C:\BTA`, Gruppen, Rechte und Freigabe legt „Einrichten“ (Schritt 0) an. Roberto hat die Ordner
des alten Servers auf seinen PC kopiert (`BTAServer`) – sie bleiben dort als Sicherung, auf den
neuen Server kommt nur der frische Stick-Ordner (ZIP 01.10. nachmittags, Werkzeug + Dienst 0.3.0).

Ablauf auf dem neuen Server (jeder Schritt einzeln, wie gewohnt):
- [x] **N0 – Stick auf den Server (01.10., 12:53):** Zwischenablage im Remotedesktop ging nicht; stattdessen Remotedesktop mit **Laufwerk-Umleitung** (mstsc → Optionen → Lokale Ressourcen → Weitere → Laufwerke). Auf dem Server erscheinen Robertos Laufwerke als „C auf L-RCIRACI“ … „W auf L-RCIRACI“ – **auch W:**, nützlich für den Import. ZIP von dort auf den Server-Desktop, entpackt nach `C:\Users\serviceBTA\Desktop\BTA-Cockpit-USB-Stick`.
- [x] **N1 – Prüfen (12:55):** wie erwartet – Admin grün, Node rot, Rest gelb. **Befund:** `C:\BTA`, `BTA-Scheurich`, `BTA-Soendgen` und die Freigabe `BTA` waren schon da (IT, 10:37), dazu ein Ordner **`BTA-Formwerk`** (IT, 10:38, nicht von uns – wird nicht angefasst). `BTA-Scheurich`/`BTA-Soendgen` leer (geprüft, 13:02) – keine alte Datenbank im Weg.
- [x] **N2 – Node (12:56–12:57):** Download 35 MB in 15 s, v22.23.3 im Dienst-Ordner.
- [x] **N3 – Vorschau (12:58):** Schritt 0 listet 3 Ordner, 5 Gruppen, 15 Mitgliedschaften, 13 Rechte-Einträge; Freigabe vorhanden. Protokoll 1258.
- [ ] **N4 – Einrichten:** **Erster Anlauf 13:04 ABGEBROCHEN** nach Ordnern, Gruppen und Mitgliedern: `FEHLER beim Einrichten: *BTA-Verwalter: Die Struktur der Sicherheitskennung ist unzulässig.` Ursache im Werkzeug: beim Rechte-Setzen stand ein `*` vor dem Gruppennamen (für icacls heißt `*` „es folgt eine SID“), und unter `ErrorActionPreference = Stop` ist die stderr-Zeile von icacls ein harter Abbruch – der vorgesehene zweite Versuch ohne `*` kam nie dran. Dieser Teil war am Morgen neu und auf dem alten Server nie gelaufen (dort Handarbeit). **Behoben (ZIP 13:15):** `Native-Ruhig` führt icacls/net ohne Abbruch aus und liefert Rückgabewert und Ausgabe; Gruppen-Namen ohne `*`; Protokoll zählt „Rechte gesetzt: n von 13“. Prüfen nach dem Abbruch (13:05): Ordner und Gruppen grün – Einrichten ist wiederholbar, Vorhandenes wird übersprungen. **Zweiter Anlauf 13:24 mit der neuen ZIP: FERTIG in 4 s** – „Rechte gesetzt: 13 von 13“, Dienst antwortet 0.3.0, Adresse `http://v-btacockpit-1:8765` auf den Stick geschrieben; Prüfen: acht Ampeln grün, Sicherung gelb (erste nachts 02:00). Protokoll 1325.
- [x] **N5 – Import (13:30–13:34):** W: war im Server-Explorer über das umgeleitete Laufwerk „W auf L-RCIRACI“ erreichbar → beide Dateien + `Fotos` nach `C:\BTA\BTA-Programm\Installation` kopiert (Kalender 4.684 KB Stand 12:44, Störungen 4.395 KB Stand 12:00). **Vorschau 13:32 (12,1 s):** Kalender 8.284 gelesen = **7.311 fachlich** + 958 Verlauf + 15 Einstellungen, 61 Löschliste, 8 wiederbelebt; Störungen 7.572 = **2.933 fachlich** + 4.624 Verlauf + 15 Einstellungen, 1.440 Löschliste; 7 Fotos. Gegen 30.09.: +5 / +2 / +1 – plausibel. **Import 13:33 (14 s): beide Nachweise 0 Abweichungen**, Datenbank 0/0 → 7.311/2.933 (Version 2), 7 Fotos kopiert. Status-Seite identisch, Fehler keine.
- [x] **N6 – App vom Server (13:38–13:50):** Status-Seite von Robertos PC über `http://v-btacockpit-1:8765/status` erreichbar (Name im Netz bekannt, Firewall offen). App-Datei getauscht – **erster Tausch 13:38 mit einer ALTEN HTML** (meine Arbeitskopie war um 11:26 zurückgesetzt, ich hatte den Bau vom 30.09. verschickt; Roll-out-Liste 44), zweiter Tausch 13:47 mit dem Stand aa88e22 (1.084 kB). `http://v-btacockpit-1:8765/app/` zeigt die Übersicht mit den fünf neuen Kacheln und den echten Daten (Tagesleistung 5·4·80 %, Backlog-Tacho 129). **Anmeldung, Zettel, zweiter Tab: 13:50 gemessen** – Version 2 → 5 (Anmeldung schreibt Verlauf + Einstellung, dazu der Zettel; gestern 3 → 6 ebenso), 7.312 Einträge, Verlauf 5.583, 2 Verbundene, Fehler keine.

**DER UMZUG IST DAMIT ERBRACHT (01.10., 13:50):** neuer Server `V-BTACOCKPIT-1` eingerichtet, Daten frisch von W: importiert (Nachweise 0), Cockpit läuft vom Server auf Robertos PC. Die Kopie des alten Servers (`BTAServer` auf Robertos PC) bleibt als Sicherung; die Kopien in `BTA-Programm\Installation` dürfen gelöscht werden. Weiter mit **19c (Foto-Test)** und **20 (Programm-ZIP mit Server-Weg)**; Werkstatt-PC im Testbetrieb danach.

## Etappe B – Import (ab 30.09. nachmittags)

- [x] **Schritt 17a** – Dienst auf 0.2.0 – **erledigt 30.09.** („0.2.0 steht“): Einrichten wiederholt, Dienst-Dateien getauscht, Neustart, Datenbanken unberührt.
- [ ] **Schritt 17b** – **Erster Anlauf 30.09., 21:47: „Zugriff verweigert“** – das Server-Konto `serviceBTA` darf den Werkstatt-Ordner auf `scheudc1` nicht lesen; das Werkzeug zeigte dafür das WinForms-Fehlerfenster statt einer Meldung (Test-Path wirft unter ErrorActionPreference=Stop) – behoben: `Datei-Lesbar` nennt den Grund, unbehandelte Fehler landen im Protokoll. **Ersatzweg:** die beiden Dateien (+ Ordner `Fotos`, falls da) von Robertos PC nach `\\v-btacockpit-01\BTA\BTA-Programm\Installation` kopieren, im Werkzeug über „…“ unter `C:\BTA\BTA-Programm\Installation` wählen. `W:` war seit 13:23 ausgefallen. **Zweiter Anlauf 21:56 über den Ersatzweg: VORSCHAU GEMESSEN** – Kalender 4,6 MB: 8.263 gelesen, 68 in der Löschliste, 15 Einstellungen, 0 ohne Kennung, 4,96 s; Störungen 4,3 MB: 7.567 gelesen, 1.440 Löschliste, 15 Einstellungen, 4,78 s; Fotos: 6 Dateien zu kopieren; gesamt 10,3 s, nichts verändert. **Befund zur Kennkarte (7.306):** die Dateien tragen neben den fachlichen Zeilen auch Verlauf (`log|…`, 90 Tage) und Einstellungen (`config|…`) – der Dienst zählte alles zusammen. **Behoben in 0.2.1:** Vorschau, Import-Meldung und Status-Seite weisen „fachlich / Verlauf / Einstellungen“ getrennt aus; `eintraege`/`stoerungen` zählen wie die Kennkarte.
- [x] **Schritt 17b-2 – VORSCHAU STIMMT MIT DER KENNKARTE ÜBEREIN (30.09., 22:06, Dienst 0.2.1):** Kalender 8.263 gelesen = **7.306 fachlich (exakt die Kennkarte)** + 942 Verlauf + 15 Einstellungen; Störungen 7.567 = **2.931 fachlich** (29.09.: 2.908, +23 in anderthalb Tagen) + 4.621 Verlauf + 15 Einstellungen; Löschlisten 68 / 1.440; 6 Fotos; 10,5 s. Zwischenanlauf 22:03 mit übersprungenem „Einrichten“ (Dienst noch 0.2.0 → leere „davon“-Zeile) → Werkzeug prüft jetzt die Dienst-Fassung vor dem Import. Freigabe für 17c. – Ausfall von `scheudc1` seit 30.09., 13:23 (IT-Rundmail Rudolf Russ: Volumen Public, temp, Verwaltung, PSG_Gruppe, O nicht erreichbar). Vor dem Import, sobald `W:` zurück ist: am Cockpit die Kennkarte prüfen (Einträge/Störberichte plausibel, nicht nahe null). Dann: Reiter Import → Standort Scheurich, beide W:-Pfade stehen vorbelegt → **„Nur pruefen (Vorschau)“**. Erwartet je Datei: Datei-Kopf (format, standort=scheurich, gespeichert …), Zählung „N gelesen – N neu, 0 geändert, 0 unverändert, … Löschliste, … Einstellungen, 0 ohne Kennung“, Fotos-Zeile, „VORSCHAU fertig“. **N muss zur Kennkarte im Cockpit passen** (29.09.: 7.285 Einträge / 2.908 Störberichte). Kommt „Zugriff verweigert“ auf W:, beide Dateien auf den Server-Desktop kopieren und über „…“ wählen.
- [x] **Schritt 17c – ERSTER ECHTER IMPORT 30.09., 22:08 (12,2 s):** Kalender 8.263 neu, Störungen 7.567 neu, Löschlisten 68 / 1.440, 6 Fotos kopiert, **beide Nachweise 0 Abweichungen**. **FUND:** Datenbank danach 7.298 fachlich statt 7.306 gelesen – acht Einträge stehen in der Datei gleichzeitig als Eintrag und in der Löschliste (nach dem Löschen neu angelegt); die App entscheidet nach Zeitstempel (`mergeEntries`: Löschmarke ≥ updatedAt = gelöscht, sonst lebt der Eintrag), der Dienst ließ die Löschliste blind gewinnen. **Behoben in 0.2.2** (B5 prüft beide Fälle, Vergleicher mit derselben Regel; 29/29). Störungen 2.931 = 2.931, kein Verlust.
- [x] **Schritt 17c-2 – ZWEITER IMPORT MIT 0.2.2, 30.09., 22:15 (11 s): STIMMT.** Kalender „8 neu, 0 geaendert, 8255 unveraendert“, „8 nach Loeschung neu angelegt (leben)“, Nachweis 0 → **7.306 / 2.931 fachlich**, Verlauf 5.563, Einstellungen 30, Version 3. Störungen „0 neu, 7567 unveraendert“, Nachweis 0, Version bleibt 3; Fotos „0 kopiert, 6 schon da“.
- [x] **Schritt 17d – Wiederholbarkeit mit echten Daten NACHGEWIESEN** (derselbe Lauf: die Störungsdatei war ein reiner Wiederholungsimport – nichts geschrieben, Version unverändert).

**ETAPPE B IST DAMIT ERBRACHT (30.09., 22:15):** Import-Nachweis 0 Abweichungen, Export gleicht dem Original, fachliche Zählung = Kennkarte (7.306 / 2.931), wiederholbar. Kopien in `BTA-Programm\Installation` dürfen gelöscht werden. Es folgt **Etappe C – App am Server** (Bauarbeit bei mir; Robertos nächster Klick kommt erst mit dem Testbetrieb auf seinem PC).
- [x] ~~Schritt 17c (ursprünglich)~~ – **„Import“** → Ja. Erwartet: Zählung wie in der Vorschau, „NACHWEIS OK – N Eintraege zurueckgelesen, 0 Abweichungen“ je Datei, „Datenbank Scheurich vorher 0/0 → nachher N/M“, Fotos kopiert, Meldung mit den Zahlen. Danach Status-Seite: Scheurich mit N Einträgen, M Störberichten. Protokoll speichern und schicken.
- [ ] **Schritt 17d** – Wiederholung: „Import“ noch einmal → alles „unveraendert“, Version bleibt (Nachweis der Wiederholbarkeit mit echten Daten).

## Etappe C – App am Server (Testbetrieb, ab 30.09. nachts)

Die App spricht im Server-Betrieb mit dem Dienst statt mit der Datei; erkannt wird das an der Adresse (`http://v-btacockpit-01:8765/app/`). Die Werkstatt bleibt auf `W:`, der Testbetrieb läuft gegen die importierte Datenbank auf dem Server – **was Roberto dort einträgt, landet NUR auf dem Server, nicht auf `W:`** (bis zum Umschalttag wird noch einmal importiert, der nimmt den W:-Stand; Test-Einträge auf dem Server gehen dabei nicht verloren, sind aber Testdaten).

- [x] **Schritt 18a** – App-Datei getauscht – **erledigt 30.09., 22:35** (1066 kB nach `C:\BTA\BTA-Programm\App`).
- [x] **Schritt 18b – DAS COCKPIT KOMMT VOM SERVER (30.09., 22:38, Robertos PC, Chrome):** `http://v-btacockpit-01:8765/app/` zeigt die echte Übersicht mit dem importierten Bestand (Pinnwand, offene Störung, Anwesende, Kennzahlen). **FUND:** „bei Klick auf Anmelden passiert nichts“ – unter `http://` ohne Zertifikat ist die Seite für Chrome kein „sicherer Kontext“, `crypto.subtle` fehlt, und die Kennwort-Prüfung (SHA-256) brach stumm ab. **Behoben:** `app/src/sha256.js` rechnet SHA-256 in JavaScript mit identischer Ausgabe, wenn der Browser es verweigert; Prüfstand C9 entfernt `crypto.subtle` und meldet sich über den Dialog an (12/12).
- [x] **Schritt 18b-2** – App-Datei 22:46 getauscht, **Anmeldung klappt (30.09., 22:48)**.
- [x] **Schritt 18c – ZWEI FENSTER, EIN SERVER (30.09., 22:51):** Pinnwand-Zettel „Servertest“ im ersten Tab, im zweiten Tab sofort da; Status-Seite: Scheurich **Version 6, 7.307 Einträge**, 2.931 Störberichte, Verlauf 5.565, gelöscht 1.500 (die acht wiederbelebten Einträge haben ihre Löschmarke verloren: 1.508 → 1.500), 4 verbundene Lauscher (zwei Tabs × zwei Speicherschichten), keine Fehler. **Damit ist der Kern von Etappe C auf Robertos PC gemessen.**
- [ ] **Schritt 18c** – Einen Test-Eintrag anlegen (z. B. To-do „Servertest“), dann auf dem Server die Status-Seite: Version +1, Einträge 7.307. Zweites Fenster (Werkstatt-PC oder zweiter Chrome-Tab): der Eintrag steht ohne Neuladen da.

- [ ] **Schritt 19a** – Stick-ZIP (Dienst 0.3.0: Fotos, Sicherungs-Ampel, Notfallzettel) → „Einrichten“ → Prüfen: **neun** Ampeln, die neunte „Letzte Sicherung“ gelb („noch keine – die erste kommt nachts um 02:00“) oder grün, falls „Sicherung jetzt“ gedrückt wurde; Fassung 0.3.0.
- [ ] **Schritt 19b** – neue App-Datei (30.09. spät) → „App-Datei tauschen…“ → am PC F5 → oben rechts „Gemeinsame Datei“ klicken: die **Server-Karte** (Verbunden mit …, Versionen, Schlüssel-Feld, „Jetzt abgleichen“, „Status-Seite“). Bild.
- [ ] **Schritt 19c** – Foto-Test: am Störbericht oder Zettel ein Foto anhängen und speichern → auf dem Server liegt es in `C:\BTA\BTA-Scheurich\fotos`, im zweiten Tab ist es sichtbar.

- [ ] **Schritt 20 (Vorbereitung Etappe D)** – neue Programm-ZIP bauen (`main.js` mit Server-Weg; `node programm/bauen.js` + `tools/stick-bauen.js --mit-programm`), Release v1.3; danach kann jeder Rechner über das Rechner-Werkzeug → Wartung → „Server-Weg einschalten“ umgestellt werden (Adresse `http://v-btacockpit-01:8765`, Schlüssel aus `einstellungen.json` des Dienstes, sobald einer gesetzt ist).

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
