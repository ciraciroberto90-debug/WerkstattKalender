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

## Damit es beim Anmelden von allein startet (optional)

1. Rechtsklick auf `Cockpit starten.cmd` → **Verknüpfung erstellen**.
2. `Windows-Taste + R`, dann `shell:startup` eingeben, Eingabetaste.
3. Die Verknüpfung in den geöffneten Ordner ziehen.

Dieser Ordner gehört deinem Benutzerkonto – besondere Rechte sind nicht nötig.

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
