# Server-Aufbau BTA-Cockpit (v-btacockpit-01)

Stand: 29.09.2026 – wird Schritt für Schritt mit Roberto ergänzt. Der Server
ist ein Windows Server (Rolle Datei-/Speicherdienste), Roberto ist dort Admin.
Freigabe: `\\v-btacockpit-01\BTA` (im Explorer auch als `M:` über die IP).

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
- [ ] **Schritt 7** – Daten kopieren (alle Cockpits zu), Byte-Größen vergleichen
- [ ] **Schritt 8** – je Rechner Werkzeug → Wartung → „Pfade speichern“ (Server-Pfade sind seit 29.09. in Werkzeug, Stick-Einstellungen und Aufsetz-PDF hinterlegt; Stick erst NACH Schritt 7 neu bespielen)
- [ ] **Schritt 9** – Kontrolle je Rechner (Kennkarte), alten Ordner auf `W:` umbenennen
- [ ] **Schritt 10** – Schattenkopien + nächtliche Sicherungsaufgabe
- [ ] **Schritt 11** – Komplettpaket nach `BTA-Programm\Installation`, Werkzeug bekommt den Server als ersten Download-Weg

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

## Schritt 7 im Detail – der Umzug (einmal, wenn niemand im Cockpit arbeitet)

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
