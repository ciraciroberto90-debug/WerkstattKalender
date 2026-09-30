# Eigener Server + eigenes Programm: Was jetzt möglich ist (Konzept „Stufe 2")

Stand: 29.09.2026, Antwort auf Robertos Frage „Was wäre da nun alles möglich,
was wäre ein Must-have, gibt es etwas, das das Programm richtig stabil macht –
ein richtiges Backend?". Entscheidung offen, Bau erst nach dem Server-Umzug
(SERVER-AUFBAU Schritte 7–11).

## 1. Woher die Unruhe der letzten Wochen wirklich kam

Alle Störfälle seit dem 03.08. haben EINE Wurzel: **viele Rechner schreiben
dieselbe Datei über das Netzlaufwerk.** Daraus folgten, jeweils gemessen und
einzeln behoben:

| Störfall | Ursache in einem Satz |
|---|---|
| Schreibschutz nach dem Start (05.08.) | zweites Fenster hielt die Datei, Rückstufung wurde gemerkt |
| 12 s Speichern, Maske hing (11./16.09.) | jeder Speichervorgang schreibt die ganze Datei (4,6 MB) |
| Verlorenes Update bei gleichzeitigem Speichern (11.09.) | zwei Schreiber, eine Datei, Zeitstempel als Schloss |
| EPERM, 0-KB-Zwischendateien (28.09.) | Laufwerk/Virenscanner weist das Anlegen der Zwischendatei ab |
| App hängt beim Verbinden (28.09.) | Merkliste des Browsers blockiert, kein Zeitlimit |
| Doppelte Störberichte (28.09.) | Maske wartete auf das Netzlaufwerk, zweiter Klick |
| 5-MB-Grenze des örtlichen Spiegels (29.09. erreicht) | die ganze Datei muss in den Browser-Speicher passen |
| 30-Sekunden-Abgleich, Kollisions-Hinweise | jeder Rechner muss die Datei lesen, um Änderungen zu sehen |

Jeder dieser Punkte ist heute gefixt. Aber sie bleiben *Symptome* derselben
Bauart. Ein Backend behebt nicht den nächsten Einzelfall, sondern **die ganze
Klasse**: Es gibt dann genau einen Schreiber, den Server.

## 2. Was ein Backend konkret ist – für uns

Ein kleiner Dienst auf `v-btacockpit-01` (Node.js, läuft als Windows-Dienst,
Roberto ist Admin – keine IT nötig), eine **SQLite-Datenbank** (eine Datei,
transaktionssicher, kein Datenbank-Server zu betreiben, Sicherung = Datei
kopieren) und eine HTTP-Schnittstelle. Das Cockpit selbst – Oberfläche,
Rechte-Matrix, Berichte, alles, was heute funktioniert – bleibt. Getauscht wird
nur die unterste Schicht (heute `storage.js`/`sharedfile.js`: Datei lesen,
zusammenführen, schreiben) gegen: „Server, gib mir …" / „Server, speichere …".
Das Programm auf den Rechnern bleibt als Hülle; genauso gut läuft das Cockpit
dann im Browser auf jedem PC im Firmennetz ohne Installation.

## 3. Must-haves für Stabilität (in dieser Reihenfolge)

1. **Ein Schreiber.** Der Server hält die Daten, die Rechner schicken
   Änderungen. Kein Datei-Schloss, keine Zwischendateien, kein EPERM, kein
   Doppelklick-Doppel, kein „wer hat zuletzt geschrieben".
2. **Transaktionen.** Jede Änderung ist ganz oder gar nicht da (SQLite im
   WAL-Modus). Ein Stromausfall mitten im Speichern hinterlässt keine halbe
   Datei. Die Notbremse gegen Massenlöschung wird zur Regel des Servers.
3. **Live statt alle 30 Sekunden.** Der Server stößt die Rechner an
   (Server-Sent Events): Ein Störbericht am PC 1 steht am PC 2 und auf dem
   Monitor in unter einer Sekunde. Der Kollisions-Wächter wird einfacher, weil
   jede Änderung eine Versionsnummer trägt und der Server Widersprüche sofort
   meldet.
4. **Automatische Sicherung, geprüfter Rückweg.** Nächtlich eine
   Datenbank-Kopie in `BTA-Sicherung` (30 Tage), dazu die Schattenkopien des
   Servers, dazu weiterhin ein JSON-Export im heutigen Format – die Daten
   bleiben lesbar, auch wenn es das Backend einmal nicht mehr gäbe. Und: Der
   Rückweg (Kopie einspielen) wird einmal geübt, nicht nur behauptet.
5. **Klares Verhalten, wenn der Server fehlt.** Heute: Laufwerk weg = App
   läuft örtlich weiter und gleicht später ab. Mit Backend: Server weg = App
   zeigt den letzten Stand zum Ansehen und sagt es laut; Schreiben wartet, bis
   er wieder da ist (Warteschlange im Rechner). Kein stilles Auseinanderlaufen.
6. **Anmeldung ohne Kennwort.** Der Server kennt das Windows-Konto des
   Kollegen (Domäne `scheurich.local`), die App-Rollen kommen weiter aus der
   Benutzerliste. Kein Abtippen, keine Kennwörter in einer Datei. Ehrlich: Im
   Firmennetz ist das eine Leitplanke wie heute, kein Tresor – dafür sorgt die
   Domäne selbst.
7. **Sehen, was der Server tut.** Eine Status-Seite (`/status`: Datenbank,
   letzte Sicherung, verbundene Rechner, Antwortzeit) und ein Protokoll. Das
   Werkzeug „Verbindung prüfen" fragt den Server statt das Laufwerk. Kein
   Raten mehr, ob es am Netz, an Rechten oder am Programm liegt.
8. **Updates ohne Handgriff.** Der Server liefert die App aus. Neuer Stand
   = eine Datei auf dem Server tauschen, jeder Rechner hat ihn beim nächsten
   Öffnen. Kein Update-Ordner, kein ZIP-Tausch (die Programm-Hülle ändert sich
   fast nie mehr). „Programm-Stand der Benutzer" ist dann immer 100 %.
9. **Tempo bei Wachstum.** 71.000 Einträge im Jahr sind für eine Datenbank
   nichts; Listen kommen seitenweise, Auswertungen rechnet der Server. Der
   Start wird schneller, nicht langsamer, weil nicht mehr 4,6 MB JSON in den
   Browser müssen. Die 5-MB-Grenze verschwindet.
10. **Prüfstände wie bisher, plus Server-Prüfstände.** Die 95 Härtetests laufen
    weiter gegen die Oberfläche; neu: Tests der Schnittstelle, ein
    Migrations-Test (JSON → Datenbank, Eintrag für Eintrag gezählt) und ein
    **Parallelbetrieb** von einer Woche, in dem Datei und Datenbank
    nebeneinander laufen und jeden Abend verglichen werden – erst dann wird
    umgeschaltet.

## 4. Was danach leicht wird (nicht Must-have)

Fotos am Störbericht (Upload auf den Server statt Dateiordner), Schichtbericht
nachts als PDF an die Morgenrunde (Mail über den Firmen-Relay, mit IT),
Teams-Nachricht per Webhook aus dem Server, Handy im WLAN (nur Browser),
Einkauf-Bereich mit eigener Tabelle, Auswertungen über Jahre, Soendgen als
zweite Datenbank auf demselben Server.

## 5. Ehrlich: Preis und Risiken

- **Größter Umbau seit dem 10.09.** Grob: Kern (Server, Datenbank, Schnittstelle,
  Umbau der Speicherschicht) 1–2 Wochen Sitzungen mit Prüfständen, Migration +
  Parallelbetrieb 1 Woche, Umschalten an einem ruhigen Tag. Die Oberfläche
  bleibt, die Kollegen merken nur, dass es schneller geht und die Warnungen
  ausbleiben.
- **Der Server wird der eine Punkt.** Ist er weg, arbeitet niemand (heute:
  ist `W:` weg, arbeitet auch niemand richtig). Deshalb Punkt 5 oben und:
  Wer startet den Dienst nach einem Server-Neustart? (Antwort: er startet von
  selbst, Aufgabenplanung „Beim Start".) Wer spielt Windows-Updates auf dem
  Server ein? (IT oder Roberto – zu klären.)
- **HTTPS.** Im Firmennetz reicht HTTP auf einem festen Port für Programm und
  Browser; ein Zertifikat der IT macht es hübscher, ist aber keine
  Voraussetzung.
- **Kein Zurück auf halbem Weg.** Deshalb Parallelbetrieb und JSON-Export: Der
  alte Weg bleibt eine Woche lang der Rückfallweg.

## 6. Empfehlung und Reihenfolge

1. Server-Umzug abschließen (Schritte 7–11) und **zwei Wochen ruhig laufen
   lassen** – das ist die Messlatte, gegen die das Backend antreten muss.
2. Robertos Entscheidung: Backend ja/nein, und Anmeldung (Windows-Konto
   automatisch) ja/nein.
3. Bau in vier Etappen, jede mit Nachweis: (a) Server liest die heutige JSON
   und liefert sie – nur lesend, Schatten neben dem Laufwerk; (b) Schreiben
   über den Server, Datei wird vom Server mitgeführt; (c) Parallelbetrieb mit
   Abendvergleich; (d) Umschalten, Datei nur noch als Export.
