# Roll-out-Liste

Was noch zu tun ist – Robertos Merkzettel. Diese Datei liegt im Git und
überlebt damit jede Sitzung.

**Auf Zuruf** („zeig mir die Liste") wird sie kurz vorgelesen: nur die offenen
Punkte, ohne Umschweife. Neue Aufgaben kommen unten dazu, erledigte wandern
nach unten in „Erledigt" statt gelöscht zu werden – so bleibt nachvollziehbar,
was schon durch ist.

Stand: 03.08.2026

---

## Auf den Rechnern einspielen

- [ ] **`cockpit-server.ps1` austauschen** – im Cockpit-Ordner. Bringt zwei
      Dinge: Dateien öffnen sich per Klick direkt (statt nur Pfad kopieren),
      und `127.0.0.1` wird auf `localhost` umgeleitet, damit der gemerkte
      Dateiverweis nie verlorengeht.
      **Danach das schwarze Fenster einmal schließen und neu starten** – sonst
      läuft der alte Dienst weiter.
- [ ] **Neue `Werkstatt_Kalender_TPM.html`** in den Netzwerkordner. Enthält den
      Linkstreifen auf der Übersicht (RC/AR), die Störberichte mit Nummer und
      Filterleiste sowie die neuen Ausdrucke (Schichtplan wochenweise quer,
      TPM/R+I-Jahreskalender A3). Kein Anwählen der JSON nötig, F5 genügt.

## Vor der Mail an die Kollegen

- [ ] **Ordnernamen prüfen:** In der Klickanleitung steht der geteilte
      OneDrive-Ordner als **`Werkstatt`**. Heißt er anders, eine Zeile ändern
      (`tools/klickanleitung.js`, Konstante `ORDNER`) und
      `node tools/klickanleitung.js` laufen lassen.
- [ ] **Cockpit-Ordner in den geteilten OneDrive-Ordner legen** – dorthin, wo
      `werkstatt-kalender-daten.json` liegt.
- [ ] **Einmal auf dem eigenen Rechner durchspielen** mit dem Paket aus dem
      OneDrive-Ordner, nicht mit dem lokalen. Dann erst die Mail.
- [ ] **Mail verschicken** – Text steht in
      `arbeitsplatz/EMAIL-AN-KOLLEGEN.md`, PDF anhängen
      (`doku/Werkstatt-Cockpit-Einrichtung.pdf`).

## Damit sich der 03.08. nicht wiederholt

Am 03.08.2026 hatte der Vertreter nach dem Neuanlegen der Verknüpfung eine
**leere Datei** verbunden statt der gemeinsamen. Symptome: kein Schichtplan,
keine Links, seine Einträge kamen nicht an. Das Ordner-Symbol war trotzdem
grün – verbunden war er ja, nur mit der falschen Datei. Beide Dateien heißen
gleich; unterschieden hat sie nur der Pfad, und den zeigt die App nirgends.

- [ ] **Pfad der verbundenen Datei anzeigen**, nicht nur den Namen – im
      Ordner-Symbol (Mauszeiger) und im Teilen-Dialog. Zwei Dateien mit
      demselben Namen sind sonst nicht auseinanderzuhalten.
- [ ] **Hinweis nach dem Verbinden mit einer leeren Datei:** „Diese Datei
      enthält keine Einträge. Ist das die richtige?" Nur direkt nach dem
      Verbinden, nicht dauerhaft – eine wirklich neue Datei ist ja zu Recht
      leer.
- [ ] **App und Daten zusammenlegen** (siehe Punkt oben): Liegt die JSON im
      selben Ordner wie die HTML, öffnet der Dateidialog gleich an der
      richtigen Stelle. Das ist die eigentliche Wurzel.
- [ ] **In die Klickanleitung:** den vollständigen Pfad der Datendatei
      aufnehmen, zum Kopieren. Ohne ihn rät jeder beim Auswählen.

## Aufräumen im Datenordner

- [ ] **Alte HTML-Kopien im App-Ordner** – der Selbsttest des Vertreters fand
      `Werkstatt_Kalender_TPM (26).html`. Der Dienst liefert die zuletzt
      geänderte aus; legt jemand eine alte Kopie neu ab, bekommen alle die
      alte Version. Nur **eine** Datei liegen lassen.

- [ ] **Zwei Sicherungsdateien `…_2026-07-28`** – vorher `Selbsttest.cmd`
      laufen lassen und die Eintragszahlen vergleichen. Erst wenn die aktuelle
      Datei mindestens so viele Einträge hat, können sie weg.

## Umzug auf einen Server (geplant)

App und Datendateien sollen künftig auf einem Server liegen statt in
OneDrive. Zwei Dinge sind **vor** dem Aufsetzen zu klären, sonst steht die
App hinterher still:

- [ ] **Wenn die HTML vom Server ausgeliefert wird, dann zwingend über
      `https` mit gültigem Zertifikat.** Gemessen am 04.08.2026 in Chromium:
      über `http://<IP>:8080/` ist `window.showOpenFilePicker` **undefined**
      (`isSecureContext = false`), über `localhost` dagegen vorhanden. Ohne
      sicheren Ursprung gibt es keine gemeinsame Datei mehr – jeder arbeitet
      still für sich, genau der Zustand vom 03.08., nur für alle.
      Alternative: Die HTML bleibt lokal beim Ausliefer-Dienst (localhost),
      und nur die **Daten** wandern auf die Server-Freigabe. Das ist der
      billigste Weg und kostet keine Zeile Code.
- [ ] **Der Ursprung wechselt = alle gemerkten Dateiverbindungen sind weg.**
      Der Browser merkt sich den Dateiverweis pro Ursprung. Kommt die App
      künftig von `https://server/…` statt von `localhost:8765`, muss
      **jeder** die gemeinsame Datei einmal neu anwählen – der Vorgang, bei
      dem am 03.08. eine leere Datei erwischt wurde. Deshalb: erst die vier
      Punkte oben erledigen, dann umziehen, und den vollständigen Pfad
      vorher an alle verteilen.
- [ ] **Dateien per Klick öffnen braucht weiterhin den lokalen Dienst.** Eine
      Seite vom zentralen Server kann keine Laufwerkspfade im Explorer
      öffnen. `cockpit-server.ps1` müsste also bleiben, auch wenn die HTML
      zentral liegt – ob eine `https`-Seite ihn ansprechen darf, ist vor der
      Umstellung zu messen (Chrome behandelt `localhost` gesondert).

**Was der Umzug bringt:** Liegen die Daten auf einer Server-Freigabe statt in
OneDrive, entfallen Konfliktkopien und Sync-Verzug, und die Sicherung läuft
über die Server-Sicherung mit. Die App selbst muss dafür nicht geändert
werden – sie spricht ein eingebundenes Laufwerk genauso an wie den
OneDrive-Ordner.

## Zweiter Standort und Übergabe an die IT (angedacht)

Die App soll an einem weiteren Firmenstandort laufen – eigene Daten, gleiche
Anwendung. Und sobald App oder Daten auf einem Server liegen, soll die IT den
Betrieb übernehmen. Beides bringt Anforderungen, die vorher zu klären sind:

- [ ] **Feiertage konfigurierbar machen – Blocker für Standort 2.** Sie stehen
      fest im Code als *Bayern* (`getHolidays`, u. a. Fronleichnam und Mariä
      Himmelfahrt). Das ist nicht bloß Anzeige: Die R+I-Rhythmen überspringen
      Feiertage (`isValidRiDay`). Ein Standort in einem anderen Bundesland
      bekäme damit **falsche Solltermine – und einen falschen Prüfnachweis**.
      Das Bundesland gehört in die Konfiguration, wie Anlagen und Team.
- [ ] **Ein Build, zwei Datenordner – niemals zwei Kopien des Codes.** Anlagen,
      R+I-Punkte, Team und Schichtarten liegen bereits in der Konfiguration,
      also reicht dieselbe HTML für beide Standorte. Wird stattdessen kopiert
      und getrennt gepflegt, laufen die Versionen binnen Monaten auseinander
      und jeder Fehler muss zweimal behoben werden.
- [ ] **Betriebshandbuch für die IT.** Was läuft wo (Ausliefer-Dienst, Port,
      Autostart), welche Dateien gehören dazu, wie wird gesichert, wie
      zurückgeholt, wie eine neue Version ausgerollt. Die vorhandene
      Anleitung richtet sich an Anwender, nicht an einen Betreiber.
- [ ] **Klären, wem die Anwendung gehört und wer sie ändern darf.** Solange
      es ein Werkzeug der Werkstatt war, stellte sich die Frage nicht. Sobald
      die IT betreibt und zwei Standorte damit arbeiten, stellt sie jemand –
      besser vorher als hinterher.
- [ ] **Betrieb ist nicht Entwicklung.** Die IT kann Server, Sicherung und
      Auslieferung übernehmen. Die Weiterentwicklung bleibt davon unberührt;
      das sollte bei der Übergabe ausdrücklich gesagt werden, sonst entsteht
      die Erwartung, „die IT macht das jetzt", und am Ende macht es niemand.

## Was der 05.08. gezeigt hat

Am Morgen des 05.08.2026 stand die App auf Schreibschutz, und der Selbsttest
meldete „KEINE JSON-Datei im Ordner".

**Die Ursache des Schreibschutzes ist gefunden und behoben.** Beim Verbinden
macht die App einen Schreibversuch. Schlug der fehl, schloss sie daraus
„keine Rechte" und **merkte sich das dauerhaft**. Der Auslöser war ein
versehentlich zweites Fenster: Der zweite Tab wollte schreiben, die Datei war
in dem Moment belegt – und weil die Merkung am Ursprung hängt und nicht am
Tab, galt sie danach für alle Fenster und überlebte Neustart und neue
Verknüpfung. Seit dem Fix wird nur noch bei einer **ausdrücklichen Ablehnung**
(`NotAllowedError`, `SecurityError`) zurückgestuft; eine belegte Datei oder
ein Netz-Aussetzer wird gemeldet, aber nicht festgeschrieben.

- [ ] **Wer jetzt schon fälschlich auf „nur ansehen" steht, muss einmal
      „Datei erneut anwählen (mit Schreibrecht)" klicken.** Der Fix verhindert
      den Fall künftig, räumt aber die bereits gemerkte Rückstufung nicht von
      selbst weg. Offen ist, ob die App das beim Start still selbst prüfen
      soll – Vorteil: niemand sitzt unbemerkt im Schreibschutz; Nachteil: ein
      echter Leser erzeugt dann bei jedem Start einen verbotenen
      Schreibversuch.

- [ ] **Der Selbsttest prüft den falschen Ordner.** Er schaut in den
      App-Ordner (`\\scheudc1\…\Werkstatt_Kalender`), die Daten liegen aber
      in OneDrive. Ergebnis: „KEINE JSON-Datei" und „Sicherungen: keine" –
      zwei Meldungen, die wie Datenverlust aussehen und niemanden kaltlassen.
      Ein Fehlalarm dieser Art ist gefährlich, weil er zu genau der Handlung
      treibt, die am 03.08. den Schaden angerichtet hat: eine neue Datei
      anlegen. Der Selbsttest muss beide Orte prüfen – App-Ordner **und**
      Datenordner – und den Datenordner aus der App übernehmen können.
- [ ] **Im Nur-Leser-Modus kommt man nicht an die eigenen Sicherungen.**
      Zahnrad und Export sind dort ausgeblendet (`!readerMode`). Wer in den
      Schreibschutz rutscht – der häufigste Fall nach einem Neustart – ist
      damit von seinem Sicherheitsnetz abgeschnitten und kann nicht einmal
      einen Export ziehen, bevor er etwas repariert. Beides muss lesend
      erreichbar sein.
- [ ] **Konfliktkopie `werkstatt-stoerungen-L-RCIRACI.json` (04.08., 06:14)**
      lag im Ordner. Der Konflikt-Wächter sammelt sie nur ein, wenn der
      Ordner-Zugriff eingerichtet ist UND die Verbindung schreibend steht –
      im Schreibschutz also gerade nicht. Prüfen, ob sie eingesammelt wurde;
      erst danach darf sie verschwinden.

## Offene Entscheidungen

- [ ] **Excel-Anbindung (OEE / Schichtpläne).** Gemessen ist: Chrome liest eine
      `.xlsx` ohne fremde Bibliothek (12 ms klein, 2,0 s bei 10 950 Zeilen).
      Gebraucht wird noch: die Datei oder ein Bild der obersten Zeilen, und was
      auf der Übersicht stehen soll (gestern? laufender Monat? Wochenverlauf?).
      Geplant: nur anzeigen, nicht zurückschreiben, Datei über den
      Ausliefer-Dienst statt Anwählen auf jedem Rechner.

---

## Erledigt

- [x] Klickanleitung als PDF, eine Seite, mit echten Bildschirmfotos
- [x] Autostart ist eine echte Wahl – „nein" nimmt ein früheres „ja" zurück
- [x] Zahnrad als festes Symbol der Verknüpfung (`shell32.dll,314`)
- [x] Startpaket-ZIP wird gebaut statt von Hand gepackt (`tools/startpaket-bauen.js`)
- [x] Linkbereich angelegt, je Kürzel eine Sammlung, nur für Bearbeiter
- [x] Linkbereich als Streifen unter der Menüleiste – ein Klick pro Link,
      auf der Übersicht (gemessen: eine Zeile, unter 46 px). In den übrigen
      Reitern ist er weg, dort nahm er nur Platz weg
- [x] Störberichte tragen eine Nummer (Jahr + laufende Zahl), Filterleiste
      links mit den Begriffen des alten Schichtbuchs, rote Kante bei offenen
- [x] Doppelte Nummern werden gemeldet und auf Klick bereinigt – der Fall
      entsteht, wenn zwei Leute in derselben Sekunde melden
- [x] Linkfeld startet beim Öffnen der App immer zugeklappt
- [x] Sammelknopf „Alle Berichte löschen" wieder entfernt – seine einmalige
      Aufgabe (Testdaten) ist erledigt
- [x] Schichtplan wochenweise drucken, quer, ein Blatt je KW (Aushang)
- [x] Planungs-Ausdruck auf Hochformat und das Zeilen-Layout des Bildschirms
      umgestellt (vorher eine Tagesmatrix mit Kacheln)
- [x] TPM & R+I als Jahreskalender fürs Board, A3 quer – ein gewöhnlicher
      Wandkalender: die Monate oben als Spalten, darunter die Tage 1–31,
      der Name steht waagrecht im Tag und wird bei Bedarf hinten gekürzt.
      Helle Monatsbeschriftung statt schwarzer Balken, und zur Wahl stehen
      „Beide", „Nur TPM" und „Nur R+I"
- [x] Drucken fragt erst nach: Umfang (beide / nur TPM / nur R+I) und Blatt
      (Jahreskalender A3 quer, einzelner Monat A4 hoch, Liste wie am
      Bildschirm)
- [x] **Ein** Drucken-Knopf, oben rechts, in jedem Bereich mit Ausdruck –
      vorher lagen sie verstreut in den Werkzeugleisten (Schichtplan,
      Planung, Prüfnachweis). Im Dialog stehen die passenden Möglichkeiten
      des Bereichs und **daneben eine Vorschau des echten Blattes**
- [x] Der Planungs-Ausdruck zeigt **Montag bis Freitag** und passt auf
      **eine** A4-Seite, gut leserlich. Das Blatt misst sich selbst und
      verkleinert sich nur, wenn es muss (gemessen: sechs Personen ohne jede
      Verkleinerung bei 11 px Schrift, neun Personen bei 7,9 px wirksam;
      vorher waren es 1563 px auf 1047 px Platz, also zwei Seiten)
- [x] Jeder Eintrag trägt seinen letzten Urheber mit sich, nicht nur die
      Verlaufszeile – die altert nach 90 Tagen heraus und fasst ab vier
      Änderungen zusammen. Im Störbericht steht „zuletzt geändert von …".
      Geprüft ist dabei vor allem der gefährliche Fall: fremde Einträge
      bekommen beim eigenen Speichern KEINEN neuen Zeitstempel, sonst würde
      der zuletzt Speichernde beim Zusammenführen alles verdrängen
- [x] Zwei an einem Störbericht: Beim Speichern wird nachgefragt, wenn ihn
      inzwischen jemand anderes geändert hat – mit Namen, Zeit und dem Inhalt
      der anderen Fassung. Vorher hätte der spätere Zeitstempel stumm
      gewonnen. Vor dem Speichern wird dafür einmal frisch nachgesehen, statt
      auf den 30-Sekunden-Takt zu warten
- [x] Dateien öffnen sich direkt über den Ausliefer-Dienst
- [x] 126 Symbole für die Links in sieben Themengruppen, darunter Zahlen und
      Farbpunkte zum Kennzeichnen (Halle 1, Linie 3, roter Bereich)
