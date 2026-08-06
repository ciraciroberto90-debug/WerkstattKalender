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

- [x] **Kennkarte der verbundenen Datei** – gemessen am 05.08.: Ein
      Dateiverweis im Browser kennt nur `getFile`, `createWritable` und
      `move`, **keinen Pfad**. Der ursprünglich geplante Pfad ist damit
      technisch nicht zu bekommen. Stattdessen stehen jetzt im Ordner-Symbol
      und im Teilen-Dialog: Name, Zahl der Einträge, Größe und letzte
      Änderung – und der Ordnername, sofern der Werkstatt-Ordner freigegeben
      ist (nur dann kann `resolve()` den Weg nennen).
- [x] **Hinweis beim Widerspruch:** Hat der Rechner Einträge und die eben
      gewählte Datei keinen einzigen, wird gefragt – mit Kenndaten und
      „Andere Datei wählen …". Erste Fassung fragte bei *jeder* leeren Datei;
      das blockierte sieben Prüfreihen und wäre auch im Betrieb falsch
      gewesen: Wer neu anfängt, hat zu Recht nichts drin, und eine Rückfrage
      bei jedem Start klickt man weg, ohne hinzusehen.
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

- [ ] **Wer jetzt schon fälschlich auf „nur ansehen" steht**, öffnet die App
      über die Verknüpfung mit **`?verwalten=1`** und klickt „Schreibzugriff
      erneut versuchen". Der Fix verhindert den Fall künftig, räumt eine
      bereits gemerkte Rückstufung aber nicht von selbst weg.
      **Entschieden (05.08.):** Die Rettungsknöpfe bleiben versteckt – für
      einen echten Nur-Leser wäre „Andere Datei wählen" zu verlockend. Der
      Weg über `?verwalten=1` steht dafür jetzt in der Anleitung.
- [ ] **Getrennte Merklisten je Ursprung** – `localhost:8765` und `file://`
      sind für den Browser zwei Welten: eigener Dateiverweis, eigener
      Zugriffsmodus, eigener Zwischenspeicher. Wer die HTML per Doppelklick
      öffnet, muss jedes Mal neu anwählen – und greift irgendwann daneben.
      Steht in der Anleitung; beim Umzug auf den Server ist es derselbe
      Mechanismus, der alle Verbindungen kappt.

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

- [ ] **OEE-Kachel an die echte Tabelle anpassen.** Die Anbindung steht und
      läuft gegen ein Prüfmuster (harte-40), die echte Tabelle hat sie noch
      nie gesehen. Zu klären, sobald sie im Datenordner liegt:
      - **Spaltenüberschriften.** Die Erkennung sucht nach „Datum", „Anlage",
        „OEE", „Verfügbarkeit", „Leistung", „Qualität". Heißen sie anders,
        wird die Zuordnung in ⚙ einmal von Hand gesetzt – das ist vorgesehen,
        kostet aber einen Handgriff. Kommen die Überschriften mehrfach vor
        (je Anlage ein Block), muss die Erkennung erweitert werden.
      - **Welcher Zeitraum gehört auf die Kachel?** Aktuell: der jüngste Tag
        mit Daten, gemittelt über alle Zeilen dieses Tages, mit Pfeil zum
        Vortag. Offen, ob es die laufende Schicht, die Woche oder eine
        einzelne Anlage sein soll.
      - **Gewichtung.** Gemittelt wird ungewichtet. Sind die Anlagen
        unterschiedlich lange gelaufen, ist das nicht ganz die Wahrheit –
        dafür bräuchte es die Laufzeit je Zeile.
      - **Wo liegt die Tabelle?** Gefunden wird sie über den Datenordner.
        Liegt sie woanders (eigener Ordner, Netzlaufwerk), muss der Ordner
        entweder freigegeben oder ein zweiter Ordnerzugriff eingerichtet
        werden.
      - Schichtpläne aus Excel sind damit noch **nicht** angebunden – der
        Leser kann es (er gibt jedes Blatt als Zeilen zurück), die Zuordnung
        auf Personen und Tage fehlt.

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
- [x] **Falsch gehende Uhr kostet keine Arbeit mehr.** Gemessen am 05.08.:
      Ein Rechner mit 40 Minuten Rückstand verlor seine Änderung beim
      Zusammenführen spurlos – ohne Hinweis, weil die Kontroll-Lesung eine
      fremde neuere Fassung als Bestätigung durchgehen ließ. Jetzt trägt jede
      Änderung einen Stempel über dem der Fassung, auf der sie beruht; dazu
      ein bleibender Hinweis auf die falsche Uhr (harte-38)
- [x] **Zwei Fenster löschen sich nicht mehr gegenseitig die Arbeit weg.**
      Gemessen am 05.08.: Beide Fenster teilen den Zwischenspeicher; aus dem
      Unterschied dazu leitete die App ab, was gelöscht wurde – ein frischer
      Eintrag des anderen Fensters bekam prompt eine Löschmarke und war
      danach auf ALLEN Geräten weg. Jetzt merkt sich jedes Fenster seinen
      eigenen Stand (harte-39, mit Gegenprobe für echte Löschungen)
- [x] **Der Konflikt-Wächter fasst keine Sicherungen mehr an.** Er erkannte
      jede Datei, die mit dem Namen der Hauptdatei plus Bindestrich anfing,
      als OneDrive-Konfliktkopie – und eine erkannte Kopie wird nach dem
      Einsammeln **gelöscht**. Eine von Hand angelegte
      `werkstatt-kalender-daten-2026-08-05.json` wäre damit weg gewesen.
      Jetzt zählt nur noch ein Anhang, der wie ein Gerätename aussieht;
      alles mit Datum oder Wörtern wie „Sicherung"/„Kopie" bleibt liegen
      (harte-16, Gegenprobe: drei Sicherungen wurden ohne die Änderung
      gelöscht)
- [x] **OEE live aus einer Excel-Tabelle, als Kachel auf der Übersicht.**
      Gelesen wird die `.xlsx` ohne fremde Bibliothek – Chrome packt das ZIP
      selbst aus, das XML liest der eingebaute Parser. Die Tabelle liegt im
      Datenordner neben der gemeinsamen Datei; gespeichert wird nur der
      **Dateiname** und die Spaltenzuordnung, denn ein Dateiverweis lässt sich
      nicht weitergeben – jedes Gerät findet die Tabelle über seinen eigenen
      Ordnerzugriff. Neu gelesen wird jede Minute und beim Zurückklicken in
      die App, aber nur wenn Excel die Datei wirklich angefasst hat.
      **Geschrieben wird nie** (harte-40 prüft das mit). Fehlt die Datei,
      steht das in der Kachel – keine stille Null
- [x] **Alle Kacheln der Übersicht haben exakt dieselben Maße.** Die Uhr lag
      über zwei Kachelbreiten und war damit die einzige mit einem anderen
      Maß. Jetzt: sieben Kacheln, je eine Spalte, gemessen 169,7 × 98,7 px –
      dafür ist die Uhr auf Zifferblatt, Uhrzeit, Schicht-Schild und
      Übergabezeit eingedampft
- [x] **Eine Uhr, die vorgeht, leert nicht mehr die Lösch-Merkliste.** Die
      Merkliste steht in der gemeinsamen Datei – wer sie kürzt, kürzt sie für
      alle. Gekürzt wurde nach „jetzt minus 180 Tage", also nach der Uhr des
      einzelnen Rechners: Ein Gerät mit falschem Jahr (leere Knopfzelle)
      leerte sie komplett. Gemessen: Danach brachte ein lange abgemeldetes
      Gerät einen vor 100 Tagen gelöschten Eintrag zurück. Bezugspunkt ist
      jetzt der frühere von beiden – eigene Uhr oder jüngste Löschmarke –,
      damit geht jeder Uhrfehler in die ungefährliche Richtung (harte-38)
- [x] **Die lokalen Sicherungen reichen jetzt über den Tag hinaus.** Gemessen
      an einem simulierten Arbeitstag (alle zwei Minuten eine fremde
      Änderung, 8 Stunden): Die 30 Plätze reichten am Feierabend nur noch
      **58 Minuten** zurück – ein Fehler, der erst am nächsten Morgen
      auffällt, hatte kein Netz mehr. Zusätzlich zu den 30 jüngsten bleibt
      jetzt je Kalendertag der letzte Stand, 14 Tage lang. Im Verwalten-
      Dialog werden auch alle angezeigt (vorher nur die 15 jüngsten – die
      Tagesstände wären unerreichbar gewesen), und die Zahl daneben zählt
      nur noch echte Einträge statt Einstellungen und Verlaufszeilen
      mitzuzählen (harte-9)
- [x] **Import:** Einträge ohne Kennung bekommen eine, statt beim
      Zusammenführen spurlos zu verschwinden (dort wird nach Kennung
      gearbeitet – was keine hat, fällt heraus, gemeldet wurde trotzdem
      „importiert"). Und die Rückfrage vor dem Ersetzen sagt jetzt, dass es
      über die gemeinsame Datei **alle Kollegen** trifft, nicht nur den
      eigenen Rechner
- [x] Dateien öffnen sich direkt über den Ausliefer-Dienst
- [x] 126 Symbole für die Links in sieben Themengruppen, darunter Zahlen und
      Farbpunkte zum Kennzeichnen (Halle 1, Linie 3, roter Bereich)
