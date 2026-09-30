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
 │  ┌──────────────┐  ┌───────────────────────┐ │  läuft als SCHEURICH\serviceBTA
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
| `GET /status` | Datenbankgröße, Version, letzte Sicherung, verbundene Rechner, Antwortzeit, Fehler der letzten 24 h – auch im ⚙ sichtbar. |
| `GET /app/` | Die App selbst (eine HTML). Neuer Stand = Datei tauschen. |
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

- **Autostart:** Aufgabenplanung „Beim Systemstart", Konto `serviceBTA`, „bei
  Fehler neu starten alle 1 min", ohne angemeldeten Benutzer. Kein Installer,
  kein Dienst-Rahmen nötig (nssm bleibt als Option).
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
| **A – Server-Kern** | Dienst, SQLite, Schnittstelle, SSE, Status-Seite, Sicherung + geübter Rückweg, Autostart auf `v-btacockpit-01`, Firewall. Läuft neben `W:`, berührt nichts. | server-tests grün; `/status` von einem Werkstatt-PC erreichbar; Rückweg protokolliert. | 3–4 |
| **B – Import** | Einleser JSON → Datenbank (Einträge, Störungen, Konfig, Verlauf, Löschliste, Fotos), wiederholbar (zweimal einlesen = kein Doppel). Testimport mit dem echten Abendstand von `W:`. | Import-Nachweis 0 Abweichungen; Export gleicht dem Original. | 2 |
| **C – App am Server** | `server-client.js` ersetzt Datei-Speicherschicht; IndexedDB-Cache; Warteschlange; Anmeldung Stufe 1; Auslieferung unter `/app/`; Entschlackung der Datei-Bausteine; Hülle umgestellt. Testbetrieb auf Robertos PC + einem Werkstatt-PC gegen den Testimport. | 95 Härtetests grün gegen Attrappe; Zwei-Schreiber-, Ausfall- und Last-Prüfstände grün; Electron-Prüfstand grün. | 5–7 |
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
4. **Port und Name:** `http://v-btacockpit-01:8765` – oder wünscht die IT
   einen Namen wie `cockpit.scheurich.local`? (Nur Komfort.)
5. **Fotos:** heute in `Fotos\` neben der Datei – künftig vom Server verwaltet
   (Upload), die alten werden mit importiert – ja?

Alles andere (Datenmodell, Schnittstelle, Etappen) ist Handwerk und wird
gebaut wie beschrieben, mit den Nachweisen aus Abschnitt 7.

---

## 10. Was sich für die Kollegen ändert

Anmeldung wie heute. Ein Störbericht steht am anderen PC und auf dem Monitor sofort.
Keine Leisten „Schreibzugriff neu bestätigen", „Datei belegt", „Fassung
veraltet" mehr. Speichern ist ein Klick ohne Warten. Sonst: dieselbe
Oberfläche, dieselben Knöpfe, dieselben Ausdrucke.
