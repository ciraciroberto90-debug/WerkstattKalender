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
- [ ] **Schritt 2** – die fünf Gruppen anlegen (Computerverwaltung → Lokale Benutzer und Gruppen)
- [ ] **Schritt 3** – Mitglieder eintragen (Windows-Anmeldenamen der Kollegen je Standort)
- [ ] **Schritt 4** – Freigabe-Berechtigung auf `BTA` setzen
- [ ] **Schritt 5** – NTFS-Rechte je Ordner (Vererbung an den Standort-Ordnern trennen)
- [ ] **Schritt 6** – Zugriff testen: je ein Konto aus Werkstatt und Ansehen an einem PC
- [ ] **Schritt 7** – Daten kopieren (alle Cockpits zu), Byte-Größen vergleichen
- [ ] **Schritt 8** – Stick und Werkzeug auf die Server-Pfade (baue ich), je Rechner „Pfade speichern"
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

## Offene Fragen

- Sind die Soendgen-Rechner und -Kollegen in **derselben Windows-Domäne** wie
  Scheurich? Nur dann können sie sich am Server anmelden, ohne dass die IT
  eine Vertrauensstellung einrichtet. (Hinweis vom 10.09.: „alle Standorte
  nutzen dasselbe Firmenlaufwerk" – spricht dafür.)
- Wer ist Robertos Vertreter (zweites Konto in `BTA-Verwalter`)?
