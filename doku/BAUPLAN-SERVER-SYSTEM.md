# Bauplan: BTA-Cockpit auf dem eigenen Server (Backend + App) – Vorlage zur Freigabe

Stand: 30.09.2026. Robertos Entscheidung vom 29.09.: Der Betrieb bleibt auf
dem Firmenlaufwerk, bis das neue System auf `v-btacockpit-01` komplett gebaut
und getestet ist; dann Import, Test, Umschalten. Dieser Plan ist die Vorlage.
Gebaut wird erst nach Robertos Freigabe, Etappe für Etappe, jede mit Nachweis.
**Arbeitsregel (Roberto, 30.09.):** Alles am Server geschieht Schritt für
Schritt – ein Schritt je Nachricht mit Klickfolge, erwarteter Anzeige und
Kontrolle, der nächste erst nach Rückmeldung. Die Etappen unten sind deshalb
Kapitel, keine Arbeitspakete; jedes wird in Einzelschritte zerlegt, wenn es
dran ist. Auch die Entscheidungen in Abschnitt 9 werden einzeln abgefragt.

---

## 1. Leitsätze – was aus diesem Monat gelernt ist

| Erkenntnis (gemessen) | Regel für den Neubau |
|---|---|
| Alle Störfälle kamen von „viele Rechner schreiben eine Datei" | **Genau ein Schreiber: der Dienst auf dem Server.** Rechner schicken Änderungen, sie schreiben nie selbst. |
| Halbe Dateien, 0-KB-Reste, EPERM | **Jede Änderung ist eine Transaktion** (SQLite, WAL). Ganz oder gar nicht. |
| Der 30-Sekunden-Abgleich und das Ganzdatei-Lesen (4,6 MB je Start) | **Der Server sagt Bescheid** (Server-Sent Events) und liefert nur Änderungen seit Stand X. |
| 5-MB-Grenze des Browser-Speichers erreicht | **Kein Ganzbestand mehr im Rechner.** Der Rechner hält einen Ausschnitt in IndexedDB, der Server hat alles. |
| „Das Blatt zeigte die laufende Schicht", Doppelklick, Hänger – alles nur durch Messen gefunden | **Jede Etappe hat einen Prüfstand, der ohne die Änderung rot ist.** Die 95 Härtetests bleiben die Messlatte der Oberfläche. |
| Update-Ordner, ZIP-Tausch, Programm-Stand-Tabelle | **Der Server liefert die App aus.** Ein Stand für alle, beim nächsten Öffnen. |
| Kennwörter als Leitplanke, Benutzerwechsel-Dialoge | **Anmeldung = Windows-Konto.** Rollen weiter aus der Benutzerliste im ⚙. |
| Verbinden-Dialoge, Schreibprobe, Merkliste, Kollisions-Heilung, Zwischendateien-Aufräumen, Programm-Stand-Meldung | **Alles, was nur wegen der Datei existierte, fällt weg.** Weniger Code, weniger Stellen, die hängen können. |
| „Keine IT nötig" | **Bleibt.** Roberto ist Admin auf dem Server; Node läuft portabel; Port und Autostart setzt er selbst. Nur ein HTTPS-Zertifikat wäre IT – und ist im Firmennetz nicht nötig. |

---

## 2. Architektur

```
 Werkstatt-PC / Monitor / Robertos PC / Handy im WLAN
 ┌──────────────────────────────────────────────┐
 │  Programm-Hülle (Electron)  ODER  Browser     │
 │  ┌────────────────────────────────────────┐  │
 │  │ BTA-Cockpit (heutige Oberfläche, React) │  │
 │  │ Speicherschicht NEU: server-client.js   │  │
 │  │  · Cache in IndexedDB (Ausschnitt)      │  │
 │  │  · Warteschlange, wenn Server fehlt     │  │
 │  └────────────────┬───────────────────────┘  │
 └───────────────────┼──────────────────────────┘
                     │ HTTP (JSON) + SSE (live), Port 8765, Firmennetz
 ┌───────────────────▼──────────────────────────┐
 │  v-btacockpit-01 · Dienst "bta-cockpit-dienst"│  Node.js, Autostart (Aufgabenplanung),
 │  ┌──────────────┐  ┌───────────────────────┐ │  läuft als Konto SYSTEM (30.09., s. Abschnitt 6)
 │  │ Schnittstelle │  │ Auslieferung der App  │ │
 │  │ /api/…        │  │ /app/… (eine HTML)    │ │
 │  └──────┬───────┘  └───────────────────────┘ │
 │         ▼                                     │
 │  SQLite je Standort (WAL)                     │  C:\BTA\BTA-Scheurich\cockpit.sqlite
 │  Fotos als Dateien                            │  C:\BTA\BTA-Scheurich\fotos\
 │  Sicherung nächtlich + JSON-Export            │  C:\BTA\BTA-Sicherung\
 │  Status-Seite /status, Protokoll              │  C:\BTA\BTA-Programm\Dienst\protokoll\
 └───────────────────────────────────────────────┘
```

**Ein Dienst, zwei Standorte:** Scheurich und Soendgen sind zwei Datenbanken
im selben Dienst (`/api/scheurich/…`, `/api/soendgen/…`). Die Standort-Wahl
der App bleibt, die Trennung ist auf dem Server hart (eigene Datei, eigene
Rechte über die Server-Gruppen aus SERVER-AUFBAU).

**Was in der Oberfläche gleich bleibt:** alles Sichtbare – Übersicht, Kacheln,
Schichtplan, TPM/R+I, Berichte, Störungen, Zeiterfassung, Rechte-Matrix,
Regeln & Listen, Ausdrucke, Schichtbericht, Monitor. **Was wegfällt:**
Datei-Dialog „Gemeinsame Datei", Schreibprobe, Verbinden/Trennen, Merkliste,
Zwischendateien-Befund, Programm-Updates-Ordner, Programm-Stand-Meldung,
Kollisions-Heilkette, Notbremse gegen Massenlöschung (wird Server-Regel),
Jahres-Archiv gegen die 5-MB-Grenze (nicht mehr nötig; bleibt als Export).

---

## 3. Datenmodell (SQLite)

Grundsatz: **Die heutigen Einträge werden 1:1 übernommen**, nicht umgebaut.
Jede Datenart (SCHICHT, ARBEIT, TODO, ZEIT, TPM, RI, TERMIN, NOTIZ, PLANNOTIZ,
SCHICHTNOTIZ, Pinnwand …) bleibt ein Eintrag mit denselben Feldern – als JSON
in einer Spalte, plus die Kernfelder als echte Spalten für Suche und Sortierung.
So ist der Import verlustfrei und die Oberfläche muss keine Felder umlernen.

```
eintraege      id TEXT PK · category · date · name · status · updated_at
               · version INTEGER (läuft je Änderung hoch) · geloescht INTEGER
               · daten JSON (der komplette heutige Eintrag)
stoerungen     id TEXT PK · nr · date · schicht · anlage · offen · updated_at
               · version · geloescht · daten JSON
konfig         schluessel TEXT PK (benutzer, rechte, regeln, tpmAnlagen, riItems,
               team, links, uebersichtVorlagen, monitor, oee, kostenstellen, …)
               · version · daten JSON
verlauf        lfd INTEGER PK · zeit · benutzer · aktion · ziel · details
               (heute: die "log|"-Einträge in der Datei)
aenderungen    lfd INTEGER PK · version · tabelle · id · benutzer · zeit
               (das Journal, aus dem "alles seit Version X" beantwortet wird)
fotos          id · stoerung_id · dateiname · groesse · zeit  (Datei liegt in fotos\)
```

- **Version statt Zeitstempel als Schloss.** Jede Änderung trägt die Version,
  auf der sie fußt (heute `basis`). Passt sie nicht mehr, antwortet der Server
  mit dem fremden Stand – die App zeigt den heutigen gelben Kollisions-Hinweis,
  aber sofort statt nach dem nächsten Abgleich.
- **Löschen = Markierung**, nie Entfernen (heute `deleted`-Liste). Ein
  „Kürzlich gelöscht"-Papierkorb (vorgemerkt seit 19.08.) wird damit ein
  Filter, kein Umbau.
- **Uhr des Servers** gilt für `updated_at`. Die fremden Rechner-Uhren, die im
  Sync-Kern drei Sonderregeln brauchten, spielen keine Rolle mehr.

---

## 4. Schnittstelle (HTTP, JSON)

| Weg | Zweck |
|---|---|
| `GET /api/{standort}/stand?seit={version}` | Alles, was sich seit Version X geändert hat (Einträge, Störungen, Konfig, Löschungen). `seit=0` = Vollbestand, seitenweise. |
| `POST /api/{standort}/aenderungen` | Ein Bündel Änderungen mit `basisVersion`. Antwort: neue Version, oder `409` mit dem fremden Stand der betroffenen Einträge. |
| `GET /api/{standort}/ereignisse` (SSE) | „Es gibt Version X" – die App holt sich dann den Stand. Kein Polling. |
| `GET /api/{standort}/export.json` | Der Bestand im **heutigen Dateiformat** (`werkstatt-kalender-v1`). Rückfallnetz und Handexport. |
| `GET /api/{standort}/fotos/{id}` · `POST …/fotos` | Fotos am Störbericht. |
| `GET /api/{standort}/quellen` · `GET/POST/DELETE …/quellen/{name}` | **Excel-Quellen (0.4.0, 02.10.):** Kopie der Tabellen, die die App nur liest (OEE, später Budget-Ist). Der Dienst kommt nicht an `W:` – ein Programm mit Laufwerkszugriff spielt die Datei ein (`?stand=` = Änderungszeit der Vorlage), Browser und Monitor lesen die Kopie. Nur Tabellen-Endungen, kein Pfad; Einspielen mit Werkstatt-Schlüssel. |
| `POST /api/{standort}/briefkasten` | **Briefkasten jetzt abholen (0.5.0, 06.10.)** – sonst im Takt (30 s). Antwort: Stand des Abholers (erreichbar, abgeholt, im Briefkasten, letzter Fehler). Siehe Abschnitt 13. |
| `GET /status` | Datenbankgröße, Version, letzte Sicherung, verbundene Rechner, Antwortzeit, Fehler der letzten 24 h, **Briefkasten** – auch im ⚙ sichtbar. |
| `GET /app/` | Die App selbst (eine HTML). Neuer Stand = Datei tauschen. |
| `GET /zettel` | (0.5.0) Der Aufnahme-Zettel fürs Handy (`aufnahme-zettel.html` neben der App-Datei) – im WLAN einmal laden, dann „Zum Startbildschirm". |
| `GET /api/ich` | Wer bin ich laut Server (Konto, Standort-Gruppen, App-Rolle). |

Größenordnung, gemessen an heute: Vollbestand Scheurich 7.285 Einträge +
2.908 Störberichte ≈ 9 MB JSON; als Delta nach dem ersten Laden nur noch
Kilobytes. Ziel: Start unter 1 s auch bei 71.000 Einträgen je Jahr (erster
Start lädt den Ausschnitt „laufendes Jahr + alles Offene", Rest auf Abruf).

---

## 5. Anmeldung und Rechte

**Robertos Vorgabe (30.09.): Anmeldung bleibt, wie sie heute ist** – Benutzer und
Rollen aus der Benutzerliste im ⚙ (Verwalter / Bearbeiter / Leser, „Nur
ansehen ohne Anmeldung“, Gruppen-Verwalter). Der Rechner merkt sich die
Anmeldung wie heute. Kein neuer Dialog, nichts umlernen.

Was sich trotzdem verbessert, ohne dass es jemand merkt: Die Kennwörter
liegen nicht mehr in einer Datei, die jeder auf dem Laufwerk lesen kann,
sondern nur noch auf dem Server (gesalzen gespeichert, Prüfung dort). Der
Server prüft jede Anfrage gegen die Rolle – ein Leser kann auch mit einem
manipulierten Programm nichts schreiben; heute verhindert das nur die
Oberfläche.

**Ausbau, nur auf Zuruf:** Anmeldung über das Windows-Konto (Programm-Hülle
kennt `USERNAME`/`USERDOMAIN`; Server gleicht mit den Server-Gruppen ab) –
spart den Dialog, ändert an Rollen und Rechten nichts. Eine fälschungssichere
Fassung (integrierte Windows-Anmeldung, `node-sspi`) wäre der Schritt danach.
Beides ist vorbereitet, keins davon Voraussetzung.

**Rechte-Matrix, Rollen, Störungen für alle, Gruppen-Verwalter (GodMode):**
bleiben unverändert – der Server liest dieselbe Konfig.

## 6. Betrieb auf dem Server

```
C:\BTA\BTA-Programm\Dienst\      node.exe (portabel), dienst.js, einstellungen.json, protokoll\
C:\BTA\BTA-Programm\App\         Werkstatt_Kalender_TPM.html (ausgeliefert unter /app/)
C:\BTA\BTA-Scheurich\            cockpit.sqlite (+ -wal, -shm), fotos\, export\
C:\BTA\BTA-Soendgen\             cockpit.sqlite, fotos\, export\
C:\BTA\BTA-Sicherung\            2026-09-30_0200_scheurich.sqlite … (30 Tage), export_*.json (14 Tage)
```

- **Autostart:** Aufgabenplanung „Beim Systemstart", **Konto `SYSTEM`** (geändert
  30.09. beim Bau des Werkzeugs: für `serviceBTA` müsste das Werkzeug ein Kennwort
  abfragen und in der Aufgabe hinterlegen, das bei jedem Kennwort-Wechsel der IT
  ausläuft; der Dienst braucht nur `C:\BTA` auf dem eigenen Server, keine
  Freigabe im Netz – dafür reicht SYSTEM), „bei Fehler neu starten 3× je 1 min",
  ohne Zeitlimit, ohne angemeldeten Benutzer. Kein Installer, kein Dienst-Rahmen
  nötig (nssm bleibt als Option).
- **Port 8765** (heute schon der Cockpit-Port), Firewall-Regel „eingehend
  erlauben" setzt Roberto als Admin. Rechner sprechen `http://v-btacockpit-01:8765`.
- **Sicherung:** Die IT sichert das ganze Firmennetz einmal täglich, also
  auch `C:\BTA` (Roberto, 30.09.). Damit diese Sicherung etwas taugt, legt der
  Dienst nachts um 02:00 eine **konsistente Kopie** der Datenbank
  (`VACUUM INTO`) und einen `export.json` im heutigen Format nach
  `BTA-Sicherung` – eine offene Datenbank-Datei mitten im Schreiben wäre in
  einer Netzsicherung sonst unbrauchbar. 14 Stände bleiben liegen, der Rest
  ist Sache der IT-Sicherung. **Rückweg wird in Etappe A einmal geübt:** Dienst
  stoppen, Kopie einspielen, starten, Stand prüfen – als Klick-Anleitung in
  SERVER-AUFBAU. Schattenkopien auf `C:` sind damit optional.
- **Wenn der Server fehlt:** Die App zeigt den letzten Stand (IndexedDB) zum
  Ansehen mit roter Leiste „Server nicht erreichbar seit 14:02", Änderungen
  landen in einer Warteschlange und gehen beim Wiederkommen raus (mit
  Kollisionsprüfung). Kein stilles Auseinanderlaufen, keine zweite Quelle.
- **Server-Pflege (zu klären, nicht Software):** Windows-Updates und Neustarts
  des Servers – IT oder Roberto; Zeitfenster außerhalb der Schichten.

---

## 7. Prüfstände (Pflicht je Etappe)

| Prüfstand | Was er beweist |
|---|---|
| `server-tests/*.js` (Node, echter Dienst auf freiem Port, Wegwerf-Datenbank) | Schnittstelle: Delta, Konflikt 409, Löschen, Konfig, Export im v1-Format, Status. |
| **Import-Nachweis** | JSON von `W:` → Datenbank → `export.json` → Vergleich Eintrag für Eintrag mit dem Original: **0 Abweichungen**, Zahlen im Protokoll (7.285 / 2.908 / Konfig-Schlüssel / Verlaufszeilen / Fotos). |
| **Zwei Schreiber gleichzeitig** | Zwei Rechner ändern denselben Eintrag in derselben Sekunde: einer gewinnt, der andere sieht sofort den Hinweis, nichts geht verloren (heute harte-70/83, dann ohne 11-s-Heilkette). |
| **Server weg / Netz weg** | Ansehen geht, Änderung wartet, kommt nach Rückkehr an; kein Doppel. |
| **Last** | 71.084 Einträge (Generator vom 11.09.): Start, Bereichswechsel, Speichern – Vorher/Nachher-Tabelle gegen die Datei-Fassung. |
| **Die 95 Härtetests** | laufen gegen eine Server-Attrappe im Browser weiter (die Oberfläche darf sich nicht ändern) – wer rot wird, zeigt, was der Umbau versehentlich berührt hat. |
| **Programm-Hülle am echten Electron** | `pruefe-programm.js` umgestellt: Start, Konto-Kopfzeile, Auslieferung, Neustart des Dienstes während die App offen ist. |
| **Rückweg** | Sicherung einspielen, Stand stimmt. Einmal echt, protokolliert. |

Rot-Nachweis wie bisher: Jeder Prüfstand läuft einmal gegen den Stand ohne die
jeweilige Änderung und muss dort fehlschlagen.

---

## 8. Etappen, Nachweise, grobe Dauer

| Etappe | Inhalt | Nachweis | Dauer (Sitzungen) |
|---|---|---|---|
| **A – Server-Kern** | Dienst, SQLite, Schnittstelle, SSE, Status-Seite, Sicherung + geübter Rückweg, Autostart auf `v-btacockpit-01`, Firewall. Läuft neben `W:`, berührt nichts. | server-tests grün; `/status` von einem Werkstatt-PC erreichbar; Rückweg protokolliert. **ERBRACHT 30.09.** (24/24 + 5/5; `/status` von Robertos PC; Rückweg 6 s, SERVER-AUFBAU Schritt 15b) | 3–4 → **1 Sitzung** |
| **B – Import** | Einleser JSON → Datenbank (Einträge, Störungen, Konfig, Verlauf, Löschliste, Fotos), wiederholbar (zweimal einlesen = kein Doppel). Testimport mit dem echten Abendstand von `W:`. | Import-Nachweis 0 Abweichungen; Export gleicht dem Original. **GEBAUT 30.09.** (Dienst 0.2.0: Vorschau, Standort-Wächter, Nachweis im Dienst; Werkzeug-Reiter Import; 28/28, 5/5, PowerShell-Transport gemessen) – **ERBRACHT 30.09., 22:15** mit dem echten Abendstand von `W:`: 7.306 / 2.931 fachlich = Kennkarte, Nachweise 0, wiederholbar; zwei Funde dabei behoben (Zählung wie die Kennkarte, Löschliste nach Zeitstempel) | 2 → **1 Sitzung** |
| **C – App am Server** | `server-client.js` ersetzt Datei-Speicherschicht; IndexedDB-Cache; Warteschlange; Anmeldung Stufe 1; Auslieferung unter `/app/`; Entschlackung der Datei-Bausteine; Hülle umgestellt. Testbetrieb auf Robertos PC + einem Werkstatt-PC gegen den Testimport. | 95 Härtetests grün gegen Attrappe; Zwei-Schreiber-, Ausfall- und Last-Prüfstände grün; Electron-Prüfstand grün. **STAND 30.09. nachts:** Speicherschicht, Spiegel, Warteschlange, 409, SSE, Schlüssel, Fotos, Server-Karte, Hülle – gebaut; Härtetests 95/95 gegen den echten Dienst (`pruefe-app-am-server` 15/15) und Datei-Weg 95/95; Electron 41/41; Testbetrieb auf Robertos PC läuft (Anmeldung, Zettel live). Offen: Entschlackung (nach D), Werkstatt-PC im Testbetrieb. | 5–7 → **1 Sitzung** |
| **D – Umschalttag** | Abends: alle Cockpits zu, letzter Import, Vergleich, Rechner per Werkzeug auf den Server (Hülle zeigt auf `http://v-btacockpit-01:8765/app/`), `W:`-Ordner umbenennen (zwei Wochen aufheben), Stick neu. | Kennkarte je Rechner: Server, Version, Konto; erste Schicht ohne Meldung. | 1 + zwei Wochen Beobachtung |

Zeit insgesamt grob drei bis vier Wochen Sitzungen. Die Kollegen merken bis
Etappe D nichts. Was in dieser Zeit im heutigen Programm gefunden wird, wird
weiter dort behoben (kleine Fixes), größere Wünsche warten auf das neue System.

---

## 9. Was Roberto entscheidet (vor Etappe A)

1. ~~**Freigabe des Plans**~~ – **FREIGEGEBEN 30.09.** (mit den zwei Änderungen: Anmeldung wie heute, Sicherung im Zusammenspiel mit der IT-Netzsicherung).
2. ~~**Anmeldung**~~ – **entschieden 30.09.: bleibt wie heute** (Benutzerliste,
   Rollen, gemerkte Anmeldung). Windows-Konto nur als späterer Ausbau.
3. ~~**Soendgen**~~ – **entschieden 30.09.: ja**, von Anfang an als zweite, leere
   Datenbank in `BTA-Soendgen`; die Trennung wird ab Etappe A mitgeprüft.
4. ~~**Port und Name**~~ – **entschieden 30.09.: Port 8765, Name des Servers, kein IT-Eintrag.** (01.10.: neuer Server mit anderem Namen – der Name ist seither Daten, kein Code: `05-Server\server-adresse.txt`.)
5. ~~**Fotos**~~ – **entschieden 30.09.: ja**, der Server verwaltet die Fotos
   (`BTA-Scheurich\fotos`, `BTA-Soendgen\fotos`), die vorhandenen werden beim
   Import mitgenommen; der Foto-Weg am Störbericht kommt damit zurück.

**Alle fünf Entscheidungen sind getroffen (30.09.). Etappe A beginnt.**

## 11. Robertos Wunsch (30.09.): EIN Werkzeug, das alles anlegt – „BTA-Server-Werkzeug"

Ja, das ist der richtige Weg und wird Teil von Etappe A. Wie das
BTA-Cockpit-Werkzeug auf dem Stick: ein Fenster (PowerShell/WinForms, nichts
zu installieren), das Roberto **auf dem Server** vom Stick startet. Reiter:

- **Prüfen** – Ampeln: bin ich Admin, gibt es `C:\BTA` mit den vier Ordnern und
  den fünf Gruppen, ist Port 8765 frei, ist Node dabei.
- **Einrichten** – ein Knopf, jede Aktion mit Protokollzeile: Node (portabel)
  und den Dienst nach `BTA-Programm\Dienst` kopieren, `einstellungen.json`
  schreiben (Standorte, Port, Pfade), Aufgabe „bta-cockpit-dienst" in der
  Aufgabenplanung anlegen (Beim Systemstart, Konto SYSTEM – s. Abschnitt 6,
  Neustart bei Fehler), Firewall-Regel für 8765, Dienst starten, `/status`
  abfragen – grün.
- **Wartung** – Dienst starten/stoppen/neu starten, Protokoll öffnen,
  Sicherung jetzt, **Sicherung einspielen** (der geübte Rückweg), App-Datei
  tauschen, Status-Seite öffnen.
- **Import** (Etappe B) – JSON von `W:` einlesen, Zähl-Nachweis anzeigen.

Der Stick bekommt damit zwei Werkzeuge: das bekannte für die Rechner und das
neue für den Server. Robertos Regel bleibt: Das Werkzeug macht die Klicks,
aber es macht sie sichtbar – jede Zeile im Protokoll, jeder Schritt einzeln
bestätigbar (erst „nur prüfen", dann „ausführen").

**Technische Entscheidung dazu (30.09.):** Der Dienst braucht **keine
Zusatzpakete** – Node bringt HTTP, SSE und seit Fassung 22 eine eingebaute
SQLite (`node:sqlite`; hier gemessen mit Node 22.22: Tabelle anlegen,
schreiben, lesen läuft, mit dem Hinweis „experimental") mit. Damit ist der
Dienst ein Ordner mit `node.exe` und ein paar `.js`-Dateien: keine
Installation, kein Compiler, nichts, was auf dem Server nachgeladen werden
muss. Der Stick trägt Node (portabel, ~30 MB) mit.

Alles andere (Datenmodell, Schnittstelle, Etappen) ist Handwerk und wird
gebaut wie beschrieben, mit den Nachweisen aus Abschnitt 7.

**Stand 30.09. (Etappe A, Werkzeug GEBAUT, Windows-Lauf UNGEMESSEN):**
`programm/verteilung/usb-stick/BTA-Server-Werkzeug.cmd` startet
`werkzeug/server-werkzeug.ps1` (WinForms, 670 Zeilen, nur ASCII, Klammern
geprüft). Reiter Prüfen (8 Ampeln), Einrichten („Nur prüfen (Vorschau)" schreibt
das Protokoll ohne eine Änderung, „Einrichten" fragt einmal nach und führt die
sechs Schritte aus), Wartung (Start/Stopp/Neustart, Status-Seite, Protokoll,
Sicherung jetzt, Sicherung einspielen mit vorheriger Kopie
`vor-rueckweg_*.sqlite`, App-Datei tauschen, Vom Server entfernen), Import
(Platzhalter für Etappe B). Der Stick trägt unter `05-Server/` den Dienst
(`dienst/dienst.js`, `db.js`, `einstellungen.beispiel.json`, byte-gleich mit
`server/`) und `node/node.exe` (Node v22.23.3, 83 MB; SHA-256 gegen
SHASUMS256.txt von nodejs.org geprüft) – gebaut mit
`node tools/stick-bauen.js --mit-server --mit-node`. **Nicht gemessen:** der
Lauf des Werkzeugs auf Windows Server 2019 (hier gibt es kein PowerShell) –
das ist Robertos erster Klick, Reiter Prüfen, vor jeder Änderung.

---

## 10. Was sich für die Kollegen ändert

Anmeldung wie heute. Ein Störbericht steht am anderen PC und auf dem Monitor sofort.
Keine Leisten „Schreibzugriff neu bestätigen", „Datei belegt", „Fassung
veraltet" mehr. Speichern ist ein Klick ohne Warten. Sonst: dieselbe
Oberfläche, dieselben Knöpfe, dieselben Ausdrucke.

---

## 12. Robertos Frage (30.09. abends): „Haben wir jetzt ein richtiges Programm – und ist es absolut zukunftssicher?"

**Kurz: Ein richtiges System ja, mit drei benannten Lücken. Absolut zukunftssicher
ist keine Software – aber dieses hier ist so gebaut, dass die Daten nie gefangen
sind und jeder Baustein in Minuten ersetzbar ist.** Was zu einem Programm gehört,
und wo wir stehen (Stand 30.09., Etappe A fertig, B gebaut, C/D offen):

| Baustein | Stand | Anmerkung |
|---|---|---|
| Oberfläche (Frontend) | ✓ | React, eine HTML-Datei, 95 Härtetests |
| Dienst (Backend) | ✓ Etappe A | Node 22, ohne Zusatzpakete, 28 + 5 Prüfstände |
| Datenbank | ✓ | SQLite – offenes Format, seit 25 Jahren stabil, überall lesbar |
| Schnittstelle + Live-Meldung | ✓ | HTTP/JSON, SSE |
| Import aus heute | ✓ gebaut | Vorschau, Standort-Wächter, Nachweis; echter Lauf wartet auf `W:` |
| Sicherung + geübter Rückweg | ✓ | nachts 02:00, 14 Stände, Rückweg 6 s (gemessen) |
| Autostart, Selbstheilung | ✓ | Aufgabe SYSTEM, Neustart 3×1 min, kein Zeitlimit |
| Installation ohne IT | ✓ | zwei Werkzeuge auf dem Stick, jeder Schritt im Protokoll |
| Status, Protokoll, Fehlerliste | ✓ | `/status`, Tagesprotokolle |
| Tests | ✓ | 95 Härtetests, Server-Prüfstände, Electron-Prüfstand |
| Doku | ✓ | Bauplan, SERVER-AUFBAU, Roll-out-Liste, README |
| App am Server, Programm-Hülle | ✗ Etappe C/D | bis dahin zwei Welten: Datei auf `W:` und leerer Server |
| **Zugriffsschutz der Schnittstelle** | **✓ geschlossen 30.09.** (Werkstatt-Schlüssel, B6/C6) – vorher Lücke 1 | Die NTFS-Gruppen schützen die Dateien, **nicht den Port 8765**: heute antwortet der Dienst jedem im Firmennetz. Entspricht der heutigen Lage (wer `W:` sieht, sieht die Datei), ist aber schwächer als die fünf Gruppen suggerieren. **Etappe C bekommt einen Werkstatt-Schlüssel** (gemeinsames Geheimnis in der App-Konfiguration, ohne den der Dienst nichts schreibt); Stufe 2 (Windows-Konto) bleibt der saubere Weg. |
| **Alarm, wenn etwas fehlt** | **✓ teils geschlossen 30.09.** (Sicherungs-Ampel im Prüfen, rote/grüne Leiste im Cockpit; Mail/Teams weiter offen) – vorher Lücke 2 | Niemand wird angerufen, wenn der Dienst steht oder die Nachtsicherung ausfiel. Heute sichtbar nur auf `/status` und im Prüfen. **Klein zu schließen:** Ampel „letzte Sicherung jünger als 26 h" im Prüfen + Leiste im Cockpit (Etappe C: „Server nicht erreichbar – arbeite örtlich weiter"). Mail/Teams bräuchte einen Postausgang der IT. |
| **Notfallzettel** | **✓ geschlossen 30.09.** (`05-Server/LIESMICH-NOTFALL.txt`) – vorher Lücke 3 | Wo liegen die Daten, wie kommt man ohne mich an sie heran, wie spielt man zurück, wie exportiert man ins alte Dateiformat. Ein Blatt auf dem Stick (`LIESMICH-NOTFALL.txt`). |
| Verschlüsselung (HTTPS) | – bewusst nein | Firmennetz, Entscheidung 4; Zertifikat wäre ein IT-Antrag |
| Handy im WLAN | ~ nach C | Browser reicht dann, keine Datei nötig |

**Zukunftsrisiken, ehrlich mit Zeithorizont:**

| Risiko | Horizont | Warum es tragbar ist |
|---|---|---|
| Node 22 (Wartung bis 04/2027), `node:sqlite` „experimental" | Jahre | Die `node.exe` liegt fest auf dem Server und ändert sich nie von selbst; sie läuft so lange wie der Server. Ein Wechsel ist Stick + „Einrichten" (3 s gemessen). |
| Windows Server 2019 (Ende 01/2029) | 2+ Jahre | Umzug = Ordner `C:\BTA` kopieren, Werkzeug „Einrichten" auf dem neuen Server. Ist heute geübt. |
| Electron-Hülle (Chromium 33, keine Sicherheitsupdates ohne Neubau) | laufend | Nur Firmennetz, keine fremden Seiten. Nach Etappe D ist die Hülle nur noch ein Fenster auf `http://v-btacockpit-01:8765/app/` – austauschbar gegen jeden Browser. |
| Eine Datei mit 18.500 Zeilen, ein Entwickler (ich) | Personen | Alles ist Text im Git, gebaut mit `npm run build`, geprüft mit einer Suite; Doku benennt jeden Weg. Ein Notfallzettel (Lücke 3) macht die Übergabe an Dritte möglich. |
| Datenmenge | > 10 Jahre | 71.000 Einträge gemessen (Import 1,5 s, Vollbestand 0,3 s); SQLite trägt Millionen. |
| Anbieter, Lizenz, Cloud, Abo | keins | Nichts davon. Daten liegen als SQLite + JSON-Export auf eurem Server; kein Dritter kann etwas abschalten. |

**Fazit für Roberto:** „Absolut" gibt es nicht – aber dieses System hat keinen
Anbieter, der es abschalten kann, ein offenes Datenformat, einen geübten Rückweg
und eine Neuinstallation in Sekunden. Die drei Lücken sind klein, benannt und
werden in Etappe C geschlossen (Schlüssel, Sicherungs-Ampel, Notfallzettel).

---

## 13. Briefkasten im Internet (0.5.0, Roll-out 65 – Robertos Favorit 06.10.)

**Die Frage:** Fotos vom Handy ins Cockpit, auch über mobile Daten (Außenlager,
unterwegs) – ohne IT-Antrag (kein VPN, kein Zertifikat, Server bleibt im
Firmennetz). **Die Antwort:** ein Durchgang im Internet, den nur wir
betreiben. Der Server **meldet sich beim Briefkasten**, nie umgekehrt – es
wird kein Port geöffnet, nichts kommt von außen herein.

```
Handy (Aufnahme-Zettel)  --HTTPS-->  Briefkasten (Cloudflare-Worker, KV)  <--HTTPS--  BTA-Dienst (holt alle 30 s, löscht sofort)
      Foto + Begleitdatei              liegt bis zum Abholen, max. 7 Tage                Foto -> fotos/, Eintrag AUFNAHME -> SQLite
```

| Teil | Datei | Was es tut |
|---|---|---|
| Kern | `briefkasten/kern.js` | Wege, zwei Schlüssel, Grenzen (3 MB, 7 Tage), CORS – ohne HTTP und ohne Ablage, deshalb ohne Netz prüfbar |
| Node-Programm | `briefkasten/briefkasten.js` | Kern + HTTP + Ordner-Ablage; für den Prüfstand und einen Eigenbetrieb |
| Cloudflare-Worker | `briefkasten/worker.js` | Kern + KV-Ablage **+ eingebetteter Aufnahme-Zettel** (0.2.0); eine Datei zum Einfügen im Dashboard (`worker-bauen.js` hält sie auf dem Stand von Kern und Zettel) |
| Abholer | `server/dienst.js` (0.5.0), `server/briefkasten.beispiel.json` | liest `briefkasten.json` neben den Einstellungen (bleibt beim Werkzeug-„Einrichten" stehen); Takt, Kontroll-Lesung, Löschen erst nach Eintrag |
| Einwurf | `handy/aufnahme-zettel.html` | „Einwerfen" statt Teilen; ohne Netz Warteschlange in der IndexedDB des Handys (überlebt Schließen/Neuladen), Nachsenden beim Öffnen, bei Netzwechsel, im 20-s-Takt |

**Wege des Briefkastens:** `GET /zettel` (und `/`) liefert den Aufnahme-Zettel
als https-Seite – so kommt er mit mobilen Daten aufs Handy, ohne WLAN und
ohne Datei; der Zettel erkennt dabei seine Herkunft als Briefkasten-Adresse
und übernimmt einen Einrichtungs-Link `#kuerzel=…&schluessel=…` (nur im
Browser, nie zum Server) · `GET /status` · `POST /einwurf` (Kopf
`X-BTA-Schluessel` = Einwurf-Schlüssel, Kopf `X-BTA-Begleit` = Begleitdatei
als URL-kodiertes JSON, Körper = Bild-Bytes) · `GET /liste`, `GET/DELETE
/abholen/{id}` (Abhol-Schlüssel). **Zwei Schlüssel**, weil das Handy
verloren gehen kann: Einwurf darf nur einwerfen und nichts lesen.

**Automatisch einsortieren (0.6.0, Roll-out 66, Robertos Freigabe 07.10.):**
Der Abholer sortiert eine Aufnahme sofort, wenn Ziel und Anlage eindeutig sind
– entschieden wird nur nach der Begleitdatei, nie nach dem Bild. `AKTE` +
bekannte Anlage → Aufnahme done/AKTE; `TODO` + bekannte Anlage + Notiz →
To-do `todo-bk-<id>` (Notiz = Titel, Foto-Verweis geteilt, Anlage in der
Bemerkung); `ZETTEL` + Notiz → Pinnwand-Zettel `notiz-bk-<id>`; `ARBEIT`,
`STOERUNG` nie. Bekannt = Name in `konfig kalender/tpmAnlagen` (Groß/Klein
egal); Schalter je Ziel in `konfig kalender/regeln → aufnahme.auto` (fehlt:
an). Aufnahme und Ziel-Eintrag gehen in **einer** Änderung in die Datenbank;
die Kennungen stammen aus der Briefkasten-Kennung, zweimal abholen legt
nichts doppelt an. Der PC nimmt es im Tagesfilm zurück („Zurück in die
Aufnahme“: Ziel-Eintrag weg, Aufnahme offen, Bilddatei bleibt). Prüfstand
(A) in `pruefe-briefkasten.js`, Rot-Nachweis gegen 0.5.0.

**Regeln des Abholers (dieselben wie beim Einzug):** Kennung
`aufn-bk-<Briefkasten-Kennung>` → zweimal abholen legt nichts doppelt an;
gelöscht wird im Briefkasten erst, wenn Foto (Kontroll-Lesung) **und**
Eintrag auf dem Server liegen; ein Fehler hält den Takt an, steht auf der
Status-Seite, der nächste Takt versucht es neu; Protokollzeile nur beim
Wechsel des Fehlers.

**Gemessen 06.10. (Prüfstand `pruefe-briefkasten.js`, 38 Prüfungen; 07.10. 46 mit dem Zettel vom Briefkasten, 55 mit dem automatischen Einsortieren):**
Einwurf vom Zettel 72 ms; Abholung durch den Dienst nach 2,0 s (Takt 5 s im
Prüfstand); Nachsenden aus der Warteschlange bis zur Aufnahme auf dem Dienst
3,1 s. **Nicht gemessen:** der echte Cloudflare-Worker (nur mit nachgebautem
KV), der Weg vom Firmen-Server ins Internet (Roberto: Browser am Server hat
Internet – ob Node ohne Proxy-Einstellung durchkommt, zeigt die Status-Seite),
Android/iPhone mit echter Kamera.

**Was dort liegt und was nicht:** je Einwurf ein eingedampftes Bild und die
Begleitdatei (Zeit, Kürzel, Anlage, Ziel, Notiz) – bis zum Abholen. Kein
Bestand, keine Namen außer dem Kürzel, kein Rückweg vom Briefkasten zum
Server. Einrichtung in zehn Schritten: `briefkasten/LIESMICH-BRIEFKASTEN.md`.
