# Das Cockpit ohne die IT wieder dauerhaft verbinden

**Kurz:** Die App wird nicht mehr als Datei geöffnet, sondern über
`http://localhost:8765/` – ausgeliefert von deinem eigenen Rechner. Für den
Browser ist `localhost` eine **sichere Herkunft**, und damit merkt er sich den
Dateizugriff wieder wie früher. Es wird nichts installiert, nichts am System
geändert, und aus dem Netz ist nichts davon erreichbar.

## Warum das nötig ist

Gemessen am Arbeitsplatz, 28.07.2026:

| Vorgang | als Datei (`file://`) | über `localhost` / `https` |
|---|---|---|
| Datei frisch ausgewählt, öffnen | 0 ms ✓ | 9 ms ✓ |
| Verweis aus der Datenbank zurückgeholt | **keine Antwort in 120 s** | **1 ms ✓** |
| Nach dem Neuladen: Zugriff anfordern | keine Antwort in 120 s | `granted` ✓ |

Chrome hat für Seiten ohne feste Adresse das Merken von Dateizugriffen fallen
lassen. An der App liegt es nicht – sie ist unverändert.

## Was sich für dich ändert

**Beim Aktualisieren: nichts.** Neue Version weiterhin als Datei in den Ordner
kopieren, alte überschreiben. Der Dienst liest bei jedem Aufruf frisch von dort.

**Beim Öffnen:** statt der Verknüpfung zur HTML-Datei ein Doppelklick auf
`Cockpit starten.cmd`. Das Cockpit öffnet sich dann von allein.

## Zwei Ablagen zur Wahl

**Variante A – Paket auf jedem Rechner.** Jeder Arbeitsplatz bekommt den Ordner
`Cockpit` lokal (Desktop oder `C:\Werkstatt`). Funktioniert überall, auch wenn
die Freigabe keine Skripte zulässt.

**Variante B – alles im App-Ordner auf dem Firmenlaufwerk.** Starter, Dienst und
Werkzeuge liegen neben `Werkstatt_Kalender_TPM … .html`. Die Kollegen holen sich
nur eine Verknüpfung auf den Desktop. Vorteil: Eine Verbesserung an den Skripten
wird an **einer** Stelle eingespielt und gilt sofort für alle.

Die Starter erkennen selbst, in welcher Ablage sie liegen: Findet sich neben
ihnen eine `Werkstatt_Kalender_TPM*.html`, gilt dieser Ordner als Datenordner.
Es muss also **kein Pfad gepflegt werden**.

### Variante B einrichten

1. Diese Dateien in den App-Ordner auf dem Firmenlaufwerk legen:
   `Cockpit starten.cmd`, `Selbsttest.cmd`, `Sicherung zurueckholen.cmd`,
   `Verknuepfung anlegen.cmd` und die vier `.ps1`-Dateien.
2. Jeder Kollege ruft dort **einmal** `Verknuepfung anlegen.cmd` auf.
   Es entsteht ein Desktop-Symbol „Werkstatt-Cockpit"; auf Nachfrage wird
   zusätzlich der Autostart eingerichtet. Danach muss niemand mehr in den
   Netzwerkordner.

> **Warum eine eigene Datei dafür?** `cmd.exe` kann keinen UNC-Pfad als
> Arbeitsverzeichnis verwenden. Eine von Hand angelegte Verknüpfung zeigt
> deshalb bei jedem Start die Meldung „UNC-Pfade werden nicht unterstützt".
> `Verknuepfung anlegen.cmd` setzt das Arbeitsverzeichnis auf einen lokalen
> Pfad – dann bleibt es still. Außerdem stellt es Fenster auf *minimiert*,
> vergibt Symbol und Namen.

> **Wenn die Freigabe keine Skripte zulässt:** Manche Laufwerke lehnen
> `.cmd`- und `.ps1`-Dateien ab (Dateityp-Sperre). Dann ist Variante B nicht
> möglich – nimm Variante A. Das merkst du sofort beim Hineinkopieren.

## Einrichtung – einmal je Rechner, etwa zwei Minuten

Die beiden Dateien gehören **nicht** in den Netzwerkordner. Sie dürfen dort
liegen, müssen es aber nicht – der Dienst muss den Ordner nur **lesen** können.
Wenn du dort keine Schreibrechte für solche Dateien hast, ist das also kein
Hindernis.

1. Einen eigenen Ordner anlegen, zum Beispiel `C:\Werkstatt` oder einfach den
   Desktop. Beide Dateien dort hineinlegen – `Cockpit starten.cmd` und
   `cockpit-server.ps1` müssen **zusammen im selben Ordner** liegen.

2. Doppelklick auf **`Cockpit starten.cmd`**. Es öffnet sich ein schwarzes
   Fenster mit der Zeile `Adresse: http://localhost:8765/`, und der Browser
   startet das Cockpit.

   Der Netzwerkpfad steht oben in `Cockpit starten.cmd` in **einer einzigen
   Zeile** (`set ORDNER=...`). Ändert sich der Pfad irgendwann, wird nur diese
   Zeile angepasst.

3. Im Cockpit wie gewohnt verbinden – Ordnersymbol rechts oben.

4. **Probe: F5 drücken.** Bleibt die Verbindung bestehen, ist es geschafft.

5. Das schwarze Fenster offen lassen, solange das Cockpit benutzt wird. Es darf
   klein gezogen werden.

## Wichtig bei der Umstellung: der Name muss einmal neu eingetragen werden

Für den Browser ist `http://localhost:8765` eine **andere Seite** als der alte
Dateipfad – mit eigenem lokalem Speicher. Beim ersten Start über die neue
Adresse ist dieser Speicher leer.

Das ist harmlos, weil alle Daten in der gemeinsamen Datei liegen. Aber:

1. **Zuerst die Datei verbinden** (Ordnersymbol rechts oben). Danach sind
   Einträge, Team, Anlagen und alle Einstellungen wieder da.
2. **Dann den eigenen Namen neu eintragen** – ⚙ → Name. Der ist bewusst
   geräteweise gespeichert und kommt nicht aus der Datei.

Dasselbe gilt für jeden Kollegen bei seiner Umstellung.

## Der Dateiname spielt keine Rolle mehr

Angenehmer Nebeneffekt: Der Dienst liefert immer die **neueste**
`Werkstatt_Kalender_TPM*.html` aus dem Ordner aus. Ob sie `(28)`, `(29)` oder
gar keine Nummer trägt, ist gleichgültig – die Adresse bleibt in jedem Fall
`http://localhost:8765/`.

Damit entfällt der bisherige Stolperstein, dass eine neue Version unter neuem
Namen von den Kollegen gar nicht geöffnet wurde. Auch ein Neuladen mit Strg+F5
ist nicht mehr nötig: Der Dienst untersagt dem Browser das Zwischenspeichern.

## Zweimal starten schadet nichts

Wird `Cockpit starten.cmd` ein zweites Mal angeklickt, erkennt der Dienst, dass
er schon läuft, öffnet nur den Browser und beendet sich wieder. Er weicht
**nicht** auf einen anderen Port aus – das wäre für den Browser eine andere
Adresse, und die verbundene Datei wäre wieder vergessen.

## Damit es beim Anmelden von allein startet (optional)

1. Rechtsklick auf `Cockpit starten.cmd` → **Verknüpfung erstellen**.
2. Rechtsklick auf die Verknüpfung → **Eigenschaften** → bei *Ausführen*
   **„Minimiert"** wählen → OK. Dann liegt das Fenster nur in der Taskleiste.
3. `Windows-Taste + R`, dann `shell:startup` eingeben, Eingabetaste.
4. Die Verknüpfung in den geöffneten Ordner ziehen.

Dieser Ordner gehört deinem Benutzerkonto – besondere Rechte sind nicht nötig.

Danach startet der Dienst bei jeder Anmeldung von allein, und das Cockpit
lässt sich wie früher über eine gewöhnliche Verknüpfung öffnen.

## Eine Desktop-Verknüpfung wie früher

Zwei Möglichkeiten, beide gleich gut:

**a) Verknüpfung auf `Cockpit starten.cmd`** – startet den Dienst, falls er noch
nicht läuft, und öffnet danach das Cockpit. Umbenennen in „Werkstatt-Cockpit",
fertig. Das ist die robustere Variante, weil sie in jedem Fall funktioniert.

**b) Verknüpfung auf die Adresse** – Rechtsklick auf den Desktop → Neu →
Verknüpfung → `http://localhost:8765/` eintragen. Öffnet direkt im Browser,
**setzt aber voraus, dass der Dienst schon läuft** (also Autostart eingerichtet
ist). Sonst erscheint „Diese Website ist nicht erreichbar".

Für die Kollegen ist **a)** die bessere Wahl: ein Symbol, ein Doppelklick, alles
weitere passiert von selbst.

## Wenn etwas nicht klappt

**Die `.cmd` lässt sich nicht herunterladen oder speichern**
Manche Umgebungen blockieren `.cmd`-Dateien beim Herunterladen. Dann die Datei
als `Cockpit starten.txt` speichern und im Explorer in `Cockpit starten.cmd`
umbenennen (dazu müssen unter Ansicht die Dateinamenerweiterungen eingeblendet
sein). Inhalt und Wirkung sind identisch.

**„Die Ausführung von Skripts ist auf diesem System deaktiviert"**
Dann verbietet eine Richtlinie PowerShell-Skripte. Dieser Weg ist damit
verschlossen – bitte melden, dann suchen wir weiter.

**„Zugriff verweigert" auf den Netzwerkordner**
Der Dienst braucht dort nur Leserechte – dieselben, die du zum Öffnen des
Cockpits ohnehin hast. Schreibrechte im Ordner sind für die Einrichtung nicht
nötig.

**Das Fenster schließt sich sofort wieder**
`Cockpit starten.cmd` per Rechtsklick → Bearbeiten öffnen und prüfen, ob beide
Dateien im selben Ordner liegen. Sonst melden.

**„Der Ordner ist nicht erreichbar"**
Das Netzlaufwerk war beim Start noch nicht verbunden. Fenster schließen, den
Ordner einmal im Explorer öffnen, dann erneut starten.

**Ein anderer Port**
Ist 8765 belegt, sucht der Dienst selbst den nächsten freien und nennt ihn im
Fenster. Dann gilt die dort genannte Adresse.

## Sicherung der Daten – läuft von allein mit

Beim Öffnen des Cockpits sichert der Starter die Datendateien in einen Ordner
`Sicherungen\JJJJ-MM-TT\` neben den Daten. Das dauert Sekunden und braucht
keinen eigenen Autostart.

- **Nur vollständige Dateien werden gesichert.** Eine halb geschriebene Datei
  wird ausdrücklich abgelehnt – sonst würde ein Torso nach und nach die guten
  Stände verdrängen, und die Sicherung wäre wertlos, sobald man sie braucht.
- **Unverändertes wird nicht doppelt abgelegt.** Sonst stünden nach zwei
  Monaten sechzig gleiche Kopien herum.
- **Ältere Stände als 60 Tage werden entfernt.**
- Fehlt das Schreibrecht im Datenordner, wird nach
  `%USERPROFILE%\Cockpit-Sicherungen` ausgewichen und das im Fenster gesagt.

Diese Sicherung ist unabhängig von der App: Die App legt zusätzlich 30 Stände
im Browser jedes Geräts ab (⚙ → Sicherungen). Erst beides zusammen deckt auch
den Fall ab, dass ein Browser-Speicher zurückgesetzt wird.

### Einen früheren Stand zurückholen

Doppelklick auf **`Sicherung zurueckholen.cmd`**. Es erscheint eine Liste aller
Stände; nach Eingabe der Nummer und einer Bestätigung wird zurückgespielt.

Der aktuelle Stand wird dabei vorher als `*.vor-wiederherstellung` gesichert –
auch ein Zurückholen kann man also rückgängig machen.

> **Vorher das Cockpit auf allen Rechnern schließen.** Sonst schreibt jemand
> den alten Stand sofort wieder mit seinem neueren zusammen.

## Wenn ein Rechner zickt: Selbsttest

Doppelklick auf **`Selbsttest.cmd`**. In zehn Sekunden steht da, woran es liegt:

- Netzlaufwerk erreichbar?
- Programmdatei vorhanden, wie alt, liegen ältere Fassungen daneben?
- Beide Datendateien vollständig, wie viele Einträge, wann zuletzt geändert?
- Liegen OneDrive-Konfliktkopien herum?
- Wie viele Sicherungen gibt es, wie alt ist die neueste?
- Läuft der Ausliefer-Dienst?
- Welche Browser-Version ist installiert?

Der Test **verändert nichts**. Am Ende liegt der Bericht in der Zwischenablage
und als Datei im eigenen Benutzerordner – zum Weiterschicken.

## Was der Dienst tut – und was nicht

- Er hört **ausschließlich** auf `127.0.0.1`, also den Rechner selbst. Aus dem
  Netz ist er nicht erreichbar.
- Er liefert **nur Dateien aus dem Cockpit-Ordner** aus und beantwortet nur
  Leseanfragen. Ein Ausbruch aus dem Ordner wird abgewiesen (nachgemessen).
- Er läuft mit deinen normalen Benutzerrechten. Keine Installation, kein Dienst
  im Hintergrund, keine Änderung am System.

## Was geprüft ist – und was nicht

Ausgeführt und belegt (PowerShell 7.4.6, Chromium):

- Auslieferung der 444 963 Bytes großen App mit `text/html`
- richtiger Inhaltstyp für `.json`
- `404` für Unbekanntes, `403` für den Ausbruchsversuch `../../../etc/passwd`
- selbsttätige Portsuche, wenn 8765 belegt ist
- im Browser über `http://localhost:8765`: **sicherer Kontext ja**,
  `showOpenFilePicker` und `showSaveFilePicker` vorhanden, App läuft fehlerfrei

**Nicht geprüft, weil es deinen Rechner braucht:** ob dort PowerShell-Skripte
erlaubt sind. Das zeigt sich beim ersten Doppelklick in zehn Sekunden.
