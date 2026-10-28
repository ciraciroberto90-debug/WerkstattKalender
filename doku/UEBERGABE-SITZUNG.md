# Übergabe an die nächste Unterhaltung

Geschrieben am 28.10.2026 von der Entwicklungs-Unterhaltung, die seit Sommer
2026 in der Cloud lief. Roberto will ab jetzt **nur noch in einer Unterhaltung
auf seinem Firmenlaptop** arbeiten (Claude-Desktop-App, „Dieser Computer“).
Diese Datei ist das Gedächtnis, das dabei nicht verloren gehen darf. Alles,
was hier steht, ist gemessen oder von Roberto bestätigt; Ungemessenes ist so
gekennzeichnet.

**Zuerst lesen, in dieser Reihenfolge:** [`CLAUDE.md`](../CLAUDE.md)
(Hausregeln), diese Datei, dann in [`ROLLOUT-LISTE.md`](../ROLLOUT-LISTE.md)
die Punkte 42, 46–52, 60–72 (die jüngsten; die Liste ist lang, der Rest ist
Geschichte und steht da, falls Roberto danach fragt).

---

## 1. Wer Roberto ist und wie die Zusammenarbeit läuft

- Roberto Ciraci, Werkstattleiter bei Scheurich (Keramik), zweiter Standort
  Soendgen Keramik. Kürzel RC. Vertreter: AR. Privates Handy: Android.
- Er schreibt kurz, oft mit Bild (Screenshot oder Foto vom Bildschirm) und
  erwartet **kurze Antworten**. „ja bauen“ / „freigeben“ ist die Freigabe.
  Bei Gestaltungsfragen will er **erst Vorlagen sehen** (HTML-Vorlagen in
  `doku/vorlage-*.html`), dann wählt er („setze A um“).
- Server, Computerverwaltung, Cloudflare, Werkzeuge: **ein Schritt je
  Nachricht** mit Klickfolge, erwarteter Anzeige und Kontrolle. Entscheidungen
  einzeln abfragen, nie als Liste.
- Er hat **keine IT-Unterstützung** und will keine brauchen: keine Adminrechte
  am Laptop, keine Installation, keine Anfrage an die IT. Auf dem Server
  `v-btacockpit-01` ist er Admin.
- Neue Aufgaben, die nicht sofort erledigt werden, gehören **in derselben
  Sitzung in die Roll-out-Liste** und in denselben Push. Erledigtes wird
  durchgestrichen und mit „GEBAUT/BEHOBEN <Datum>“ ergänzt, nicht gelöscht.
- Antworten auf Deutsch, Code-Kommentare auf Deutsch und sie erklären das
  *Warum*. Keine Modell-Kennungen in Commits oder Dateien.

## 2. Stand der Dinge am 28.10.2026

| Was | Im Repo (Branch `claude/jolly-bell-qmnsv0`) | Auf Robertos Server / Geräten |
|---|---|---|
| App-Datei `Werkstatt_Kalender_TPM.html` | Bau 16b4635, **1.226.085 Bytes** (Roll-outs bis 71: Übergabe-Mappe, To-do von–bis, To-dos in der Planung, Nachtschicht-Schichttag) | **älter** – zuletzt getauscht 02.10. (1095 kB). Gemessen 28.10. in Downloads des Laptops: nur eine Datei vom 09.07. (264.553 Bytes) und eine vom 10.10. (1.226.380 Bytes, Vorgänger-Bau) |
| Dienst `server/dienst.js` | **0.6.1** (Abholer mit Marke statt Liste im Takt, automatisches Einsortieren) | **0.5.0** läuft (Status-Seite, Stand 07./08.10.; seither nicht neu gemessen) |
| Cloudflare-Worker `briefkasten/worker.js` | **0.3.0** (Weg `/neu` mit Marke, eingebetteter Zettel) | **0.2.0** läuft (`/status`, 08.10.) – damit besteht das Kontingent-Problem aus Roll-out 68 dort weiter |
| USB-Stick | `BTA-Cockpit-USB-Stick-0.6.1.zip` (Werkzeug mit `$DienstFassungStick = "0.6.1"`) | physischer Stick mit Werkzeug 0.3.0-Dienst (Zip vom 01.10. in Downloads) |
| Handy-Zettel | `handy/aufnahme-zettel.html`, kommt über `/zettel` vom Worker | läuft auf Robertos Android, Einrichtungs-Link/QR aus Roll-out 65 |

**Die drei offenen Einspiel-Schritte** (seit 08.10., Reihenfolge so lassen):

1. **Worker 0.3.0 in Cloudflare einfügen.** Dashboard → Workers & Pages →
   `bta-briefkasten` → Edit code → kompletten Inhalt von `briefkasten/worker.js`
   einsetzen → Deploy. Kontrolle:
   `https://bta-briefkasten.roberto-ciraci.workers.dev/status` zeigt Fassung
   0.3.0. Schlüssel und KV-Bindung (`ABLAGE`) bleiben dabei erhalten, sie
   hängen an den Einstellungen des Workers, nicht am Code.
2. **Dienst 0.6.1 auf den Server.** Stick-Inhalt aktualisieren (Abschnitt 4),
   am Server `werkzeug\BTA-Server-Werkzeug.cmd` → Reiter Einrichten →
   „Einrichten“. Kontrolle: `http://v-btacockpit-01:8765/status` zeigt 0.6.1
   und unter „Briefkasten“ die Zeile „N Nachfragen, davon M Listen“.
3. **App-Datei tauschen.** Server-Werkzeug → „App-Datei tauschen…“ → die
   gebaute HTML wählen. Das Werkzeug hebt die alte als
   `Werkstatt_Kalender_TPM.vor-<Datum>.html` auf. Kontrolle: Größe am Ziel
   1.226.085 Bytes, Status-Seite zeigt unter „App“ den neuen Stand; jeder
   Rechner hat sie beim nächsten Öffnen (die Programm-Hülle zeigt auf
   `http://v-btacockpit-01:8765/app/`).

## 3. Wo alles liegt

- **Server `v-btacockpit-01`:** `C:\BTA\BTA-Programm\Dienst\` (node.exe
  portabel, dienst.js, db.js, `einstellungen.json`, **`briefkasten.json`**,
  `protokoll\`), `C:\BTA\BTA-Programm\App\Werkstatt_Kalender_TPM.html`
  (ausgeliefert unter `/app/`, daneben `aufnahme-zettel.html`),
  `C:\BTA\BTA-Scheurich\` und `C:\BTA\BTA-Soendgen\` (SQLite je Standort,
  Fotos), Sicherungen daneben. Vom Laptop aus: `\\v-btacockpit-01\BTA\…`,
  Status-Seite `http://v-btacockpit-01:8765/status`. Autostart über die
  Aufgabenplanung, Firewall-Regel 8765 (Roberto als Admin gesetzt).
- **Altes Firmenlaufwerk `W:`** = `\\SCHEUDC1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender`
  (Datendateien `werkstatt-kalender-daten.json`, `werkstatt-stoerungen.json`,
  Update-Ordner). Seit dem Server-Weg (02.10.) nur noch Rückfallebene; der
  Umschalttag (Roll-out 46/47/50/51) ist noch nicht gemacht.
- **Cloudflare:** Konto von Roberto, Worker `bta-briefkasten`, KV-Namespace
  als Variable `ABLAGE` gebunden, zwei Geheimnisse unter „Settings →
  Variables and Secrets“: `EINWURF_SCHLUESSEL` (Handy wirft ein) und
  `ABHOL_SCHLUESSEL` (Dienst holt ab). Frei-Kontingent: 100.000 Lesen /
  1.000 Listen / 1.000 Schreiben / 1.000 Löschen je Tag.
- **Die Schlüssel stehen bewusst NICHT im Repo und kommen nie hinein.** Wer
  sie braucht, findet den Abhol-Schlüssel in `briefkasten.json` auf dem Server
  und beide im Cloudflare-Dashboard. Im Einrichtungs-Link/QR für das Handy
  steckt der Einwurf-Schlüssel (`#kuerzel=…&adresse=…&schluessel=…`).
- **Stick-Quellen:** `programm/verteilung/usb-stick/` (Werkzeuge
  `werkzeug/cockpit-werkzeug.ps1` für PCs, `werkzeug/server-werkzeug.ps1` für
  den Server, `02-Einstellungen/standard-einstellungen.json`, `05-Server/`).
- **Doku:** `doku/ANLEITUNG.md` (Bedienung, wird mit jedem Roll-out
  ergänzt), `doku/BAUPLAN-SERVER-SYSTEM.md` (Architektur, Abschnitt 13 =
  Briefkasten), `doku/SERVER-AUFBAU.md` (Klickanleitung Server),
  `briefkasten/LIESMICH-BRIEFKASTEN.md` (Cloudflare einrichten, Fehlertabelle,
  Kosten), `05-Server/LIESMICH-SERVER.txt`.

## 4. Wie gebaut wird

```bash
cd app && npm install && npm run build      # → Werkstatt_Kalender_TPM.html im Repo-Wurzelordner
node briefkasten/worker-bauen.js            # nach jeder Änderung an kern.js oder handy/aufnahme-zettel.html
node tools/stick-bauen.js --mit-server      # Stick-Zip neu (--mit-node holt node.exe von nodejs.org, ~35 MB)
node tools/startpaket-bauen.js              # nach jeder Änderung in arbeitsplatz/
```

- Node und npm werden ohne Adminrechte gebraucht (portables Node reicht,
  es liegt im Stick-Ordner `05-Server`). **Ungemessen am 28.10.:** ob Git,
  Node und npm auf Robertos Laptop vorhanden sind – das ist der erste Schritt
  der neuen Unterhaltung (Roll-out 72).
- Der Bau-Befehl kopiert seit 28.10. mit Node statt mit `cp`, läuft also
  auch unter Windows ohne Git-Bash.
- Vor dem Einspielen die gebaute Datei gegen den Repo-Stand prüfen (Größe,
  ein Merkmal per Suche im Text, z. B. `data-stoer-nacht-hinweis` für
  Roll-out 71). Nie eine Datei verschicken oder kopieren, die nicht aus dem
  gerade gepushten Stand stammt.
- Die Programm-Hülle (Electron) wird nicht neu gebaut; sie ist seit dem
  Server-Weg nur ein Fenster auf `/app/`.

## 5. Tests – die wichtigste Einschränkung für den Laptop

- Die Suite (`bash tests/run-hardness-tests.sh`, 104 Dateien `harte-*.js`,
  Playwright-core gegen Chromium) und die Server-Prüfstände
  (`tests/server/pruefe-*.js`) sind **fest an die bisherige Cloud-Umgebung
  gebunden**: 108 Dateien enthalten die festen Pfade
  `/home/user/WerkstattKalender` und `/opt/pw-browsers/chromium`. **Auf dem
  Windows-Laptop laufen sie so nicht** (gemessen 28.10. per Suche, nicht
  durch einen Lauf unter Windows).
- Bis die Suite tragbar ist (Roll-out 73): Änderungen am **Zusammenführen,
  Speichern oder an der Dateiverbindung** brauchen laut Hausregel einen
  Rot-Nachweis-Test. Solche Änderungen gehören deshalb weiterhin in eine
  Cloud-Unterhaltung auf demselben Repo (die hat alle Dateien, nur nicht
  Robertos Rechner) oder warten auf Roll-out 73. Oberflächen-Änderungen ohne
  Sync-Berührung kann der Laptop bauen und einspielen; der Test wird dann
  als „ungemessen“ in die Liste geschrieben und nachgeholt.
- Regeln, die sich bewährt haben: nie bauen, während die Suite läuft (der
  Bau tauscht die HTML unter den laufenden Tests aus); keine eigenen
  Chromium-Läufe parallel zur Suite; harte-70 und harte-108 (6) sind unter
  Suite-Last gelegentlich rot und standalone grün (Umgebung, nicht Code);
  Rot-Nachweis gegen einen alten Bau geht über `APP_PFAD=<alte html>` und
  `git show <alter commit>:Werkstatt_Kalender_TPM.html > alt.html`; harte-65
  wacht über den Quelltext der Druckfunktionen (`${DRUCK_FARBTREUE}` muss in
  jedem Druckblatt auf eigener Zeile unter `@page` stehen); Server-Prüfstände
  mit `node --no-warnings`.

## 6. Gelernte Fallen (damit sie nicht noch einmal passieren)

- `pkill -f` mit einem Muster, das in der eigenen Befehlszeile vorkommt,
  beendet die eigene Shell (dreimal passiert, exit 144).
- Ein Einrichtungs-Link für den Zettel, der nur die Raute ändert, braucht den
  `hashchange`-Hörer – ist gebaut, aber beim Testen am Handy daran denken.
- Cloudflare KV: 1.000 Listen-Vorgänge je Tag. Ein Abholer im 30-s-Takt mit
  Liste je Takt sprengt das in acht Stunden (Vorfall 07.10. 21:04). Darum
  die Marke (`/neu`) – nie wieder eine Liste je Takt einbauen.
- Störungs-Nachtschicht gehört zum Tag ihres Beginns (`stoerSchichtTag`).
  Bestehende Berichte werden nicht umgeschrieben, die Anzeige rechnet.
- Beim Bau derselben Quelle kann der Minifizierer wenige Zeilen anders
  anordnen (gleiche Größe, anderer Inhalt). Deshalb gilt als Referenz immer
  die **gepushte** HTML, nicht ein frischer Bau derselben Quelle.
- Dateianhänge aus der Cloud-Unterhaltung kamen bei Roberto nicht zuverlässig
  in Downloads an (Befund 28.10.). Mit der Laptop-Unterhaltung entfällt das:
  direkt aus dem Repo-Ordner auf den Server kopieren.

## 7. Offen (Kurzfassung, Einzelheiten in der Roll-out-Liste)

- Einspielen: die drei Schritte aus Abschnitt 2.
- 72 Laptop-Unterhaltung einrichten, 73 Suite tragbar machen.
- 60 Tagesplan kompakt, 62, 63, 55, 56; 46/47/50/51 Umschalttag und
  Excel-Quellen am Server; 42 harte-70-Testfenster auf 24 s; iPhone-Messung
  des Zettels; 67 QR mit Anlagenliste; Angebot „Planungs-Druck auf zwei
  Seiten“; bewusst nicht gebaut: Kästchen „für die Übergabe“ in den Listen.

## 8. Erster Arbeitstag der neuen Unterhaltung

1. `git --version`, `node --version`, `npm --version` messen; Erreichbarkeit
   von `\\v-btacockpit-01\BTA\BTA-Programm\App`, der Status-Seite und des
   Worker-`/status` messen. Ergebnis als Tabelle an Roberto.
2. Repo klonen (Branch `claude/jolly-bell-qmnsv0`), `cd app && npm install &&
   npm run build`, Größe und Merkmal prüfen.
3. Die drei Einspiel-Schritte, einer je Nachricht, in der Reihenfolge
   Worker → Dienst → App-Datei. Nach jedem Schritt die Roll-out-Liste
   fortschreiben und pushen.
4. Erst danach neue Bauwünsche annehmen.
